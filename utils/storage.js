// utils/storage.js
const STORAGE_KEY = 'fridge_chef_data';
const SCHEMA_VERSION = 3;
const { clone, consumeInventory, migrateData, normalizeRecipes } = require('./domain');

/**
 * 默认 Mock 数据
 */
const defaultData = {
  schemaVersion: SCHEMA_VERSION,
  inventory: [
    {
      id: 1,
      name: '鸡蛋',
      quantity: 6,
      unit: '个',
      expiryDate: '2026-03-10',
      // 预设分类：农产品
      category: '农产品'
    },
    {
      id: 2,
      name: '西红柿',
      quantity: 2,
      unit: '个',
      expiryDate: '2026-03-05',
      // 预设分类：蔬菜
      category: '蔬菜'
    }
  ],
    // 不推荐的食材记录：{ ingredientName: '鸡蛋', expireAt: 1710000000000 }
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

function canSyncCloud() {
  return typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.callFunction === 'function';
}

function scheduleCloudPush() {
  if (!canSyncCloud()) return;
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(async () => {
    cloudSyncTimer = null;
    try {
      await wx.cloud.callFunction({
        name: 'syncData',
        data: { action: 'push', data: getCloudSnapshot() }
      });
    } catch (error) {
      console.warn('云端同步失败，将在下次修改时重试');
    }
  }, 500);
}

function getCloudSnapshot() {
  const snapshot = getSnapshot();
  snapshot.diary = snapshot.diary.map((entry) => ({ ...entry, imageList: [] }));
  return snapshot;
}

function saveData(data, options = {}) {
  if (options.touch !== false) data.updatedAt = Date.now();
  cache = data;
  wx.setStorageSync(STORAGE_KEY, data);
  if (options.sync !== false) scheduleCloudPush();
}

function initialize() {
  if (cache) return clone(cache);
  const raw = wx.getStorageSync(STORAGE_KEY) || null;
  const migrated = migrateData(raw, defaultData, SCHEMA_VERSION);
  migrated.recipes = normalizeRecipes(migrated.recipes);
  if (!migrated.updatedAt) migrated.updatedAt = Date.now();
  saveData(migrated, { sync: false, touch: false });
  return clone(migrated);
}

async function syncWithCloud() {
  if (!canSyncCloud()) return { synced: false, reason: 'unavailable' };
  const local = getSnapshot();
  const response = await wx.cloud.callFunction({ name: 'syncData', data: { action: 'pull' } });
  if (!response.result || response.result.success === false) {
    throw new Error((response.result && response.result.error) || '云端读取失败');
  }
  const remote = response.result && response.result.data;

  if (remote && Number(remote.updatedAt) > Number(local.updatedAt || 0)) {
    const migrated = migrateData(remote, defaultData, SCHEMA_VERSION);
    migrated.recipes = normalizeRecipes(migrated.recipes);
    const localImages = new Map(local.diary.map((entry) => [entry.id, entry.imageList || []]));
    migrated.diary = migrated.diary.map((entry) => ({
      ...entry,
      imageList: localImages.get(entry.id) || []
    }));
    cache = migrated;
    wx.setStorageSync(STORAGE_KEY, migrated);
    return { synced: true, source: 'cloud' };
  }

  const pushResponse = await wx.cloud.callFunction({
    name: 'syncData',
    data: { action: 'push', data: getCloudSnapshot() }
  });
  if (!pushResponse.result || pushResponse.result.success === false) {
    throw new Error((pushResponse.result && pushResponse.result.error) || '云端写入失败');
  }
  return { synced: true, source: 'local' };
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
    const base = Date.now();
    const ids = (items || []).map((item, index) => {
      const id = base + index + Math.floor(Math.random() * 1000);
      data.inventory.push({ id, ...item });
      return id;
    });
    return ids;
  });
}

function updateItem(id, patch) {
  return mutateData((data) => {
    const index = data.inventory.findIndex((item) => item.id === id);
    if (index < 0) return false;
    data.inventory[index] = { ...data.inventory[index], ...patch };
    return true;
  });
}

function removeItem(id) {
  return mutateData((data) => {
    const before = data.inventory.length;
    data.inventory = data.inventory.filter((item) => item.id !== id);
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
}

function getFavoriteRecipes() {
  return getSnapshot().favoriteRecipes;
}

function toggleFavoriteRecipe(name) {
  return mutateData((data) => {
    const favorites = new Set(data.favoriteRecipes || []);
    if (favorites.has(name)) favorites.delete(name);
    else favorites.add(name);
    data.favoriteRecipes = Array.from(favorites);
    return favorites.has(name);
  });
}

function claimDailyExpiryReminder() {
  return mutateData((data) => {
    if (!data.preferences.expiryReminderEnabled) return false;
    const today = formatDate(new Date());
    if (data.reminderState.lastExpiryReminderDate === today) return false;
    data.reminderState.lastExpiryReminderDate = today;
    return true;
  });
}

function getDiary() {
  return getSnapshot().diary.slice().sort((a, b) => b.createdAt - a.createdAt);
}

function publishDiary(entry) {
  return mutateData((data) => {
    const consumption = consumeInventory(data.inventory, entry.usedIngredients || []);
    const diaryEntry = {
      ...entry,
      id: Date.now() + Math.floor(Math.random() * 1000),
      createdAt: Date.now(),
      usedIngredients: consumption.consumedItems
    };
    data.inventory = consumption.inventory;
    data.diary.push(diaryEntry);
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
    return { removed: true, imagePaths: clone(removed.imageList || []) };
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
  formatDate,
  addDays,
  getExcludedIngredients,
  addExcludedIngredient,
  markNewlyAddedIngredients,
  getNewlyAddedIngredients,
  syncWithCloud
};
