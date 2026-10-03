# LingoNest

LingoNest（暂定名）是一款 Android 优先的英语词汇学习应用。它帮助英语基础较弱的用户快速记录单词、用英语或中文理解单词、建立自己的单词组，并通过及时复习逐步巩固记忆。

当前项目处于 **阶段 0：项目规划与技术地图**。仓库目前只包含项目文档，尚未初始化 Expo，也尚未编写业务代码。

## 新对话或新协作者的阅读顺序

1. [PROJECT_CONSTITUTION.md](PROJECT_CONSTITUTION.md)：项目最高层治理原则。
2. [PROJECT_STATUS.md](PROJECT_STATUS.md)：当前已经完成、正在进行和下一步要做的事情。
3. [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md)：从阶段 0 到阶段 5 的路线。
4. [docs/product/MVP.md](docs/product/MVP.md)：第一版产品范围和验收标准。
5. [docs/product/MODULE_MAP.md](docs/product/MODULE_MAP.md)：产品模块地图。
6. [docs/decisions/](docs/decisions/)：已经做出的重要架构和产品决策。
7. [docs/learning/LEARNING_LOG.md](docs/learning/LEARNING_LOG.md)：开发者的学习记录和术语记录。
8. [docs/learning/TROUBLESHOOTING_LOG.md](docs/learning/TROUBLESHOOTING_LOG.md)：问题、排错过程和解决经验。

## 协作约定

- 在改变产品范围、技术栈或架构之前，先阅读项目宪法和当前状态。
- 没有明确要求时，不要直接编写业务代码或初始化新的技术栈。
- 第一次引入专业术语时，用简单语言解释它所在的软件层次。
- 每个阶段都必须有可运行、可验证或可阅读的交付结果。
- 重要决策写入 `docs/decisions/`，进展更新到 `PROJECT_STATUS.md` 和 `PROJECT_ROADMAP.md`。
- AI 可以辅助分析、解释和生成代码，但实际开发者必须理解关键实现。

## 当前结论

第一阶段采用本地优先方案：

```text
添加单词 → 建立单词组 → 查看单词卡 → 复习 → 保存复习记录
```

第一阶段暂不接入 AI 和虚拟角色。

