const storage = require('../../utils/storage');

Page({
  data: {
    token: '',
    invite: null,
    nickname: '',
    loading: true,
    error: ''
  },

  onLoad(options) {
    const token = String(options.token || '');
    this.setData({ token, nickname: storage.getSnapshot().profile?.nickname || '' });
    this.loadInvite();
  },

  async loadInvite() {
    try {
      const result = await storage.resolveInvite(this.data.token);
      this.setData({ invite: result.invite, loading: false });
    } catch (error) {
      this.setData({ error: error.message || '邀请已失效', loading: false });
    }
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  async acceptInvite() {
    const nickname = this.data.nickname.trim();
    if (!nickname) {
      wx.showToast({ title: '请填写家庭昵称', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '正在加入', mask: true });
    try {
      await storage.acceptInvite(this.data.token, nickname);
      wx.showToast({ title: '已加入家庭冰箱', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 800);
    } catch (error) {
      wx.showToast({ title: error.message || '加入失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  }
});
