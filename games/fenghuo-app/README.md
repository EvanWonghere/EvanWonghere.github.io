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
