# LingoNest 本地后端：3.0b

这个服务目前提供健康检查与一份开发用备份，尚未连接手机。它默认仅监听 `127.0.0.1`，因此只能从运行它的电脑访问。**只用测试数据**；无账号保护的接口不能开放到公网。

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

`GET` 表示读取，`PUT` 表示提交一份备份。Express 接收请求并校验数据，SQLite 把它写到电脑文件中；版本号必须匹配当前记录。`GET /health` 不访问手机数据。3.0c 才验证手机连接，3.0d 才在 App 内做手动备份和恢复。
