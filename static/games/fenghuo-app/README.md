# 烽火城池网页构建

本目录包含 Cocos Creator 3.8.5 的 `web-mobile` 正式构建；源工程是 `FenghuoSiege`，构建基于 2026-10-30 工作区快照（含当时未提交的改动），启动场景为 `Main`。这不是单纯由 Git HEAD 重现的产物。

构建前在**临时工程副本**中，对 `assets/scripts/logic/Preview.ts` 和 `assets/scripts/logic/InteractionModel.ts` 各将 `[...new Set(sourceIds)]` 改为 `Array.from(new Set(sourceIds))`。Creator 3.8.5 的正式构建会错误转换前者，使拖动派兵报错；该修正尚未写回源工程。重新构建时必须先将修正合入源工程或再次应用到副本。

外层 `index.html` 保持竖屏比例并对接玩具箱；`game/arcade-bridge.js` 等待场景就绪、转发错误和处理暂停原因。重新生成 `game/` 后需要保留桥接脚本，并在生成的 `game/index.html` 中、`</body>` 前加入 `<script src="arcade-bridge.js"></script>`。构建完成后须从玩具箱入口验证加载、拖动派兵与暂停恢复。

地图加载优化：使用 `cwebp -q 85` 将 `game/assets/main/native/d6/d654a212-4af3-4c46-88a9-e6956a49522b.png` 编码为同名 `.webp`，并将 `game/assets/main/import/d6/d654a212-4af3-4c46-88a9-e6956a49522b.json` 中的 `fmt` 从 `0` 改为 `4_0`。Creator 3.8.5 会优先选择受支持的 WebP，不支持时回退 PNG。重新构建后需要重新生成 WebP 并重新设置 `fmt`，保留原 PNG。
