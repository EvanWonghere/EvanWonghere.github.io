# 英语朗读室

入口 `/study/english/`，Hugo 页面在 `layouts/english/single.html`。前端无构建步骤。

## 行为与隐私

- 录音使用浏览器 MediaRecorder，最多 25 秒。音频先在页面内存中保存，可回听或丢弃，刷新即失。
- 点击评分时才把音频、参考文本发送到已有 Azure Speech 资源 `hive-english-speech-20261009`（`southeastasia`，F0）。音频本地解码、降混为单声道、重采样为 16kHz、编码 PCM16 WAV 后通过 HTTPS 发送到 `speech-assess`，后端立即转发到 Azure 短音频 REST 评分接口，不写入数据库/存储、不记录音频日志。
- 短句最多 60 词 / 600 字符；录音后的文本或口音变更必须重录。使用单次短音频发音评估，音素粒度、误读检查开启、韵律附加评估关闭。长停顿可能结束首个语段，页面提示核对完整度和漏读。
- 成绩来自 Azure，显示综合、准确度、流利度、完整度及单词/音素分数。缺少的分数显示 `—`；不会假造分数，也不把它作为水平认证。
- 历史仅写 `hive-english-v1`，最多 50 次。无录音数据、无云端成绩表，不读写音乐/题库成绩。读取、写入、导入均校验 v1；损坏或较新版本保留原值，阻止覆盖。导入合并 ID、保留已有冲突项，保留最近 50 次。
- 评分须通过现有 Supabase 管理员身份。访客可录音/回听，不能调用评分接口。通过题库登录再返回，复用已有 session，无新增 OAuth 回调地址或 Auth 配置变更。
- 管理员可点击“测试完整评分（公开示例）”，用微软公开的 2.03 秒 WAV 验证授权、浏览器连接、音频上传及实际评分；不会发送自己的录音、不写入练习历史，示例请求也会计入 Azure 用量。前端不加载 Speech SDK、不直接连接 Azure WebSocket；Azure 密钥和 token 不返回浏览器。

## 后端与部署

本功能独立的 `speech-assess` 函数源码在本仓库 `supabase/functions/speech-assess/`。旧版 `speech-token` 和 SDK 适配器仅保留作回滚参考，当前页面不调用它们。它与题库共用现有 Supabase 项目 `vtbwqnigocrbpmbkbiiv` 的 Auth 和 `is_app_admin()`；不修改 `ai-tutor`、表、RLS、音乐成员权限或题库构建。

部署需先确认，只部署这一函数：

```sh
supabase functions deploy speech-assess --project-ref vtbwqnigocrbpmbkbiiv --no-verify-jwt --use-api
```

在该项目 Edge Function Secrets 中设置 `AZURE_SPEECH_KEY`（Azure 资源“密钥和终结点”的密钥）、`AZURE_SPEECH_REGION=southeastasia`。密钥只保存在服务端 Secret，不能放 Hugo 配置、源码、命令参数或日志。无需数据库迁移，不能运行 `db push` 或改变已有函数的秘密。

`verify_jwt=false` 是为了支持 publishable key；函数内部必须先用 `auth.getUser(token)` 验证 JWT，再以该用户身份调用 `is_app_admin()`，失败即拒绝。每次请求重新检查权限。CORS 仅允许主站和本机 1313 端口；它是浏览器限制，真正权限来自身份校验。评分请求体流式限制为 1.12 MB，参考文本限制 60 词 / 600 字符，口音仅 en-US/en-GB；服务端验证 WAV 为 PCM16、单声道、16kHz，并限制实际音频时长（最多 26 秒编码余量）。Azure HTTPS 请求超时 45 秒；浏览器总超时 60 秒。不自动重试，避免重复计费。

F0 资源保持原套餐，不自动升级；实际额度和停用状态以 Azure 控制台为准。取消评分/网络超时不保证 Azure 未处理请求；重试可能重复计入用量。

## 检查

`node --test tests/*.test.mjs` 覆盖 WAV 编码、成绩解析/记录校验、未登录/普通用户门禁、权限撤销/缓存、CORS 和 Azure 故障。`hugo --minify` 构建页面。完整 HTTPS 评分链路及麦克风需要真实浏览器验证：

1. 访客录音、回听、丢弃；确认麦克风在结束、切后台、离开页面后释放；刷新录音消失。
2. 管理员通过题库登录，回到本页刷新状态；朗读 10–20 秒，发送评分，查看逐词及音素反馈。
3. 录音后改文本/口音须重录；连续录音 25 秒自动结束；拒绝权限、断网、取消、超时有可理解提示。
4. 普通登录账号接口返回 403，未登录返回 401；密钥不能出现在前端响应/源码中。
5. 历史导出/导入合并；损坏/较新版本不被覆盖；移动端布局与 Safari 音频解码手工检查。

官方参考：[发音评估](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment)、[短时 token](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-speech-to-text-short)、[token exchange 示例](https://github.com/Azure-Samples/AzureSpeechReactSample)。
