const ALL_CATEGORY = '全部';
const ALLOWED_UNITS = ['个', 'kg', '包', 'g', '斤', '份'];

const CATEGORY_RULES = [
  { keywords: ['猪', '牛', '羊', '鸡', '鸭', '鱼', '肉', '蛋', '牛奶', '虾'], category: '农产品' },
  { keywords: ['白', '青', '绿', '菜', '萝', '瓜', '茄', '椒', '葱', '蒜', '姜', '豆', '土豆', '西红柿', '番茄', '茄子', '生菜', '黄瓜', '白菜', '菠菜', '芹菜', '韭菜', '豆角', '四季豆', '豆芽', '莲藕', '冬瓜', '南瓜', '丝瓜', '苦瓜', '花菜', '西兰花', '卷心菜', '油菜', '空心菜', '茼蒿', '芥蓝', '芦笋', '竹笋', '莴笋', '山药', '芋头', '洋葱', '香菜', '豌豆', '毛豆', '油麦菜'], category: '蔬菜' },
  { keywords: ['苹', '香', '橙', '橘', '梨', '桃', '葡', '莓', '果', '柠'], category: '水果' },
  { keywords: ['水', '奶', '汁', '饮', '酒', '茶', '咖'], category: '饮品/其他' }
];

const SORTED_CATEGORY_KEYWORDS = CATEGORY_RULES
  .flatMap((rule) => rule.keywords.map((keyword) => ({ keyword, category: rule.category })))
  .sort((a, b) => b.keyword.length - a.keyword.length);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function filterInventory(inventory, filters = {}) {
  const searchKey = String(filters.searchKey || '').trim().toLowerCase();
  const category = filters.category || ALL_CATEGORY;

  return (inventory || []).filter((item) => {
    const matchesCategory = category === ALL_CATEGORY || item.category === category;
    const matchesSearch = !searchKey || String(item.name || '').toLowerCase().includes(searchKey);
    return matchesCategory && matchesSearch;
  });
}

function buildRecommendations(inventory, recipes, excludedNames = [], limit = 2) {
  const excluded = new Set(excludedNames);
  const available = new Set(
    (inventory || [])
      .filter((item) => !excluded.has(item.name) && Number(item.quantity) > 0)
      .map((item) => item.name)
  );
  if (!available.size) return [];

  const difficultyOrder = { '极简': 0, '简单': 1, '中等': 2, '困难': 3 };
  return (recipes || [])
    .map((recipe) => {
      const ingredients = recipe.ingredients || [];
      const matchCount = ingredients.reduce(
        (count, ingredient) => count + (available.has(ingredient) ? 1 : 0),
        0
      );
      return {
        ...recipe,
        matchCount,
        totalIngredients: ingredients.length,
        matchRate: ingredients.length ? matchCount / ingredients.length : 0,
        ingredientsText: ingredients.join('、'),
        ingredientsStr: JSON.stringify(ingredients)
      };
    })
    .filter((recipe) => recipe.matchCount > 0)
    .sort((a, b) =>
      b.matchRate - a.matchRate ||
      b.matchCount - a.matchCount ||
      (difficultyOrder[a.difficulty] ?? 99) - (difficultyOrder[b.difficulty] ?? 99)
    )
    .slice(0, limit);
}

function migrateData(rawData, defaults, schemaVersion) {
  const raw = rawData && typeof rawData === 'object' ? clone(rawData) : {};
  const fallback = clone(defaults);
  return {
    ...raw,
    schemaVersion,
    inventory: Array.isArray(raw.inventory) ? raw.inventory : fallback.inventory,
    recipes: Array.isArray(raw.recipes) && raw.recipes.length ? raw.recipes : fallback.recipes,
    diary: Array.isArray(raw.diary) ? raw.diary : [],
    excludedIngredients: Array.isArray(raw.excludedIngredients) ? raw.excludedIngredients : [],
    newlyAddedIngredients: Array.isArray(raw.newlyAddedIngredients) ? raw.newlyAddedIngredients : []
  };
}

function normalizeUnit(unit) {
  const aliases = { 公斤: 'kg', 千克: 'kg', 克: 'g' };
  const normalized = aliases[unit] || unit || '个';
  return ALLOWED_UNITS.includes(normalized) ? normalized : '个';
}

function normalizeFoods(value) {
  const candidates = Array.isArray(value) ? value : [value];
  return candidates.flatMap((food) => {
    if (!food || typeof food !== 'object') return [];
    const name = String(food.name || '').trim();
    const quantity = Number(food.quantity);
    if (!name || !Number.isFinite(quantity) || quantity <= 0) return [];
    return [{ name, quantity, unit: normalizeUnit(String(food.unit || '').trim()) }];
  });
}

function parseRecognizedFoods(input) {
  if (Array.isArray(input) || (input && typeof input === 'object')) {
    return normalizeFoods(input);
  }

  const text = String(input || '').trim();
  if (!text) return [];
  const withoutFence = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const jsonCandidates = [withoutFence];
  const arrayMatch = withoutFence.match(/\[[\s\S]*\]/);
  const objectMatch = withoutFence.match(/\{[\s\S]*\}/);
  if (arrayMatch) jsonCandidates.push(arrayMatch[0]);
  if (objectMatch) jsonCandidates.push(objectMatch[0]);

  for (const candidate of jsonCandidates) {
    try {
      const foods = normalizeFoods(JSON.parse(candidate));
      if (foods.length) return foods;
    } catch (error) {
      // Continue with the next structured candidate or the text fallback.
    }
  }

  return text
    .split(/[，,、;；\n]+/)
    .map((segment) => segment.trim())
    .flatMap((segment) => {
      const match = segment.match(/^(.+?)\s*(\d+(?:\.\d+)?)\s*(个|kg|公斤|千克|包|g|克|斤|份)?$/i);
      if (!match) return [];
      return normalizeFoods({ name: match[1], quantity: match[2], unit: match[3] });
    });
}

function recognizeCategory(name) {
  const text = String(name || '').trim();
  if (!text) return null;
  const match = SORTED_CATEGORY_KEYWORDS.find((item) => text.includes(item.keyword));
  return match ? match.category : null;
}

function expiryTime(item) {
  if (!item.expiryDate) return Number.POSITIVE_INFINITY;
  const time = new Date(item.expiryDate).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function consumeInventory(inventory, requestedIngredients) {
  const nextInventory = clone(inventory || []);
  const consumedItems = [];

  (requestedIngredients || []).forEach((request) => {
    let remaining = Math.max(0, Number(request.quantity) || 0);
    const batches = nextInventory
      .filter((item) => item.name === request.name && Number(item.quantity) > 0)
      .sort((a, b) => expiryTime(a) - expiryTime(b));

    batches.forEach((batch) => {
      if (remaining <= 0) return;
      const available = Number(batch.quantity) || 0;
      const used = Math.min(available, remaining);
      batch.quantity = available - used;
      remaining -= used;
      consumedItems.push({ id: batch.id, name: batch.name, quantity: used, unit: batch.unit });
    });
  });

  return {
    inventory: nextInventory.filter((item) => Number(item.quantity) > 0),
    consumedItems
  };
}

module.exports = {
  ALL_CATEGORY,
  ALLOWED_UNITS,
  buildRecommendations,
  clone,
  consumeInventory,
  filterInventory,
  migrateData,
  parseRecognizedFoods,
  recognizeCategory
};
