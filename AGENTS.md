# AGENTS.md

Personal Hugo blog ("蜂窝 / Hive") deployed to GitHub Pages at `yufenghuang.tech`. Default language is `zh-cn`; English (`en`) is secondary. Theme is [hugo-theme-stack](https://github.com/CaiJimmy/hugo-theme-stack), pulled in as a git submodule under `themes/hugo-theme-stack`.

This file is the shared instruction set for coding agents (Claude Code, Codex and others). `CLAUDE.md` imports it and only adds Claude-specific notes.

## Commands

```bash
git submodule update --init --recursive   # required once per clone; the theme is a submodule
hugo server -D                            # http://localhost:1313/, drafts included
hugo server -D --buildFuture              # also include scheduled posts
hugo --minify                             # production build into ./public (same as CI)
node --test tests/*.test.mjs              # arcade, music and composition rule tests (same as CI)
git diff --check                          # CI rejects whitespace errors
```

There is no package manager. Hugo and Node's built-in test runner are the only tools.

## Deployment

Pushes to `main` trigger `.github/workflows/gh-pages.yml`: `node --test tests/*.test.mjs`, `git diff --check`, `hugo --minify` with Hugo extended 0.165.0, then publish `./public` to the `gh-pages` branch with CNAME `yufenghuang.tech`. Every push to `main` goes live, so a change is published only after it is pushed, and a broken push is published too. Keep the local Hugo version and the workflow's `hugo-version` in step.

## Configuration

- `hugo.toml` is the live config. `hugo.yaml` is a leftover Stack example template and is not used; edit `hugo.toml`.
- Site-wide menu entries (including custom ones like `quiz`, `quotes`, `games`) are defined in `hugo.toml` under `[[menu.main]]`. Custom icons referenced by those entries (`device-gamepad`, `quote`, `brand-steam`) live in `assets/icons/` and override the Stack theme's icons by filename.
- Math uses the Stack theme's built-in KaTeX, enabled site-wide via `[params.article] math = true`, with a local override at `layouts/partials/article/components/math.html`. Per-page override with frontmatter `math: true/false`. `params.markup.goldmark` has passthrough delimiters for `\[...\]`, `$$...$$` and `\(...\)`; single `$...$` is recognized by KaTeX but is **not** in passthrough, so avoid it.

## Content architecture

1. **`content/post/`**: standard blog posts with the usual Stack rendering.
2. **`content/games/`**: the "独立游戏厅" arcade. Each `<slug>.md` sets `game_url: "/games/<slug>-app/index.html"`; `layouts/games/single.html` renders a full-screen page with a nav bar and an `<iframe>` to `game_url`. Apps live in `static/games/<slug>-app/`; shared rule engines live in `static/games/engines/` and are covered by `tests/arcade-rules.test.mjs`. Adding a game means adding the app under `static/games/<slug>-app/` and `content/games/<slug>.md` with `menu.main.parent: "games"` and the matching `game_url`.
3. **`content/study/`**: study tools under `/study/`.
   - `music.md` (`type: "music"`) is the 音乐练习室, rendered by `layouts/music/single.html`. Its source lives in this repository; see the next section.
   - `maogai.md` reuses the games iframe layout for `static/study/maogai-app/`.
   - `labs.md` uses `layouts/redirect/single.html` to redirect to `/labs/`.
4. **`content/page/quote/index.md`**: sets `layout: "quotes"`, which selects `layouts/page/quotes.html`. It iterates `data/quotes.yaml` (`prose_quotes`, `poetry_and_passages`, `articles`) and renders each item via `layouts/_partials/quote-card.html`. To add a quote or article, edit `data/quotes.yaml`, not the markdown file.

## 音乐练习室 (`/study/music/`)

- Plain ES modules under `static/music/` with no build step and no online service: `curriculum.mjs`, `lesson-details.mjs`, `harmony.mjs`, `practice.mjs`, `core.mjs` (pitch, question generation, rhythm scoring, progress validation, spaced review), `audio.mjs`, `notation.mjs`, `composition.mjs`, `score-player.mjs`, `creative.mjs`, `app.mjs`, plus styles.
- `static/music/README.md` is the detailed contract: scoring tolerances, storage and backup behaviour, and the browser review checklist. Read it before changing music logic.
- Scoring and progress are deterministic code in `core.mjs` and friends, tested by `tests/music.test.mjs` and `tests/composition.test.mjs`. Keep them deterministic.
- Progress is stored only in `localStorage` key `hive-music-v1`, isolated from quiz, 毛概 and game records. Stay compatible with existing v1 records and never silently overwrite corrupt or newer-version data.
- Use stable lesson and question IDs so existing review records keep matching.
- Third-party code in `static/music/vendor/` and piano samples in `static/music/samples/` carry their own licences (`NOTICE.md`, `THIRD_PARTY_NOTICES.md`). Do not edit vendored files; record new third-party assets in the notices.
- The microphone is analysed locally and never recorded or uploaded; MIDI requests plain input without SysEx. Keep both properties.

## Built apps copied from other repositories

- `static/quiz/` is the Interview Question Bank build (`EvanWonghere/InterviewQuestionBank`). Its CI pushes the "Update from https://github.com/EvanWonghere/InterviewQuestionBank/commit/…" commits here.
- `static/labs/` is the ConceptLab build (`EvanWonghere/ConceptLab`).

Do not edit or rebuild either app from this repository; change the source repository instead. Their Supabase project, GitHub login and AI tutor also live in the quiz repository.

## Layout override pattern

To customize theme rendering, mirror the Stack theme path under `layouts/` and Hugo prefers the local file. Existing overrides include `layouts/index.html` (home page intro block), `layouts/_default/single.html`, `layouts/_default/_markup/render-codeblock.html`, `layouts/partials/{head,footer}/`, `layouts/partials/article/components/{math,series-nav}.html`, `layouts/games/`, `layouts/music/`, `layouts/redirect/`, `layouts/page/quotes.html` and `layouts/_partials/quote-card.html`. Before adding one, check the matching file in `themes/hugo-theme-stack/layouts/` for the block structure to `define`.

## Things to avoid

- Do not edit files under `themes/hugo-theme-stack/`; it is a submodule. Override via `layouts/` or `assets/`.
- Do not edit `public/`, `resources/` or `.hugo_build.lock`; they are generated.
- Do not commit `.history/`; it is IDE local history and already ignored.

## Cloud and non-macOS environments

- Run `git submodule update --init --recursive` first; without the theme, Hugo cannot build.
- Hugo may be missing in a cloud session. `node --test tests/*.test.mjs` needs only Node. If Hugo is unavailable, say the site build was not verified instead of reporting it as passed.
- Features that need real hardware or a person (MIDI keyboards, microphone accuracy, audio quality, touch feel) cannot be verified in the cloud. List them as manual checks.
