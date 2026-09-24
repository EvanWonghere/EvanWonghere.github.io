# 蜂窝音乐练习室

入口 `/study/music/`；Hugo 模板 `layouts/music/single.html`，独立 ES modules，
无需 npm 构建或在线服务。导航来自 `content/study/music.md`，学习工具页也提供入口。

## 内容与实现

- `curriculum.mjs`：6 阶段、24 课、72 道小测、23 组钢琴练习、5 首原创视唱短句、5 组节奏。
- `lesson-details.mjs`：24 课完整讲解、目标、例题、谱例试听、作业和自查标准。
- `harmony.mjs`：22 种和弦、10 种进行、十二调移调、转位与四种配置，保留等音拼写。
- `practice.mjs`：分级技术与短曲、分手/片段循环、独立声部保持时值和起音判定。
- `core.mjs`：音高与题目生成、单音音高识别、节奏评分、进度校验与间隔复习。
- `audio.mjs`：Web Audio 钢琴采样、合成音回退、力度滤波、96 声部目标上限、延音与可取消播放。
- `notation.mjs`：高低音谱与大谱表 SVG，音符、加线、升号、附点、时值及视唱 4/4 小节线。
- `app.mjs` / `style.css`：学习页面、计时、键盘/MIDI、麦克风、备份和响应布局。
- `atelier.css`：独立的 ÉTUDE 视觉设计；暖白谱纸、宋体标题、深绿琴身和原创 SVG 封面，不依赖在线字体。
- `samples/`：四套 FluidR3 逐音采样（三角钢琴、电钢琴、羽管键琴、爵士风琴），共 352 个 MP3（约 7.5 MB），来源与授权见 `samples/NOTICE.md`。

训练判定明确区分：等音模式允许逐音组成和弦，只检查音高；跟拍模式的起音窗口为 ±0.25 拍。
完整时值模式按 75% 音高/起音 + 25% 按键保持评分，保持时长容差为 ±25%（至少 100 ms）；
它测量按键按下至松开的时长，不评价实体指法或踏板后的声学尾音。长音与其他声部可同时独立进行。
循环片段会截短边界处的长音；分手后的持续音用“保持”标示，休止保留原时间线。
和弦工坊支持古典终止、爵士 ii–V–I、小调 iiø–V–i、三全音替代、Blues 等；
送到钢琴时将超过八度的上方结构分配给双手，各手不超过八度。配置与转位会分别保存成绩。
“靠近前一和弦”是最小移动建议，不是古典四部和声规则检查器。

节奏按预备拍结束后的绝对位置判定，漏拍、多拍都扣分；视唱跟音需在目标 ±35 音分内
稳定约半秒，成绩是有音帧中接近目标的比例，不评分节奏。自主视唱只记录次数。

麦克风只分析本地单音，不录制或上传，不连接扬声器。结束、切页、隐藏页面时释放音轨。
MIDI 仅请求普通输入（不申请 SysEx），支持力度、note-off、velocity-zero note-on 与 CC64。
真正的键重、机械触感、声学共鸣以及教师反馈不能由浏览器模拟取代。

## 保存与备份

独立 localStorage key `hive-music-v1`，不接触面试、毛概或游戏记录。保存课程完成、答题次数、
正确率、复习时间、练习最好/最近成绩、最近 150 条练习、每日有效时长、连续天数、
速度/力度/音量/音域设置以及上次选择的曲目、音色和练习方式。扩展保存作业勾选、
最多 100 篇练习日志、工坊生成练习及分手/片段成绩、最好与最近成绩对应的速度；兼容原有 v1 记录。未完成练习不记成绩。
题目答对后的间隔为 1、3、7、14、30 天；错题立即可复习并在 10 分钟后到期。

页面在前台、且两分钟内有操作时每 15 秒累计时长。记录不自动跨设备同步，导出/导入 JSON
可迁移。导入预览后须明确确认替换，并尝试下载原进度。读取损坏或未来版本时不静默覆盖；
保存被拒绝/空间不足时显示持久提示。新窗口通过 storage 事件接受其他页面的保存。

## 管理员 AI 助手（可选）

`hugo.toml` 的 `[params.musicAI]` 默认关闭。关闭时页面不渲染入口，不加载 `ai.mjs` 或 supabase-js，
练习、判分和备份与离线版本完全一致。打开后顶栏出现“AI 助手”，只有管理员能使用：

- 用途：讲解本课、作业反馈（先提示，不代做）、作曲点评（读当前 ABC 草稿与格式检查结果）。
- 判分、掌握状态、作业勾选与复习安排仍只由 `core.mjs` 等确定性代码计算。`ai.mjs` 只拿到进度的
  `structuredClone` 副本和当前课程、乐谱，没有任何保存进度的函数；`tests/music-ai.test.mjs` 检查这一点。
- 后端是题库仓库 `supabase/functions/ai-tutor` 的 `music-*` 动作与 `music_messages` 表，见该仓库
  `docs/AI_TUTOR.md`。浏览器只用公开的 `supabaseUrl` 与 `publishableKey`。
- 登录：GitHub OAuth（PKCE）回到 `/study/music/?code=…`，换取会话后清理地址并回到登录前的栏目。
  会话与题库、概念实验室同源共享，退出会同时退出三者。需要把 `https://yufenghuang.tech/study/music/`
  加入 Supabase Auth 重定向白名单。
- 请求恢复：发送前把请求写入 sessionStorage `hive-music-ai-pending`（不写 `hive-music-v1`）。
  断网或刷新后用同一请求 ID 重发，服务端不会重复调用模型；关闭标签页后仍可在历史中看到结果。
- 课程目录：服务端只信任题库仓库里的 `musicCatalog.json`，不含小测题与答案。修改课程后运行
  `node tools/export-music-catalog.mjs <题库仓库路径>`，同时更新本目录的 `catalog-versions.mjs`
  和题库的目录；两者不一致时该课的 AI 讲解暂停，其余课程不受影响。
- `vendor/supabase-js-2.112.4.mjs` 的来源、打包命令与许可见 `vendor/NOTICE.md`。
- 回退：把 `enabled` 改回 `false` 并推送；浏览器里的练习进度不受影响。

## 验证

```sh
node --test tests/music.test.mjs
node --test tests/music-ai.test.mjs
node --test tests/*.test.mjs
hugo --minify --destination /tmp/hive-music-build
hugo server --port 1314 --destination /tmp/hive-music-preview
```

现有 GitHub Actions 的 `tests/*.test.mjs` 已包含音乐规则测试。
浏览器复核项目：课程/答题刷新恢复，重复答题只记一次；识谱不泄露答案；
四套采样加载与切换取消；和弦工坊到钢琴跟弹、刷新恢复；作业/日志与片段循环；
双手不同保持时值的完整评分；桌面专注模式与手机音区滑条；电脑键盘/指针松键与踏板；等音和跟拍完整结算；预备拍与节奏评分；
MIDI 消息/断开；麦克风拒绝、取消与完成清理；有效/无效备份；窄屏滚动与无横向溢出。
实体 MIDI 琴触感、真实人声在不同设备上的识别精度需手工复核。

## 维护

添加课程时使用稳定 ID，避免已有题目复习记录失配；新练习数据需提供音符与时值。
修改课程内容后运行 `node tools/export-music-catalog.mjs <题库仓库路径>`，否则 `tests/music-ai.test.mjs` 会失败。
不要修改 `public/` 或主题子模块。静态资源从同站 `/music/` 读取；本博客部署在域名根目录。
该页面沿用博客的 GitHub Pages 工作流，提交并推送 `main` 后才会发布到线上。
