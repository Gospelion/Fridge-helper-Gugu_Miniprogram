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
  assert.equal(initialized.schemaVersion, 4);
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

test('fresh installs start empty and pull existing cloud data before pushing', async () => {
  let stored = null;
  const calls = [];
  global.wx = {
    getStorageSync: () => stored,
    setStorageSync: (key, value) => {
      stored = JSON.parse(JSON.stringify(value));
    },
    cloud: {
      callFunction: async (request) => {
        calls.push(request);
        return {
          result: {
            success: true,
            data: request.data.action === 'pull' ? {
              schemaVersion: 4,
              inventory: [{ id: 99, name: '苹果', quantity: 1, unit: '个' }],
              updatedAt: 100
            } : null
          }
        };
      }
    }
  };

  const storagePath = require.resolve('../utils/storage');
  delete require.cache[storagePath];
  const storage = require('../utils/storage');

  assert.deepEqual(storage.initialize().inventory, []);
  assert.equal(storage.getSnapshot().updatedAt, 0);
  const result = await storage.syncWithCloud();
  assert.equal(result.source, 'cloud');
  assert.equal(storage.getInventory()[0].name, '苹果');
  assert.deepEqual(calls.map((call) => call.data.action), ['pull']);

  delete global.wx;
});

test('schema migration removes only the exact legacy mock inventory', () => {
  let stored = {
    schemaVersion: 3,
    inventory: [
      { id: 1, name: '鸡蛋', quantity: 6, unit: '个', expiryDate: '2026-03-10', category: '农产品' },
      { id: 2, name: '西红柿', quantity: 2, unit: '个', expiryDate: '2026-03-05', category: '蔬菜' },
      { id: 3, name: '用户食材', quantity: 1, unit: '个' }
    ]
  };
  global.wx = {
    getStorageSync: () => stored,
    setStorageSync: (key, value) => {
      stored = JSON.parse(JSON.stringify(value));
    }
  };

  const storagePath = require.resolve('../utils/storage');
  delete require.cache[storagePath];
  const storage = require('../utils/storage');

  assert.deepEqual(storage.initialize().inventory.map((item) => item.name), ['用户食材']);

  delete global.wx;
});
