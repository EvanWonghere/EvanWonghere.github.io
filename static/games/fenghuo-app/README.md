# 烽火城池网页构建

本目录由 `FenghuoSiege` 的 `tools/deploy/publish-site.mjs` 发布到个人网站 `static/games/fenghuo-app/`。

- 源工程：Cocos Creator **3.8.5**，`web-mobile` 正式构建（`md5Cache=true`）。
- 外层 `index.html`：9:16 居中 iframe + 加载遮罩，对接玩具箱暂停/恢复。
- `game/arcade-bridge.js`：场景就绪、加载进度、错误转发；重新构建后须保留并在 `game/index.html` 的 `</body>` 前引入。

## 源工程约束

`assets/scripts/**` 中禁止 `[...new Set(...)]` 等展开 Set/Map/迭代器的写法（Creator 3.8.5 正式构建会转错）；须用 `Array.from(...)`。见 `tests/structure/spread-iterable.test.ts`。

## 地图 WebP

构建完成后对地图 PNG（uuid 见 `assets/art/map/bg_map.png.meta`）运行 `cwebp -q 85`，并将对应 `import` json 的 `fmt` 设为 `4_0`（由 publish 脚本自动处理）。

## 发布

```bash
tools/deploy/build-web.sh
node tools/deploy/publish-site.mjs /path/to/EvanWonghere.github.io
```

## 一次准备或发布

在 FenghuoSiege 根目录运行（需 Node、Python/FFmpeg、Hugo、cwebp 和 Creator 3.8.5）：

```bash
tools/deploy/release-web.sh --site /path/to/EvanWonghere.github.io --sync
```

脚本先检查游戏目标目录未修改，再用 `git pull --ff-only` 安全同步网站；分叉或冲突会停止，不切分支、不 reset。随后验证源项目，在独立临时工程构建，将资源打到临时目录，成功才替换网站游戏目录；旧游戏备份在网站根目录 `.fenghuo-backup-*`，验证完成后可自行清理。最后跑网站测试与 Hugo 构建。原工程的 `build/web-mobile` 不会被覆盖，构建日志与快照位置会打印。

显式增加 `--push` 会仅提交网站 `static/games/fenghuo-app` 并推送 main，触发 GitHub Pages；不提交源游戏工程或其他网站文件。先确保当前版本已经验收，再使用此选项。默认模式只准备本地待发布结果，保留原有未跟踪文件；若已有待发布游戏改动，脚本拒绝再次覆盖，请先确认/处理。`publish-site.mjs <site> [build-directory]` 仍可单独使用，支持指定新鲜构建目录。
