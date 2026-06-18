const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 1024 * 1024;

function isRiskError(error) {
  const code = Number(error && (error.errCode || error.errcode));
  const message = String(error && error.message || '');
  return code === 87014 || /risky|违规|不合规|敏感/i.test(message);
}

async function checkText(content, openid) {
  const text = String(content || '').trim();
  if (!text) return { passed: true };
  const response = await cloud.openapi.security.msgSecCheck({
    content: text,
    version: 2,
    scene: 4,
    openid
  });
  const suggest = response.result && response.result.suggest;
  return { passed: suggest === 'pass', reason: suggest || 'review' };
}

async function checkImage(fileID) {
  const download = await cloud.downloadFile({ fileID });
  const buffer = download.fileContent;
  if (!buffer || buffer.length > MAX_IMAGE_BYTES) {
    return { passed: false, reason: 'image_too_large' };
  }
  try {
    const response = await cloud.openapi.security.imgSecCheck({
      media: {
        contentType: 'image/jpeg',
        value: buffer
      }
    });
    const code = Number(response.errCode ?? response.errcode ?? 0);
    const suggest = response.result && response.result.suggest;
    if (code === 87014 || (suggest && suggest !== 'pass')) {
      return { passed: false, reason: suggest || 'risky' };
    }
    if (code !== 0) throw new Error(`Image security check failed with code ${code}`);
    return { passed: true };
  } catch (error) {
    if (isRiskError(error)) return { passed: false, reason: 'risky' };
    throw error;
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const fileIDs = Array.isArray(event.fileIDs) ? event.fileIDs.slice(0, MAX_IMAGES) : [];
  if (!OPENID) return { success: false, error: '无法识别当前用户' };
  if (fileIDs.some((fileID) => typeof fileID !== 'string' || !fileID)) {
    return { success: false, error: '图片参数无效' };
  }

  try {
    const textResult = await checkText(event.text, OPENID);
    if (!textResult.passed) {
      return { success: true, passed: false, reason: textResult.reason };
    }
    for (const fileID of fileIDs) {
      const imageResult = await checkImage(fileID);
      if (!imageResult.passed) {
        return { success: true, passed: false, reason: imageResult.reason };
      }
    }
    return { success: true, passed: true };
  } catch (error) {
    console.error('Content security check failed:', error && error.errCode);
    return { success: false, error: '内容安全检测服务暂不可用' };
  }
};
