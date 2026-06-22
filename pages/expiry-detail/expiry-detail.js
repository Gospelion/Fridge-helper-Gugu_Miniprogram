const storage = require('../../utils/storage');
const { calcDaysLeft } = require('../../utils/domain');

function getStatus(daysLeft) {
  if (daysLeft === null) return 'unset';
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 1) return 'urgent';
  if (daysLeft <= 3) return 'warning';
  return 'normal';
}

function getExpiryLabel(daysLeft) {
  if (daysLeft === null) return '未设置保质期';
  if (daysLeft < 0) return `已过期 ${Math.abs(daysLeft)} 天`;
  if (daysLeft === 0) return '今天到期';
  if (daysLeft === 1) return '明天到期';
  return `剩余 ${daysLeft} 天`;
}

function getCategoryBgClass(category) {
  const classMap = {
    '农产品': 'bg-agri',
    '蔬菜': 'bg-veg',
    '水果': 'bg-fruit',
    '饮品/其他': 'bg-other'
  };
  return classMap[category] || 'bg-other';
}

function getExpiryStatusClass(status) {
  if (status === 'expired') return 'expiry-expired';
  if (status === 'urgent') return 'expiry-urgent';
  return 'expiry-warning';
}

Page({
  data: {
    type: 'warning',
    title: '临期食材',
    summaryText: '这些食材进入了最佳处理时间',
    overviewTitle: '安排进最近一餐',
    overviewDesc: '临期不等于变质，食用前请确认气味与状态。',
    emptyDesc: '当前没有需要优先处理的食材',
    items: []
  },

  onLoad(options) {
    const type = options.type === 'expired' ? 'expired' : 'warning';
    const title = type === 'expired' ? '已过期食材' : '临期食材';
    const pageCopy = type === 'expired'
      ? {
          summaryText: '请检查状态并及时清理',
          overviewTitle: '先确认，再处理',
          overviewDesc: '超过保质期的食材不建议继续食用，请妥善处理。',
          emptyDesc: '很好，当前库存没有过期食材'
        }
      : {
          summaryText: '这些食材进入了最佳处理时间',
          overviewTitle: '安排进最近一餐',
          overviewDesc: '临期不等于变质，食用前请确认气味与状态。',
          emptyDesc: '当前没有需要优先处理的食材'
        };
    this.setData({ type, title, ...pageCopy });
    wx.setNavigationBarTitle({ title });
  },

  goBack() {
    wx.navigateBack({
      fail: () => wx.switchTab({ url: '/pages/index/index' })
    });
  },

  onShow() {
    const items = storage.getInventory()
      .map((item) => {
        const daysLeft = calcDaysLeft(item.expiryDate);
        const status = getStatus(daysLeft);
        return {
          ...item,
          daysLeft,
          status,
          expiryLabel: getExpiryLabel(daysLeft),
          expiryStatusClass: getExpiryStatusClass(status),
          categoryBgClass: getCategoryBgClass(item.category)
        };
      })
      .filter((item) => this.data.type === 'expired'
        ? item.status === 'expired'
        : item.status === 'warning' || item.status === 'urgent')
      .sort((a, b) => a.daysLeft - b.daysLeft);
    this.setData({ items });
  }
});
