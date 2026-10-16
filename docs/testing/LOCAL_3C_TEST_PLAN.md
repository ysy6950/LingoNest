# 3.0c Android 局域网连接验收

状态：服务端与 App 自动测试通过；Android 实机待用户验证。3.0c 不备份手机单词。

2026-10-17：两端类型检查、服务端 5 项测试、App 22 项测试、Android bundle 导出通过；电脑局域网请求返回 `lan-health-only`，同地址 `/backup` 返回 404。以上不代表 Android 实机已通过。

测试前记录日期、`git rev-parse --short HEAD`、手机型号与 Android 版本。电脑与手机在同一可信 Wi-Fi，按 [`server/README.md`](../../server/README.md) 启动局域网健康检查模式。

| 编号 | 操作 | 预期 | 结果 |
|---|---|---|---|
| LC-01 | 电脑用实际 WLAN IP 访问 `/health` | 返回 `status: ok` 和 `mode: lan-health-only` | 待填写 |
| LC-02 | 同一 IP 访问 `/backup` | 404，不暴露无账号备份接口 | 待填写 |
| LC-03 | Android Expo Go：统计 → 检查电脑连接，输入电脑 IP 和端口 | 显示连接成功；手机单词不改变 | 待填写 |
| LC-04 | 输错 IP、端口或停止服务后重试 | 显示错误或超时；本地添加、复习仍可用 | 待填写 |
| LC-05 | 切走再返回、关闭重开 App | 不自动连接或上传单词；本地学习记录仍在 | 待填写 |

若失败，记录所用 IP/端口、电脑网络类型、手机网络、服务端日志、App 提示及复现步骤。不要把“电脑能访问”写成“手机已通过”。
