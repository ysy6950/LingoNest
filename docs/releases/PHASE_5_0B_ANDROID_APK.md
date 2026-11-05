# 5.0b · Android 独立安装包

状态：2026-10-30 云构建成功；真机安装、首次启动与旧数据恢复待验收。

## 本次选择

- Android 应用标识：`com.ysy6950.lingonest`。这是手机识别独立 App 的固定名称；后续同一应用更新应保持不变。
- 测试版本：`0.5.0`，Android 内部版本号 `1`。这是测试版，不表示已经公开发布。后续更新安装包时增加内部版本号。
- 图标：生成 LingoNest 书页与新芽图标，应用图标和 Android 自适应图标统一。
- 构建方式：Expo EAS Build 的 `preview` 档位，生成可直接安装的 APK；需要 Expo 账号。APK 内包含运行所需代码，无需 Expo Go 或开发服务器。
- 仅播放发音，关闭音频插件默认的录音权限。
- 电脑后端目前只接受可信私人局域网内的 HTTP；独立包需要允许 Android 明文网络访问。配对请求未加密，不能用在公共或不可信网络，后续公开部署应改为 HTTPS。手机端地址校验仍只接受私有局域网 IPv4。

配置位于 `mobile/app.json`、`mobile/eas.json`；依赖 `expo-build-properties` 由 Expo 官方插件设置 Android 网络选项。当前没有引入本地 Android SDK 和 Gradle，因为云构建能先验证独立安装；未来需要完全离线构建或深度原生定制时再评估本地构建。

## 构建与安装

在仓库根目录打开 PowerShell：

```powershell
cd mobile
npx.cmd eas-cli build --platform android --profile preview
```

如果尚未登录，先运行 `npx.cmd eas-cli login`，由本人在 Expo 官方页面完成。已构建的 APK：

- [直接下载 Android APK](https://expo.dev/artifacts/eas/-X6vUDa6k00B45fzyjroL25RU3Im4RSX7_n5AWeH6i8.apk)
- [查看 Expo 构建记录](https://expo.dev/accounts/lenxifan11/projects/lingonest/builds/7f61dbaa-a3b0-4bba-b00d-b7771e97f7f2)

构建编号：`7f61dbaa-a3b0-4bba-b00d-b7771e97f7f2`；Expo 标记状态为 `FINISHED`。当前 APK 下载期限至 **2026-11-13**。用 Android 手机打开直接下载链接下载、安装；Android 若提示允许从浏览器安装，仅对这份自己构建的测试包操作。安装完成后，从桌面图标启动 LingoNest，确认不需要 Expo Go。

## 先保护现有单词

Expo Go 和独立 LingoNest 使用不同的应用存储空间，独立包不会自动读到 Expo Go 中的单词。**不要卸载 Expo Go、清除其数据，也不要先覆盖电脑上的唯一备份。**

1. 在现有 Expo Go 版中打开“电脑备份”，连接当前电脑后端。
2. 核对手机单词数、电脑已有备份和覆盖提示，再把手机数据备份到电脑。电脑目前只保留最新一份完整备份。
3. 安装独立 APK。新安装版可能先显示一次演示词，这是独立存储的初始内容，不代表旧词丢失。
4. 在独立版连接同一电脑，先核对备份数量和时间，再选择“从电脑恢复到手机”。恢复会整体替换独立版的现有单词与复习进度。
5. 核对旧单词、分组、复习记录；在确认成功前保留 Expo Go。

## 验收记录

| 检查项 | 结果 |
|---|---|
| APK 构建成功，记录 EAS 构建链接与包版本 | 通过；0.5.0 (1)，EAS `7f61dbaa-a3b0-4bba-b00d-b7771e97f7f2`，2026-10-30 |
| Android 真机安装、从桌面启动且无需 Expo Go | 待填 |
| Expo Go 数据已先备份，独立版恢复后数量和内容一致 | 待填 |
| 设备型号与 Android 版本 | 待填 |

后端停止、离线冷启动、发音、AI 与系统导航的完整回归属于 5.0c，不能仅凭 APK 构建成功宣称通过。
