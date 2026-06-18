// app.js
const storage = require('./utils/storage');

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
        env: 'cloud1-7g8cbcwq59588ae2',
        traceUser: true
      })
    }

    // 2 初始化本地存储 Mock 数据
    storage.initialize();

  }
});
