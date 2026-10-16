# HeirCut 开发手记的配图

`content/post/HeirCut/` 里各篇文章的 SVG 图由 `make_figs.py` 生成，只用 Python 标准库。

```sh
python3 tools/heircut-figures/make_figs.py <HeirCut 检出>/Library/HaircutLab tools/heircut-figures/lines.csv <输出目录>
```

输出十四个 SVG，生成后手工复制到对应文章目录：

| 文件 | 文章 | 数据 |
|---|---|---|
| `lab-curves.svg` | 01 | Haircut Lab 2026-06-23 的四次校准记录（文件名写在脚本里）。`Library/` 不入库，只在开发机上有 |
| `button-versions.svg` | 01 | 无，示意图 |
| `cut-pipeline.svg` | 02 | 无，示意图 |
| `score-sets.svg` | 02 | 无，示意图 |
| `architecture.svg` | 03 | 无，示意图 |
| `lines-over-time.svg` | 03 | `lines.csv` |
| `story-states.svg` | 03 | 写在脚本里的 `STORY_STATES`：2025 年的点取自 Plastic SCM 仓库 `2025Q2GJ`（变更集 10/13/24/54/94/132 里 `GuestStates.cs` 的 `D1/D2/D3` 状态类个数），2026 年取自 git（`9436b1b`、`467981d`） |
| `word-to-ending.svg` | 04 | 无，示意图（例子取自国王第一天的换词与结算条件） |
| `ai-monthly.svg` | 11 | `ai-monthly.csv`：按 committer date 统计每月提交数与 `Co-Authored-By: Claude` / `Co-authored-by: Cursor` 署名数（`git log --all --since --until -i --grep`） |
| `save-timeline.svg` | 07 | 无，示意图 |
| `bot-coverage.svg` | 08 | `bot-coverage.csv`：机器人批次 `Library/PlaythroughBatches/20260916-024402` 中 19 条覆盖路线的用时（每条日志里最大的 `t=`）与累计见到的不同台词（`coverage-NN.lines.txt` 求并集） |
| `trap-shapes.svg` | 09 | 无，示意图 |
| `size-steps.svg` | 10 | 写在脚本里的 `SIZE_STEPS`，取自提交说明里的构建实测（2.2 GB → 1.6 GB → 879 MB → 860 MB） |
| `closeshot-frame.svg` | 10 | 写在脚本里：帷幕拉开后最差帧 1744 ms → 121 ms，噪声本底约 85 ms（取自提交说明） |
| `letterbox.svg` | 12 | 写在脚本里：用与游戏 `DisplayViewportUtility.CalculateViewport` 相同的公式算 16:9、21:9、16:10 屏幕上的画面矩形 |

`lines.csv` 是快照，每行是「提交时间, 提交, GuestStates.cs 行数, 桥的行数」，由下面的命令从 HeirCut 仓库重新生成：

```sh
tools/heircut-figures/collect_lines.sh <HeirCut 检出> > tools/heircut-figures/lines.csv
```

图里的颜色是经过色觉缺陷校验的分类色板；改颜色后要重新校验，并保证每条线都有直接标签。

文章 02 的 `cut.gif` 与 `cut-before-after.jpg` 不是这里生成的：它们是在 Unity 的 `HaircutLab` 场景里用 `HairCutter.TryApplyCut` 逐帧剪、用 Lab Camera 逐帧渲染后，用 ffmpeg 和 ImageMagick 合成的。
