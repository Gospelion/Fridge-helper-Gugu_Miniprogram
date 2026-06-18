// app.js
const storage = require('./utils/storage');
const cloudConfig = require('./config/cloud');

App({
  globalData: {
    pendingRecipeName: ''
  },

  onLaunch() {

    this.loadExtraLightFont();

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

  },

  loadExtraLightFont() {
    if (typeof wx.loadFontFace !== 'function') return;

    const fontFaces = [
      {
        family: 'SourceHanSansExtraLight',
        source: 'url("https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5.2.5/files/noto-sans-sc-chinese-simplified-200-normal.woff2")'
      },
      {
        family: 'SourceHanSansExtraLightLatin',
        source: 'url("https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5.2.5/files/noto-sans-sc-latin-200-normal.woff2")'
      }
    ];

    fontFaces.forEach(({ family, source }) => {
      wx.loadFontFace({
        family,
        global: true,
        source,
        descriptors: {
          style: 'normal',
          weight: '200'
        },
        fail: (error) => {
          console.warn(`${family} 加载失败，已回退到系统字体`, error);
        }
      });
    });
  }
});
