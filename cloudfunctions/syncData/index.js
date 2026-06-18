const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const collection = db.collection('fridge_user_data');

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { success: false, error: '无法识别当前用户' };

  if (event.action === 'pull') {
    try {
      const result = await collection.doc(OPENID).get();
      return { success: true, data: result.data && result.data.payload };
    } catch (error) {
      const message = String(error && error.message || '');
      if (/not exist|not found|不存在/i.test(message)) {
        return { success: true, data: null };
      }
      console.error('Failed to read synced data:', error && error.errCode);
      return { success: false, error: '云端数据读取失败' };
    }
  }

  if (event.action === 'push') {
    const payload = event.data;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { success: false, error: '数据格式无效' };
    }
    await collection.doc(OPENID).set({
      data: {
        payload,
        updatedAt: db.serverDate()
      }
    });
    return { success: true };
  }

  return { success: false, error: '不支持的同步操作' };
};
