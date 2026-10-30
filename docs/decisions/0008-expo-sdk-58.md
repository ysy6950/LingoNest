# ADR 0008：移动端升级到 Expo SDK 58

日期：2026-10-26

状态：已实施，待 Android 实机验收

## 背景

手机已安装支持 SDK 58 的 Expo Go，项目使用 SDK 57，Expo Go 在加载应用前提示版本不兼容。手机本地保存单词与复习记录，卸载 Expo Go 来安装旧版可能造成数据丢失。

## 决定

将 `mobile/` 的 Expo、Expo Router、React Native、React、相关 Expo 原生模块及类型依赖升级为 SDK 58 推荐版本。保持现有本地数据键、v3 快照格式、后端协议和业务功能不变。以后升级 SDK 时先检查现有 Expo Go、依赖兼容和本地数据，再做实机回归。

## 取舍与验证

使用旧版 Expo Go 可以少改项目，但可能需要替换现有安装并影响手机本地数据；开发构建需要额外的 Android 构建流程。当前选择升级项目以继续使用用户已安装的 Expo Go。SDK 58 引入新的 React Native 和 Router 版本，自动检查不能证明手机交互无回归。

已通过 Expo Doctor、类型检查、41 项移动端测试、Android/Web 导出、锁文件干运行、网页发音页迁移及布局回归。仍需在原手机上确认 Expo Go 启动、旧单词与复习记录、页面导航、词典音频和设备朗读。

参考：[Expo 官方升级步骤](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)与 [SDK 58 发布说明](https://expo.dev/changelog/sdk-58)。
