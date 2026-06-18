// app.js
const storage = require('./utils/storage');
const cloudConfig = require('./config/cloud');

App({
  globalData: {
    pendingRecipeName: ''
  },

  onLaunch() {

    // 1 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 以上基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: cloudConfig.envId,
        traceUser: true
      })
    }

    // 2 初始化本地存储 Mock 数据
    storage.initialize();
    this.globalData.syncReady = storage.syncWithCloud().catch(() => {
      console.warn('云端数据暂时不可用，当前继续使用本地数据');
    });

  }
});
