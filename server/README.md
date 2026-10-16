# LingoNest 本地后端：3.0d

这个服务默认提供健康检查与一份开发用备份，仅监听 `127.0.0.1`。指定局域网 IP 后默认只开放健康检查；3.0d 可额外启用需要临时配对码的手机备份模式。它仅供自己的可信私人局域网开发测试，不是公开部署的多用户服务。

## 运行

需要 Node.js 24 或更高版本。在仓库根目录的 PowerShell 中运行：

```powershell
cd server
npm.cmd install
npm.cmd run dev
```

保持终端运行，在同一台电脑的浏览器打开 <http://127.0.0.1:3000/health>，应看到：

```json
{"status":"ok","service":"lingonest-local-server"}
```

`Ctrl+C` 可停止服务。如果 3000 端口已被占用，可在启动前设置当前 PowerShell 会话的 `PORT`：

```powershell
$env:PORT = 3001
npm.cmd run dev
```

随后访问 <http://127.0.0.1:3001/health>。检查代码与接口测试：

```powershell
npm.cmd run typecheck
npm.cmd test
```

PowerShell 在某些 Windows 电脑上会拦截 `npm.ps1`，导致直接输入 `npm` 报执行策略错误。使用 `npm.cmd` 调用同一个 npm 即可，不需要改变系统执行策略。

## 验证备份确实落盘

保持服务运行，在另一个 PowerShell 窗口执行：

```powershell
$baseUrl = 'http://127.0.0.1:3000'
Invoke-RestMethod "$baseUrl/backup" | ConvertTo-Json -Depth 10

$testSnapshot = @{
  version = 2
  cards = @(@{ id = 12; word = 'learn'; meaning = 'to gain knowledge'; groupId = 1; createdAt = 1000 })
  groups = @(@{ id = 1; name = 'Default' })
  reviews = @{ '12' = @{ stage = 0; dueAt = 0; lastReviewedAt = $null; lastResult = $null; reviewCount = 0 } }
  selectedGroupId = 1
}
$body = @{ snapshot = $testSnapshot; expectedRevision = 0 } | ConvertTo-Json -Depth 10
Invoke-RestMethod "$baseUrl/backup" -Method Put -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 10
```

第一次读取应包含 `"backup":null` 和数据库标识 `serverId`；写入后返回 `revision: 1`。按 `Ctrl+C` 停止服务并重新运行 `npm.cmd run dev`，再次执行读取命令，测试单词仍在。数据库文件位于 `server/data/lingonest.sqlite`，已被 Git 忽略。若之前已写入过测试备份，`expectedRevision: 0` 会返回 HTTP 409；这是防止覆盖的预期行为，更新时应传入当前读取到的版本号。

`GET` 表示读取，`PUT` 表示提交一份备份。Express 接收请求并校验数据，SQLite 把它写到电脑文件中；版本号必须匹配当前记录。`GET /health` 不访问手机数据。电脑本机旧测试接口保留；手机使用下面需要配对的局域网模式。

## 3.0c：Android 手机检查电脑连接

电脑和手机连接同一个可信任的 Wi-Fi。电脑在 PowerShell 中运行 `ipconfig`，找到当前 **WLAN 的 IPv4 地址**，例如 `192.168.1.20`。不要填 `127.0.0.1`、路由器地址或公网 IP。

在 `server/` 的 PowerShell 中运行，**把示例 IP 换成电脑实际地址**：

```powershell
$env:LINGONEST_LAN_IP = '192.168.1.20'
$env:LINGONEST_LAN_BACKUP = '0'
$env:PORT = '3001'
npm.cmd run dev
```

终端应显示 `LAN health-only server`。在电脑浏览器先访问 `http://你的电脑IP:3001/health`，应包含 `"mode":"lan-health-only"`；访问同地址的 `/backup` 应返回 404。局域网模式只绑定你指定的私有 IPv4，不开放 `0.0.0.0`。测试后按 `Ctrl+C` 停止服务。

接着在另一个终端从 `mobile/` 启动 Expo，Android Expo Go 打开 App，进入“统计 → 检查电脑连接”，输入 `电脑IP:3001`，点击“检查连接”。不要输入 `localhost`：那在手机上表示手机自身。

若电脑访问成功而手机失败，先确认同一 Wi-Fi、IP/端口、电脑防火墙是否拦截这个程序，以及网络是否启用了设备隔离。不要直接关闭整个防火墙；如系统提示放行，仅考虑可信私人网络和这次开发所需的服务。Expo 的 tunnel 只解决 Expo 开发服务器连接，不会自动转发此 API。Expo Go 的 Android 明文 HTTP 能否访问该局域网地址必须以实机结果为准；若被系统阻止，再评估开发构建的网络配置，不为此修改生产安全设置。

## 3.0d：手机手动备份与恢复

先在旧后端终端按 `Ctrl+C`。在 `D:\Project\LingoNest\server` 的 PowerShell 中运行（替换实际 IP）：

```powershell
$env:LINGONEST_LAN_IP = '192.168.1.20'
$env:LINGONEST_LAN_BACKUP = '1'
$env:PORT = '3001'
npm.cmd start
```

使用 `start` 避免文件修改导致自动重启。终端会显示 `LAN backup server` 和一行 `Temporary pairing code`，其后是本次运行随机生成的 32 位配对码。它属于临时访问凭证，不要提交、截图分享或发到聊天记录中。停止服务再启动时，配对码会变，但 SQLite 里的备份和数据库标识保持不变。

手机重新加载 App → **统计 → 电脑备份与恢复**：

1. 输入 `电脑IP:3001`，粘贴完整配对码，点击“读取电脑备份”。先读取不会上传或修改手机单词。
2. 核对两边数量、电脑版本和时间，选择“备份手机数据到电脑”，再确认。电脑仅保留一份当前备份；确认覆盖后，不保留旧电脑版本。3.0b 的测试快照也会显示，不能把它误认为手机备份。
3. “从电脑恢复到手机”会替换整份手机数据，不合并；恢复前先保存手机原数据。确认后可“撤销上次恢复”，撤销无需连接电脑。恢复副本在当前 App 的本地存储，清除数据或卸载 App 会删除它。
4. 关闭重开 App 后单词、分组、复习进度和恢复副本仍应存在。IP 和配对码只在该页面临时使用，退出后需要重新填写；不会自动传输。

备份内容是 v2 快照（单词、分组、复习状态及所选分组），不包含临时卡片翻面或当前复习会话。SQLite 文件仍在 `server/data/lingonest.sqlite`，没有新增数据库或邮件账号。相同电脑服务只供自己的测试设备使用，尚无用户数据隔离。

| 情况 | 处理 |
|---|---|
| 401 / 配对码过期 | 从当前运行的终端重新复制；错误配对码不能读写备份 |
| 404 / 仅开放连接检查 | 确认 `LINGONEST_LAN_BACKUP=1` 并重启服务 |
| 409 / 版本冲突 | 重新读取并检查；不自动重试覆盖，也不自动合并 |
| 保存后断网，没有确认响应 | 电脑可能已保存；重新读取电脑版本后再决定是否重试 |
| 手机存储写入失败 | 原数据不清除；检查空间后重试，不卸载 App 来排错 |

配对检查用于限制读写权限，HTTP 本身仍未加密。只在可信私人网络用测试数据，不进行公网端口转发。正式发布需要重新设计 HTTPS、账号与权限。完整验收见 [LOCAL_3D_TEST_PLAN.md](../docs/testing/LOCAL_3D_TEST_PLAN.md)。

返回默认电脑本机模式时，先停止服务，在同一 PowerShell 中清除本次变量后再启动：

```powershell
Remove-Item Env:LINGONEST_LAN_IP -ErrorAction SilentlyContinue
Remove-Item Env:LINGONEST_LAN_BACKUP -ErrorAction SilentlyContinue
Remove-Item Env:PORT -ErrorAction SilentlyContinue
npm.cmd start
```
