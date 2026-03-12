const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  try {
    const { fileID } = event
    console.log("收到 fileID:", fileID)

    if (!fileID) {
      return { 
        success: false,
        error: "缺少 fileID 参数" 
      }
    }

    // 获取可访问临时 URL
    console.log("获取图片临时 URL...")
    const tempFileRes = await cloud.getTempFileURL({
      fileList: [fileID]
    })

    const tempFileURL = tempFileRes.fileList[0]?.tempFileURL
    if (!tempFileURL) {
      return {
        success: false,
        error: "获取临时 URL 失败"
      }
    }

    console.log("临时 URL:", tempFileURL)

    // 下载图片并转为 base64
    console.log("下载图片...")
    const downloadRes = await axios.get(tempFileURL, {
      responseType: 'arraybuffer'
    })
    const base64Image = Buffer.from(downloadRes.data).toString('base64')
    console.log("图片 base64 长度:", base64Image.length)

    // 调用通义千问多模态 API（标准 OpenAI 兼容格式）
    console.log("调用 AI API...")
    const res = await axios.post(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      {
        model: "qwen3.5-plus",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `请识别图片里的食材，严格按以下规则返回：
【规则】
1. 判断食材是否用"包装袋/包装盒"封装
2. 包装的：数量=1，单位="包"
3. 散装的：数清楚个数，单位="个"
4. 无法数清个数的散装食材：数量=1，单位="份"
5. 如果只能识别出食材名称但无法确定数量，默认数量=1，单位="个"

【返回格式】
只返回纯 JSON 数组，不要有任何其他文字、说明、markdown 标记！
每个食材对象必须包含 name、quantity、unit 三个字段

正确示例：
[{"name":"鸡蛋","quantity":6,"unit":"个"}]
[{"name":"西红柿","quantity":1,"unit":"个"}]
[{"name":"牛肉","quantity":1,"unit":"包"}]

错误示例（不要这样）：
- "识别结果如下：[...]"
- - "\`\`\`json[...]\`\`\`"
- "好的，这是识别结果：[...]"
- 只返回食材名称如"西红柿"

现在请识别图片中的食材：`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ]
      },
      {
        headers: {
          Authorization: 'Bearer sk-7a65b36beb914cc78a88157a22bc7ebd',
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    )

    console.log("API 响应状态:", res.status)
    console.log("API 响应数据:", JSON.stringify(res.data, null, 2))

    const result = res.data?.choices?.[0]?.message?.content || ""
    console.log("识别结果:", result)

    if (!result) {
      return {
        success: false,
        error: "AI 未能识别出食材"
      }
    }

    return { 
      success: true,
      result 
    }

  } catch (e) {
    console.error("云函数执行出错:", e)
    return {
      success: false,
      error: e.message || "未知错误",
      stack: e.stack
    }
  }
}
