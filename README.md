# 冰箱咕（Fridge Helper Gugu）

冰箱咕是一款原生微信小程序，帮助家庭记录冰箱库存、发现临期食材，并根据现有食材推荐菜谱。它支持拍照识别食材、烹饪日记和本地优先的云端同步。

## 已实现功能

- 库存：添加、编辑、删除、搜索和分类筛选食材，支持多批次和保质期。
- 看板：总批次、食材种类、临期/过期统计和分类分布图。
- 提醒：打开小程序时，每日最多提醒一次即将到期或已经过期的库存。
- 推荐：按库存名称和数量匹配菜谱，展示缺少食材，支持人数、最高难度、收藏优先和候选轮换。
- AI 识别：拍照后由通义千问视觉模型提取食材；用户确认、修改后才写入库存。
- 烹饪日记：选择菜谱或自定义菜名，可保存照片，并按菜谱用量扣减库存。
- 单位换算：菜谱扣减支持 `g`、`kg`、`斤`之间的重量换算，并优先消耗最早过期批次。
- 家庭共享：一个用户可加入多个冰箱，通过微信分享邀请成员共同维护库存和日记。
- 数据同步：本地优先，离线操作联网后按记录同步；同一记录的并发修改由用户选择保留版本。

## 项目结构

```text
.
├─ pages/
│  ├─ index/                 # 库存、看板和推荐
│  ├─ add/                   # 手动添加和 AI 识别确认
│  ├─ diary/                 # 烹饪日记
│  ├─ fridge-manage/         # 冰箱切换、邀请和成员管理
│  └─ fridge-invite/         # 微信邀请确认
├─ utils/
│  ├─ domain.js              # 推荐、识别解析、单位换算
│  └─ storage.js             # 多冰箱缓存、离线队列和共享同步
├─ cloudfunctions/
│  ├─ recognizeFood/         # AI 图片识别
│  ├─ contentSecurity/       # 菜名与照片内容安全检测
│  ├─ fridgeAccess/          # 冰箱、邀请、成员和权限
│  └─ fridgeSync/            # 事务化记录同步和冲突检测
├─ config/cloud.js           # 微信云环境 ID
├─ tests/                    # Node.js 领域测试
├─ PRIVACY.md
└─ LICENSE
```

## 部署

1. 使用微信开发者工具导入仓库。
2. 在 `config/cloud.js` 中填写目标微信云环境 ID。
3. 创建 `user_profiles`、`fridges`、`fridge_members`、`fridge_items`、`fridge_diaries`、`fridge_invites` 和 `fridge_operations` 集合，并设置为仅管理端可读写。
4. 上传并部署 `fridgeAccess`、`fridgeSync`、`recognizeFood` 和 `contentSecurity`，选择“云端安装依赖”。
5. 在 `recognizeFood` 云函数配置中添加环境变量 `DASHSCOPE_API_KEY`。
6. 确认小程序已具备调用微信内容安全接口的权限，然后验证正常图片可以发布、风险内容会被阻止。
7. 为 `fridge_members` 建立 `(openid, status)`、`(fridgeId, status)` 索引，为 `fridge_items` 和 `fridge_diaries` 建立 `(fridgeId, deleted)` 索引，为 `fridge_operations` 建立 `fridgeId` 索引。
8. 使用两个微信账号验证分享邀请、离线修改、冲突处理、所有权转让和共享日记照片。

完整步骤见 [shared-fridge-qa.md](shared-fridge-qa.md)。

## 数据策略

应用离线时继续使用 `wx.setStorageSync`，并为当前冰箱记录独立操作队列。联网后，云函数按成员权限提交操作；每次写入在事务中同时校验记录版本、递增冰箱 revision 并保存幂等操作日志。同一记录发生并发冲突时不会静默覆盖。

AI 图片仅为识别临时上传，调用结束后会请求删除。更完整的数据处理说明见 [PRIVACY.md](PRIVACY.md)。正式发布前还应补充用户可操作的云端数据删除入口。

## 测试

```powershell
node tests\domain.test.js
node tests\storage.test.js
```

测试覆盖筛选、推荐、识别结果解析、数据迁移、单位换算、最早过期批次扣减、共享 bootstrap、离线操作队列和版本冲突。微信 API、云函数和真机交互仍需在微信开发者工具中验证。

## 尚未实现

- 后台定时推送式到期通知；当前提醒只在用户打开小程序时触发。
- 菜谱价格数据库，因此暂不支持可靠的预算筛选。
- 用户主动清除全部云端数据/注销入口。

## License

[MIT](LICENSE)
