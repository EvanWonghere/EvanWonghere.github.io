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

## 本地记录与回放

开局可选“记录本局”（首次默认关闭），暂停或结算时手动导出 JSON。重新开局后在菜单导入本地文件，支持暂停、1×/2×和退出；无上传接口。录制只捕获成功真人命令，包含真实场景地图、有效规则、难度/AI种子及逻辑代码指纹。中途导出是合法局部记录；调试派兵/升级、局内AI开关变化或达到预算会停止有效记录。

回放仅支持同一代码和配置版本。两个网页构建脚本都会先生成代码指纹；手动用 Creator 预览或构建前须运行 `npm run replay:identity`，检查用 `node tools/replay/update-identity.mjs --check`。文件最多4MiB、20000条成功命令和216000个逻辑tick（60Hz下一小时）。不支持从检查点跳转；从开局依次重放并验证状态。浏览器界面使用独立DOM，非浏览器运行不提供文件入口，原游戏流程不受影响。

本地预览须服务发布器生成的外壳目录，不直接服务 Creator 裸构建：

```bash
node tools/deploy/publish-site.mjs /private/tmp/fh-replay-preview-site /path/to/fresh/build/web-mobile
python3 tools/deploy/serve-preview.py --directory /private/tmp/fh-replay-preview-site/static/games/fenghuo-app --port 18813
```

首次切换旧入口时使用带新版本参数的URL，例如 `http://127.0.0.1:18813/?preview=responsive-v3`。预览服务器禁用缓存并忽略条件GET，避免同一端口从裸构建切为外壳时复用旧HTML。正式站点发布不使用此开发服务器。
