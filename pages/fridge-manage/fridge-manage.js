const storage = require('../../utils/storage');

Page({
  data: {
    fridges: [],
    activeFridge: null,
    members: [],
    currentRole: 'member',
    inviteToken: '',
    conflicts: [],
    loading: false
  },

  onLoad(options) {
    this.openSyncSection = options.section === 'sync';
  },

  onShow() {
    this.refresh(false);
  },

  async refresh(remote = true) {
    this.setData({ loading: true });
    try {
      if (remote) await storage.refreshFridgeList();
      const fridges = storage.getFridges();
      const activeFridge = storage.getActiveFridge();
      this.setData({
        fridges,
        activeFridge,
        conflicts: storage.getSnapshot().syncConflicts || []
      });
      if (activeFridge) {
        const result = await storage.listMembers(activeFridge.id);
        this.setData({
          members: (result.members || []).map((member) => ({ ...member, initial: member.nickname.slice(0, 1) })),
          currentRole: result.role || activeFridge.role
        });
      }
      if (this.openSyncSection && this.data.conflicts.length) {
        setTimeout(() => wx.pageScrollTo({ selector: '#sync-section', duration: 300 }), 50);
        this.openSyncSection = false;
      }
    } catch (error) {
      if (remote) wx.showToast({ title: error.message || '刷新失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async chooseFridge(e) {
    const { id } = e.currentTarget.dataset;
    if (id === this.data.activeFridge?.id) return;
    wx.showLoading({ title: '切换中', mask: true });
    try {
      await storage.switchFridge(id);
      await this.refresh(false);
    } catch (error) {
      wx.showToast({ title: error.message || '切换失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  prompt(title, placeholder, value = '') {
    return new Promise((resolve) => {
      wx.showModal({
        title,
        editable: true,
        placeholderText: placeholder,
        content: value,
        success: (result) => resolve(result.confirm ? String(result.content || '').trim() : '')
      });
    });
  },

  async createFridge() {
    const name = await this.prompt('创建家庭冰箱', '例如：我们家的冰箱');
    if (!name) return;
    const nickname = await this.prompt('你的家庭昵称', '例如：妈妈、阿明', storage.getSnapshot().profile?.nickname || '');
    if (!nickname) return;
    wx.showLoading({ title: '创建中', mask: true });
    try {
      await storage.createFridge(name, nickname);
      await this.refresh(false);
      wx.showToast({ title: '已创建', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '创建失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async renameFridge() {
    const fridge = this.data.activeFridge;
    const name = await this.prompt('修改冰箱名称', '冰箱名称', fridge.name);
    if (!name) return;
    try {
      await storage.renameFridge(fridge.id, name);
      await this.refresh(false);
    } catch (error) {
      wx.showToast({ title: error.message || '修改失败', icon: 'none' });
    }
  },

  async editNickname() {
    const self = this.data.members.find((member) => member.isSelf);
    const nickname = await this.prompt('修改家庭昵称', '你的家庭昵称', self?.nickname || '');
    if (!nickname) return;
    try {
      await storage.updateMemberNickname(this.data.activeFridge.id, nickname);
      await this.refresh(false);
    } catch (error) {
      wx.showToast({ title: error.message || '修改失败', icon: 'none' });
    }
  },

  async prepareInvite() {
    wx.showLoading({ title: '生成邀请', mask: true });
    try {
      const result = await storage.createInvite(this.data.activeFridge.id);
      this.setData({ inviteToken: result.token });
      wx.showToast({ title: '邀请已生成', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '生成失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onShareAppMessage() {
    const fridge = this.data.activeFridge;
    return {
      title: `邀请你加入「${fridge?.name || '家庭冰箱'}」`,
      path: `/pages/fridge-invite/fridge-invite?token=${this.data.inviteToken}`
    };
  },

  onMemberTap(e) {
    const target = this.data.members.find((member) => member.memberId === e.currentTarget.dataset.id);
    if (!target || target.isSelf || this.data.currentRole !== 'owner') return;
    wx.showActionSheet({
      itemList: ['转让所有权', '移除成员'],
      success: ({ tapIndex }) => {
        const action = tapIndex === 0 ? 'transfer' : 'remove';
        wx.showModal({
          title: action === 'transfer' ? '转让所有权' : '移除成员',
          content: action === 'transfer'
            ? `确认将冰箱所有权转让给“${target.nickname}”？`
            : `确认将“${target.nickname}”移出冰箱？`,
          success: async ({ confirm }) => {
            if (!confirm) return;
            try {
              if (action === 'transfer') await storage.transferOwnership(this.data.activeFridge.id, target.memberId);
              else await storage.removeMember(this.data.activeFridge.id, target.memberId);
              await this.refresh();
            } catch (error) {
              wx.showToast({ title: error.message || '操作失败', icon: 'none' });
            }
          }
        });
      }
    });
  },

  leaveOrDelete() {
    const owner = this.data.currentRole === 'owner';
    wx.showModal({
      title: owner ? '删除冰箱' : '退出冰箱',
      content: owner ? '只有没有其他成员时才能删除，库存、日记和照片也会被清理。' : '退出后将无法再查看这个冰箱。',
      success: async ({ confirm }) => {
        if (!confirm) return;
        try {
          if (owner) await storage.deleteFridge(this.data.activeFridge.id);
          else await storage.leaveFridge(this.data.activeFridge.id);
          await this.refresh(false);
        } catch (error) {
          wx.showToast({ title: error.message || '操作失败', icon: 'none' });
        }
      }
    });
  },

  async resolveConflict(e) {
    const { id, strategy } = e.currentTarget.dataset;
    try {
      await storage.resolveSyncConflict(id, strategy);
      this.setData({ conflicts: storage.getSnapshot().syncConflicts || [] });
      wx.showToast({ title: '冲突已处理', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '处理失败', icon: 'none' });
    }
  }
});
