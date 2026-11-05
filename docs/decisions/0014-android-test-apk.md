# ADR 0014：Android 独立测试 APK 与云构建

日期：2026-10-30

状态：EAS 云构建已成功；真机安装和数据恢复待验收

## 背景

Expo Go 和 Android 资源导出都不能证明 LingoNest 可以作为独立应用安装。当前开发电脑没有 Java、Android SDK 或 Gradle，首个安装包需要选择一个能生成原生 APK 的构建流程。独立 App 也无法直接访问 Expo Go 的本地存储。

## 决策

1. 使用 Expo 官方 EAS Build 云端构建 preview APK。它适合个人测试，不代表应用已上架或可公开服务；不为一次测试安装本地 Android 工具链。
2. Android 应用标识固定为 com.ysy6950.lingonest，测试版本 0.5.0 / versionCode 1，使用 LingoNest 书页与新芽图标。后续同一应用更新保持标识并递增内部版本号。
3. 使用 EAS 内部测试分发与云端托管的 Android keystore。不要把 keystore 或密码写进仓库；继续签名同一应用需要保留 EAS 凭据。
4. 手机需访问电脑端私人局域网服务，因此 Android 构建允许明文 HTTP。应用端仍仅允许私有 LAN IPv4；当前配对请求未加密，禁止用于公共网络，公网方案须提供 HTTPS。
5. 仅播放单词音频，不启用麦克风录音或后台播放权限。
6. Expo Go 与独立应用的数据是分开的。先从 Expo Go 备份到电脑，再由独立应用恢复；恢复会整体替换目标数据，不能跳过备份核对。

## 验证

- 移动端 87 项测试、类型检查和 Android bundle 导出通过。
- EAS 构建 7f61dbaa-a3b0-4bba-b00d-b7771e97f7f2 完成，包名 com.ysy6950.lingonest，版本 0.5.0，内部版本 1。
- 真机安装、桌面启动、Expo Go 数据备份与独立应用恢复尚待用户验收，不能以云构建成功代替。

## 后续

根据 5.0c 的真机结果记录设备和 Android 版本、离线冷启动、发音、AI、电脑备份与系统导航回归。若反复构建成为日常流程或需要原生调试，再评估本地 Android 构建。
