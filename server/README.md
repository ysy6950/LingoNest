# LingoNest 本地后端：3.0c

这个服务默认提供健康检查与一份开发用备份，仅监听 `127.0.0.1`。3.0c 可显式启动**局域网健康检查模式**供手机测试连接；该模式不打开数据库，也不提供备份接口。**只用测试数据**；无账号保护的备份接口不能开放到公网。

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

第一次读取应为 `{"backup":null}`；写入后返回 `revision: 1`。按 `Ctrl+C` 停止服务并重新运行 `npm.cmd run dev`，再次执行读取命令，测试单词仍在。数据库文件位于 `server/data/lingonest.sqlite`，已被 Git 忽略。若之前已写入过测试备份，`expectedRevision: 0` 会返回 HTTP 409；这是防止覆盖的预期行为，更新时应传入当前读取到的版本号。

`GET` 表示读取，`PUT` 表示提交一份备份。Express 接收请求并校验数据，SQLite 把它写到电脑文件中；版本号必须匹配当前记录。`GET /health` 不访问手机数据。3.0d 才在 App 内做手动备份和恢复。

## 3.0c：Android 手机检查电脑连接

电脑和手机连接同一个可信任的 Wi-Fi。电脑在 PowerShell 中运行 `ipconfig`，找到当前 **WLAN 的 IPv4 地址**，例如 `192.168.1.20`。不要填 `127.0.0.1`、路由器地址或公网 IP。

在 `server/` 的 PowerShell 中运行，**把示例 IP 换成电脑实际地址**：

```powershell
$env:LINGONEST_LAN_IP = '192.168.1.20'
$env:PORT = '3001'
npm.cmd run dev
```

终端应显示 `LAN health-only server`。在电脑浏览器先访问 `http://你的电脑IP:3001/health`，应包含 `"mode":"lan-health-only"`；访问同地址的 `/backup` 应返回 404。局域网模式只绑定你指定的私有 IPv4，不开放 `0.0.0.0`。测试后按 `Ctrl+C` 停止服务。

接着在另一个终端从 `mobile/` 启动 Expo，Android Expo Go 打开 App，进入“统计 → 检查电脑连接”，输入 `电脑IP:3001`，点击“检查连接”。不要输入 `localhost`：那在手机上表示手机自身。

若电脑访问成功而手机失败，先确认同一 Wi-Fi、IP/端口、电脑防火墙是否拦截这个程序，以及网络是否启用了设备隔离。不要直接关闭整个防火墙；如系统提示放行，仅考虑可信私人网络和这次开发所需的服务。Expo 的 tunnel 只解决 Expo 开发服务器连接，不会自动转发此 API。Expo Go 的 Android 明文 HTTP 能否访问该局域网地址必须以实机结果为准；若被系统阻止，再评估开发构建的网络配置，不为此修改生产安全设置。
