// pages/index/index.js
const storage = require('../../utils/storage');

Page({
  data: {
    inventory: [],
    filteredInventory: [],
    searchKey: '',
    showDeleteMode: false,
    // 用于高亮新添加的食材
    newlyAddedIds: [],
    recommendedRecipes: [],
    categories: ['全部', '农产品', '蔬菜', '水果', '饮品/其他'],
    activeCategory: '全部',
    swipeOffsets: {}
  },

  onLoad() {
    storage.initData();
    this.refreshData();
    this.generateRecommendations();
  },

  onShow() {
    this.refreshData();
    this.generateRecommendations();
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
      this.setData({
        newlyAddedIds: result.ids
      });
      setTimeout(() => {
        this.setData({
          newlyAddedIds: []
        });
      }, 3000);
    }
  },

  /**
   * 根据当前库存生成推荐菜谱
   */
  generateRecommendations() {
    const inventory = storage.getInventory();
    const recipes = storage.getRecipes();
    
    // 获取当前库存中的食材名称列表
    const availableIngredients = inventory.map(item => item.name);
    
    if (availableIngredients.length === 0) {
      this.setData({ recommendedRecipes: [] });
      return;
    }
    
    // 计算每个菜谱的匹配度
    const scoredRecipes = recipes.map(recipe => {
      const matchCount = recipe.ingredients.filter(ing => 
        availableIngredients.includes(ing)
      ).length;
      const totalIngredients = recipe.ingredients.length;
      const matchRate = matchCount / totalIngredients;
      
      return {
        ...recipe,
        matchCount,
        totalIngredients,
        matchRate,
        ingredientsText: recipe.ingredients.join('、'),
        ingredientsStr: JSON.stringify(recipe.ingredients)
      };
    });
    
    // 筛选出至少能匹配 1 种食材的菜谱
    const matchableRecipes = scoredRecipes.filter(recipe => recipe.matchCount >= 1);
    
    // 按匹配度排序，优先推荐匹配度高的
    matchableRecipes.sort((a, b) => {
      if (b.matchRate !== a.matchRate) {
        return b.matchRate - a.matchRate;
      }
      if (b.matchCount !== a.matchCount) {
        return b.matchCount - a.matchCount;
      }
      const difficultyOrder = { '极简': 0, '简单': 1, '中等': 2, '困难': 3 };
      return difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty];
    });
    
    // 取前 2 个推荐（左右排列显示）
    const topRecipes = matchableRecipes.slice(0, 2);
    
    this.setData({
      recommendedRecipes: topRecipes
    });
  },

  /**
   * 刷新推荐菜谱
   */
  onRefreshRecommend() {
    wx.showLoading({ title: '生成中...' });
    setTimeout(() => {
      this.generateRecommendations();
      wx.hideLoading();
      wx.showToast({
        title: '已更新推荐',
        icon: 'success'
      });
    }, 300);
  },

  /**
   * 跳转到添加食材页面
   */
  goAddPage() {
    wx.navigateTo({
      url: '/pages/add/add'
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
        
        // 重新生成推荐
        this.generateRecommendations();
        
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
    wx.navigateTo({
      url: `/pages/diary/diary?recipeName=${encodeURIComponent(name)}`
    });
  },

  /**
   * 分类筛选
   */
  onFilterTap(e) {
    const { name } = e.currentTarget.dataset;
    this.setData({
      activeCategory: name
    });
    
    if (name === '全部') {
      this.setData({
        filteredInventory: this.data.inventory
      });
    } else {
      const filtered = this.data.inventory.filter(item => item.category === name);
      this.setData({
        filteredInventory: filtered
      });
    }
  },

  /**
   * 处理滑动变化
   */
  onItemSwipeChange(e) {
    const { id } = e.currentTarget.dataset;
    const { x } = e.detail;
    this.setData({
      [`swipeOffsets[${id}]`]: x
    });
  },

  /**
   * 滑动结束处理
   */
  onItemSwipeEnd(e) {
    const { id } = e.currentTarget.dataset;
    const { x } = e.detail;
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
          this.refreshData();
          this.generateRecommendations();
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
    }
  },

  /**
   * 长按食材卡片
   */
  onInventoryLongPress(e) {
    this.toggleDeleteMode();
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
          this.generateRecommendations();
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
  