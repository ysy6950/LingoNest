# 词典数据来源与授权边界

最后核对：2026-10-28

来源：Merriam-Webster Dictionary API 的 Learner's Dictionary with Audio 产品页、Terms of Service、Developer 注册页和隐私政策。

## 1. 当前使用方式

LingoNest 使用 Merriam-Webster Learner's Dictionary API 查询单词，读取可用的 IPA、词性和美式音频标识。请求来自手动查询、关联词候选核对，或用户开启后的自动补全。电脑后端把音频标识转换为受限的 HTTPS 媒体地址；手机播放音频时直接访问媒体域名。当前没有下载或打包完整词典数据集，也没有批量预处理词典。

官方产品页列出的可用数据特征包括定义、例句、IPA、音频、插图和拼写建议：[Learner's Dictionary API](https://dictionaryapi.com/products/api-learners-dictionary)。本项目当前只保存经过筛选的 IPA、词性、音频地址、来源标识和查询时间，不把原始词典响应返回给手机。

## 2. Key 和请求边界

- `LINGONEST_WEBSTER_KEY` 只放在电脑 `server/.env`，不放移动端或 Git。
- API Key 按官方请求格式作为词典请求的查询参数发送；日志不得记录完整 URL。
- 词典请求是单词级查询，不把整份用户单词库发送给服务商。
- 词典命中只证明词形存在，不证明 AI 推荐的近义、反义、搭配或词根关系正确。
- 词典服务超时、无效 Key、找不到可用发音或网络失败都会以安全错误返回；不会改写原单词或复习记录。

## 3. 注册条款中的实际限制

官方 Terms of Service 当前将免费许可描述为非商业用途，并列出每个 reference work 每日不超过 1000 次查询、最多使用两个 reference works 等条件；条款也限制复制、分发、商业使用和移除专有标识，并说明商标不表示 Merriam-Webster 对应用的背书：[Terms of Service](https://www.dictionaryapi.com/info/terms-of-service)。开发者注册页要求同意条款和隐私政策后才能取得 Key：[Register for a Developer Account](https://dictionaryapi.com/register/index.htm)。

条款还写明，未经 Merriam-Webster 书面批准，不应提交自动或录制的查询。LingoNest 的可选自动补全会在用户添加单词后由程序发起词典请求，虽然用户先打开开关并确认，但是否符合这条限制尚未向供应商确认；因此不能把“用户选择开启”当成已经获得自动查询许可。条款也没有在该页面明确说明本项目保存 IPA、词性和音频地址的期限及离线缓存是否获准。

当前仓库记录这些边界，不宣称已取得自动查询或内容再分发许可。正式公开分发、自动补全演示、商业化或扩大用户量前，应重新阅读当时条款并向供应商确认书面许可；若未获确认，应关闭自动词典补全，保留用户主动点击的单词查询路径，并重新评估是否长期保存查询字段。不要仅凭当前开发 Key 推断可以公开运营。

官方品牌指南要求使用 Merriam-Webster 标识、不得修改、保留 ®，并列出 50×50、100×100 和 125×125 像素的批准尺寸；当前卡片来源说明使用 50×50 布局单位的标识，移动端布局单位与物理像素的差异仍需在公开发布前核对：[Brand Guidelines](https://www.dictionaryapi.com/info/branding-guidelines)。标识不代表供应商认可或背书应用。

隐私政策说明开发者注册资料、Key 和查询统计可能由供应商处理；AI 服务商也有自己的数据政策。演示时只使用公开常见测试词，不发送个人信息或私密学习内容。[Privacy Policy](https://dictionaryapi.com/info/privacy-policy)

## 4. 对项目实现的影响

| 需求 | 当前决定 |
|---|---|
| 单词发音 | 读取供应商可用的美式音频；无音频时显示不可用，不伪造地址 |
| 音标和词性 | 手动查询后确认保存；自动补全依赖用户预先开启设置，供应商自动查询许可另行确认 |
| 离线学习 | 已保存的音标可离线查看；首次查询和网络音频播放可能需要联网 |
| 关联词核对 | 只调用词典确认候选词形；不把词典当作关系或词源数据库 |
| 批量词典数据库 | 当前不做；条款不支持把当前 Key 当作批量数据集许可 |

本文件是工程记录，不是法律意见。若产品从个人求职展示变为公开分发，应在发布前完成供应商许可、品牌使用和隐私政策复核。
