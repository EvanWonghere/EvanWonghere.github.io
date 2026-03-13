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
