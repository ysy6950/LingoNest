# LingoNest

LingoNest（暂定名）是一款 Android 优先的英语词汇学习应用，帮助英语基础较弱的用户快速记录单词、写下英语或中文解释、整理分组，并在合适的时间复习。

当前项目正在交付 **3.0 云端数据找回**：四个入口仍负责添加、单词组、复习和统计；统计页可进入可选的云端备份。用户报告本地 2.1 的目标实机测试通过，3.0 真实云端验收尚未完成；项目状态以 [PROJECT_STATUS.md](PROJECT_STATUS.md) 为准。

## 当前核心流程

```text
添加单词 → 选择分组 → 在两列卡片库中搜索/浏览
                         ↓
             左右滑动同组卡片 · 轻点翻面
                         ↓
             到期后进入独立复习会话
                         ↓
               翻面 → 反馈 → 安排下次复习
```

MVP 2.0 的固定间隔是：记住了后 1、3、7、14、30 天逐步延长；再来一次为 10 分钟后；有点模糊为 1 天后并降低阶段。这个规则先追求清楚和可验证，后续再根据真实使用决定是否升级算法。

单词卡详情页把修改、移动、删除收在右上角“管理”中。卡片向左滑看同组下一张、向右滑看上一张；也可以使用卡片下方的箭头。切换后默认显示正面，浏览不会增加复习记录。

## 技术概览

- TypeScript、React Native、Expo SDK 57：Android 移动端。
- Expo Router：四个底部入口、组详情、卡片详情和复习会话的页面路由。
- Zustand：跨页面共享单词、分组和复习进度。
- AsyncStorage 2：本地保存 v2 数据，并迁移旧版 `lingonest.cards` / `lingonest.groups`。
- React Native `FlatList`：单词组中的双列卡片列表。
- React Native `Animated`：卡片翻面过渡。
- Supabase Auth、PostgreSQL：可选邮箱登录与按账号隔离的云端备份；本地功能无需登录。
- Expo SecureStore：在 Android 设备安全存储中保存登录会话。

当前没有 AI、虚拟角色或商城。3.0 的 Supabase 后端需按 [配置说明](docs/cloud/SETUP.md) 由项目拥有者建立并进行双设备验收；未配置时 App 继续本地运行。后续阶段见 [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md)。

## 本地运行

```powershell
cd D:\Project\LingoNest\mobile
npm install
npx expo start
```

用 Android 手机上的 Expo Go 扫描二维码并打开项目。修改代码后可在 Expo Go 重新加载；遇到缓存问题再使用 `npx expo start -c`。

## 验收

请先阅读 [MVP 2.0 测试计划](docs/testing/MVP_TEST_PLAN.md)，不要清除 App 数据。快速顺序是：添加一个词 → 切换四个入口 → 打开分组双列卡片 → 搜索和排序 → 打开卡片详情并翻面、左右滑动 → 从角落“管理”入口修改/移动/删除 → 开始复习并回答 → 查看统计 → 关闭重开验证保存 → 记录 3 分钟实际用时。

自动检查通过不等于手机验收通过。请把每个用例的实际结果写回测试计划；失败时记录设备、Commit、步骤、预期和实际结果。

3.0 的手动备份与恢复范围见 [MVP_3.md](docs/product/MVP_3.md)，真实账号和双设备检查见 [CLOUD_3_TEST_PLAN.md](docs/testing/CLOUD_3_TEST_PLAN.md)。目前工作区中的改动尚未作为 3.0 发布；云端项目配置与实机结果仍待完成。

## 项目文档阅读顺序

1. [PROJECT_CONSTITUTION.md](PROJECT_CONSTITUTION.md)：最高层治理原则。
2. [PROJECT_STATUS.md](PROJECT_STATUS.md)：当前状态、未验收项目和接续规则。
3. [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md)：阶段路线和完成标准。
4. [docs/product/MVP.md](docs/product/MVP.md)：MVP 2.0 产品范围。
5. [docs/testing/MVP_TEST_PLAN.md](docs/testing/MVP_TEST_PLAN.md)：明早可执行的人工验收清单。
6. [docs/decisions/](docs/decisions/)：重要技术和产品决策。
7. [docs/learning/](docs/learning/)：实际遇到的概念与问题。

## 后续方向

阶段 3 先实现 Supabase、PostgreSQL、可选登录和可恢复的手动备份；真正的双设备自动同步另行设计。阶段 4 通过服务端安全调用 AI 生成可检查的解释、例句、关联词和练习；阶段 5 在学习闭环稳定后评估游戏化、角色、商城和 Android 发布展示。
