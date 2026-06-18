const storage = require('../../utils/storage');

function calcDaysLeft(expiryDate) {
  if (!expiryDate) return null;
  const expire = new Date(expiryDate);
  const now = new Date();
  const diff = expire.getTime() - now.getTime();
  return Number.isNaN(diff) ? null : Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function getStatus(daysLeft) {
  if (daysLeft === null) return 'unset';
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 1) return 'urgent';
  if (daysLeft <= 3) return 'warning';
  return 'normal';
}

function getExpiryLabel(daysLeft) {
  if (daysLeft < 0) return `已过期 ${Math.abs(daysLeft)} 天`;
  if (daysLeft === 0) return '今天到期';
  if (daysLeft === 1) return '明天到期';
  return `剩余 ${daysLeft} 天`;
}

Page({
  data: {
    type: 'warning',
    title: '临期食材',
    items: []
  },

  onLoad(options) {
    const type = options.type === 'expired' ? 'expired' : 'warning';
    const title = type === 'expired' ? '已过期食材' : '临期食材';
    this.setData({ type, title });
    wx.setNavigationBarTitle({ title });
  },

  onShow() {
    const items = storage.getInventory()
      .map((item) => {
        const daysLeft = calcDaysLeft(item.expiryDate);
        return { ...item, daysLeft, status: getStatus(daysLeft), expiryLabel: getExpiryLabel(daysLeft) };
      })
      .filter((item) => this.data.type === 'expired'
        ? item.status === 'expired'
        : item.status === 'warning' || item.status === 'urgent')
      .sort((a, b) => a.daysLeft - b.daysLeft);
    this.setData({ items });
  }
});
