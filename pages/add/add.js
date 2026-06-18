// pages/add/add.js
const storage = require('../../utils/storage');
const { ALLOWED_UNITS, parseRecognizedFoods, recognizeCategory } = require('../../utils/domain');

// 各类别默认保质期天数
const defaultDays = {
  '农产品': 5,
  '蔬菜': 3,
  '水果': 7,
  '饮品/其他': 30
};

Page({
  data: {
    quickTags: [
      { name: '鸡蛋' },
      { name: '西红柿' },
      { name: '青菜' },
      { name: '猪肉' },
      { name: '牛肉' },
      { name: '土豆' }
    ],
    units: ALLOWED_UNITS,
    // 食材分类选项
    categories: ['农产品', '蔬菜', '水果', '饮品/其他'],
    showUnitSelector: false,
    recognizedFood: "",
    form: {
      name: '',
      quantity: '',
      unitIndex: 0,
      expiryDays: '',
      categoryIndex: 3 // 默认“饮品/其他”
    }
  },

  /**
   * 根据食材名称自动识别分类并更新表单
   */
  autoRecognizeCategory(name) {
    if (!name) return;
    
    const result = recognizeCategory(name);
    if (result) {
      const categoryIndex = this.data.categories.indexOf(result);
      const days = defaultDays[result] || 30;
      this.setData({
        'form.categoryIndex': categoryIndex >= 0 ? categoryIndex : 3,
        'form.expiryDays': String(days)
      });
    }
  },

  onQuickTagTap(e) {
    const { name } = e.currentTarget.dataset;
    this.setData({
      'form.name': name
    });
    // 触发自动识别
    this.autoRecognizeCategory(name);
  },

  onNameInput(e) {
    this.setData({
      'form.name': e.detail.value
    });
  },

  onNameBlur(e) {
    // blur 事件中可能没有 e.detail.value，从 data 中获取最新值
    const name = this.data.form.name || '';
    // 触发自动识别
    this.autoRecognizeCategory(name);
  },

  onQuantityInput(e) {
    this.setData({
      'form.quantity': e.detail.value
    });
  },

  onUnitChange(e) {
    this.setData({
      'form.unitIndex': Number(e.detail.value) || 0
    });
  },

  onExpiryDaysInput(e) {
    this.setData({
      'form.expiryDays': e.detail.value
    });
  },

  onCategoryChange(e) {
    this.setData({
      'form.categoryIndex': Number(e.detail.value) || 0
    });
  },

  /**
   * 打开单位选择器
   */
  openUnitSelector() {
    this.setData({
      showUnitSelector: true
    });
  },

  /**
   * 关闭单位选择器
   */
  closeUnitSelector() {
    this.setData({
      showUnitSelector: false
    });
  },

  /**
   * 点击单位卡片
   */
  onUnitCardTap(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({
      'form.unitIndex': index,
      showUnitSelector: false
    });
  },

  chooseCameraImage() {
    return new Promise((resolve, reject) => {
      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['camera'],
        success: (res) => resolve(res.tempFilePaths[0]),
        fail: reject
      });
    });
  },

  compressImage(filePath) {
    return new Promise((resolve, reject) => {
      wx.compressImage({
        src: filePath,
        quality: 60,
        success: (res) => resolve(res.tempFilePath),
        fail: reject
      });
    });
  },

  uploadRecognitionImage(filePath) {
    return wx.cloud.uploadFile({
      cloudPath: `food-images/${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`,
      filePath
    });
  },

  buildInventoryItems(foods) {
    return foods.map((food) => {
      const category = recognizeCategory(food.name) || '饮品/其他';
      const days = defaultDays[category] || 30;
      return {
        ...food,
        category,
        expiryDate: storage.formatDate(storage.addDays(new Date(), days))
      };
    });
  },

  async handlePhotoAdd() {
    let tempFilePath;
    try {
      tempFilePath = await this.chooseCameraImage();
    } catch (error) {
      return;
    }

    let fileID = '';
    let addedCount = 0;
    let failureMessage = '';
    wx.showLoading({ title: '识别中', mask: true });
    try {
      const compressedPath = await this.compressImage(tempFilePath);
      const uploadResult = await this.uploadRecognitionImage(compressedPath);
      fileID = uploadResult.fileID;
      const response = await wx.cloud.callFunction({
        name: 'recognizeFood',
        data: { fileID }
      });
      if (!response.result || response.result.success === false) {
        throw new Error(response.result?.error || '云函数返回结果为空');
      }

      const rawResult = response.result.result || '';
      const foods = parseRecognizedFoods(rawResult);
      if (!foods.length) throw new Error('未识别到有效食材');
      const ids = storage.addItems(this.buildInventoryItems(foods));
      storage.markNewlyAddedIngredients(ids);
      addedCount = ids.length;
      this.setData({ recognizedFood: rawResult });
    } catch (error) {
      console.error('识别失败:', error);
      failureMessage = error.message || '识别失败';
    } finally {
      if (fileID) {
        try {
          await wx.cloud.deleteFile({ fileList: [fileID] });
        } catch (cleanupError) {
          console.warn('清理识别图片失败:', cleanupError);
        }
      }
      wx.hideLoading();
    }

    if (!addedCount) {
      wx.showToast({ title: failureMessage || '识别失败', icon: 'none' });
      return;
    }
    wx.showToast({ title: `已添加 ${addedCount} 种`, icon: 'success', duration: 1500 });
    setTimeout(() => wx.navigateBack({ delta: 1 }), 1000);
  },

  parseOcrTextAndAdd(text) {
    const foods = parseRecognizedFoods(text);
    if (!foods.length) return 0;
    const ids = storage.addItems(this.buildInventoryItems(foods));
    storage.markNewlyAddedIngredients(ids);
    return ids.length;
  },

  /**
   * 手动表单提交
   */
  onSubmit() {
    const { name, quantity, unitIndex, expiryDays, categoryIndex } =
      this.data.form;
    if (!name.trim()) {
      wx.showToast({
        title: '请填写食材名称',
        icon: 'none'
      });
      return;
    }
    if (!quantity) {
      wx.showToast({
        title: '请填写数量',
        icon: 'none'
      });
      return;
    }
    const num = Number(quantity);
    if (Number.isNaN(num) || num <= 0) {
      wx.showToast({
        title: '数量需为正数',
        icon: 'none'
      });
      return;
    }

    let expiryDate = '';
    if (expiryDays) {
      const days = Number(expiryDays);
      if (!Number.isFinite(days) || days < 0) {
        wx.showToast({ title: '保质期需为非负数', icon: 'none' });
        return;
      }
      expiryDate = storage.formatDate(storage.addDays(new Date(), days));
    }

    const unit = this.data.units[unitIndex] || '个';
    const category =
      this.data.categories[categoryIndex] || '饮品/其他';

    const newId = storage.addItem({
      name: name.trim(),
      quantity: num,
      unit,
      expiryDate,
      // 用户手动选择的分类；若未选择则默认“饮品/其他”
      category
    });
    storage.markNewlyAddedIngredients([newId]);

    wx.showToast({
      title: '已加入冰箱',
      icon: 'success',
      duration: 1500
    });

    // 重置表单
    this.setData({
      form: {
        name: '',
        quantity: '',
        unitIndex: 0,
        expiryDays: '',
        categoryIndex: 3
      }
    });

    // 延迟跳转回 index 页面，确保 toast 显示完整
    setTimeout(() => {
      wx.navigateBack({
        delta: 1
      });
    }, 1000);
  }
});
