// pages/index/index.js
const storage = require('../../utils/storage');
const { buildRecommendations, filterInventory } = require('../../utils/domain');

Page({
  data: {
    inventory: [],
    filteredInventory: [],
    searchKey: '',
    showDeleteMode: false,
    // 用于高亮新添加的食材
    newlyAddedIds: [],
    recommendedRecipes: [],
    recommendationOffset: 0,
    preferences: { servings: 2, maxDifficulty: '困难', expiryReminderEnabled: true },
    servingOptions: [1, 2, 3, 4, 5, 6],
    difficultyOptions: ['极简', '简单', '中等', '困难'],
    categoryStats: [],
    categories: ['全部', '农产品', '蔬菜', '水果', '饮品/其他'],
    activeCategory: '全部',
    swipeOffsets: {},
    // 编辑相关
    units: ['个', 'kg', '包', 'g', '斤', '份'],
    showEditModal: false,
    showEditUnitSelector: false,
    editForm: {
      id: null,
      name: '',
      quantity: '',
      unitIndex: 0,
      expiryDays: ''
    }
  },

  onLoad() {
    this._swipePositions = {};
  },

  onShow() {
    const highlight = storage.getNewlyAddedIngredients();
    this.refreshPage(highlight.ids);
    this.scheduleHighlightClear(highlight.ids);
    // 更新自定义 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0,
        hidden: false
      });
    }
    const syncReady = getApp().globalData.syncReady;
    if (!this._cloudRefreshBound && syncReady) {
      this._cloudRefreshBound = true;
      syncReady.then(() => this.refreshPage()).catch(() => {});
    }
  },

  onHide() {
    this.clearHighlightTimer();
  },

  onUnload() {
    this.clearHighlightTimer();
  },

  clearHighlightTimer() {
    if (this._highlightTimer) {
      clearTimeout(this._highlightTimer);
      this._highlightTimer = null;
    }
  },

  scheduleHighlightClear(ids) {
    this.clearHighlightTimer();
    if (!ids.length) return;
    this._highlightTimer = setTimeout(() => {
      const clearFlag = (items) => items.map((item) => ({ ...item, isNewlyAdded: false }));
      this.setData({
        newlyAddedIds: [],
        inventory: clearFlag(this.data.inventory),
        filteredInventory: clearFlag(this.data.filteredInventory)
      });
      this._highlightTimer = null;
    }, 3000);
  },

  /**
   * 刷新推荐菜谱
   */
  onRefreshRecommend() {
    wx.showLoading({ title: '生成中...' });
    this.setData({ recommendationOffset: this.data.recommendationOffset + 2 });
    this.refreshPage();
    wx.hideLoading();
    wx.showToast({ title: '已更新推荐', icon: 'success' });
  },

  onServingChange(e) {
    const servings = this.data.servingOptions[Number(e.detail.value)] || 2;
    storage.updatePreferences({ servings });
    this.refreshPage();
  },

  onDifficultyChange(e) {
    const maxDifficulty = this.data.difficultyOptions[Number(e.detail.value)] || '困难';
    storage.updatePreferences({ maxDifficulty });
    this.refreshPage();
  },

  onReminderChange(e) {
    storage.updatePreferences({ expiryReminderEnabled: e.detail.value });
    this.refreshPage();
  },

  onToggleFavorite(e) {
    storage.toggleFavoriteRecipe(e.currentTarget.dataset.name);
    this.refreshPage();
  },

  /**
   * 跳转到添加食材页面
   */
  goAddPage() {
    wx.navigateTo({
      url: '/pages/add/add'
    });
  },

  goExpiryDetail(e) {
    const type = e.currentTarget.dataset.type === 'expired' ? 'expired' : 'warning';
    wx.navigateTo({
      url: `/pages/expiry-detail/expiry-detail?type=${type}`
    });
  },

  /**
   * 点击推荐菜品卡片 - 选择 24h 内不再推荐某个食材
   */
  onRecommendTap(e) {
    const { name, ingredients } = e.currentTarget.dataset;
    const ingredientsList = JSON.parse(ingredients || '[]');
    
    if (ingredientsList.length === 0) {
      wx.showToast({
        title: '无可用食材',
        icon: 'none'
      });
      return;
    }
    
    wx.showActionSheet({
      itemList: ingredientsList.map(item => `24h 内不推荐「${item}」`),
      success: (res) => {
        const selectedIngredient = ingredientsList[res.tapIndex];
        storage.addExcludedIngredient(selectedIngredient);
        
        this.refreshPage();
        
        wx.showToast({
          title: `已排除 ${selectedIngredient}`,
          icon: 'success'
        });
      }
    });
  },

  /**
   * 跳转到日记页面并带上菜谱信息
   */
  goDiaryWithRecipe(e) {
    const { name } = e.currentTarget.dataset;
    getApp().globalData.pendingRecipeName = name;
    wx.switchTab({ url: '/pages/diary/diary' });
  },

  /**
   * 分类筛选
   */
  onFilterTap(e) {
    const { name } = e.currentTarget.dataset;
    this.setData({
      activeCategory: name,
      filteredInventory: filterInventory(this.data.inventory, {
        searchKey: this.data.searchKey,
        category: name
      })
    });
  },

  /**
   * 处理滑动变化
   */
  onItemSwipeChange(e) {
    const { id } = e.currentTarget.dataset;
    const { x } = e.detail;
    this._swipePositions[id] = x;
  },

  /**
   * 滑动结束处理
   */
  onItemSwipeEnd(e) {
    const { id } = e.currentTarget.dataset;
    const x = this._swipePositions[id] || 0;
    const threshold = -60;
    
    if (x < threshold) {
      this.setData({
        [`swipeOffsets[${id}]`]: -80
      });
    } else {
      this.setData({
        [`swipeOffsets[${id}]`]: 0
      });
    }
  },

  /**
   * 点击删除按钮
   */
  onSwipeDeleteTap(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: `确定要删除"${name}"吗？`,
      success: (res) => {
        if (res.confirm) {
          storage.removeItem(id);
          this.refreshPage();
          wx.showToast({
            title: '已删除',
            icon: 'success'
          });
        }
      }
    });
  },

  /**
   * 点击食材卡片
   */
  onInventoryTap(e) {
    if (this.data.showDeleteMode) {
      this.onDeleteTap(e);
    } else {
      // 非删除模式下，点击打开编辑弹窗
      this.openEditModal(e);
    }
  },

  /**
   * 长按食材卡片
   */
  onInventoryLongPress(e) {
    this.toggleDeleteMode();
  },

  refreshPage(newlyAddedIds = this.data.newlyAddedIds || []) {
    const snapshot = storage.getSnapshot();
    const excludedIngredients = storage.getExcludedIngredients();
    const highlighted = new Set(newlyAddedIds);
    const list = snapshot.inventory;
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
        isNewlyAdded: highlighted.has(item.id),
        expiryDate: item.expiryDate || '未设置',
        ...expiryInfo
      };
    });
    // 计算 dashboard 统计数据
    const dashboard = {
      total: list.length,
      totalTypes: new Set(list.map(item => item.name)).size,
      warning: decorated.filter(item => item.status === 'warning' || item.status === 'urgent').length,
      warningTypes: new Set(decorated.filter(item => item.status === 'warning' || item.status === 'urgent').map(item => item.name)).size,
      expired: decorated.filter(item => item.status === 'expired').length,
      expiredTypes: new Set(decorated.filter(item => item.status === 'expired').map(item => item.name)).size
    };
    const categoryCounts = this.data.categories.slice(1).map((name) => ({
      name,
      count: list.filter((item) => item.category === name).length
    }));
    const inventoryCount = Math.max(1, list.length);
    const categoryStats = categoryCounts.map((item) => ({
      ...item,
      percent: Math.round(item.count / inventoryCount * 100)
    }));
    const storedPreferences = storage.getPreferences();
    const preferences = {
      ...storedPreferences,
      servingIndex: Math.max(0, this.data.servingOptions.indexOf(storedPreferences.servings)),
      difficultyIndex: Math.max(0, this.data.difficultyOptions.indexOf(storedPreferences.maxDifficulty))
    };

    const filteredInventory = filterInventory(decorated, {
      searchKey: this.data.searchKey,
      category: this.data.activeCategory
    });

    this.setData({
      inventory: decorated,
      filteredInventory,
      dashboard,
      categoryStats,
      preferences,
      newlyAddedIds,
      recommendedRecipes: buildRecommendations(
        snapshot.inventory,
        snapshot.recipes,
        excludedIngredients,
        2,
        {
          ...preferences,
          favoriteRecipes: storage.getFavoriteRecipes(),
          offset: this.data.recommendationOffset
        }
      )
    });

    const urgentCount = decorated.filter((item) => item.status === 'urgent' || item.status === 'expired').length;
    if (urgentCount && storage.claimDailyExpiryReminder()) {
      wx.showModal({
        title: '临期提醒',
        content: `有 ${urgentCount} 批食材即将到期或已经过期，记得优先处理。`,
        showCancel: false
      });
    }
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
    if (!expiryDate) return null;
    const now = new Date();
    const expire = new Date(expiryDate);
    const diff = expire.getTime() - now.getTime();
    return Number.isNaN(diff) ? null : Math.ceil(diff / (1000 * 60 * 60 * 24));
  },

  getStatus(daysLeft) {
    if (daysLeft === null) return 'unset';
    if (daysLeft < 0) return 'expired';
    if (daysLeft <= 1) return 'urgent';
    if (daysLeft <= 3) return 'warning';
    return 'normal';
  },

  /**
   * 根据剩余天数返回过期信息
   */
  getExpiryInfo(daysLeft) {
    if (daysLeft === null) {
      return { expiryLabel: '未设置保质期', expiryStatusClass: 'expiry-unset' };
    }
    if (daysLeft < 0) {
      return { expiryLabel: `已过期 ${Math.abs(daysLeft)} 天`, expiryStatusClass: 'expiry-expired' };
    }
    if (daysLeft === 0) {
      return { expiryLabel: '今天到期', expiryStatusClass: 'expiry-urgent' };
    }
    if (daysLeft === 1) {
      return { expiryLabel: '明天到期', expiryStatusClass: 'expiry-urgent' };
    }
    if (daysLeft <= 3) {
      return { expiryLabel: `剩余 ${daysLeft} 天`, expiryStatusClass: 'expiry-warning' };
    }
    return { expiryLabel: `剩余 ${daysLeft} 天`, expiryStatusClass: 'expiry-normal' };
  },

  onSearchInput(e) {
    const searchKey = e.detail.value || '';
    this.setData({
      searchKey,
      filteredInventory: filterInventory(this.data.inventory, {
        searchKey,
        category: this.data.activeCategory
      })
    });
  },

  onSearchClear() {
    this.setData({
      searchKey: '',
      filteredInventory: filterInventory(this.data.inventory, {
        category: this.data.activeCategory
      })
    });
  },

  toggleDeleteMode() {
    this.setData({
      showDeleteMode: !this.data.showDeleteMode
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
          this.refreshPage();
          wx.showToast({
            title: '已删除',
            icon: 'success'
          });
        }
      }
    });
  },

  /**
   * 打开编辑弹窗
   */
  openEditModal(e) {
    const { id, name, quantity, unit } = e.currentTarget.dataset;
    const item = this.data.inventory.find(i => i.id === id);
    if (!item) return;

    // 计算距离过期天数
    const daysLeft = this.calcDaysLeft(item.expiryDate);
    const expiryDays = daysLeft === null ? '' : (daysLeft > 0 ? String(daysLeft) : '0');

    // 查找单位索引
    const unitIndex = this.data.units.indexOf(unit || '个');

    this.setData({
      editForm: {
        id,
        name,
        quantity: String(quantity),
        unitIndex: unitIndex >= 0 ? unitIndex : 0,
        expiryDays
      },
      showEditModal: true
    });
    this.setTabBarHidden(true);
  },

  setTabBarHidden(hidden) {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ hidden });
    }
  },

  /**
   * 关闭编辑弹窗
   */
  closeEditModal() {
    this.setData({
      showEditModal: false,
      showEditUnitSelector: false
    });
    this.setTabBarHidden(false);
  },

  /**
   * 编辑数量输入
   */
  onEditQuantityInput(e) {
    this.setData({
      'editForm.quantity': e.detail.value
    });
  },

  /**
   * 编辑过期天数输入
   */
  onEditExpiryDaysInput(e) {
    this.setData({
      'editForm.expiryDays': e.detail.value
    });
  },

  /**
   * 打开单位选择器
   */
  openEditUnitSelector() {
    this.setData({
      showEditUnitSelector: true
    });
  },

  /**
   * 关闭单位选择器
   */
  closeEditUnitSelector() {
    this.setData({
      showEditUnitSelector: false
    });
  },

  /**
   * 点击单位卡片
   */
  onEditUnitCardTap(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({
      'editForm.unitIndex': index,
      showEditUnitSelector: false
    });
  },

  /**
   * 确认编辑
   */
  confirmEdit() {
    const { id, quantity, unitIndex, expiryDays } = this.data.editForm;

    // 验证数量
    const num = Number(quantity);
    if (Number.isNaN(num) || num <= 0) {
      wx.showToast({
        title: '数量需为正数',
        icon: 'none'
      });
      return;
    }

    // 验证天数
    const days = Number(expiryDays);
    if (Number.isNaN(days) || days < 0) {
      wx.showToast({
        title: '天数需为非负数',
        icon: 'none'
      });
      return;
    }

    // 计算过期日期
    const now = new Date();
    const expiryDate = storage.formatDate(storage.addDays(now, days));

    // 更新食材
    const unit = this.data.units[unitIndex] || '个';
    const updated = storage.updateItem(id, {
      quantity: num,
      unit,
      expiryDate
    });

    if (!updated) {
      wx.showToast({ title: '食材不存在，请刷新后重试', icon: 'none' });
      return;
    }

    wx.showToast({
      title: '已保存',
      icon: 'success'
    });

    this.closeEditModal();
    this.refreshPage();
  }
});
