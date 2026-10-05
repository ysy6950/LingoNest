# LingoNest

LingoNest（暂定名）是一款 Android 优先的英语词汇学习应用，帮助英语基础较弱的用户快速记录单词、写下英语或中文解释、整理分组，并在合适的时间复习。

当前项目正在交付 **本地 MVP 2.0**：四个入口分别负责添加、单词组、复习和统计。数据先保存在手机本地，Android/Expo Go 人工验收尚未完成；项目状态以 [PROJECT_STATUS.md](PROJECT_STATUS.md) 为准。

## 当前核心流程

```text
添加单词 → 选择分组 → 在两列卡片库中搜索/浏览
                         ↓
             到期后进入独立复习会话
                         ↓
               翻面 → 反馈 → 安排下次复习
```

MVP 2.0 的固定间隔是：记住了后 1、3、7、14、30 天逐步延长；再来一次为 10 分钟后；有点模糊为 1 天后并降低阶段。这个规则先追求清楚和可验证，后续再根据真实使用决定是否升级算法。

## 技术概览

- TypeScript、React Native、Expo SDK 57：Android 移动端。
- Expo Router：四个底部入口、组详情、卡片详情和复习会话的页面路由。
- Zustand：跨页面共享单词、分组和复习进度。
- AsyncStorage 2：本地保存 v2 数据，并迁移旧版 `lingonest.cards` / `lingonest.groups`。
- React Native `FlatList`：单词组中的双列卡片列表。
- React Native `Animated`：卡片翻面过渡。

当前没有 Supabase、登录、AI、虚拟角色或商城。后续阶段见 [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md)。

## 本地运行

```powershell
cd D:\Project\LingoNest\mobile
npm install
npx expo start
```

用 Android 手机上的 Expo Go 扫描二维码并打开项目。修改代码后可在 Expo Go 重新加载；遇到缓存问题再使用 `npx expo start -c`。

## 明早验收

请先阅读 [MVP 2.0 测试计划](docs/testing/MVP_TEST_PLAN.md)，不要清除 App 数据。快速顺序是：添加一个词 → 切换四个入口 → 打开分组双列卡片 → 搜索和排序 → 打开卡片详情并翻面 → 修改/移动/删除 → 开始复习并回答 → 查看统计 → 关闭重开验证保存 → 记录 3 分钟实际用时。

自动检查通过不等于手机验收通过。请把每个用例的实际结果写回测试计划；失败时记录设备、Commit、步骤、预期和实际结果。

## 项目文档阅读顺序

1. [PROJECT_CONSTITUTION.md](PROJECT_CONSTITUTION.md)：最高层治理原则。
2. [PROJECT_STATUS.md](PROJECT_STATUS.md)：当前状态、未验收项目和接续规则。
3. [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md)：阶段路线和完成标准。
4. [docs/product/MVP.md](docs/product/MVP.md)：MVP 2.0 产品范围。
5. [docs/testing/MVP_TEST_PLAN.md](docs/testing/MVP_TEST_PLAN.md)：明早可执行的人工验收清单。
6. [docs/decisions/](docs/decisions/)：重要技术和产品决策。
7. [docs/learning/](docs/learning/)：实际遇到的概念与问题。

## 后续方向

阶段 3 评估 Supabase、PostgreSQL、登录和云端同步；阶段 4 通过服务端安全调用 AI 生成可检查的解释、例句、关联词和练习；阶段 5 在学习闭环稳定后评估游戏化、角色、商城和 Android 发布展示。
