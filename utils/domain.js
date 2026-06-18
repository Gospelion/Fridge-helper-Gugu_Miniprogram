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

function buildRecommendations(inventory, recipes, excludedNames = [], limit = 2, options = {}) {
  const excluded = new Set(excludedNames);
  const available = new Set(
    (inventory || [])
      .filter((item) => !excluded.has(item.name) && Number(item.quantity) > 0)
      .map((item) => item.name)
  );
  if (!available.size) return [];

  const difficultyOrder = { '极简': 0, '简单': 1, '中等': 2, '困难': 3 };
  const maxDifficulty = options.maxDifficulty || '困难';
  const maxDifficultyRank = difficultyOrder[maxDifficulty] ?? 3;
  const favorites = new Set(options.favoriteRecipes || []);
  const servingsFactor = Math.max(1, Number(options.servings) || 2) / 2;
  const ranked = (recipes || [])
    .map((recipe) => {
      const ingredients = recipe.ingredients || [];
      const matchCount = ingredients.reduce(
        (count, ingredient) => count + (available.has(ingredient.name || ingredient) ? 1 : 0),
        0
      );
      const ingredientNames = ingredients.map((ingredient) => ingredient.name || ingredient);
      return {
        ...recipe,
        matchCount,
        totalIngredients: ingredients.length,
        matchRate: ingredients.length ? matchCount / ingredients.length : 0,
        ingredientsText: ingredients.map((ingredient) => {
          if (typeof ingredient === 'string') return ingredient;
          const adjusted = Math.round((Number(ingredient.quantity) || 1) * servingsFactor * 100) / 100;
          return `${ingredient.name}${adjusted}${ingredient.unit || ''}`;
        }).join('、'),
        ingredientsStr: JSON.stringify(ingredientNames),
        isFavorite: favorites.has(recipe.name)
      };
    })
    .filter((recipe) => recipe.matchCount > 0 && (difficultyOrder[recipe.difficulty] ?? 99) <= maxDifficultyRank)
    .sort((a, b) =>
      Number(b.isFavorite) - Number(a.isFavorite) ||
      b.matchRate - a.matchRate ||
      b.matchCount - a.matchCount ||
      (difficultyOrder[a.difficulty] ?? 99) - (difficultyOrder[b.difficulty] ?? 99)
    );
  if (!ranked.length) return [];
  const offset = Math.abs(Number(options.offset) || 0) % ranked.length;
  return ranked.concat(ranked).slice(offset, offset + Math.min(limit, ranked.length));
}

const DEFAULT_INGREDIENT_AMOUNTS = {
  '鸡蛋': { quantity: 2, unit: '个' },
  '西红柿': { quantity: 2, unit: '个' },
  '番茄': { quantity: 2, unit: '个' },
  '猪肉': { quantity: 300, unit: 'g' },
  '牛肉': { quantity: 300, unit: 'g' },
  '鸡肉': { quantity: 300, unit: 'g' },
  '排骨': { quantity: 500, unit: 'g' },
  '虾': { quantity: 500, unit: 'g' },
  '鱼': { quantity: 1, unit: '份' }
};

function normalizeRecipes(recipes) {
  return (recipes || []).map((recipe) => ({
    ...recipe,
    ingredients: (recipe.ingredients || []).map((ingredient) => {
      if (ingredient && typeof ingredient === 'object') {
        return {
          name: String(ingredient.name || '').trim(),
          quantity: Number(ingredient.quantity) || 1,
          unit: normalizeUnit(ingredient.unit || '份')
        };
      }
      const name = String(ingredient || '').trim();
      return { name, ...(DEFAULT_INGREDIENT_AMOUNTS[name] || { quantity: 1, unit: '份' }) };
    }).filter((ingredient) => ingredient.name)
  }));
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
    newlyAddedIngredients: Array.isArray(raw.newlyAddedIngredients) ? raw.newlyAddedIngredients : [],
    favoriteRecipes: Array.isArray(raw.favoriteRecipes) ? raw.favoriteRecipes : [],
    preferences: {
      servings: 2,
      maxDifficulty: '困难',
      expiryReminderEnabled: true,
      ...(raw.preferences || {})
    },
    reminderState: raw.reminderState && typeof raw.reminderState === 'object' ? raw.reminderState : {}
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
    const name = String(food.name || food.foodName || food.ingredient || food['食材'] || food['名称'] || '').trim();
    const quantity = Number(food.quantity ?? food.count ?? food['数量']);
    if (!name || !Number.isFinite(quantity) || quantity <= 0) return [];
    return [{ name, quantity, unit: normalizeUnit(String(food.unit || food['单位'] || '').trim()) }];
  });
}

function parseRecognizedFoods(input) {
  if (Array.isArray(input)) {
    const foods = normalizeFoods(input);
    if (foods.length) return foods;
    const blockText = input
      .map((item) => typeof item === 'string' ? item : (item && (item.text || item.content)) || '')
      .filter(Boolean)
      .join('\n');
    return blockText ? parseRecognizedFoods(blockText) : [];
  }

  if (input && typeof input === 'object') {
    const foods = normalizeFoods(input);
    if (foods.length) return foods;
    for (const key of ['foods', 'items', 'ingredients', 'data', 'result']) {
      if (input[key]) {
        const nested = parseRecognizedFoods(input[key]);
        if (nested.length) return nested;
      }
    }
    const objectText = input.text || input.content;
    return objectText ? parseRecognizedFoods(objectText) : [];
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
      if (match) return normalizeFoods({ name: match[1], quantity: match[2], unit: match[3] });
      const nameOnly = segment.replace(/^[-*\d.、\s]+/, '').trim();
      const looksLikeIngredient = /^[\u4e00-\u9fa5A-Za-z0-9（）()\s-]{1,20}$/.test(nameOnly) &&
        !/(识别结果|食材如下|无法识别|图片|没有食材|未识别)/.test(nameOnly);
      return looksLikeIngredient ? normalizeFoods({ name: nameOnly, quantity: 1, unit: '个' }) : [];
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
  const shortages = [];
  const weightFactors = { g: 1, kg: 1000, '斤': 500 };

  (requestedIngredients || []).forEach((request) => {
    const requestUnit = request.unit || '';
    const requestFactor = weightFactors[requestUnit] || 1;
    let remaining = Math.max(0, Number(request.quantity) || 0) * requestFactor;
    const batches = nextInventory
      .filter((item) => {
        if (item.name !== request.name || Number(item.quantity) <= 0) return false;
        if (!requestUnit) return true;
        const bothWeights = weightFactors[requestUnit] && weightFactors[item.unit];
        return bothWeights || item.unit === requestUnit;
      })
      .sort((a, b) => expiryTime(a) - expiryTime(b));

    batches.forEach((batch) => {
      if (remaining <= 0) return;
      const batchFactor = weightFactors[batch.unit] || 1;
      const availableInBase = (Number(batch.quantity) || 0) * batchFactor;
      const usedInBase = Math.min(availableInBase, remaining);
      const usedInBatchUnit = usedInBase / batchFactor;
      batch.quantity = Number(batch.quantity) - usedInBatchUnit;
      remaining -= usedInBase;
      consumedItems.push({ id: batch.id, name: batch.name, quantity: usedInBatchUnit, unit: batch.unit });
    });

    if (remaining > 0) {
      shortages.push({
        name: request.name,
        quantity: remaining / requestFactor,
        unit: requestUnit
      });
    }
  });

  return {
    inventory: nextInventory.filter((item) => Number(item.quantity) > 0),
    consumedItems,
    shortages
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
  normalizeRecipes,
  parseRecognizedFoods,
  recognizeCategory
};
