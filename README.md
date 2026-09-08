# 蜂窝 / Hive

个人博客站点，基于 [Hugo](https://gohugo.io/) 与 [Stack 主题](https://github.com/CaiJimmy/hugo-theme-stack)，托管于 GitHub Pages。

- **站点**：<https://yufenghuang.tech/>
- **语言**：中文（默认）、English

## 本地开发

```bash
# 克隆（含子模块，如主题）
git clone --recurse-submodules https://github.com/EvanWonghere/EvanWonghere.github.io.git
cd EvanWonghere.github.io

# 安装主题（若未用 submodule 拉取）
git submodule update --init --recursive

# 启动本地预览
hugo server -D
```

浏览器访问 <http://localhost:1313/>。

## 目录概览

| 目录 / 文件     | 说明 |
|----------------|------|
| `content/`     | 文章与页面（Markdown） |
| `static/`      | 静态资源；`static/quiz/` 为面试刷题单页应用 |
| `layouts/`     | 自定义布局（覆盖主题） |
| `assets/icons/`| 自定义菜单图标（如 `device-gamepad.svg`） |
| `hugo.toml`    | Hugo 与主题配置 |

## 部署

推送至 `main` 分支后，由 GitHub Actions（[.github/workflows/gh-pages.yml](.github/workflows/gh-pages.yml)）自动构建并部署到 GitHub Pages，自定义域为 `yufenghuang.tech`。

## 许可与版权

博客内容版权见站点内说明；仓库结构与配置可参考使用。

## ÉTUDE 音乐练习室

`/study/music/` 是独立视觉设计的音乐学习与创作应用。课程、听音、视唱、
节奏、88 键采样钢琴、古典与爵士和弦练习之外，还提供：

- 五线谱作曲：ABC 编辑、点选音符替换、撤销/重做、多声部与变速跟谱播放。
- 导入 `.abc`、`score-partwise` 格式 `.musicxml` / `.xml`、压缩 `.mxl`；
  导出 ABC、MIDI 和谱面 SVG。文件本机处理；照片和 PDF 识谱尚未实现。
- Strudel 官方编辑器按需嵌入，附节奏、琶音、爵士和声、叠层入门片段。
  内嵌编辑器修改需复制回本站草稿后保存；切换栏目或隐藏页面会关闭内嵌演奏。
- 草稿自动保存、最多 20 首作品，与原有练习进度一起通过 JSON 备份迁移。

主要入口为 `layouts/music/single.html` 和 `static/music/app.mjs`；创作模块为
`composition.mjs`、`creative.mjs`、`score-player.mjs`。依赖来源与授权见
[第三方说明](THIRD_PARTY_NOTICES.md) 和 [排谱依赖说明](static/music/vendor/NOTICE.md)。

验证：`node --test tests/*.test.mjs`，再执行 `hugo --minify`。
MusicXML 转换浏览器验证样本位于 `tests/fixtures/music/tied-duet.musicxml`，
预期 F 大调 120 BPM、双声部、4 个发声音符、总长 2 秒（右手降 B 连音保持 2 秒）。
