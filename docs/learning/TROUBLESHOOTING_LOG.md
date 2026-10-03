# LingoNest 问题与排错记录

本文件记录开发过程中遇到的错误、排查过程、解决方案和可复用的经验。问题不是失败记录，而是理解系统边界和工程方法的重要学习材料。

## 记录模板

```text
日期：
现象：
错误信息：
当时的假设：
排查动作：
根本原因：
解决方案：
以后如何更快判断：
关联提交：
```

## 2026-10-03：AsyncStorage 原生模块为空

### 现象

加入本地持久化后，Expo Go 报错：

```text
AsyncStorageError: Native module is null, cannot access legacy storage
```

### 当时的假设

最初怀疑是从 `react-native` 核心包导入了已经移除的旧版 AsyncStorage。

### 排查动作

1. 检查 `App.tsx` 的导入路径。
2. 确认实际安装的依赖版本：

```text
@react-native-async-storage/async-storage@3.1.1
```

3. 运行 `npx expo install --check`，发现 Expo SDK 57 推荐版本是 `2.2.0`。

### 根本原因

导入路径本身正确，但 AsyncStorage `3.1.1` 与当前 Expo SDK 57 的原生模块版本不兼容，导致 JavaScript 接口存在而原生模块为空。

### 解决方案

使用 Expo 的兼容安装命令：

```powershell
npx expo install @react-native-async-storage/async-storage
```

并用 `npx expo start -c` 清理 Metro 缓存后重新加载 Expo Go。

最终版本：`@react-native-async-storage/async-storage@2.2.0`。

### 以后如何更快判断

- Expo 项目安装原生依赖时优先使用 `npx expo install`，不要直接使用普通 `npm install` 追最新版。
- 遇到 Native module 错误时，同时检查导入路径、依赖版本、Expo SDK 兼容性和 Metro 缓存。
- 不要直接运行 `npm audit fix --force` 解决版本问题，它可能引入不兼容的重大升级。

### 关联提交

`cb79675 feat: persist word cards locally`

## 2026-10-03：Git 索引写入权限失败

### 现象

工具执行 `git add` 时出现：

```text
fatal: Unable to create '.git/index.lock': Permission denied
```

### 排查动作

- 检查 `.git/index.lock` 是否残留。
- 检查是否有 Git 进程占用。
- 确认 `.git/index` 没有只读属性。
- 改由 VS Code 终端执行 Git 命令。

### 解决方案

在项目根目录执行：

```powershell
git add mobile/App.tsx
git commit -m "feat: support multiple word cards"
```

### 经验

Git 权限错误不等于代码错误。先检查锁文件和进程，再尝试在本机终端执行，避免误删 `.git` 文件。
