# 5.1a：局域网 HTTPS 与数据归属验收

状态：2026-11-03 电脑端握手、Android 原生配置和 0.5.2 APK 构建已完成；真机连接和旧数据保留待验证。Android versionCode 3。

[安装 0.5.2 APK](https://expo.dev/artifacts/eas/hon0H2W-MOOjzuem4qv9T8D0PPe-8_PjQAzhcpGF9E4.apk) · [EAS 构建记录](https://expo.dev/accounts/lenxifan11/projects/lingonest/builds/1d660abb-6921-47f8-ba76-478599b06266)。构建状态 FINISHED，2026-11-03；构建记录显示下载到期时间为 2026-11-17。旧 0.5.0/0.5.1 APK 不能验证本轮 HTTPS。

## 电脑准备

1. 保留旧 App 和现有电脑备份。若手机只有这一份学习资料，先按原有方法备份并核对电脑备份时间，不卸载 App。
2. 在 `D:\Project\LingoNest\server` 的 PowerShell 运行 `ipconfig`，找到电脑 WLAN 的私有 IPv4。运行 `npm.cmd run tls:generate -- <电脑IP>`。首次运行会生成电脑私钥和公开 CA；后续 IP 改变时使用同一 CA 重新签发服务证书。不要把 `server/data/tls/`、`.env` 或配对码上传 GitHub。
3. 停掉旧电脑后端，再在同一 PowerShell 设置 `$env:LINGONEST_LAN_IP = '<电脑IP>'`、`$env:LINGONEST_LAN_BACKUP = '1'`、`$env:LINGONEST_LAN_TLS = '1'`、`$env:PORT = '3001'`，运行 `npm.cmd start`。应显示 `https://<电脑IP>:3001/health`，并为本次运行生成新的临时配对码。
4. 如果证书显示 IP 不匹配，重新运行第 2 步并重启服务。电脑 IP 变动无需变更 App 内公开 CA，但丢失 CA 私钥需要重新构建 APK。

## Android 回归

在**升级安装**测试 APK 后进行。应用标识保持 `com.ysy6950.lingonest`，不要卸载旧 App 或清除数据。Expo Go 不含此 APK 的自定义证书配置，不用它判断 HTTPS 是否通过。

- 设置 → 电脑地址输入 `https://<电脑IP>:3001`，输入当前电脑终端临时配对码，点击连接。统计 → 检查电脑连接应成功；进入备份页能读取原有电脑备份，但不要为验证而确认覆盖。
- 检查原手机单词、分组、AI 笔记和复习进度仍在；重启 App 后再次检查。旧配对码在 App 重启后按现有规则需要重新输入。
- 断开电脑或输错地址时，电脑功能显示失败；原有单词查看、添加、复习及本地保存继续可用。
- 新 APK 输入 `http://<电脑IP>:3001` 应被拒绝为无效地址，不能发送密码或学习资料到明文端点。
- 电脑保存的旧 SQLite 备份数量和版本不应因证书生成、健康检查或安装 APK 改变；当前没有任何账号认领动作。

记录设备型号、Android 版本、安装包版本、电脑地址是否含 HTTPS、成功与失败步骤。若新包无法连接，保留 App 数据，先核对电脑 IP、服务启动地址和证书；不要卸载降级。

## 已完成的自动与电脑端检查

- 使用项目公开 CA 请求 `https://192.168.5.52:3002/health` 得到服务响应；不提供 CA 时被拒绝；把访问目标改成未写入证书的 `192.168.5.53` 时主机名校验失败。Windows `curl` 的本地 CA 无吊销服务，验证时仅对该次检查加 `--ssl-no-revoke`，没有跳过证书链与主机名校验。
- Expo `prebuild` 生成的 AndroidManifest 引用了 `@xml/lingonest_network_security`；资源包含项目公开 CA，`cleartextTrafficPermitted="false"`。
- 2026-11-03：移动端 93 项、后端 44 项测试、两端类型检查及 Android 资源导出通过。新增测试验证旧 `http://` 地址读取时转为 HTTPS，但原存储键仍保留以便回退。隔离测试数据库上的 HTTPS 备份路由在无配对时返回 401。0.5.2 APK 已由 EAS 成功构建；实际手机 HTTPS 握手不能由这些检查替代。
- 2026-11-03：用户报告 5.1a 手机测试通过，进入 5.1b；设备型号、Android 系统版本和逐项数值未提供，不补造。
