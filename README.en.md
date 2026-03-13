# Hive / 蜂窝

Personal blog built with [Hugo](https://gohugo.io/) and the [Stack theme](https://github.com/CaiJimmy/hugo-theme-stack), hosted on GitHub Pages.

- **Site**: <https://yufenghuang.tech/>
- **Languages**: English, 中文 (default)

## Local development

```bash
# Clone with submodules (e.g. theme)
git clone --recurse-submodules https://github.com/EvanWonghere/EvanWonghere.github.io.git
cd EvanWonghere.github.io

# Init theme if not pulled via submodule
git submodule update --init --recursive

# Run local server
hugo server -D
```

Open <http://localhost:1313/> in your browser.

## Repository layout

| Path | Description |
|------|-------------|
| `content/` | Posts and pages (Markdown) |
| `static/` | Static assets; `static/quiz/` is the interview quiz SPA |
| `layouts/` | Custom layouts (override theme) |
| `assets/icons/` | Custom menu icons (e.g. `device-gamepad.svg`) |
| `hugo.toml` | Hugo and theme configuration |

## Deployment

Pushes to the `main` branch trigger GitHub Actions ([.github/workflows/gh-pages.yml](.github/workflows/gh-pages.yml)) to build and deploy to GitHub Pages. Custom domain: `yufenghuang.tech`.

## License & copyright

Content license is stated on the site; repository structure and config are free to reuse as reference.
