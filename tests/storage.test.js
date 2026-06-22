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
  assert.equal(initialized.schemaVersion, 5);
  assert.equal(initialized.activeFridgeId, 'local-default');
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
  assert.equal(storage.getSnapshot().pendingOperations.length, 4);
  assert.equal(writeCount, 3);

  delete global.wx;
});

test('fresh installs bootstrap a personal fridge and load its shared snapshot', async () => {
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
        return { result: {
          success: true,
          profile: { nickname: '小陈', preferences: { servings: 2 } },
          fridges: [{ id: 'f1', name: '我的冰箱', role: 'owner', memberCount: 1 }],
          activeFridgeId: 'f1',
          snapshot: {
            revision: 1,
            inventory: [{ id: 'item1', name: '苹果', quantity: 1, unit: '个', _version: 1 }],
            diary: []
          }
        } };
      }
    }
  };

  const storagePath = require.resolve('../utils/storage');
  delete require.cache[storagePath];
  const storage = require('../utils/storage');

  assert.deepEqual(storage.initialize().inventory, []);
  assert.equal(storage.getSnapshot().updatedAt, 0);
  const result = await storage.syncWithCloud();
  assert.equal(result.source, 'shared');
  assert.equal(storage.getInventory()[0].name, '苹果');
  assert.equal(storage.getActiveFridge().id, 'f1');
  assert.deepEqual(calls.map((call) => [call.name, call.data.action]), [['fridgeAccess', 'bootstrap']]);

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

test('cloud bootstrap rejects business-level failures', async () => {
  let stored = {
    schemaVersion: 5,
    inventory: [{ id: 1, name: '苹果', quantity: 1, unit: '个' }],
    updatedAt: 200
  };
  global.wx = {
    getStorageSync: () => stored,
    setStorageSync: (key, value) => { stored = JSON.parse(JSON.stringify(value)); },
    cloud: {
      callFunction: async () => ({ result: { success: false, error: '初始化被拒绝' } })
    }
  };

  const storagePath = require.resolve('../utils/storage');
  delete require.cache[storagePath];
  const storage = require('../utils/storage');
  storage.initialize();
  await assert.rejects(storage.syncWithCloud(), /初始化被拒绝/);

  delete global.wx;
});

test('offline operations flush idempotently and clear the local queue', async () => {
  let stored = {
    schemaVersion: 5,
    activeFridgeId: 'f1',
    fridges: [{ id: 'f1', name: '家庭冰箱', role: 'owner' }],
    fridgeCaches: { f1: { inventory: [], diary: [], revision: 0 } },
    inventory: [],
    diary: []
  };
  const calls = [];
  global.wx = {
    getStorageSync: () => stored,
    setStorageSync: (key, value) => { stored = JSON.parse(JSON.stringify(value)); },
    cloud: {
      callFunction: async (request) => {
        calls.push(request);
        const operation = request.data.operations[0];
        return { result: {
          success: true,
          appliedOpIds: [operation.opId],
          conflicts: [],
          snapshot: {
            revision: 1,
            inventory: [{ ...operation.payload, _version: 1 }],
            diary: []
          }
        } };
      }
    }
  };
  const storagePath = require.resolve('../utils/storage');
  delete require.cache[storagePath];
  const storage = require('../utils/storage');
  storage.initialize();
  storage.addItem({ name: '牛奶', quantity: 1, unit: '份' });
  assert.equal(storage.getCloudSyncState().pendingCount, 1);
  await storage.flushPendingOperations();
  assert.equal(storage.getCloudSyncState().pendingCount, 0);
  assert.equal(storage.getInventory()[0]._version, 1);
  assert.equal(calls[0].name, 'fridgeSync');
  delete global.wx;
});

test('version conflicts remain blocked until the user resolves them', async () => {
  let stored = {
    schemaVersion: 5,
    activeFridgeId: 'f1',
    fridges: [{ id: 'f1', name: '家庭冰箱', role: 'member' }],
    fridgeCaches: { f1: { inventory: [{ id: 'i1', name: '鸡蛋', quantity: 2, unit: '个', _version: 1 }], diary: [], revision: 1 } },
    inventory: [{ id: 'i1', name: '鸡蛋', quantity: 2, unit: '个', _version: 1 }],
    diary: []
  };
  global.wx = {
    getStorageSync: () => stored,
    setStorageSync: (key, value) => { stored = JSON.parse(JSON.stringify(value)); },
    cloud: {
      callFunction: async (request) => {
        const operation = request.data.operations[0];
        return { result: {
          success: true,
          appliedOpIds: [],
          conflicts: [{ opId: operation.opId, current: { id: 'i1', quantity: 4, _version: 2 }, local: operation.payload }],
          snapshot: { revision: 2, inventory: [{ id: 'i1', name: '鸡蛋', quantity: 4, unit: '个', _version: 2 }], diary: [] }
        } };
      }
    }
  };
  const storagePath = require.resolve('../utils/storage');
  delete require.cache[storagePath];
  const storage = require('../utils/storage');
  storage.initialize();
  storage.updateItem('i1', { quantity: 3 });
  await storage.flushPendingOperations();
  assert.equal(storage.getSnapshot().pendingOperations[0].status, 'blocked');
  assert.equal(storage.getCloudSyncState().conflictCount, 1);
  delete global.wx;
});

test('dirty personal preferences survive bootstrap and are pushed afterward', async () => {
  let stored = {
    schemaVersion: 5,
    profile: { nickname: '小陈', nicknameConfigured: true },
    profileDirty: true,
    activeFridgeId: 'f1',
    fridges: [{ id: 'f1', name: '家庭冰箱', role: 'owner' }],
    fridgeCaches: { f1: { inventory: [], diary: [], revision: 1 } },
    inventory: [],
    diary: [],
    preferences: { servings: 1, maxDifficulty: '简单', expiryReminderEnabled: true }
  };
  const calls = [];
  global.wx = {
    getStorageSync: () => stored,
    setStorageSync: (key, value) => { stored = JSON.parse(JSON.stringify(value)); },
    cloud: {
      callFunction: async (request) => {
        calls.push(request);
        if (request.data.action === 'bootstrap') {
          return { result: {
            success: true,
            profile: { preferences: { servings: 6 } },
            fridges: stored.fridges,
            activeFridgeId: 'f1',
            snapshot: { revision: 1, inventory: [], diary: [] }
          } };
        }
        return { result: { success: true } };
      }
    }
  };
  const storagePath = require.resolve('../utils/storage');
  delete require.cache[storagePath];
  const storage = require('../utils/storage');
  storage.initialize();
  await storage.syncWithCloud();
  assert.equal(storage.getPreferences().servings, 1);
  assert.equal(storage.getSnapshot().profileDirty, false);
  assert.deepEqual(calls.map((call) => call.data.action), ['bootstrap', 'updateProfile']);
  delete global.wx;
});
