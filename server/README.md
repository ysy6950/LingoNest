# LingoNest 本地后端：3.0a

这个服务目前只有一个健康检查接口，不连接手机，也不读写单词。它默认仅监听 `127.0.0.1`，因此只能从运行它的电脑访问。

## 运行

需要 Node.js 24 或更高版本。在仓库根目录的 PowerShell 中运行：

```powershell
cd server
npm install
npm run dev
```

保持终端运行，在同一台电脑的浏览器打开 <http://127.0.0.1:3000/health>，应看到：

```json
{"status":"ok","service":"lingonest-local-server"}
```

`Ctrl+C` 可停止服务。如果 3000 端口已被占用，可在启动前设置当前 PowerShell 会话的 `PORT`：

```powershell
$env:PORT = 3001
npm run dev
```

随后访问 <http://127.0.0.1:3001/health>。检查代码与接口测试：

```powershell
npm run typecheck
npm test
```

`GET /health` 中，`GET` 表示读取，`/health` 是请求的路径。Express 收到请求后运行对应函数，再把 JSON 响应发回浏览器。这里没有数据库、账号或邮件服务；3.0b 才加入 SQLite，3.0c 才验证手机连接。
