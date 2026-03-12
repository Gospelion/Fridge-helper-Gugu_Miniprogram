// test_ai_key.js
const axios = require('axios')

// ========== 配置区 ==========
const API_KEY = 'sk-7a65b36beb914cc78a88157a22bc7ebd'
const IMAGE_URL = 'https://example.com/test.jpg' // 可测试图片URL，也可以用云函数 getTempFileURL 返回的临时URL
// ===========================

async function testAI() {
  try {
    const response = await axios.post(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        model: 'qwen3.5-plus',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: '测试识别图片中的食材，只返回名称，用逗号分隔' },
              { type: 'image_url', image_url: { url: IMAGE_URL } }
            ]
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10秒超时
      }
    )

    console.log('接口返回状态:', response.status)
    console.log('接口返回数据:', JSON.stringify(response.data, null, 2))

    const result = response.data?.choices?.[0]?.message?.content || ''
    if (!result) {
      console.log('AI 未返回识别结果')
    } else {
      console.log('识别结果:', result)
    }
  } catch (err) {
    if (err.response) {
      console.error('接口返回错误:', err.response.status, err.response.data)
    } else {
      console.error('请求出错:', err.message)
    }
  }
}

// 执行测试
testAI()