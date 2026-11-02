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

## 记录与回放已关闭

当前交付版 `GameConfig.replay.enabled = false`。开局、暂停、结算均不显示记录/导入/导出入口，不读取旧录制偏好、不创建后台记录器、不接受记录文件；相关实现保留，当前无法启用。原点击派遣和两种点击设置的拖动操作保留。

每次打包前仍运行 `npm run replay:identity` 生成构建代码指纹，用来核对测试和线上版本；检查用 `node tools/replay/update-identity.mjs --check`。这一步不会启用游戏内记录回放。

本地预览须服务发布器生成的外壳目录，不直接服务 Creator 裸构建：

```bash
node tools/deploy/publish-site.mjs /private/tmp/fh-replay-preview-site /path/to/fresh/build/web-mobile
python3 tools/deploy/serve-preview.py --directory /private/tmp/fh-replay-preview-site/static/games/fenghuo-app --port 18813
```

首次切换旧入口时使用带新版本参数的URL，例如 `http://127.0.0.1:18813/?preview=responsive-v3`。预览服务器禁用缓存并忽略条件GET，避免同一端口从裸构建切为外壳时复用旧HTML。正式站点发布不使用此开发服务器。

## 点击与拖动操作

网站外壳的 iframe 使用 `game/index.html?controls=inspect`：点击查看任意据点，己方可升级或调整出兵比例；拖动派兵。原 Creator 工程默认 `classic`，保留点击来源→目标→数量→派遣。显式 `controls=classic` 可验收传统操作；未知值沿用工程默认。两种模式拖动均优先，超过阈值后不再触发点击。开局面板以“点击据点时”区分“选择派兵对象”“查看据点信息”，并明确两种设置都支持拖动，参数仅决定初始选项；同一入口可以选择两种模式，开始后锁定，重新开始可再选。网页预览应保留外壳以维持9:16适配。

当前UX布局：游戏画幅统一9:16，保留满幅地图、头像与结算比例；较宽窗口等比居中，小横屏保留可关闭的竖屏建议。记录回放关闭后开局菜单不再预留其空白区；外壳加载失败可真实重试。
