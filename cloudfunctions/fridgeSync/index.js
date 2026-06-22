const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const fridges = db.collection('fridges');
const members = db.collection('fridge_members');
const items = db.collection('fridge_items');
const diaries = db.collection('fridge_diaries');
const operations = db.collection('fridge_operations');

const MAX_OPERATIONS = 50;
const MAX_IMAGE_BYTES = 1024 * 1024;
const ALLOWED_UNITS = new Set(['个', 'kg', '包', 'g', '斤', '份']);
const ALLOWED_CATEGORIES = new Set(['农产品', '蔬菜', '水果', '饮品/其他']);

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function memberId(fridgeId, openid) {
  return hash(`${fridgeId}:${openid}`).slice(0, 40);
}

function recordId(fridgeId, entityType, entityId) {
  return hash(`${fridgeId}:${entityType}:${entityId}`);
}

async function getDocument(collection, id) {
  try {
    const result = await collection.doc(id).get();
    return result.data || null;
  } catch (error) {
    const message = String(error?.message || '');
    if (/not exist|not found|不存在/i.test(message)) return null;
    throw error;
  }
}

async function getTransactionDocument(transaction, collectionName, id) {
  try {
    const result = await transaction.collection(collectionName).doc(id).get();
    return result.data || null;
  } catch (error) {
    const message = String(error?.message || '');
    if (/not exist|not found|不存在/i.test(message)) return null;
    throw error;
  }
}

async function requireMembership(fridgeId, openid) {
  const membership = await getDocument(members, memberId(fridgeId, openid));
  if (!membership || membership.status !== 'active') throw new Error('你不是该冰箱的成员');
  return membership;
}

function cleanPayload(payload, entityType, fridgeId) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const common = { id: source.id };
  if (entityType === 'item') {
    return {
      ...common,
      name: String(source.name || '').trim().slice(0, 40),
      quantity: Number(source.quantity),
      unit: String(source.unit || '').slice(0, 8),
      expiryDate: String(source.expiryDate || '').slice(0, 10),
      category: String(source.category || '饮品/其他').slice(0, 20)
    };
  }
  return {
    ...common,
    title: String(source.title || '').trim().slice(0, 80),
    recipeName: String(source.recipeName || '').slice(0, 80),
    imageList: Array.isArray(source.imageList)
      ? source.imageList
        .filter((fileID) => String(fileID).includes(`/diary-shared/${fridgeId}/`))
        .slice(0, 3)
      : [],
    usedIngredients: Array.isArray(source.usedIngredients) ? source.usedIngredients.slice(0, 50) : [],
    createdAt: Number(source.createdAt || Date.now())
  };
}

function publicRecord(record) {
  if (!record) return null;
  const { _id, fridgeId, deleted, ...value } = record;
  return value;
}

async function checkDiaryContent(operation, membership, fridgeId) {
  if (operation.entityType !== 'diary' || !['create', 'update'].includes(operation.action)) return;
  const payload = operation.payload || {};
  const title = String(payload.title || '').trim();
  if (title) {
    const response = await cloud.openapi.security.msgSecCheck({
      content: title,
      version: 2,
      scene: 4,
      openid: membership.openid
    });
    if (response.result?.suggest !== 'pass') throw new Error('日记标题未通过内容安全检测');
  }
  if (!Array.isArray(payload.imageList)) return;
  const fileIDs = payload.imageList.slice(0, 3);
  for (const fileID of fileIDs) {
    if (!String(fileID).includes(`/diary-shared/${fridgeId}/`)) throw new Error('日记图片路径无效');
    const download = await cloud.downloadFile({ fileID });
    if (!download.fileContent || download.fileContent.length > MAX_IMAGE_BYTES) throw new Error('日记图片过大');
    const response = await cloud.openapi.security.imgSecCheck({
      media: { contentType: 'image/jpeg', value: download.fileContent }
    });
    const code = Number(response.errCode ?? response.errcode ?? 0);
    if (code === 87014 || (response.result?.suggest && response.result.suggest !== 'pass')) {
      throw new Error('日记图片未通过内容安全检测');
    }
    if (code !== 0) throw new Error('图片安全检测暂不可用');
  }
}

async function getSnapshot(fridgeId) {
  const [fridge, itemResult, diaryResult] = await Promise.all([
    getDocument(fridges, fridgeId),
    items.where({ fridgeId, deleted: db.command.neq(true) }).limit(1000).get(),
    diaries.where({ fridgeId, deleted: db.command.neq(true) }).limit(1000).get()
  ]);
  return {
    revision: fridge?.revision || 0,
    inventory: (itemResult.data || []).map(publicRecord),
    diary: (diaryResult.data || []).map(publicRecord)
  };
}

async function applyOperation(fridgeId, membership, operation) {
  const entityType = operation.entityType === 'diary' ? 'diary' : 'item';
  const action = ['create', 'update', 'delete'].includes(operation.action) ? operation.action : null;
  if (!operation.opId || !operation.entityId || !action) throw new Error('同步操作格式无效');
  await checkDiaryContent(operation, membership, fridgeId);
  const collectionName = entityType === 'diary' ? 'fridge_diaries' : 'fridge_items';
  const documentId = recordId(fridgeId, entityType, operation.entityId);
  const transactionResult = await db.runTransaction(async (transaction) => {
    const previousOperation = await getTransactionDocument(transaction, 'fridge_operations', operation.opId);
    if (previousOperation) return { applied: true, duplicate: true };
    const fridge = await getTransactionDocument(transaction, 'fridges', fridgeId);
    if (!fridge || fridge.deletedAt) throw new Error('冰箱不存在');
    const current = await getTransactionDocument(transaction, collectionName, documentId);
    const currentVersion = Number(current?._version || 0);

    if (action === 'create' && current && !current.deleted) {
      return { conflict: true, current: publicRecord(current), reason: 'already_exists' };
    }
    if (action !== 'create' && (!current || current.deleted)) {
      if (action !== 'delete') return { conflict: true, current: null, reason: 'not_found' };
      await transaction.collection('fridge_operations').doc(operation.opId).set({ data: {
        fridgeId, entityType, entityId: operation.entityId, action, result: 'already_deleted', createdAt: Date.now()
      } });
      return { applied: true };
    }
    if (action !== 'create' && currentVersion !== Number(operation.baseVersion || 0)) {
      return { conflict: true, current: publicRecord(current), reason: 'version_mismatch' };
    }

    const revision = Number(fridge.revision || 0) + 1;
    const now = Date.now();
    let deletedFiles = [];
    if (action === 'create') {
      const payload = cleanPayload({ ...operation.payload, id: operation.entityId }, entityType, fridgeId);
      if (!payload.name && entityType === 'item') throw new Error('食材名称不能为空');
      if (!payload.title && entityType === 'diary') throw new Error('日记标题不能为空');
      if (entityType === 'item' && (!Number.isFinite(payload.quantity) || payload.quantity <= 0)) throw new Error('食材数量无效');
      if (entityType === 'item' && !ALLOWED_UNITS.has(payload.unit)) throw new Error('食材单位无效');
      if (entityType === 'item' && !ALLOWED_CATEGORIES.has(payload.category)) throw new Error('食材分类无效');
      await transaction.collection(collectionName).doc(documentId).set({ data: {
        ...payload,
        fridgeId,
        _version: 1,
        revision,
        createdBy: membership._id,
        updatedBy: membership._id,
        createdAt: payload.createdAt || now,
        updatedAt: now,
        deleted: false
      } });
    } else if (action === 'update') {
      const allowed = cleanPayload({ ...current, ...operation.payload, id: operation.entityId }, entityType, fridgeId);
      if (entityType === 'item' && (!Number.isFinite(allowed.quantity) || allowed.quantity <= 0)) throw new Error('食材数量无效');
      if (entityType === 'item' && !ALLOWED_UNITS.has(allowed.unit)) throw new Error('食材单位无效');
      await transaction.collection(collectionName).doc(documentId).update({ data: {
        ...allowed,
        _version: currentVersion + 1,
        revision,
        updatedBy: membership._id,
        updatedAt: now
      } });
    } else {
      await transaction.collection(collectionName).doc(documentId).update({ data: {
        deleted: true,
        _version: currentVersion + 1,
        revision,
        updatedBy: membership._id,
        updatedAt: now
      } });
      if (entityType === 'diary') {
        deletedFiles = (current.imageList || []).filter((id) => String(id).startsWith('cloud://'));
      }
    }
    await transaction.collection('fridges').doc(fridgeId).update({ data: { revision, updatedAt: now } });
    await transaction.collection('fridge_operations').doc(operation.opId).set({ data: {
      fridgeId,
      entityType,
      entityId: operation.entityId,
      action,
      revision,
      result: 'applied',
      createdBy: membership._id,
      createdAt: now
    } });
    return { applied: true, revision, deletedFiles };
  });
  if (transactionResult.deletedFiles?.length) {
    await cloud.deleteFile({ fileList: transactionResult.deletedFiles }).catch(() => {});
  }
  return transactionResult;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, error: '无法识别当前用户' };
  try {
    const fridgeId = String(event.fridgeId || '');
    const membership = await requireMembership(fridgeId, OPENID);
    if (event.action === 'getSnapshot') {
      return { success: true, snapshot: await getSnapshot(fridgeId) };
    }
    if (event.action !== 'applyOperations') return { success: false, error: '不支持的操作' };
    const queued = Array.isArray(event.operations) ? event.operations.slice(0, MAX_OPERATIONS) : [];
    const appliedOpIds = [];
    const conflicts = [];
    for (const operation of queued) {
      try {
        const result = await applyOperation(fridgeId, membership, operation);
        if (result.applied) appliedOpIds.push(operation.opId);
        if (result.conflict) conflicts.push({
          opId: operation.opId,
          entityType: operation.entityType,
          entityId: operation.entityId,
          reason: result.reason,
          current: result.current,
          local: operation.payload
        });
      } catch (error) {
        conflicts.push({
          opId: operation.opId,
          entityType: operation.entityType,
          entityId: operation.entityId,
          reason: 'rejected',
          error: error.message || '操作未通过服务端校验',
          current: null,
          local: operation.payload
        });
      }
    }
    return { success: true, appliedOpIds, conflicts, snapshot: await getSnapshot(fridgeId) };
  } catch (error) {
    console.error('fridgeSync failed:', event.action, error);
    return { success: false, error: error.message || '共享冰箱同步失败' };
  }
};
