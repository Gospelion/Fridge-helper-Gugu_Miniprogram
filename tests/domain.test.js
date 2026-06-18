const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRecommendations,
  consumeInventory,
  filterInventory,
  migrateData,
  normalizeRecipes,
  parseRecognizedFoods
} = require('../utils/domain');

test('filterInventory combines category and search filters', () => {
  const inventory = [
    { name: '西红柿', category: '蔬菜' },
    { name: '苹果', category: '水果' },
    { name: '小番茄', category: '水果' }
  ];
  assert.deepEqual(
    filterInventory(inventory, { searchKey: '茄', category: '水果' }).map((item) => item.name),
    ['小番茄']
  );
  assert.equal(filterInventory(inventory, { searchKey: '不存在', category: '全部' }).length, 0);
});

test('buildRecommendations excludes muted ingredients and ranks matches', () => {
  const inventory = [{ name: '鸡蛋', quantity: 2 }, { name: '西红柿', quantity: 1 }];
  const recipes = [
    { name: '番茄炒蛋', ingredients: ['鸡蛋', '西红柿'], difficulty: '简单' },
    { name: '蒸蛋', ingredients: ['鸡蛋'], difficulty: '极简' }
  ];
  assert.equal(buildRecommendations(inventory, recipes)[0].name, '番茄炒蛋');
  assert.deepEqual(buildRecommendations(inventory, recipes, ['鸡蛋']).map((item) => item.name), ['番茄炒蛋']);
  assert.deepEqual(buildRecommendations([], recipes), []);
});

test('migrateData preserves user records and fills missing collections idempotently', () => {
  const defaults = {
    inventory: [{ id: 1, name: '默认食材' }],
    recipes: [{ name: '默认菜谱', ingredients: [] }]
  };
  const legacy = { inventory: [{ id: 9, name: '用户食材' }], diary: [{ id: 2 }] };
  const migrated = migrateData(legacy, defaults, 2);
  assert.deepEqual(migrated.inventory, legacy.inventory);
  assert.deepEqual(migrated.recipes, defaults.recipes);
  assert.deepEqual(migrated.diary, legacy.diary);
  assert.deepEqual(migrateData(migrated, defaults, 2), migrated);
});

test('parseRecognizedFoods accepts JSON, markdown JSON, Chinese text, and rejects invalid rows', () => {
  assert.deepEqual(parseRecognizedFoods('[{"name":"鸡蛋","quantity":6,"unit":"个"}]'), [
    { name: '鸡蛋', quantity: 6, unit: '个' }
  ]);
  assert.deepEqual(parseRecognizedFoods('```json\n[{"name":"牛肉","quantity":1,"unit":"包"}]\n```'), [
    { name: '牛肉', quantity: 1, unit: '包' }
  ]);
  assert.deepEqual(parseRecognizedFoods('土豆 2个，牛肉 500g'), [
    { name: '土豆', quantity: 2, unit: '个' },
    { name: '牛肉', quantity: 500, unit: 'g' }
  ]);
  assert.deepEqual(parseRecognizedFoods('[{"name":"坏数据","quantity":0}]'), []);
});

test('consumeInventory uses earliest expiry batches and removes empty batches', () => {
  const inventory = [
    { id: 1, name: '鸡蛋', quantity: 0.5, unit: '个', expiryDate: '2026-06-20' },
    { id: 2, name: '鸡蛋', quantity: 2, unit: '个', expiryDate: '2026-06-19' },
    { id: 3, name: '牛奶', quantity: 1, unit: '盒', expiryDate: '2026-06-18' }
  ];
  const result = consumeInventory(inventory, [{ name: '鸡蛋', quantity: 2.5 }]);
  assert.deepEqual(result.consumedItems.map((item) => [item.id, item.quantity]), [[2, 2], [1, 0.5]]);
  assert.deepEqual(result.inventory.map((item) => item.id), [3]);
});

test('consumeInventory only records available quantity when stock is insufficient', () => {
  const result = consumeInventory(
    [{ id: 1, name: '鸡蛋', quantity: 0.25, unit: '个' }],
    [{ name: '鸡蛋', quantity: 1 }]
  );
  assert.equal(result.consumedItems[0].quantity, 0.25);
  assert.deepEqual(result.inventory, []);
  assert.deepEqual(result.shortages, [{ name: '鸡蛋', quantity: 0.75, unit: '' }]);
});

test('consumeInventory converts kg, g, and jin while keeping batch units', () => {
  const result = consumeInventory(
    [
      { id: 1, name: '牛肉', quantity: 0.2, unit: 'kg', expiryDate: '2026-06-18' },
      { id: 2, name: '牛肉', quantity: 1, unit: '斤', expiryDate: '2026-06-19' }
    ],
    [{ name: '牛肉', quantity: 300, unit: 'g' }]
  );
  assert.deepEqual(result.consumedItems.map((item) => [item.id, item.quantity, item.unit]), [
    [1, 0.2, 'kg'],
    [2, 0.2, '斤']
  ]);
  assert.equal(result.inventory[0].quantity, 0.8);
  assert.deepEqual(result.shortages, []);
});

test('normalizeRecipes upgrades legacy ingredient names to quantities and units', () => {
  const recipes = normalizeRecipes([{ name: '番茄炒蛋', ingredients: ['鸡蛋', '西红柿'] }]);
  assert.deepEqual(recipes[0].ingredients, [
    { name: '鸡蛋', quantity: 2, unit: '个' },
    { name: '西红柿', quantity: 2, unit: '个' }
  ]);
});
