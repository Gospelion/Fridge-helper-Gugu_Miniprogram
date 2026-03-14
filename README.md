# 🧊 冰箱咕（Fridge Helper Gugu）

[![WeChat Mini Program](https://img.shields.io/badge/WeChat-MiniProgram-green)](https://developers.weixin.qq.com/miniprogram/dev/)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

> 一款微信小程序，帮助用户管理冰箱库存，统计食材、推荐菜品，并支持 AI 食材识别。

---

## 目录
- [项目概览](#项目概览)
- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [使用说明](#使用说明)
- [未来改进](#未来改进)
- [致谢](#致谢)
- [License](#license)

---

## 项目概览
“冰箱助手”是一款帮助用户管理家庭冰箱食材的小程序。  
用户可以记录冰箱内食材及数量、自动统计食材种类、上传食物照片进行 AI 识别，并获取智能推荐的菜谱或食材组合建议。

---

## 功能特性
- **食材管理**  
  - 添加、删除、修改冰箱中的食材  
  - 支持多种单位：个、kg、包、g、斤  
  - Dashboard 显示食材统计（件数和种类）
- **AI 食材识别**  
  - 上传食物图片，返回识别结果（如“西红柿”）  
  - 支持多种常见食材
- **智能推荐**  
  - 根据冰箱现有食材，推荐可做菜品或组合  
  - 可根据人数和预算提供个性化建议
- **数据可视化**  
  - Dashboard 展示冰箱库存状态和食材分布  
  - 支持按单位或类别统计

---

## 技术栈
- **前端**：微信小程序原生框架（WXML, WXSS, JS）  
- **后端**：微信云开发（Cloud Functions）  
- **AI服务**：图像识别云函数（需配置 API Key）  
- **数据库**：微信云数据库（存储食材、用户操作、推荐数据）  

---

## 项目结构
```text
fridge-assistant/
│-- app.js
│-- app.json
│-- pages/
│   ├─ index/
│   ├─ dashboard/
│   └─ about/
│-- utils/
│   └─ storage.js
│-- cloudfunctions/
│   └─ addFood/
├─ README.md
```
---

## 使用说明

### 1️⃣ 导入项目
- 打开 **微信开发者工具**  
- 选择「导入项目」并定位到项目目录  

### 2️⃣ 配置云开发环境
- 启用 **云数据库**  
- 上传 **cloudfunctions** 文件夹内容到云函数  

### 3️⃣ 设置 AI 服务 API Key
- 在 `cloudfunctions/addFood` 文件中配置 API Key  
- 确保云函数可正确调用 AI 服务  

### 4️⃣ 运行小程序
- 在开发者工具中点击「编译」并预览  
- 测试地图、筛选器和 AI 推荐功能  

---

## 未来改进
- 增加更多大学和餐厅数据  
- 支持多用户推荐和收藏功能  
- 优化 AI 推荐算法，支持更多个性化参数  
- 提供历史决策记录和用户评分  

---

## 致谢
- 感谢 [微信小程序官方文档](https://developers.weixin.qq.com/miniprogram/dev/) 提供的开发框架  
- 感谢开源社区提供的图像识别和地图示例  
- 感谢所有参与测试和反馈的同学  

---

## License
- 本项目使用 **MIT License**  
- 版权所有 © 2026  
- 更多信息请查看 [LICENSE](LICENSE) 文件
