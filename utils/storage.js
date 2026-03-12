// utils/storage.js
const STORAGE_KEY = 'fridge_chef_data';

/**
 * 默认 Mock 数据
 */
const defaultData = {
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
  diary: []
};

function getRawData() {
  const data = wx.getStorageSync(STORAGE_KEY);
  
  return data || null;
}

function saveData(data) {
  wx.setStorageSync(STORAGE_KEY, data);
}

/**
 * 初始化本地数据（只在首次安装或无数据时写入）
 */
function initData() {
  const data = getRawData();
  if (!data || !data.inventory) {
    // 首次使用，直接写入默认数据
    saveData(defaultData);
    return;
  }
  
  // 已有数据时，检查是否需要补充默认食材（避免重复）
  const inventory = data.inventory || [];
  const existingNames = inventory.map(i => i.name);
  
  defaultData.inventory.forEach(defaultItem => {
    if (!existingNames.includes(defaultItem.name)) {
      inventory.push({
        ...defaultItem,
        id: Date.now() + Math.floor(Math.random() * 1000)
      });
    }
  });
  
  data.inventory = inventory;
  saveData(data);
}

/**
 * 对外导出完整数据
 */
function getData() {
  const data = getRawData();
  if (!data) {
    return defaultData;
  }
  return data;
}

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

/**
 * 单位换算：将不同单位转换为标准单位"件"
 * 换算准则：
 * - 1 个 = 1 件
 * - 1 包 = 1 件
 * - 1kg = 2 件
 * - 1 斤 = 0.5kg = 1 件
 * - 1g = 0.001kg = 0.002 件
 */
function convertToPieces(quantity, unit) {
  const qty = Number(quantity) || 0;
  
  switch (unit) {
    case '个':
      return qty * 1;
    case '包':
      return qty * 1;
    case '斤':
      return qty * 1; // 1 斤 = 0.5kg = 1 件
    case 'kg':
      return qty * 2; // 1kg = 2 件
    case 'g':
      return qty * 0.002; // 1g = 0.002 件
    default:
      return qty; // 未知单位按原数量计算
  }
}

/**
 * 单位换算：将"件"转换回指定单位（用于显示）
 */
function convertFromPieces(pieces, targetUnit) {
  const pcs = Number(pieces) || 0;
  
  switch (targetUnit) {
    case '个':
      return pcs / 1;
    case '包':
      return pcs / 1;
    case '斤':
      return pcs / 1;
    case 'kg':
      return pcs / 2;
    case 'g':
      return pcs / 0.002;
    default:
      return pcs;
  }
}

/**
 * 获取库存列表
 */
function getInventory() {
  return getData().inventory || [];
}

/**
 * 新增食材
 */
function addItem(item) {
  const data = getData();
  const inventory = data.inventory || [];
  const id = Date.now() + Math.floor(Math.random() * 1000);
  inventory.push({
    id,
    ...item
  });
  data.inventory = inventory;
  saveData(data);
  return id;
}

/**
 * 更新食材
 */
function updateItem(id, patch) {
  const data = getData();
  const inventory = data.inventory || [];
  const idx = inventory.findIndex((i) => i.id === id);
  if (idx !== -1) {
    inventory[idx] = {
      ...inventory[idx],
      ...patch
    };
    data.inventory = inventory;
    saveData(data);
  }
}

/**
 * 删除食材
 */
function removeItem(id) {
  const data = getData();
  const inventory = data.inventory || [];
  data.inventory = inventory.filter((i) => i.id !== id);
  saveData(data);
}

/**
 * 获取菜谱
 */
function getRecipes() {
  return getData().recipes || [];
}

/**
 * 获取食物日记列表（按时间倒序）
 */
function getDiary() {
  const diary = getData().diary || [];
  return diary.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * 新增一条日记
 */
function addDiaryEntry(entry) {
  const data = getData();
  const diary = data.diary || [];
  diary.push({
    id: Date.now() + Math.floor(Math.random() * 1000),
    createdAt: Date.now(),
    ...entry
  });
  data.diary = diary;
  saveData(data);
}

/**
 * 根据消耗的食材扣减库存
 * consumedList: [{ name: '鸡蛋', quantity: 1 }]
 */
function consumeIngredients(consumedList) {
  const data = getData();
  const inventory = data.inventory || [];

  consumedList.forEach((c) => {
    const item = inventory.find((i) => i.name === c.name);
    if (item) {
      const left = (item.quantity || 0) - (c.quantity || 0);
      if (left <= 0) {
        // 数量用完，从列表移除
        const idx = inventory.findIndex((i) => i.id === item.id);
        if (idx !== -1) {
          inventory.splice(idx, 1);
        }
      } else {
        item.quantity = left;
      }
    }
  });

  data.inventory = inventory;
  saveData(data);
}

/**
 * 获取不推荐的食材列表（已过滤 24 小时外的过期记录）
 */
function getExcludedIngredients() {
  const data = getData();
  const excluded = data.excludedIngredients || [];
  const now = Date.now();
  // 过滤掉已过期的记录（超过 24 小时）
  const valid = excluded.filter(item => item.expireAt > now);
  // 如果有过滤，更新存储
  if (valid.length !== excluded.length) {
    data.excludedIngredients = valid;
    saveData(data);
  }
  return valid.map(item => item.ingredientName);
}

/**
 * 添加不推荐的食材（24 小时内不推荐）
 */
function addExcludedIngredient(ingredientName) {
  const data = getData();
  const excluded = data.excludedIngredients || [];
  const now = Date.now();
  const expireAt = now + 24 * 60 * 60 * 1000; // 24 小时后
  
  // 如果已存在，更新过期时间
  const existing = excluded.find(item => item.ingredientName === ingredientName);
  if (existing) {
    existing.expireAt = expireAt;
  } else {
    excluded.push({
      ingredientName,
      expireAt
    });
  }
  
  data.excludedIngredients = excluded;
  saveData(data);
}

/**
 * 移除不推荐的食材
 */
function removeExcludedIngredient(ingredientName) {
  const data = getData();
  const excluded = data.excludedIngredients || [];
  data.excludedIngredients = excluded.filter(item => item.ingredientName !== ingredientName);
  saveData(data);
}

/**
 * 记录新添加的食材 ID（用于返回主页后高亮提示）
 */
function markNewlyAddedIngredients(ids) {
  const data = getData();
  const now = Date.now();
  // 将 ID 数组转为 { id, timestamp } 格式
  const newMarks = ids.map(id => ({ id, timestamp: now }));
  // 合并到现有标记中
  data.newlyAddedIngredients = newMarks;
  saveData(data);
}

/**
 * 获取新添加的食材 ID 列表（5 秒内的标记）
 * 返回格式：{ ids: number[], shouldHighlight: boolean }
 */
function getNewlyAddedIngredients() {
  const data = getData();
  const marks = data.newlyAddedIngredients || [];
  const now = Date.now();
  const validWindow = 5000; // 5 秒时间窗口
  
  // 过滤出 5 秒内的标记
  const validMarks = marks.filter(mark => now - mark.timestamp < validWindow);
  
  // 如果有有效标记，清除存储（避免重复触发）
  if (validMarks.length > 0) {
    data.newlyAddedIngredients = [];
    saveData(data);
  }
  
  return {
    ids: validMarks.map(m => m.id),
    shouldHighlight: validMarks.length > 0
  };
}

module.exports = {
  initData,
  getData,
  getInventory,
  addItem,
  updateItem,
  removeItem,
  getRecipes,
  getDiary,
  addDiaryEntry,
  consumeIngredients,
  formatDate,
  addDays,
  convertToPieces,
  convertFromPieces,
  getExcludedIngredients,
  addExcludedIngredient,
  removeExcludedIngredient,
  markNewlyAddedIngredients,
  getNewlyAddedIngredients
};