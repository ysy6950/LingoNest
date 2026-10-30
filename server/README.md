# LingoNest 本地后端：3.0d 与 4.0 AI 基础

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

启动后不要再次运行第二个服务。如果看到 `Port 3001 is already in use`，说明旧服务还占着端口，应回到旧服务终端按 `Ctrl+C`，再重新执行上面的启动命令。手机只有在电脑的 `/health` 返回 `"mode":"lan-backup"` 时才能读取备份；`lan-health-only` 只支持连接检查。

手机重新加载 App → **统计 → 电脑备份与恢复**：

1. 输入 `电脑IP:3001`，粘贴完整配对码，点击“读取电脑备份”。先读取不会上传或修改手机单词。
2. 核对两边数量、电脑版本和时间，选择“备份手机数据到电脑”，再确认。电脑仅保留一份当前备份；确认覆盖后，不保留旧电脑版本。3.0b 的测试快照也会显示，不能把它误认为手机备份。
3. “从电脑恢复到手机”会替换整份手机数据，不合并；恢复前先保存手机原数据。确认后可“撤销上次恢复”，撤销无需连接电脑。恢复副本在当前 App 的本地存储，清除数据或卸载 App 会删除它。
4. 关闭重开 App 后单词、分组、复习进度和恢复副本仍应存在。成功配对后，AI、词典与备份共用当前 App 会话的连接；地址单独保存在手机，配对码只留在运行内存。切换页面无需重输；完全结束并重新启动 App、或电脑服务重启后，需要重新输入新的配对码。不会自动传输。

新版备份内容是 v3 快照（单词、可选词典音标、AI 笔记、分组、复习状态及所选分组），不包含临时卡片翻面或当前复习会话。旧 v2 备份仍可读。SQLite 文件仍在 `server/data/lingonest.sqlite`，没有新增数据库或邮件账号。相同电脑服务只供自己的测试设备使用，尚无用户数据隔离。

| 情况 | 处理 |
|---|---|
| 401 / 配对码过期 | 从当前运行的终端重新复制；错误配对码不能读写备份 |
| 404 / 仅开放连接检查 | 确认 `LINGONEST_LAN_BACKUP=1` 并重启服务 |
| 409 / 版本冲突 | 重新读取并检查；不自动重试覆盖，也不自动合并 |
| 保存后断网，没有确认响应 | 电脑可能已保存；重新读取电脑版本后再决定是否重试 |
| 手机存储写入失败 | 原数据不清除；检查空间后重试，不卸载 App 来排错 |

配对检查用于限制读写权限，HTTP 本身仍未加密。只在可信私人网络用测试数据，不进行公网端口转发。正式发布需要重新设计 HTTPS、账号与权限。完整验收见 [LOCAL_3D_TEST_PLAN.md](../docs/testing/LOCAL_3D_TEST_PLAN.md)。

## 4.0 AI 服务端基础（可选）

手机不会连接 AI 服务商。请求路径为：

```text
Android App → 电脑本地后端（配对码）→ AI 服务商
```

电脑后端读取 API Key，手机只收到英语解释、中文提示和三条不同情境的例句。发送分析请求时，单词和用户填写的解释会交给你配置的 AI 服务商处理；不要发送个人隐私或密码。电脑后端并非公网服务，局域网 HTTP 只供可信 Wi-Fi 开发测试。

4.0 只建立服务端和手机请求模块；4.1 已在单词详情页加入可编辑预览和确认保存入口。没有 AI 配置时服务照常启动，添加、复习和备份不受影响。

先选定一个支持 OpenAI-compatible Chat Completions 的服务商，并从该服务商账号后台获取 API Key、接口地址与模型名。本项目不会替你创建服务商账户，也不会自动产生 Key。不要把 Key 发到聊天、截图、手机端配置或 GitHub。

复制 `server/.env.example` 为 `server/.env`，只在电脑本地填写：

```text
LINGONEST_AI_BASE_URL=https://服务商提供的OpenAI兼容Base-URL/v1
LINGONEST_AI_API_KEY=服务商后台生成的密钥
LINGONEST_AI_MODEL=服务商提供的模型标识
```

PowerShell 复制命令（在仓库根目录）：

```powershell
Copy-Item server/.env.example server/.env
```

修改 `server/.env` 后重启电脑后端。服务启动行会显示 `AI configuration: disabled`、`misconfigured` 或 `configured`。`configured` 仅表示三个配置项完整且地址使用 HTTPS，不证明 Key 有效、账户有额度或真实模型可用。服务状态接口 `GET /ai/status` 不暴露 Key。

`LINGONEST_AI_BASE_URL` 可填服务商给出的 Base URL（通常以 `/v1` 结尾），后端会补上 `/chat/completions`；也可填完整的 `/v1/chat/completions` 地址。不要把 API Key 拼进 URL。若手机提示 AI 失败，先看电脑终端的 `[AI] request failed: ...` 分类；日志只显示错误类别和服务商 HTTP 状态，不显示 Key、请求内容或服务商原始响应。修改配置或代码后必须停止旧的 `npm.cmd start` 进程并重启；`/health` 可达不代表 AI 请求成功。

电脑服务需使用 3.0d 配对备份模式并保持运行，手机通过 `POST /ai/word-analysis` 提交单词和可选解释。测试计划见 [AI_4_0_TEST_PLAN.md](../docs/testing/AI_4_0_TEST_PLAN.md) 及 [4.1 手机验收](../docs/testing/AI_4_1_TEST_PLAN.md)。接口按兼容协议请求 JSON 格式结果，要求 `definition`、`chineseHint`、`examples`（恰好三句）；服务端校验字段、限制长度、设定 90 秒超时，手机等待上限为 120 秒，并对服务商错误做脱敏。提示词要求三句围绕用户当前词义，但程序无法保证语义完全正确或情境确实不同；必须人工检查。手机可以删减并保存 1～3 句。旧版单例句笔记和备份可被新版读取；新版三例句备份不能保证被旧版 App 读取，不要在旧版 App 上恢复新版备份。

如果尚未选服务商或填写 Key，**不要为了完成离线测试而猜测配置**。先运行两端自动化测试；等服务商确定后，再使用非隐私测试词做真实联调并核对费用与隐私政策。

返回默认电脑本机模式时，先停止服务，在同一 PowerShell 中清除本次变量后再启动：

```powershell
Remove-Item Env:LINGONEST_LAN_IP -ErrorAction SilentlyContinue
Remove-Item Env:LINGONEST_LAN_BACKUP -ErrorAction SilentlyContinue
Remove-Item Env:PORT -ErrorAction SilentlyContinue
npm.cmd start
```

## 4.2 词典音标与设备朗读

美式单词朗读由 Merriam-Webster's Learner's Dictionary with Audio 提供的公开音频完成；英式朗读由 Android 设备上的 Expo Speech `en-GB` 提供。音标与词性通过电脑后端查询词典。词典 Key 只保存在电脑 `server/.env`：

```text
LINGONEST_WEBSTER_KEY=你在词典开发者后台取得的Learners词典Key
```

默认 URL 已内置，不需要填写 `LINGONEST_WEBSTER_BASE_URL`。只有供应商明确要求其他兼容地址时才改它；不能把 Key 放进 URL、App 或仓库。配置后重启 3.0d 的配对局域网服务，启动行 `Dictionary configuration: configured` 仅表示配置字段完整，不代表真实 Key 可用。手机单词卡点“获取音标”，首次输入电脑 IP、端口及配对码；成功后本次 App 会话会复用连接。查询先预览、再确认保存，失败不会改变单词、复习或备份数据。后端 `POST /dictionary/word` 只接受一个英文词，返回 IPA、词性、可选的美式音频地址、来源与查询时间；音频地址只允许固定的 `media.merriam-webster.com` HTTPS 路径，不返回原始词典正文或 Key。音频由手机直接向该媒体域名获取，播放时手机需要能访问互联网。

2026-10-24 的真实 `learn` 查询曾因无效 Key 返回 `provider_auth`；用户修正 Key 后成功取得音标，并于 2026-10-26 本轮开始前确认 4.2 完成。不要提交或分享 Key。具体手机和迁移回归见 [4.2 测试计划](../docs/testing/AI_4_2_TEST_PLAN.md)。词典 API 使用还受供应商许可和品牌要求约束；正式发布前重新核对。

## 4.3 关联词推荐

沿用以上 AI 和词典配置，不增加 `.env` 字段或 SQLite 表。更新后在原局域网服务终端按 `Ctrl+C`，再运行 `npm.cmd start`；配对码会变，手机首次输入新码，后续本次 App 会话复用。`/health` 可访问不能证明旧进程已加载新接口。

手机从单词卡的“关联词推荐”进入。`POST /ai/related-words` 使用与备份、AI 分析相同的配对权限，JSON 请求体为 `{ "word": "serene", "meaning": "平静、宁静" }`。单词 1～120 字符，解释最多 500 字符；解释中的换行在发给 AI 前转为空格。后端围绕该词义生成以下结构并严格校验：

```json
{
  "candidates": [
    {
      "word": "calm",
      "category": "synonym",
      "definition": "peaceful and not worried",
      "chineseHint": "平静的",
      "reason": "都可描述平静；calm 也可强调不慌张。",
      "dictionaryStatus": "found"
    }
  ]
}
```

这是结构示例，不是一次真实调用记录。`category` 允许 `synonym`、`antonym`、`collocation`、`word_family`，最多 8 项、每类最多 2 项，可为空。词典核对状态由后端生成，不能由 AI 声称：

| dictionaryStatus | 含义 |
|---|---|
| found | 词条 ID、词头或词形列表匹配；仅说明词形存在，关系和解释仍需人工核对 |
| not_found | 未匹配；拼写建议不算命中，未收录的搭配仍可能正确 |
| unavailable | 词典网络、权限、超时或返回格式异常，尚未核对 |
| not_configured | 未配置可用词典服务，尚未核对 |

AI 默认 90 秒超时，随后词典查询并行执行，每项上限 10 秒；手机等待上限 120 秒，为词典核对及网络传输留出时间。AI 失败沿用已有安全错误分类和 `[AI]` 日志；词典异常记录 `[Dictionary]` 分类，候选返回为尚未核对，不暴露 Key、请求正文或供应商原始错误。AI 未配置返回 503，配对不正确返回 401，仅连接检查模式不开放此接口。

推荐日志增加阶段耗时，单位 `ms`（1000 ms = 1 秒）。以下仅为格式示例，不是实测结果：

```text
[AI] recommendation completed: ai=42000ms dictionary=800ms total=42800ms
[AI] recommendation failed: timeout (elapsed=90000ms)
```

`ai` 包含服务商请求、读取及解析结果；`dictionary` 是并行词典核对的阶段耗时。超时只意味着本程序停止等待，不能保证服务商撤销处理或不计次，实际收费以服务商规则为准。程序不会自动重试；不要连续点击重新生成。当前没有后台结果找回机制。更新后需重启原局域网后端、使用新配对码连接并重载 App；不需要更改 `.env`。

推荐不自动存入电脑或手机；用户逐项编辑单词/解释、选组、确认后，写入现有手机 v3 普通卡片，后续可手动备份。词典只核对原候选，不给修改后的单词背书。实现取舍见 [ADR 0009](../docs/decisions/0009-related-words-recommendations.md)，验收见 [4.3 测试计划](../docs/testing/AI_4_3_TEST_PLAN.md)。

## 4.4 AI 语境选词练习

手机从“复习”页进入练习，先从已有单词中选择一个分组和 4～5 个单词，再通过已配对的电脑后端调用 `POST /ai/exercises`。请求体只包含本轮选中的单词、ID 和当前解释：

```json
{
  "words": [
    { "id": 1, "word": "learn", "meaning": "学习" },
    { "id": 2, "word": "review", "meaning": "复习" },
    { "id": 3, "word": "practice", "meaning": "练习" },
    { "id": 4, "word": "remember", "meaning": "记住" }
  ]
}
```

AI 只返回适合出题的单词对应的题目草稿：目标单词 ID、包含一个 `_____` 空缺的英语例句和简短解释。后端拒绝额外字段、重复题目、未知 ID、换行、过长文本或不含唯一五下划线空缺的句子；AI 可以跳过不适合出题的单词，因此题目数量可能少于输入数量。手机根据本轮单词生成并随机排列四个选项，目标 ID 决定正确答案，答案和分数不由 AI 决定。

用户可以选择答案、跳过题目，或将有歧义的题目标记为“此题有疑问”。被排除的题目不计入本轮分数。练习结果只保存在当前 App 会话，不写入 v3 快照、不改变复习间隔，也不会自动加入新的单词。生成期间如果参与单词被编辑、删除或恢复，本轮会失效，需要重新生成，避免用旧题目判分。

接口沿用 AI 的 90 秒后端超时、手机 120 秒等待和配对权限。常见错误包括 `ai_disabled`（未配置 AI）、`unauthorized`（配对码错误）、`timeout`（服务商响应超时）和 `invalid_response`（服务商返回结构不合规）。排查时先看电脑终端的 `[AI] exercises ...` 日志；日志只记录错误类别、耗时和必要的 HTTP 状态，不记录 API Key 或完整请求。更新代码后停止旧的 `npm.cmd start`，重启后端并在手机重新配对。完整验收步骤见 [4.4 测试计划](../docs/testing/AI_4_4_TEST_PLAN.md)，设计取舍见 [ADR 0012](../docs/decisions/0012-ai-exercises.md)。

## 4.5 稳定性、缓存和用量

沿用现有配置，不安装新依赖、不新增 `.env` 字段或数据库表。更新后在原局域网后端窗口按 `Ctrl+C`，再运行 `npm.cmd start`，手机重载并使用新配对码连接。在添加页右上角“设置”找到“AI 服务用量”，点击“查询用量”；查询本身不会调用 AI，统计需手动刷新。

### 缓存与同时请求

- 分析和推荐只缓存通过校验的成功结果，24 小时后过期，共用最多 200 条。满时移除最久未访问的结果；缓存按任务、完整输入及提示词版本区分，保留词义和大小写，`US` 与 `us` 不共用。
- 相同任务、相同输入的同时请求共享一次生成，不重复调用服务商。完成的练习题不缓存，再练一轮仍请求服务商；连续两次可能碰巧生成相似例句。
- 同时最多两个不同 AI 任务。超过上限返回 `503 {"error":"busy"}`，手机提示等任务完成再试；不排队，不自动重试。缓存命中、等待同一任务不占新名额；失败不缓存并释放任务名额。
- 推荐缓存只包含 AI 候选，词典核对仍每次执行；缓存命中不等于推荐整个接口不访问网络。词典和音频不计入 AI 用量。
- 电脑重启后缓存及统计清空，SQLite 备份和手机资料保留。此服务仍只适用于可信私人网络，不包含费用硬上限或多用户隔离。

### 管理接口

| 接口 | 作用 |
|---|---|
| `GET /ai/usage` | 返回 AI 配置状态、启动时间、缓存数量/容量/有效期、同时任务上限及在途数量、各任务计数、安全失败分类。 |
| `DELETE /ai/cache` | 清理电脑缓存并返回同样的用量结构；保留统计及手机单词/笔记。 |

手机访问这两个接口时，需要当前局域网备份模式和相同的 Bearer 配对码；响应带 `Cache-Control: no-store`。仅健康检查模式返回 404。AI 未配置也可查询状态及零计数，不影响备份。旧的 `GET /ai/status` 继续只返回 `{ "status": "..." }`。

计数按 `analysis`（学习笔记）、`related`（关联词）、`exercise`（语境练习）分别记录：

| 字段 | 含义 |
|---|---|
| `requests` | 通过输入校验、进入已配置生成流程的请求；不含鉴权失败、非法输入和未配置请求。 |
| `providerRequests` | 本服务发起服务商调用的次数，包括失败尝试；不是计费笔数或金额。 |
| `cacheHits` / `coalesced` | 缓存命中次数 / 共享同一在途生成的后续请求次数。 |
| `succeeded` / `failed` | 实际生成任务的成功 / 失败；共享任务不会重复计一次失败。 |
| `busyRejected` | 因同时任务已满而拒绝的新任务次数，不发起服务商调用。 |

每类“请求 = 调用 + 缓存命中 + 重复合并 + 忙碌拒绝”；调用尚在进行时暂不计成功或失败。失败分类沿用超时、鉴权、接口地址、参数、限流、服务商故障、格式及未知异常，不包含服务商原文。统计接口不返回单词、解释、生成结果、配对码、服务商配置或密钥。

清缓存需要手机确认；取消不发送删除请求。清理不终止已在处理的任务，其结果仍会返回给等待者，但不能重新写回此次缓存。旧任务结束前同输入仍可能合并等待，之后重新生成才会再次调用服务商。清缓存不能撤回已发出的请求，也不能保证停止服务商计费。

最小验证：查询初始用量 → 对同词同义生成笔记预览两次（不必保存）→ 查询，观察第一次调用加 1、第二次命中加 1 → 清缓存并确认手机资料仍在。真实费用以服务商账单为准。完整步骤见 [4.5 测试计划](../docs/testing/AI_4_5_TEST_PLAN.md)，取舍见 [ADR 0013](../docs/decisions/0013-ai-runtime-cache-and-usage.md)。
