const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const profiles = db.collection('user_profiles');
const fridges = db.collection('fridges');
const members = db.collection('fridge_members');
const items = db.collection('fridge_items');
const diaries = db.collection('fridge_diaries');
const invites = db.collection('fridge_invites');
const operations = db.collection('fridge_operations');

const MAX_MEMBERS = 10;
const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function cleanText(value, fallback, maxLength = 24) {
  const text = String(value || '').trim().slice(0, maxLength);
  return text || fallback;
}

function memberId(fridgeId, openid) {
  return hash(`${fridgeId}:${openid}`).slice(0, 40);
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

async function getMembership(fridgeId, openid) {
  const membership = await getDocument(members, memberId(fridgeId, openid));
  return membership && membership.status === 'active' ? membership : null;
}

async function requireMembership(fridgeId, openid, ownerOnly = false) {
  const membership = await getMembership(fridgeId, openid);
  if (!membership) throw new Error('你不是该冰箱的成员');
  if (ownerOnly && membership.role !== 'owner') throw new Error('只有所有者可以执行此操作');
  return membership;
}

async function listUserFridges(openid) {
  const memberResult = await members.where({ openid, status: 'active' }).limit(100).get();
  const result = [];
  for (const membership of memberResult.data || []) {
    const fridge = await getDocument(fridges, membership.fridgeId);
    if (!fridge || fridge.deletedAt) continue;
    result.push({
      id: fridge._id,
      name: fridge.name,
      role: membership.role,
      nickname: membership.nickname,
      memberCount: fridge.memberCount || 1,
      revision: fridge.revision || 0
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

async function getSnapshot(fridgeId) {
  const [fridge, itemResult, diaryResult] = await Promise.all([
    getDocument(fridges, fridgeId),
    items.where({ fridgeId, deleted: db.command.neq(true) }).limit(1000).get(),
    diaries.where({ fridgeId, deleted: db.command.neq(true) }).limit(1000).get()
  ]);
  return {
    revision: fridge?.revision || 0,
    inventory: (itemResult.data || []).map(({ _id, fridgeId: ignored, ...item }) => item),
    diary: (diaryResult.data || []).map(({ _id, fridgeId: ignored, ...entry }) => entry)
  };
}

async function importLegacy(fridgeId, openid, legacyData) {
  const inventory = Array.isArray(legacyData?.inventory) ? legacyData.inventory : [];
  const diary = Array.isArray(legacyData?.diary) ? legacyData.diary : [];
  await Promise.all(inventory.map((item, index) => {
    const id = String(item.id || `legacy_item_${index}`);
    return items.doc(hash(`${fridgeId}:item:${id}`)).set({ data: {
      ...item,
      id,
      fridgeId,
      _version: 1,
      revision: 1,
      createdBy: memberId(fridgeId, openid),
      updatedBy: memberId(fridgeId, openid),
      createdAt: item.createdAt || Date.now(),
      updatedAt: Date.now(),
      deleted: false
    } });
  }));
  await Promise.all(diary.map((entry, index) => {
    const id = String(entry.id || `legacy_diary_${index}`);
    return diaries.doc(hash(`${fridgeId}:diary:${id}`)).set({ data: {
      ...entry,
      id,
      imageList: [],
      fridgeId,
      _version: 1,
      revision: 1,
      createdBy: memberId(fridgeId, openid),
      updatedBy: memberId(fridgeId, openid),
      updatedAt: Date.now(),
      deleted: false
    } });
  }));
}

async function bootstrap(openid, event) {
  let profile = await getDocument(profiles, openid);
  let migratedLegacy = false;
  if (!profile) {
    migratedLegacy = true;
    const fridgeId = `fridge_${hash(openid).slice(0, 24)}`;
    const nickname = cleanText(event.nickname, '我', 16);
    const legacy = event.legacyData || {};
    await fridges.doc(fridgeId).set({ data: {
      name: '我的冰箱',
      ownerOpenId: openid,
      memberCount: 1,
      revision: 1,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    } });
    await members.doc(memberId(fridgeId, openid)).set({ data: {
      fridgeId,
      openid,
      role: 'owner',
      nickname,
      status: 'active',
      joinedAt: db.serverDate()
    } });
    profile = {
      nickname,
      activeFridgeId: fridgeId,
      preferences: legacy.preferences || {},
      favoriteRecipes: legacy.favoriteRecipes || [],
      excludedIngredients: legacy.excludedIngredients || [],
      reminderState: legacy.reminderState || {},
      migrationVersion: 1,
      nicknameConfigured: false
    };
    await profiles.doc(openid).set({ data: { ...profile, updatedAt: db.serverDate() } });
    await importLegacy(fridgeId, openid, legacy);
  }
  let fridgeList = await listUserFridges(openid);
  if (!fridgeList.length) {
    const created = await createFridge(openid, { name: '我的冰箱', nickname: profile.nickname || '我' });
    profile.activeFridgeId = created.fridge.id;
    fridgeList = await listUserFridges(openid);
  }
  const activeFridgeId = fridgeList.some((fridge) => fridge.id === profile.activeFridgeId)
    ? profile.activeFridgeId
    : fridgeList[0]?.id;
  return {
    success: true,
    profile: {
      nickname: profile.nickname || '我',
      nicknameConfigured: Boolean(profile.nicknameConfigured),
      preferences: profile.preferences || {},
      favoriteRecipes: profile.favoriteRecipes || [],
      excludedIngredients: profile.excludedIngredients || [],
      reminderState: profile.reminderState || {}
    },
    fridges: fridgeList,
    activeFridgeId,
    snapshot: activeFridgeId ? await getSnapshot(activeFridgeId) : null,
    migratedLegacy
  };
}

async function createFridge(openid, event) {
  const fridgeId = `fridge_${crypto.randomBytes(12).toString('hex')}`;
  const nickname = cleanText(event.nickname, '我', 16);
  const fridge = { id: fridgeId, name: cleanText(event.name, '家庭冰箱'), role: 'owner', memberCount: 1, revision: 0 };
  await db.runTransaction(async (transaction) => {
    const now = Date.now();
    await transaction.collection('fridges').doc(fridgeId).set({ data: {
      name: fridge.name,
      ownerOpenId: openid,
      memberCount: 1,
      revision: 0,
      createdAt: now,
      updatedAt: now
    } });
    await transaction.collection('fridge_members').doc(memberId(fridgeId, openid)).set({ data: {
      fridgeId, openid, role: 'owner', nickname, status: 'active', joinedAt: now
    } });
    await transaction.collection('user_profiles').doc(openid).update({ data: { activeFridgeId: fridgeId, updatedAt: now } });
  });
  return { success: true, fridge };
}

async function createInvite(openid, event) {
  await requireMembership(event.fridgeId, openid, true);
  const fridge = await getDocument(fridges, event.fridgeId);
  if ((fridge.memberCount || 1) >= MAX_MEMBERS) throw new Error(`每个冰箱最多 ${MAX_MEMBERS} 名成员`);
  const token = crypto.randomBytes(24).toString('hex');
  const tokenHash = hash(token);
  await invites.doc(tokenHash).set({ data: {
    fridgeId: event.fridgeId,
    createdBy: memberId(event.fridgeId, openid),
    expiresAt: Date.now() + INVITE_TTL_MS,
    usedAt: null,
    createdAt: db.serverDate()
  } });
  return { success: true, token, expiresAt: Date.now() + INVITE_TTL_MS, fridgeName: fridge.name };
}

async function resolveInvite(event) {
  const invite = await getDocument(invites, hash(event.token));
  if (!invite || invite.usedAt || Number(invite.expiresAt) <= Date.now()) throw new Error('邀请已失效');
  const fridge = await getDocument(fridges, invite.fridgeId);
  if (!fridge || fridge.deletedAt) throw new Error('冰箱不存在');
  const owner = await getMembership(invite.fridgeId, fridge.ownerOpenId);
  return { success: true, invite: { fridgeId: invite.fridgeId, fridgeName: fridge.name, ownerNickname: owner?.nickname || '所有者' } };
}

async function acceptInvite(openid, event) {
  const tokenHash = hash(event.token);
  const nickname = cleanText(event.nickname, '家庭成员', 16);
  const accepted = await db.runTransaction(async (transaction) => {
    const invite = await getTransactionDocument(transaction, 'fridge_invites', tokenHash);
    if (!invite || invite.usedAt || Number(invite.expiresAt) <= Date.now()) throw new Error('邀请已失效');
    const fridge = await getTransactionDocument(transaction, 'fridges', invite.fridgeId);
    if (!fridge || fridge.deletedAt) throw new Error('冰箱不存在');
    const membershipId = memberId(invite.fridgeId, openid);
    const existing = await getTransactionDocument(transaction, 'fridge_members', membershipId);
    const isExisting = existing && existing.status === 'active';
    if (!isExisting && (fridge.memberCount || 1) >= MAX_MEMBERS) throw new Error(`每个冰箱最多 ${MAX_MEMBERS} 名成员`);
    const now = Date.now();
    if (!isExisting) {
      await transaction.collection('fridge_members').doc(membershipId).set({ data: {
        fridgeId: invite.fridgeId,
        openid,
        role: 'member',
        nickname,
        status: 'active',
        joinedAt: now
      } });
      await transaction.collection('fridges').doc(invite.fridgeId).update({ data: {
        memberCount: Number(fridge.memberCount || 1) + 1,
        updatedAt: now
      } });
    }
    await transaction.collection('fridge_invites').doc(tokenHash).update({ data: {
      usedAt: now,
      usedBy: membershipId
    } });
    return { invite, fridge, existing: isExisting ? existing : null };
  });
  const profile = await getDocument(profiles, openid);
  const profilePatch = { activeFridgeId: accepted.invite.fridgeId, nickname, updatedAt: db.serverDate() };
  if (profile) await profiles.doc(openid).update({ data: profilePatch });
  else await profiles.doc(openid).set({ data: profilePatch });
  return { success: true, fridge: {
    id: accepted.invite.fridgeId,
    name: accepted.fridge.name,
    role: accepted.existing?.role || 'member',
    memberCount: (accepted.fridge.memberCount || 1) + (accepted.existing ? 0 : 1)
  } };
}

async function listMembers(openid, event) {
  const self = await requireMembership(event.fridgeId, openid);
  const result = await members.where({ fridgeId: event.fridgeId, status: 'active' }).limit(MAX_MEMBERS).get();
  return { success: true, role: self.role, members: (result.data || []).map((member) => ({
    memberId: member._id,
    nickname: member.nickname,
    role: member.role,
    isSelf: member.openid === openid
  })) };
}

async function updateProfile(openid, event) {
  const allowed = event.profile || {};
  await profiles.doc(openid).set({ data: {
    nickname: cleanText(allowed.nickname, '我', 16),
    nicknameConfigured: Boolean(allowed.nicknameConfigured),
    activeFridgeId: event.activeFridgeId,
    preferences: event.preferences || {},
    favoriteRecipes: Array.isArray(event.favoriteRecipes) ? event.favoriteRecipes : [],
    excludedIngredients: Array.isArray(event.excludedIngredients) ? event.excludedIngredients : [],
    reminderState: event.reminderState || {},
    updatedAt: db.serverDate()
  } });
  return { success: true };
}

async function cleanupFridge(fridgeId) {
  const diaryResult = await diaries.where({ fridgeId }).limit(1000).get();
  const fileList = (diaryResult.data || []).flatMap((entry) => entry.imageList || []).filter((id) => String(id).startsWith('cloud://'));
  if (fileList.length) await cloud.deleteFile({ fileList }).catch(() => {});
  for (const collection of [items, diaries, operations, invites, members]) {
    const result = await collection.where({ fridgeId }).limit(1000).get();
    await Promise.all((result.data || []).map((record) => collection.doc(record._id).remove()));
  }
  await fridges.doc(fridgeId).remove();
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, error: '无法识别当前用户' };
  try {
    switch (event.action) {
      case 'bootstrap': return await bootstrap(OPENID, event);
      case 'listFridges': return { success: true, fridges: await listUserFridges(OPENID) };
      case 'createFridge': return await createFridge(OPENID, event);
      case 'updateProfile': return await updateProfile(OPENID, event);
      case 'createInvite': return await createInvite(OPENID, event);
      case 'resolveInvite': return await resolveInvite(event);
      case 'acceptInvite': return await acceptInvite(OPENID, event);
      case 'listMembers': return await listMembers(OPENID, event);
      case 'renameFridge': {
        await requireMembership(event.fridgeId, OPENID, true);
        const name = cleanText(event.name, '家庭冰箱');
        await fridges.doc(event.fridgeId).update({ data: { name, updatedAt: db.serverDate() } });
        return { success: true, fridge: { id: event.fridgeId, name } };
      }
      case 'updateMemberNickname': {
        await requireMembership(event.fridgeId, OPENID);
        const nickname = cleanText(event.nickname, '家庭成员', 16);
        await members.doc(memberId(event.fridgeId, OPENID)).update({ data: { nickname } });
        await profiles.doc(OPENID).update({ data: { nickname, nicknameConfigured: true, updatedAt: db.serverDate() } });
        return { success: true, nickname };
      }
      case 'removeMember': {
        await requireMembership(event.fridgeId, OPENID, true);
        await db.runTransaction(async (transaction) => {
          const target = await getTransactionDocument(transaction, 'fridge_members', event.memberId);
          const fridge = await getTransactionDocument(transaction, 'fridges', event.fridgeId);
          if (!target || target.fridgeId !== event.fridgeId || target.role === 'owner') throw new Error('无法移除该成员');
          const now = Date.now();
          await transaction.collection('fridge_members').doc(target._id).update({ data: { status: 'removed', removedAt: now } });
          await transaction.collection('fridges').doc(event.fridgeId).update({ data: {
            memberCount: Math.max(1, Number(fridge.memberCount || 1) - 1), updatedAt: now
          } });
        });
        return { success: true };
      }
      case 'transferOwnership': {
        await requireMembership(event.fridgeId, OPENID, true);
        await db.runTransaction(async (transaction) => {
          const target = await getTransactionDocument(transaction, 'fridge_members', event.memberId);
          if (!target || target.fridgeId !== event.fridgeId || target.status !== 'active') throw new Error('目标成员不存在');
          const now = Date.now();
          await transaction.collection('fridge_members').doc(memberId(event.fridgeId, OPENID)).update({ data: { role: 'member' } });
          await transaction.collection('fridge_members').doc(target._id).update({ data: { role: 'owner' } });
          await transaction.collection('fridges').doc(event.fridgeId).update({ data: { ownerOpenId: target.openid, updatedAt: now } });
        });
        return { success: true };
      }
      case 'leaveFridge': {
        const self = await requireMembership(event.fridgeId, OPENID);
        if (self.role === 'owner') throw new Error('请先转让所有权');
        await db.runTransaction(async (transaction) => {
          const fridge = await getTransactionDocument(transaction, 'fridges', event.fridgeId);
          const now = Date.now();
          await transaction.collection('fridge_members').doc(self._id).update({ data: { status: 'left', leftAt: now } });
          await transaction.collection('fridges').doc(event.fridgeId).update({ data: {
            memberCount: Math.max(1, Number(fridge.memberCount || 1) - 1), updatedAt: now
          } });
        });
        return { success: true };
      }
      case 'deleteFridge': {
        const self = await requireMembership(event.fridgeId, OPENID, true);
        const fridge = await getDocument(fridges, event.fridgeId);
        if ((fridge.memberCount || 1) > 1) throw new Error('有其他成员时请先转让所有权');
        await fridges.doc(event.fridgeId).update({ data: { deletedAt: db.serverDate(), deletedBy: self._id } });
        await cleanupFridge(event.fridgeId);
        return { success: true };
      }
      default: return { success: false, error: '不支持的操作' };
    }
  } catch (error) {
    console.error('fridgeAccess failed:', event.action, error);
    return { success: false, error: error.message || '共享冰箱服务暂不可用' };
  }
};
