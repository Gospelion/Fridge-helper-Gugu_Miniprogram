// pages/diary/diary.js
const storage = require('../../utils/storage');
const { getServingFactor } = require('../../utils/domain');

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

  onLoad() {
    this.initRecipes('');
  },

  onShow() {
    const app = getApp();
    const pendingRecipeName = app.globalData.pendingRecipeName || '';
    app.globalData.pendingRecipeName = '';
    if (pendingRecipeName) {
      this.setData({ customTitle: '' });
    }
    this.initRecipes(pendingRecipeName || this.data.selectedRecipeName);
    this.refreshDiary();
    // 更新自定义 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1,
        hidden: false
      });
    }
    const syncReady = getApp().globalData.syncReady;
    if (!this._cloudRefreshBound && syncReady) {
      this._cloudRefreshBound = true;
      syncReady.then(() => {
        this.initRecipes(this.data.selectedRecipeName);
        this.refreshDiary();
      }).catch(() => {});
    }
  },

  initRecipes(preferName) {
    const recipes = storage.getRecipes();
    const recipeNames = recipes.map((r) => r.name);
    const hasCustomTitle = this.data.customTitle.trim().length > 0;
    let selectedRecipeIndex = hasCustomTitle ? -1 : 0;
    let selectedRecipeName = hasCustomTitle ? '' : (recipeNames[0] || '');

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
      const consumedByName = new Map();
      (item.usedIngredients || []).forEach((ingredient) => {
        const key = `${ingredient.name}|${ingredient.unit || ''}`;
        const current = consumedByName.get(key) || { ...ingredient, quantity: 0 };
        current.quantity += Number(ingredient.quantity) || 0;
        consumedByName.set(key, current);
      });
      const usedIngredientsText = Array.from(consumedByName.values())
        .map((u) => `${u.name} x${u.quantity}${u.unit || ''}`)
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
      customTitle: '',
      showRecipeSelector: false
    });
  },

  onCustomTitleInput(e) {
    const customTitle = e.detail.value;
    const hasCustomTitle = customTitle.trim().length > 0;
    const fallbackIndex = this.data.recipeNames.length ? 0 : -1;
    this.setData({
      customTitle,
      selectedRecipeIndex: hasCustomTitle ? -1 : fallbackIndex,
      selectedRecipeName: hasCustomTitle ? '' : (this.data.recipeNames[fallbackIndex] || '')
    });
  },

  goAddPage() {
    wx.navigateTo({ url: '/pages/add/add' });
  },

  chooseImage() {
    const remaining = 3 - this.data.imageList.length;
    if (remaining <= 0) {
      wx.showToast({ title: '最多选择 3 张图片', icon: 'none' });
      return;
    }
    wx.chooseImage({
      count: remaining,
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

  previewDiaryImage(e) {
    const { entryId, imageIndex } = e.currentTarget.dataset;
    const entry = this.data.diaryList.find((item) => item.id === entryId);
    if (!entry || !entry.imageList[imageIndex]) return;
    wx.previewImage({ current: entry.imageList[imageIndex], urls: entry.imageList });
  },

  compressImage(filePath) {
    return new Promise((resolve, reject) => {
      wx.compressImage({
        src: filePath,
        quality: 45,
        success: (res) => resolve(res.tempFilePath),
        fail: reject
      });
    });
  },

  saveFile(tempFilePath) {
    return new Promise((resolve, reject) => {
      wx.saveFile({
        tempFilePath,
        success: (res) => resolve(res.savedFilePath),
        fail: reject
      });
    });
  },

  removeSavedFiles(paths) {
    (paths || []).forEach((filePath) => {
      wx.removeSavedFile({ filePath, fail: () => {} });
    });
  },

  async persistCompressedImages(paths) {
    const savedPaths = [];
    try {
      for (const path of paths) {
        savedPaths.push(await this.saveFile(path));
      }
      return savedPaths;
    } catch (error) {
      this.removeSavedFiles(savedPaths);
      throw error;
    }
  },

  async checkDiaryContent(title, imagePaths) {
    const compressedPaths = [];
    const fileIDs = [];
    try {
      for (let index = 0; index < imagePaths.length; index += 1) {
        const compressedPath = await this.compressImage(imagePaths[index]);
        compressedPaths.push(compressedPath);
        const uploadResult = await wx.cloud.uploadFile({
          cloudPath: `diary-security/${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}.jpg`,
          filePath: compressedPath
        });
        fileIDs.push(uploadResult.fileID);
      }

      const response = await wx.cloud.callFunction({
        name: 'contentSecurity',
        data: { text: title, fileIDs }
      });
      const result = response.result;
      if (!result || result.success === false) {
        const error = new Error(result?.error || '内容安全检测服务暂不可用');
        error.userMessage = '安全检测失败，请稍后重试';
        throw error;
      }
      if (!result.passed) {
        const error = new Error(result.reason || '内容未通过安全检测');
        if (result.reason === 'review') {
          error.userMessage = '内容需要人工复核，暂不能发布';
        } else if (result.reason === 'image_too_large') {
          error.userMessage = '图片过大，请压缩后重试';
        } else {
          error.userMessage = '内容未通过安全检测，请修改后重试';
        }
        throw error;
      }
      return compressedPaths;
    } finally {
      if (fileIDs.length) {
        try {
          await wx.cloud.deleteFile({ fileList: fileIDs });
        } catch (cleanupError) {
          console.warn('清理安全检测临时文件失败');
        }
      }
    }
  },

  /**
   * 发布日记并扣减库存
   */
  async onPublish() {
    const { recipes, selectedRecipeIndex, customTitle, imageList } = this.data;
    const recipe =
      recipes[selectedRecipeIndex] && recipes[selectedRecipeIndex].name
        ? recipes[selectedRecipeIndex]
        : null;

    if (!recipe && !customTitle.trim()) {
      wx.showToast({ title: '请至少选择或填写一道菜名', icon: 'none' });
      return;
    }

    const finalTitle =
      customTitle.trim() ||
      (recipe ? recipe.name : '未命名料理');

    const servingsFactor = getServingFactor(storage.getPreferences().servings);
    const usedIngredients = recipe && recipe.ingredients
      ? recipe.ingredients.map((ingredient) => ({
          ...ingredient,
          quantity: Math.round(ingredient.quantity * servingsFactor * 100) / 100
        }))
      : [];

    let savedImages = [];
    wx.showLoading({ title: '安全检测中', mask: true });
    try {
      const checkedImages = await this.checkDiaryContent(finalTitle, imageList);
      savedImages = await this.persistCompressedImages(checkedImages);
      const publishResult = storage.publishDiary({
        title: finalTitle,
        recipeName: recipe ? recipe.name : '',
        imageList: savedImages,
        usedIngredients
      });
      this.setData({
        customTitle: '',
        imageList: [],
        selectedRecipeIndex: recipes.length ? 0 : -1,
        selectedRecipeName: recipes[0]?.name || ''
      });
      this.refreshDiary();
      const shortages = publishResult.shortages || [];
      wx.showToast({
        title: shortages.length ? `已记录，${shortages.length} 种库存不足` : '已记录并扣减库存',
        icon: shortages.length ? 'none' : 'success'
      });
    } catch (error) {
      console.error('保存日记失败:', error);
      this.removeSavedFiles(savedImages);
      wx.showToast({ title: error.userMessage || '保存失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onDeleteDiary(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除日记',
      content: '删除后将同时清理已保存的照片，是否继续？',
      success: (res) => {
        if (!res.confirm) return;
        const result = storage.removeDiaryEntry(id);
        if (!result.removed) return;
        this.removeSavedFiles(result.imagePaths);
        this.refreshDiary();
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    });
  }
});
