// utils/storage.js
const STORAGE_KEY = 'fridge_chef_data';
const SCHEMA_VERSION = 5;
const { clone, consumeInventory, migrateData, normalizeRecipes } = require('./domain');

const defaultData = {
  schemaVersion: SCHEMA_VERSION,
  profile: { nickname: '我', nicknameConfigured: false },
  activeFridgeId: 'local-default',
  fridges: [
    { id: 'local-default', name: '我的冰箱', role: 'owner', memberCount: 1, revision: 0 }
  ],
  fridgeCaches: {},
  pendingOperations: [],
  syncConflicts: [],
  profileDirty: false,
  inventory: [],
  excludedIngredients: [],
  recipes: [
    // 鸡蛋类
    { name: '西红柿炒蛋', ingredients: ['鸡蛋', '西红柿'], difficulty: '简单' },
    { name: '番茄蛋汤', ingredients: ['鸡蛋', '西红柿'], difficulty: '极简' },
    { name: '韭菜炒蛋', ingredients: ['鸡蛋', '韭菜'], difficulty: '简单' },
    { name: '蒸蛋羹', ingredients: ['鸡蛋'], difficulty: '简单' },
    { name: '黄瓜炒蛋', ingredients: ['鸡蛋', '黄瓜'], difficulty: '简单' },
    { name: '苦瓜炒蛋', ingredients: ['鸡蛋', '苦瓜'], difficulty: '简单' },
    { name: '葱花炒蛋', ingredients: ['鸡蛋'], difficulty: '极简' },

    // 肉类
    { name: '红烧肉', ingredients: ['猪肉'], difficulty: '中等' },
    { name: '糖醋排骨', ingredients: ['排骨'], difficulty: '中等' },
    { name: '宫保鸡丁', ingredients: ['鸡肉', '花生'], difficulty: '中等' },
    { name: '可乐鸡翅', ingredients: ['鸡翅'], difficulty: '简单' },
    { name: '红烧鸡翅', ingredients: ['鸡翅'], difficulty: '简单' },
    { name: '鱼香肉丝', ingredients: ['猪肉', '木耳', '胡萝卜'], difficulty: '中等' },
    { name: '回锅肉', ingredients: ['猪肉', '青椒'], difficulty: '中等' },
    { name: '孜然牛肉', ingredients: ['牛肉', '洋葱'], difficulty: '简单' },
    { name: '水煮肉片', ingredients: ['猪肉', '豆芽'], difficulty: '中等' },
    { name: '香菇滑鸡', ingredients: ['鸡肉', '香菇'], difficulty: '简单' },

    // 蔬菜类
    { name: '蒜蓉西兰花', ingredients: ['西兰花'], difficulty: '简单' },
    { name: '清炒土豆丝', ingredients: ['土豆'], difficulty: '简单' },
    { name: '酸辣土豆丝', ingredients: ['土豆'], difficulty: '简单' },
    { name: '手撕包菜', ingredients: ['包菜'], difficulty: '简单' },
    { name: '干煸四季豆', ingredients: ['四季豆'], difficulty: '中等' },
    { name: '地三鲜', ingredients: ['土豆', '茄子', '青椒'], difficulty: '中等' },
    { name: '虎皮青椒', ingredients: ['青椒'], difficulty: '简单' },
    { name: '蚝油生菜', ingredients: ['生菜'], difficulty: '极简' },
    { name: '清炒小白菜', ingredients: ['小白菜'], difficulty: '极简' },
    { name: '凉拌黄瓜', ingredients: ['黄瓜'], difficulty: '极简' },
    { name: '番茄花菜', ingredients: ['西红柿', '花菜'], difficulty: '简单' },

    // 海鲜类
    { name: '清蒸鱼', ingredients: ['鱼'], difficulty: '中等' },
    { name: '红烧鱼', ingredients: ['鱼'], difficulty: '中等' },
    { name: '糖醋鱼', ingredients: ['鱼'], difficulty: '中等' },
    { name: '白灼虾', ingredients: ['虾'], difficulty: '极简' },
    { name: '油焖大虾', ingredients: ['虾'], difficulty: '简单' },
    { name: '蒜蓉蒸虾', ingredients: ['虾'], difficulty: '简单' },

    // 汤类
    { name: '紫菜蛋花汤', ingredients: ['鸡蛋', '紫菜'], difficulty: '极简' },
    { name: '冬瓜排骨汤', ingredients: ['排骨', '冬瓜'], difficulty: '简单' },
    { name: '玉米排骨汤', ingredients: ['排骨', '玉米'], difficulty: '简单' },
    { name: '西红柿牛腩汤', ingredients: ['牛肉', '西红柿'], difficulty: '中等' },
    { name: '酸菜鱼', ingredients: ['鱼', '酸菜'], difficulty: '中等' },
    { name: '菠菜蛋汤', ingredients: ['鸡蛋', '菠菜'], difficulty: '极简' },

    // 主食类
    { name: '蛋炒饭', ingredients: ['鸡蛋', '米饭'], difficulty: '简单' },
    { name: '西红柿鸡蛋面', ingredients: ['鸡蛋', '西红柿', '面条'], difficulty: '简单' },
    { name: '葱油拌面', ingredients: ['面条'], difficulty: '简单' },
    { name: '韭菜盒子', ingredients: ['韭菜', '鸡蛋', '面粉'], difficulty: '中等' },
    { name: '番茄鸡蛋饺子', ingredients: ['鸡蛋', '西红柿', '饺子皮'], difficulty: '中等' }
  ],
  diary: [],
  excludedIngredients: [],
  newlyAddedIngredients: [],
  favoriteRecipes: [],
  preferences: { servings: 2, maxDifficulty: '困难', expiryReminderEnabled: true },
  reminderState: {}
};

let cache = null;
let cloudSyncTimer = null;
let profileSyncTimer = null;
let cloudSyncRetryDelay = 2000;
let cloudDirty = false;
let cloudConflict = false;

const LEGACY_MOCK_ITEMS = [
  { id: 1, name: '鸡蛋', quantity: 6, unit: '个', expiryDate: '2026-03-10', category: '农产品' },
  { id: 2, name: '西红柿', quantity: 2, unit: '个', expiryDate: '2026-03-05', category: '蔬菜' }
];

function removeLegacyMockInventory(data, sourceVersion) {
  if (Number(sourceVersion || 0) >= SCHEMA_VERSION) return data;
  data.inventory = (data.inventory || []).filter((item) => !LEGACY_MOCK_ITEMS.some((mock) =>
    Object.keys(mock).every((key) => item[key] === mock[key])
  ));
  return data;
}

function migrateStoredData(raw) {
  const migrated = migrateData(raw, defaultData, SCHEMA_VERSION);
  removeLegacyMockInventory(migrated, raw && raw.schemaVersion);
  migrated.recipes = normalizeRecipes(migrated.recipes);
  migrated.profile = migrated.profile && typeof migrated.profile === 'object'
    ? migrated.profile
    : { nickname: '我', nicknameConfigured: false };
  migrated.activeFridgeId = migrated.activeFridgeId || 'local-default';
  migrated.fridges = Array.isArray(migrated.fridges) && migrated.fridges.length
    ? migrated.fridges
    : clone(defaultData.fridges);
  migrated.fridgeCaches = migrated.fridgeCaches && typeof migrated.fridgeCaches === 'object'
    ? migrated.fridgeCaches
    : {};
  if (!migrated.fridgeCaches[migrated.activeFridgeId]) {
    migrated.fridgeCaches[migrated.activeFridgeId] = {
      inventory: clone(migrated.inventory || []),
      diary: clone(migrated.diary || []),
      revision: 0
    };
  }
  const activeCache = migrated.fridgeCaches[migrated.activeFridgeId];
  migrated.inventory = clone(activeCache.inventory || []);
  migrated.diary = clone(activeCache.diary || []);
  migrated.pendingOperations = Array.isArray(migrated.pendingOperations) ? migrated.pendingOperations : [];
  migrated.syncConflicts = Array.isArray(migrated.syncConflicts) ? migrated.syncConflicts : [];
  migrated.profileDirty = Boolean(migrated.profileDirty);
  return migrated;
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function persistActiveFridge(data) {
  if (!data.activeFridgeId) return;
  data.fridgeCaches = data.fridgeCaches || {};
  const previous = data.fridgeCaches[data.activeFridgeId] || {};
  data.fridgeCaches[data.activeFridgeId] = {
    ...previous,
    inventory: clone(data.inventory || []),
    diary: clone(data.diary || [])
  };
}

function queueOperation(data, entityType, action, entityId, payload, baseVersion = 0) {
  const existing = (data.pendingOperations || []).find((operation) =>
    operation.fridgeId === data.activeFridgeId &&
    operation.entityType === entityType &&
    operation.entityId === entityId &&
    operation.status === 'pending'
  );
  if (existing && action === 'update' && (existing.action === 'create' || existing.action === 'update')) {
    existing.payload = { ...existing.payload, ...clone(payload || {}) };
    return existing;
  }
  if (existing && action === 'delete' && existing.action === 'create') {
    data.pendingOperations = data.pendingOperations.filter((operation) => operation.opId !== existing.opId);
    return null;
  }
  if (existing && action === 'delete') {
    data.pendingOperations = data.pendingOperations.filter((operation) => operation.opId !== existing.opId);
  }
  const operation = {
    opId: createId('op'),
    fridgeId: data.activeFridgeId,
    entityType,
    action,
    entityId,
    payload: clone(payload || {}),
    baseVersion: Number(baseVersion || 0),
    createdAt: Date.now(),
    status: 'pending'
  };
  data.pendingOperations = data.pendingOperations || [];
  data.pendingOperations.push(operation);
  return operation;
}

function canSyncCloud() {
  return typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.callFunction === 'function';
}

function callAccess(action, data = {}) {
  if (!canSyncCloud()) return Promise.reject(new Error('当前无法连接共享冰箱服务'));
  return wx.cloud.callFunction({ name: 'fridgeAccess', data: { action, ...data } })
    .then((response) => {
      if (!response.result || response.result.success === false) {
        throw new Error(response.result?.error || '共享冰箱服务暂不可用');
      }
      return response.result;
    });
}

function profilePayload(data) {
  return {
    profile: data.profile,
    activeFridgeId: data.activeFridgeId,
    preferences: data.preferences,
    favoriteRecipes: data.favoriteRecipes,
    excludedIngredients: data.excludedIngredients,
    reminderState: data.reminderState
  };
}

async function pushProfileNow() {
  if (!canSyncCloud()) return { synced: false, reason: 'unavailable' };
  const data = getSnapshot();
  if (!data.activeFridgeId || data.activeFridgeId === 'local-default') {
    return { synced: false, reason: 'not_bootstrapped' };
  }
  await callAccess('updateProfile', profilePayload(data));
  const next = getSnapshot();
  next.profileDirty = false;
  saveData(next, { sync: false, touch: false });
  return { synced: true };
}

function scheduleProfilePush() {
  const current = getSnapshot();
  current.profileDirty = true;
  saveData(current, { sync: false, touch: false });
  if (!canSyncCloud() || current.activeFridgeId === 'local-default') return;
  if (profileSyncTimer) clearTimeout(profileSyncTimer);
  profileSyncTimer = setTimeout(async () => {
    profileSyncTimer = null;
    try {
      await pushProfileNow();
    } catch (error) {
      console.warn('个人偏好同步失败，将在下次修改时重试');
    }
  }, 500);
}

function getLegacySnapshot() {
  const snapshot = getSnapshot();
  return {
    inventory: snapshot.inventory,
    diary: snapshot.diary.map((entry) => ({ ...entry, imageList: [] })),
    preferences: snapshot.preferences,
    favoriteRecipes: snapshot.favoriteRecipes,
    excludedIngredients: snapshot.excludedIngredients,
    reminderState: snapshot.reminderState,
    updatedAt: snapshot.updatedAt
  };
}

function applyFridgeSnapshot(data, fridgeId, snapshot) {
  if (!snapshot) return;
  data.fridgeCaches ||= {};
  const localImages = new Map((data.fridgeCaches[fridgeId]?.diary || [])
    .map((entry) => [String(entry.id), entry.imageList || []]));
  const diary = (snapshot.diary || []).map((entry) => ({
    ...entry,
    imageList: entry.imageList?.length ? entry.imageList : (localImages.get(String(entry.id)) || [])
  }));
  data.fridgeCaches[fridgeId] = {
    inventory: clone(snapshot.inventory || []),
    diary: clone(diary),
    revision: Number(snapshot.revision || 0)
  };
  if (data.activeFridgeId === fridgeId) {
    data.inventory = clone(snapshot.inventory || []);
    data.diary = clone(diary);
  }
}

async function flushPendingOperations() {
  if (!canSyncCloud()) return { synced: false, reason: 'unavailable' };
  const pending = (getSnapshot().pendingOperations || [])
    .filter((operation) => operation.status === 'pending');
  if (!pending.length) return { synced: true, applied: 0 };
  const groups = pending.reduce((result, operation) => {
    (result[operation.fridgeId] ||= []).push(operation);
    return result;
  }, {});
  let appliedCount = 0;
  for (const [fridgeId, operations] of Object.entries(groups)) {
    const response = await wx.cloud.callFunction({
      name: 'fridgeSync',
      data: { action: 'applyOperations', fridgeId, operations }
    });
    if (!response.result || response.result.success === false) {
      throw new Error(response.result?.error || '共享冰箱写入失败');
    }
    const appliedIds = new Set(response.result.appliedOpIds || []);
    const conflicts = response.result.conflicts || [];
    const conflictIds = new Set(conflicts.map((item) => item.opId));
    const next = getSnapshot();
    next.pendingOperations = next.pendingOperations
      .filter((operation) => !appliedIds.has(operation.opId))
      .map((operation) => conflictIds.has(operation.opId)
        ? { ...operation, status: 'blocked' }
        : operation);
    next.syncConflicts = [
      ...(next.syncConflicts || []).filter((item) => !conflictIds.has(item.opId)),
      ...conflicts
    ];
    if (response.result.snapshot) applyFridgeSnapshot(next, fridgeId, response.result.snapshot);
    saveData(next, { sync: false, touch: false });
    appliedCount += appliedIds.size;
  }
  return { synced: true, applied: appliedCount };
}

function scheduleCloudPush(delay = 500) {
  if (!canSyncCloud()) return;
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(async () => {
    cloudSyncTimer = null;
    try {
      await flushPendingOperations();
      cloudDirty = (cache?.pendingOperations || []).some((operation) => operation.status === 'pending');
      cloudConflict = (cache?.syncConflicts || []).length > 0;
      cloudSyncRetryDelay = 2000;
    } catch (error) {
      console.warn(`云端同步失败，将在 ${cloudSyncRetryDelay / 1000} 秒后重试`);
      scheduleCloudPush(cloudSyncRetryDelay);
      cloudSyncRetryDelay = Math.min(cloudSyncRetryDelay * 2, 30000);
    }
  }, delay);
}

function saveData(data, options = {}) {
  if (options.touch !== false) data.updatedAt = Date.now();
  persistActiveFridge(data);
  cache = data;
  wx.setStorageSync(STORAGE_KEY, data);
  if (options.sync !== false) {
    cloudDirty = true;
    cloudConflict = false;
    scheduleCloudPush();
  }
}

function initialize() {
  if (cache) return clone(cache);
  const raw = wx.getStorageSync(STORAGE_KEY) || null;
  const migrated = migrateStoredData(raw);
  if (!migrated.updatedAt) migrated.updatedAt = 0;
  saveData(migrated, { sync: false, touch: false });
  return clone(migrated);
}

async function syncWithCloud() {
  if (!canSyncCloud()) return { synced: false, reason: 'unavailable' };
  const local = getSnapshot();
  const response = await wx.cloud.callFunction({
    name: 'fridgeAccess',
    data: {
      action: 'bootstrap',
      nickname: local.profile?.nickname || '我',
      legacyData: getLegacySnapshot()
    }
  });
  if (!response.result || response.result.success === false) {
    throw new Error((response.result && response.result.error) || '共享冰箱初始化失败');
  }
  const next = getSnapshot();
  if (!local.profileDirty) {
    next.profile = { ...next.profile, ...(response.result.profile || {}) };
    if (response.result.profile?.preferences) next.preferences = response.result.profile.preferences;
    if (response.result.profile?.favoriteRecipes) next.favoriteRecipes = response.result.profile.favoriteRecipes;
    if (response.result.profile?.excludedIngredients) next.excludedIngredients = response.result.profile.excludedIngredients;
    if (response.result.profile?.reminderState) next.reminderState = response.result.profile.reminderState;
  }
  next.fridges = response.result.fridges || next.fridges;
  next.activeFridgeId = response.result.activeFridgeId || next.activeFridgeId;
  if (response.result.migratedLegacy) {
    next.pendingOperations = (next.pendingOperations || [])
      .filter((operation) => operation.fridgeId !== 'local-default');
    next.syncConflicts = (next.syncConflicts || [])
      .filter((conflict) => conflict.fridgeId !== 'local-default');
    delete next.fridgeCaches['local-default'];
  }
  if (response.result.snapshot) applyFridgeSnapshot(next, next.activeFridgeId, response.result.snapshot);
  saveData(next, { sync: false, touch: false });
  await flushPendingOperations();
  if (local.profileDirty) await pushProfileNow();
  cloudDirty = (cache?.pendingOperations || []).some((operation) => operation.status === 'pending');
  cloudConflict = (cache?.syncConflicts || []).length > 0;
  cloudSyncRetryDelay = 2000;
  return { synced: true, source: 'shared' };
}

function retryCloudSync() {
  if (!canSyncCloud()) return Promise.resolve({ synced: false, reason: 'unavailable' });
  if (getSnapshot().profileDirty) scheduleProfilePush();
  if (cloudDirty && !cloudConflict) {
    scheduleCloudPush(0);
    return Promise.resolve({ synced: false, reason: 'push_scheduled' });
  }
  return syncWithCloud();
}

function getCloudSyncState() {
  const data = getSnapshot();
  return {
    dirty: cloudDirty || data.profileDirty,
    conflict: cloudConflict,
    pendingCount: (data.pendingOperations || []).filter((item) => item.status === 'pending').length + (data.profileDirty ? 1 : 0),
    conflictCount: (data.syncConflicts || []).length
  };
}

function getSnapshot() {
  if (!cache) initialize();
  return clone(cache);
}

function mutateData(mutator) {
  const draft = getSnapshot();
  const result = mutator(draft);
  saveData(draft);
  return result;
}

const initData = initialize;
const getData = getSnapshot;

/**
 * 工具函数：格式化日期为 YYYY-MM-DD
 */
function formatDate(date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 工具函数：在指定日期上加天数
 */
function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function getInventory() {
  return getSnapshot().inventory;
}

function addItem(item) {
  return addItems([item])[0];
}

function addItems(items) {
  return mutateData((data) => {
    const ids = (items || []).map((item) => {
      const id = createId('item');
      const record = { id, ...item, _version: 0 };
      data.inventory.push(record);
      queueOperation(data, 'item', 'create', id, record);
      return id;
    });
    return ids;
  });
}

function updateItem(id, patch) {
  return mutateData((data) => {
    const index = data.inventory.findIndex((item) => item.id === id);
    if (index < 0) return false;
    const current = data.inventory[index];
    data.inventory[index] = { ...current, ...patch };
    queueOperation(data, 'item', 'update', id, patch, current._version);
    return true;
  });
}

function removeItem(id) {
  return mutateData((data) => {
    const current = data.inventory.find((item) => item.id === id);
    const before = data.inventory.length;
    data.inventory = data.inventory.filter((item) => item.id !== id);
    if (current) queueOperation(data, 'item', 'delete', id, {}, current._version);
    return data.inventory.length !== before;
  });
}

function getRecipes() {
  return getSnapshot().recipes;
}

function getPreferences() {
  return getSnapshot().preferences;
}

function updatePreferences(patch) {
  mutateData((data) => {
    data.preferences = { ...data.preferences, ...patch };
  });
  scheduleProfilePush();
}

function getFavoriteRecipes() {
  return getSnapshot().favoriteRecipes;
}

function toggleFavoriteRecipe(name) {
  const result = mutateData((data) => {
    const favorites = new Set(data.favoriteRecipes || []);
    if (favorites.has(name)) favorites.delete(name);
    else favorites.add(name);
    data.favoriteRecipes = Array.from(favorites);
    return favorites.has(name);
  });
  scheduleProfilePush();
  return result;
}

function claimDailyExpiryReminder() {
  const result = mutateData((data) => {
    if (!data.preferences.expiryReminderEnabled) return false;
    const today = formatDate(new Date());
    if (data.reminderState.lastExpiryReminderDate === today) return false;
    data.reminderState.lastExpiryReminderDate = today;
    return true;
  });
  if (result) scheduleProfilePush();
  return result;
}

function getDiary() {
  return getSnapshot().diary.slice().sort((a, b) => b.createdAt - a.createdAt);
}

function publishDiary(entry) {
  return mutateData((data) => {
    const beforeInventory = new Map(data.inventory.map((item) => [item.id, clone(item)]));
    const consumption = consumeInventory(data.inventory, entry.usedIngredients || []);
    const diaryEntry = {
      ...entry,
      id: createId('diary'),
      createdAt: Date.now(),
      usedIngredients: consumption.consumedItems,
      _version: 0
    };
    data.inventory = consumption.inventory;
    const remaining = new Map(data.inventory.map((item) => [item.id, item]));
    consumption.consumedItems.forEach(({ id }) => {
      const previous = beforeInventory.get(id);
      const current = remaining.get(id);
      if (current) {
        queueOperation(data, 'item', 'update', id, { quantity: current.quantity }, previous?._version);
      } else if (previous) {
        queueOperation(data, 'item', 'delete', id, {}, previous._version);
      }
    });
    data.diary.push(diaryEntry);
    queueOperation(data, 'diary', 'create', diaryEntry.id, {
      ...diaryEntry,
      imageList: []
    });
    return {
      diaryEntry: clone(diaryEntry),
      consumedItems: clone(consumption.consumedItems),
      shortages: clone(consumption.shortages)
    };
  });
}

function removeDiaryEntry(id) {
  return mutateData((data) => {
    const index = data.diary.findIndex((entry) => entry.id === id);
    if (index < 0) return { removed: false, imagePaths: [] };
    const [removed] = data.diary.splice(index, 1);
    queueOperation(data, 'diary', 'delete', id, {}, removed._version);
    return { removed: true, imagePaths: clone(removed.imageList || []) };
  });
}

function updateDiaryImages(id, imageList) {
  return mutateData((data) => {
    const index = data.diary.findIndex((entry) => entry.id === id);
    if (index < 0) return false;
    const current = data.diary[index];
    data.diary[index] = { ...current, imageList: clone(imageList || []) };
    queueOperation(data, 'diary', 'update', id, { imageList: clone(imageList || []) }, current._version);
    return true;
  });
}

function getExcludedIngredients() {
  const data = getSnapshot();
  const excluded = data.excludedIngredients;
  const now = Date.now();
  const valid = excluded.filter((item) => item.expireAt > now);
  if (valid.length !== excluded.length) {
    mutateData((draft) => {
      draft.excludedIngredients = valid;
    });
  }
  return valid.map((item) => item.ingredientName);
}

function addExcludedIngredient(ingredientName) {
  mutateData((data) => {
    const expireAt = Date.now() + 24 * 60 * 60 * 1000;
    const existing = data.excludedIngredients.find(
      (item) => item.ingredientName === ingredientName
    );
    if (existing) existing.expireAt = expireAt;
    else data.excludedIngredients.push({ ingredientName, expireAt });
  });
  scheduleProfilePush();
}

function markNewlyAddedIngredients(ids) {
  mutateData((data) => {
    const now = Date.now();
    data.newlyAddedIngredients = ids.map((id) => ({ id, timestamp: now }));
  });
}

function getNewlyAddedIngredients() {
  const data = getSnapshot();
  const now = Date.now();
  const validMarks = data.newlyAddedIngredients.filter((mark) => now - mark.timestamp < 5000);
  if (validMarks.length > 0) {
    mutateData((draft) => {
      draft.newlyAddedIngredients = [];
    });
  }
  return {
    ids: validMarks.map((mark) => mark.id),
    shouldHighlight: validMarks.length > 0
  };
}

function getFridges() {
  return getSnapshot().fridges || [];
}

function getActiveFridge() {
  const data = getSnapshot();
  return data.fridges.find((fridge) => fridge.id === data.activeFridgeId) || null;
}

async function syncFridge(fridgeId) {
  if (!canSyncCloud()) return { synced: false, reason: 'unavailable' };
  await flushPendingOperations();
  const response = await wx.cloud.callFunction({
    name: 'fridgeSync',
    data: { action: 'getSnapshot', fridgeId }
  });
  if (!response.result || response.result.success === false) {
    throw new Error(response.result?.error || '冰箱数据读取失败');
  }
  const next = getSnapshot();
  applyFridgeSnapshot(next, fridgeId, response.result.snapshot);
  saveData(next, { sync: false, touch: false });
  return { synced: true };
}

async function switchFridge(fridgeId) {
  const data = getSnapshot();
  if (!data.fridges.some((fridge) => fridge.id === fridgeId)) {
    throw new Error('你已不是该冰箱的成员');
  }
  persistActiveFridge(data);
  data.activeFridgeId = fridgeId;
  const target = data.fridgeCaches[fridgeId] || { inventory: [], diary: [], revision: 0 };
  data.inventory = clone(target.inventory || []);
  data.diary = clone(target.diary || []);
  saveData(data, { sync: false });
  scheduleProfilePush();
  try {
    await syncFridge(fridgeId);
  } catch (error) {
    console.warn('已切换到本地缓存，联网后会自动刷新');
  }
  return getActiveFridge();
}

async function refreshFridgeList() {
  const result = await callAccess('listFridges');
  const data = getSnapshot();
  data.fridges = result.fridges || [];
  if (!data.fridges.some((fridge) => fridge.id === data.activeFridgeId) && data.fridges.length) {
    data.activeFridgeId = data.fridges[0].id;
  }
  saveData(data, { sync: false, touch: false });
  return data.fridges;
}

async function createFridge(name, nickname) {
  const result = await callAccess('createFridge', { name, nickname });
  await refreshFridgeList();
  await switchFridge(result.fridge.id);
  const data = getSnapshot();
  data.profile = { ...data.profile, nickname, nicknameConfigured: true };
  saveData(data, { sync: false });
  scheduleProfilePush();
  return result.fridge;
}

async function renameFridge(fridgeId, name) {
  const result = await callAccess('renameFridge', { fridgeId, name });
  await refreshFridgeList();
  return result.fridge;
}

function createInvite(fridgeId) {
  return callAccess('createInvite', { fridgeId });
}

function resolveInvite(token) {
  return callAccess('resolveInvite', { token });
}

async function acceptInvite(token, nickname) {
  const result = await callAccess('acceptInvite', { token, nickname });
  await refreshFridgeList();
  await switchFridge(result.fridge.id);
  const data = getSnapshot();
  data.profile = { ...data.profile, nickname, nicknameConfigured: true };
  saveData(data, { sync: false });
  scheduleProfilePush();
  return result.fridge;
}

function listMembers(fridgeId) {
  return callAccess('listMembers', { fridgeId });
}

async function updateMemberNickname(fridgeId, nickname) {
  const result = await callAccess('updateMemberNickname', { fridgeId, nickname });
  const data = getSnapshot();
  data.profile = { ...data.profile, nickname, nicknameConfigured: true };
  saveData(data, { sync: false });
  scheduleProfilePush();
  return result;
}

async function removeMember(fridgeId, memberOpenId) {
  const result = await callAccess('removeMember', { fridgeId, memberId: memberOpenId });
  await refreshFridgeList();
  return result;
}

async function transferOwnership(fridgeId, memberOpenId) {
  const result = await callAccess('transferOwnership', { fridgeId, memberId: memberOpenId });
  await refreshFridgeList();
  return result;
}

async function leaveFridge(fridgeId) {
  const result = await callAccess('leaveFridge', { fridgeId });
  await refreshFridgeList();
  const data = getSnapshot();
  if (data.activeFridgeId === fridgeId && data.fridges.length) await switchFridge(data.fridges[0].id);
  return result;
}

async function deleteFridge(fridgeId) {
  const result = await callAccess('deleteFridge', { fridgeId });
  await refreshFridgeList();
  const data = getSnapshot();
  delete data.fridgeCaches[fridgeId];
  if (!data.fridges.length) {
    data.activeFridgeId = '';
    data.inventory = [];
    data.diary = [];
  }
  saveData(data, { sync: false });
  if (data.fridges.length) await switchFridge(data.fridges[0].id);
  return result;
}

async function resolveSyncConflict(opId, strategy) {
  const data = getSnapshot();
  const conflict = data.syncConflicts.find((item) => item.opId === opId);
  const operation = data.pendingOperations.find((item) => item.opId === opId);
  if (!conflict || !operation) return false;
  if (strategy === 'remote') {
    data.pendingOperations = data.pendingOperations.filter((item) => item.opId !== opId);
    data.syncConflicts = data.syncConflicts.filter((item) => item.opId !== opId);
    saveData(data, { sync: false });
    await syncFridge(operation.fridgeId);
    return true;
  }
  operation.opId = createId('op');
  operation.baseVersion = Number(conflict.current?._version || 0);
  operation.status = 'pending';
  data.syncConflicts = data.syncConflicts.filter((item) => item.opId !== opId);
  saveData(data);
  return true;
}

module.exports = {
  initialize,
  getSnapshot,
  initData,
  getData,
  getInventory,
  addItem,
  addItems,
  updateItem,
  removeItem,
  getRecipes,
  getPreferences,
  updatePreferences,
  getFavoriteRecipes,
  toggleFavoriteRecipe,
  claimDailyExpiryReminder,
  getDiary,
  publishDiary,
  removeDiaryEntry,
  updateDiaryImages,
  formatDate,
  addDays,
  getExcludedIngredients,
  addExcludedIngredient,
  markNewlyAddedIngredients,
  getNewlyAddedIngredients,
  syncWithCloud,
  retryCloudSync,
  getCloudSyncState,
  getFridges,
  getActiveFridge,
  switchFridge,
  syncFridge,
  refreshFridgeList,
  createFridge,
  renameFridge,
  createInvite,
  resolveInvite,
  acceptInvite,
  listMembers,
  updateMemberNickname,
  removeMember,
  transferOwnership,
  leaveFridge,
  deleteFridge,
  resolveSyncConflict,
  flushPendingOperations
};
