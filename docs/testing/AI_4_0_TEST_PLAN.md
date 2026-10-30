# 阶段 4.0 AI 服务基础测试计划

## 范围

验证本地后端到 AI 兼容接口的服务基础及手机到本地后端的请求模块。此阶段没有 AI 页面、AI 内容自动保存或真实服务商承诺。测试不会清空手机数据或改动数据库备份。

## 自动检查

在仓库根目录分别执行：

```powershell
cd server
npm.cmd run typecheck
npm.cmd test
cd ..\mobile
npm.cmd run typecheck
npm.cmd test
```

通过条件：服务端和手机端类型检查成功；服务端 AI 测试覆盖未配置、配置不完整、安全地址、成功解析、过大或错误格式响应、上游失败、超时及局域网配对；手机端测试确认请求地址为电脑私网地址，且处理未配置和错误地址。记录准确测试数量与运行日期。

## 无 AI 配置的本地回归

1. 确保 `server/.env` 不存在或三项 AI 设置为空，再启动后端。
2. 确认终端显示 AI configuration 为 `disabled`，`GET /health` 仍返回成功。
3. 确认 `GET /ai/status` 返回 `{"status":"disabled"}`；不带配对码调用 `/ai/word-analysis` 应被拒绝，携带有效配对码应返回 503。
4. 在 Android/Expo Go 验证添加单词、复习以及已有手动备份/读取仍可用。

电脑可用以下 PowerShell 命令读取安全状态（不返回密钥）：

```powershell
$headers = @{ Authorization = 'Bearer 此次启动显示的配对码' }
Invoke-RestMethod 'http://电脑IP:3001/ai/status' -Headers $headers
```

## 真实服务商验收（待用户选定配置）

- 先确认服务商协议兼容性、费用和隐私政策；仅用公开常见测试词，不填个人信息。
- 按 `server/README.md` 配置电脑端 `.env`，重启后端并检查仅显示 `configured`。
- Android 发起请求后确认结果只包含英语解释、中文提示和例句；4.1 的可操作验收步骤见 `AI_4_1_TEST_PLAN.md`。确认手机和仓库中均没有 API Key。
- 验证错误 Key、断网、服务商限流和超时能显示可理解错误；重新检查添加、复习、备份仍工作。
- 记录供应商名称、日期、使用模型、实际结果与异常，但不要记录 Key、完整带密钥请求头或账户敏感信息。

用户已在电脑端配置服务商，但真实请求尚未成功确认；此测试项保持“待验收”。此前 PowerShell 测试返回 `unauthorized` 是配对码输入流程错误，请勿将其误记成服务商错误。已在聊天中暴露的临时配对码应通过重启电脑后端轮换。
