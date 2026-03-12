// pages/index/index.js
const storage = require('../../utils/storage');

Page({
  data: {
    inventory: [],
    filteredInventory: [],
    searchKey: '',
    showDeleteMode: false,
    // 用于高亮新添加的食材
    newlyAddedIds: []
  },

  onLoad() {
    storage.initData();
    this.refreshData();
  },

  onShow() {
    this.refreshData();
    // 检查是否有新添加的食材需要高亮
    this.checkNewlyAddedIngredients();
    // 更新自定义 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0
      });
    }
  },

  /**
   * 检查新添加的食材并设置高亮标记
   */
  checkNewlyAddedIngredients() {
    const result = storage.getNewlyAddedIngredients();
    if (result.shouldHighlight && result.ids.length > 0) {
      // 将新添加的食材 ID 存储到 data 中，用于 wxml 绑定
      this.setData({
        newlyAddedIds: result.ids
      });
      // 3 秒后清除高亮标记
      setTimeout(() => {
        this.setData({
          newlyAddedIds: []
        });
      }, 3000);
    }
  },

  refreshData() {
    const list = storage.getInventory();
    const decorated = list.map((item) => {
      const daysLeft = this.calcDaysLeft(item.expiryDate);
      const status = this.getStatus(daysLeft);
      const categoryBgClass = this.getCategoryBgClass(item.category);
      const expiryInfo = this.getExpiryInfo(daysLeft);
      return {
        ...item,
        daysLeft,
        status,
        categoryBgClass,
        expiryDate: item.expiryDate || '未设置',
        ...expiryInfo
      };
    });
    // 计算 dashboard 统计数据
    const dashboard = {
      total: list.length,
      totalTypes: new Set(list.map(item => item.name)).size,
      warning: decorated.filter(item => item.status === 'warning').length,
      warningTypes: new Set(decorated.filter(item => item.status === 'warning').map(item => item.name)).size,
      expired: decorated.filter(item => item.status === 'expired').length,
      expiredTypes: new Set(decorated.filter(item => item.status === 'expired').map(item => item.name)).size
    };

    this.setData({
      inventory: decorated,
      filteredInventory: this.filterBySearch(decorated, this.data.searchKey),
      dashboard
    });
  },

  /**
   * 根据分类返回对应的背景色类名
   */
  getCategoryBgClass(category) {
    const classMap = {
      '农产品': 'bg-agri',
      '蔬菜': 'bg-veg',
      '水果': 'bg-fruit',
      '饮品/其他': 'bg-other'
    };
    return classMap[category] || 'bg-other';
  },

  calcDaysLeft(expiryDate) {
    if (!expiryDate) return 999;
    const now = new Date();
    const expire = new Date(expiryDate);
    const diff = expire.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  },

  getStatus(daysLeft) {
    if (daysLeft < 0) return 'expired';
    if (daysLeft <= 1) return 'urgent';
    if (daysLeft <= 3) return 'warning';
    return 'normal';
  },

  /**
   * 根据剩余天数返回过期信息
   */
  getExpiryInfo(daysLeft) {
    if (daysLeft < 0) {
      return { expiryLabel: `🗑️ 已过期 ${Math.abs(daysLeft)} 天`, expiryStatusClass: 'expiry-expired' };
    }
    if (daysLeft === 0) {
      return { expiryLabel: `⚠️ 今天到期`, expiryStatusClass: 'expiry-urgent' };
    }
    if (daysLeft === 1) {
      return { expiryLabel: `⏰ 明天到期`, expiryStatusClass: 'expiry-urgent' };
    }
    if (daysLeft <= 3) {
      return { expiryLabel: `🟡 剩余 ${daysLeft} 天`, expiryStatusClass: 'expiry-warning' };
    }
    return { expiryLabel: `🟢 剩余 ${daysLeft} 天`, expiryStatusClass: 'expiry-normal' };
  },

  filterBySearch(list, key) {
    if (!key) return list;
    const k = key.toLowerCase();
    return list.filter((item) => item.name.toLowerCase().includes(k));
  },

  onSearchInput(e) {
    const searchKey = e.detail.value || '';
    this.setData({
      searchKey,
      filteredInventory: this.filterBySearch(this.data.inventory, searchKey)
    });
  },

  toggleDeleteMode() {
    this.setData({
      showDeleteMode: !this.data.showDeleteMode
    });
  },

  onAddTap() {
    wx.navigateTo({
      url: '/pages/add/add'
    });
  },

  onRecipeCardTap(e) {
    const { name } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/diary/diary?recipeName=${encodeURIComponent(name)}`
    });
  },

  onDeleteTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个食材吗？',
      success: (res) => {
        if (res.confirm) {
          storage.removeItem(id);
          this.refreshData();
          wx.showToast({
            title: '已删除',
            icon: 'success'
          });
        }
      }
    });
  },

  noop() {}
});
  