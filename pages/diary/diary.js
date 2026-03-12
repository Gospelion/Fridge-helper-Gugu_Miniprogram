// pages/diary/diary.js
const storage = require('../../utils/storage');

Page({
  data: {
    recipes: [],
    recipeNames: [],
    selectedRecipeIndex: 0,
    selectedRecipeName: '',
    showRecipeSelector: false,
    customTitle: '',
    imageList: [],
    diaryList: []
  },

  onLoad(options) {
    // 如果从首页带过来推荐菜名，尽量选中
    const recipeName = options && options.recipeName
      ? decodeURIComponent(options.recipeName)
      : '';
    this.initRecipes(recipeName);
    this.refreshDiary();
  },

    onShow() {
    // 可能库存变化，日记中展示的消耗文本不依赖库存，可不必每次刷新
    // 更新自定义 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1
      });
    }
  },

  initRecipes(preferName) {
    const recipes = storage.getRecipes();
    const recipeNames = recipes.map((r) => r.name);
    let selectedRecipeIndex = 0;
    let selectedRecipeName = recipeNames[0] || '';

    if (preferName) {
      const idx = recipeNames.indexOf(preferName);
      if (idx >= 0) {
        selectedRecipeIndex = idx;
        selectedRecipeName = preferName;
      }
    }

    this.setData({
      recipes,
      recipeNames,
      selectedRecipeIndex,
      selectedRecipeName
    });
  },

  refreshDiary() {
    const list = storage.getDiary();
    const decorated = list.map((item) => {
      const date = new Date(item.createdAt || Date.now());
      const dateText = storage.formatDate(date);
      const usedIngredientsText = (item.usedIngredients || [])
        .map((u) => `${u.name} x${u.quantity}`)
        .join('，');
      return {
        ...item,
        dateText,
        usedIngredientsText
      };
    });
    this.setData({
      diaryList: decorated
    });
  },

  openRecipeSelector() {
    if (this.data.recipeNames.length === 0) {
      wx.showToast({
        title: '暂无可选菜谱，请先添加菜谱',
        icon: 'none'
      });
      return;
    }
    this.setData({
      showRecipeSelector: true
    });
  },

  closeRecipeSelector() {
    this.setData({
      showRecipeSelector: false
    });
  },

  onRecipeCardTap(e) {
    const index = e.currentTarget.dataset.index;
    const selectedRecipeName = this.data.recipeNames[index];
    this.setData({
      selectedRecipeIndex: index,
      selectedRecipeName,
      showRecipeSelector: false
    });
  },

  onCustomTitleInput(e) {
    this.setData({
      customTitle: e.detail.value
    });
  },

  chooseImage() {
    wx.chooseImage({
      count: 3,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const paths = res.tempFilePaths || [];
        this.setData({
          imageList: this.data.imageList.concat(paths).slice(0, 3)
        });
      }
    });
  },

  previewImage(e) {
    const index = e.currentTarget.dataset.index;
    wx.previewImage({
      current: this.data.imageList[index],
      urls: this.data.imageList
    });
  },

  /**
   * 发布日记并扣减库存
   */
  onPublish() {
    const { recipes, selectedRecipeIndex, customTitle, imageList } = this.data;

    if (!recipes.length && !customTitle.trim()) {
      wx.showToast({
        title: '请至少选择或填写一道菜名',
        icon: 'none'
      });
      return;
    }

    const recipe =
      recipes[selectedRecipeIndex] && recipes[selectedRecipeIndex].name
        ? recipes[selectedRecipeIndex]
        : null;

    const finalTitle =
      customTitle.trim() ||
      (recipe ? recipe.name : '未命名料理');

    const usedIngredients =
      recipe && recipe.ingredients
        ? recipe.ingredients.map((name) => ({
            name,
            quantity: 1
          }))
        : [];

    // 扣减库存
    if (usedIngredients.length) {
      storage.consumeIngredients(usedIngredients);
    }

    // 写入日记
    storage.addDiaryEntry({
      title: finalTitle,
      recipeName: recipe ? recipe.name : '',
      imageList,
      usedIngredients
    });

    wx.showToast({
      title: '已记录并扣减库存',
      icon: 'success'
    });

    // 清空发布表单并刷新历史列表
    this.setData({
      customTitle: '',
      imageList: []
    });
    this.refreshDiary();
  },

  noop() {}
});