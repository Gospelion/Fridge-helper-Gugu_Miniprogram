// pages/add/add.js
const storage = require('../../utils/storage');
const fs = wx.getFileSystemManager()
// 关键词到分类的映射
const keywordMap = [
  { keywords: ['猪', '牛', '羊', '鸡', '鸭', '鱼', '肉', '蛋', '牛奶','虾'], category: '农产品', categoryIndex: 0 },
  { keywords: ['白', '青', '绿', '菜', '萝', '瓜', '茄', '椒', '葱', '蒜', '姜', '豆', '土豆', '西红柿', '番茄', '茄子', '生菜', '黄瓜', '白菜', '菠菜', '芹菜', '韭菜', '豆角', '四季豆', '豆芽', '莲藕', '冬瓜', '南瓜', '丝瓜', '苦瓜', '花菜', '西兰花', '卷心菜', '油菜', '空心菜', '茼蒿', '芥蓝', '芦笋', '竹笋', '莴笋', '山药', '芋头', '洋葱', '香菜', '豌豆', '毛豆', '油麦菜'], category: '蔬菜', categoryIndex: 1 },
  { keywords: ['苹', '香', '橙', '橘', '梨', '桃', '葡', '莓', '果', '柠'], category: '水果', categoryIndex: 2 },
  { keywords: ['水', '奶', '汁', '饮', '酒', '茶', '咖'], category: '饮品/其他', categoryIndex: 3 }
];

// 各类别默认保质期天数
const defaultDays = {
  '农产品': 5,
  '蔬菜': 3,
  '水果': 7,
  '饮品/其他': 30
};

/**
 * 根据食材名称智能识别分类
 * 优先匹配更长的关键词（如"牛奶"优先于"奶"）
 */
function recognizeCategory(name) {
  if (!name) return null;
  
  // 收集所有关键词及其分类信息，按长度降序排序
  const allKeywords = [];
  for (const item of keywordMap) {
    for (const keyword of item.keywords) {
      allKeywords.push({
        keyword,
        length: keyword.length,
        category: item.category,
        categoryIndex: item.categoryIndex
      });
    }
  }
  // 长关键词优先匹配
  allKeywords.sort((a, b) => b.length - a.length);
  
  // 查找第一个匹配的关键词
  for (const item of allKeywords) {
    if (name.includes(item.keyword)) {
      return { category: item.category, categoryIndex: item.categoryIndex };
    }
  }
  return null;
}

/**
 * 计算过期日期
 */
function calculateExpireDate(days) {
  const now = new Date();
  const expireDate = storage.addDays(now, days);
  return storage.formatDate(expireDate);
}

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
        units: ['个', 'kg', '包', 'g', '斤'],
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
      // 更新分类
      this.setData({
        'form.categoryIndex': result.categoryIndex
      });

      // 根据分类获取默认天数，更新保质期
      const days = defaultDays[result.category] || 30;
      this.setData({
        'form.expiryDays': String(days)
      });

      console.log(`自动识别: "${name}" -> 分类: ${result.category}, 默认保质期: ${days}天`);
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

  /**
   * 模拟 OCR：用户在弹窗中手动输入识别到的文字
   * 未来可在此处接入百度 AI 或微信 OCR 接口
   */
  onMockOcr() {
    wx.showModal({
      title: '模拟 OCR 结果',
      content: '请手动输入识别到的食材及数量',
      editable: true,
      placeholderText: '例如：土豆 2个，牛肉 500g',
      success: (res) => {
        if (res.confirm) {
          const text = (res.content || '').trim();
          if (!text) return;
          const addedCount = this.parseOcrTextAndAdd(text);
          wx.showToast({
            title: `已添加 ${addedCount} 种`,
            icon: 'success'
          });
        }
      }
    });
  },

                /**
   * 方式 A：拍照添加食材
   */
  async handlePhotoAdd() {
    const that = this
    wx.chooseImage({
      count: 1,
      sourceType: ['camera'],
      success: async (res) => {
        const tempFilePath = res.tempFilePaths[0]
        wx.showLoading({
          title: "识别中"
        })
        // 1 压缩图片
        wx.compressImage({
          src: tempFilePath,
          quality: 60,
          success: async (compressRes) => {
            const compressedPath = compressRes.tempFilePath
            try {
              // 2 上传云存储
              const uploadRes = await wx.cloud.uploadFile({
                cloudPath: `food-images/${Date.now()}.jpg`,
                filePath: compressedPath
              })
              const fileID = uploadRes.fileID
              console.log("上传成功:", fileID)
              // 3 调用云函数
              const aiRes = await wx.cloud.callFunction({
                name: "recognizeFood",
                data: { fileID }
              })
              
              console.log("AI 返回:", JSON.stringify(aiRes, null, 2))

              // 检查云函数返回结果
              if (!aiRes.result) {
                throw new Error("云函数返回结果为空")
              }
              // 检查是否执行成功
              if (aiRes.result.success === false) {
                throw new Error(aiRes.result.error || "识别失败")
              }

                            const result = aiRes.result.result || ""
              console.log("识别结果:", result)

              if (!result.trim()) {
                throw new Error("AI 未能识别出食材")
              }
              that.setData({
                recognizedFood: result
              })
              // 4 解析食材信息（JSON 格式）
              let foods = []
              try {
                foods = JSON.parse(result)
                // 确保是数组格式
                if (!Array.isArray(foods)) {
                  foods = [foods]
                }
              } catch (e) {
                console.error("JSON 解析失败:", e)
                console.error("原始返回内容:", result)
                
                // 尝试提取 JSON 部分（处理 AI 返回 markdown 或带说明的情况）
                const jsonMatch = result.match(/\[[\s\S]*\]/)
                if (jsonMatch) {
                  try {
                    foods = JSON.parse(jsonMatch[0])
                    console.log("从混合内容中提取 JSON 成功")
                  } catch (e2) {
                    console.error("提取 JSON 失败:", e2)
                  }
                }
                
                // 如果还是失败，尝试解析 "名称 数量单位" 格式
                if (foods.length === 0) {
                  // 例如："西红柿 2 个" 或 "土豆 500g"
                  const match = result.match(/([\u4e00-\u9fa5A-Za-z]+)\s*(\d+(?:\.\d+)?)\s*(个 |kg|包|g|斤)?/)
                  if (match) {
                    foods = [{
                      name: match[1].trim(),
                      quantity: Number(match[2]) || 1,
                      unit: match[3] || "个"
                    }]
                  } else {
                    // 最后尝试：如果只有纯文本名称（如"西红柿"），给默认数量和单位
                    const pureText = result.trim().replace(/[\[\]{}"']/g, '')
                    if (pureText && pureText.length > 0 && pureText.length < 20) {
                      foods = [{
                        name: pureText,
                        quantity: 1,
                        unit: "个"
                      }]
                      console.log("纯文本识别，使用默认数量:", foods)
                    } else {
                      // 逗号分隔尝试
                      foods = result.split(/[,,]/).map(f => ({ name: f.trim(), quantity: 1, unit: "个" })).filter(f => f.name)
                    }
                  }
                }
                
                // 如果所有方法都失败，显示原始内容让用户确认
                if (foods.length === 0) {
                  wx.showModal({
                    title: '识别结果',
                    content: 'AI 返回的内容格式无法解析，请手动输入：\n\n' + result,
                    editable: true,
                    placeholderText: '例如：西红柿 2 个',
                    success: (modalRes) => {
                      if (modalRes.confirm) {
                        that.parseOcrTextAndAdd(modalRes.content || '')
                      }
                    }
                  })
                  return
                }
              }
              // 识别成功后自动保存并返回
              if (foods.length > 0) {
                const firstFood = foods[0]
                const name = firstFood.name.trim()
                const quantity = Number(firstFood.quantity) || 1
                const unit = firstFood.unit || "个"
                
                // 智能识别分类
                const recognized = recognizeCategory(name)
                const category = recognized ? recognized.category : '饮品/其他'
                const days = defaultDays[category] || 30
                
                // 计算过期日期
                const now = new Date()
                const expiryDate = storage.formatDate(storage.addDays(now, days))
                
                                // 自动保存到冰箱，并记录新添加的食材 ID
                const newId = storage.addItem({
                  name,
                  quantity,
                  unit,
                  expiryDate,
                  category
                })
                storage.markNewlyAddedIngredients([newId])
                
                wx.hideLoading()
                wx.showToast({
                  title: "识别成功，已添加",
                  icon: "success",
                  duration: 1500
                })
                
                // 延迟跳转回 index 页面
                setTimeout(() => {
                  wx.navigateBack({
                    delta: 1
                  })
                }, 1000)
              } else {
                wx.hideLoading()
                wx.showToast({
                  title: "未识别到食材",
                  icon: "none"
                })
              }
            } catch (err) {
              console.error("识别失败:", err)
              wx.hideLoading()
              wx.showToast({
                title: "识别失败",
                icon: "none"
              })
            }
          },
          fail: (err) => {
            console.error("压缩失败", err)
            wx.hideLoading()
          }
        })
      }
    })
  },
  /**
   * 图片转 base64
   * @param {string} filePath - 图片路径
   * @returns {Promise} - base64 字符串
   */
  imageToBase64(filePath) {
    return new Promise((resolve, reject) => {
      const fs = wx.getFileSystemManager();
      fs.readFile({
        filePath: filePath,
        encoding: 'base64',
        success: (res) => {
          resolve(res.data);
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  },

    /**
   * 简单解析 OCR 文本并加入库存
   * 示例输入：土豆 2 个，牛肉 500g
   */
  parseOcrTextAndAdd(text) {
    const segments = text
      .split(/，|,/)
      .map((s) => s.trim())
      .filter(Boolean);

    let added = 0;
    const newIds = [];

    segments.forEach((seg) => {
      // 尝试匹配：名称 数量单位
      // 如：土豆 2 个 / 牛肉 500g / 鸡蛋 10
      const match = seg.match(/(\S+)\s*(\d+(?:\.\d+)?)(个|kg|包|g|斤)?/);
      if (match) {
        const name = match[1];
        const quantity = Number(match[2]) || 1;
        const unit = match[3] || '个';

        const now = new Date();

        // OCR 模式下也进行智能分类识别
        const recognized = recognizeCategory(name);
        const category = recognized ? recognized.category : '饮品/其他';
        const days = defaultDays[category] || 30;
        const expiryDate = storage.formatDate(storage.addDays(now, days));

        // 记录新添加的食材 ID
        const newId = storage.addItem({
          name,
          quantity,
          unit,
          expiryDate,
          category
        });
        newIds.push(newId);
        added += 1;
      }
    });

    // 标记所有新添加的食材
    if (newIds.length > 0) {
      storage.markNewlyAddedIngredients(newIds);
    }

    return added;
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
      if (!Number.isNaN(days) && days > 0) {
        const now = new Date();
        expiryDate = storage.formatDate(storage.addDays(now, days));
      }
    }

    const unit = this.data.units[unitIndex] || '个';
    const category =
      this.data.categories[categoryIndex] || '饮品/其他';

    storage.addItem({
      name: name.trim(),
      quantity: num,
      unit,
      expiryDate,
      // 用户手动选择的分类；若未选择则默认“饮品/其他”
      category
    });

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


