const test = require('node:test');
const assert = require('node:assert/strict');

test('storage migrates once, batches writes, and publishes diary atomically', () => {
  let stored = {
    inventory: [
      { id: 1, name: '鸡蛋', quantity: 1, unit: '个', expiryDate: '2026-06-19' },
      { id: 2, name: '鸡蛋', quantity: 2, unit: '个', expiryDate: '2026-06-20' }
    ]
  };
  let writeCount = 0;
  global.wx = {
    getStorageSync: () => stored,
    setStorageSync: (key, value) => {
      assert.equal(key, 'fridge_chef_data');
      stored = JSON.parse(JSON.stringify(value));
      writeCount += 1;
    }
  };

  const storagePath = require.resolve('../utils/storage');
  delete require.cache[storagePath];
  const storage = require('../utils/storage');

  const initialized = storage.initialize();
  assert.equal(initialized.schemaVersion, 3);
  assert.ok(initialized.recipes.length > 0);
  assert.equal(writeCount, 1);

  const ids = storage.addItems([
    { name: '苹果', quantity: 1, unit: '个' },
    { name: '牛奶', quantity: 1, unit: '份' }
  ]);
  assert.equal(ids.length, 2);
  assert.equal(writeCount, 2);

  const result = storage.publishDiary({
    title: '蒸蛋',
    recipeName: '蒸蛋',
    imageList: [],
    usedIngredients: [{ name: '鸡蛋', quantity: 1 }]
  });
  assert.equal(result.consumedItems[0].id, 1);
  assert.equal(storage.getSnapshot().inventory.some((item) => item.id === 1), false);
  assert.equal(storage.getDiary()[0].title, '蒸蛋');
  assert.equal(writeCount, 3);

  delete global.wx;
});
