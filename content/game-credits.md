---
title: "游戏厅致谢与授权"
description: "游戏厅所使用的数据来源、实现参考与离线运行说明。"
url: "/games/credits/"
---

游戏厅的代码、绘图、字体和音效均随站点本地提供，游玩过程中不会从第三方 CDN 或接口加载资源。

### 随仓库提供的数据

Hive Words 与 Typing Rain 使用由 **SCOWL / English Speller Database** 生成的美式英语词库。本站词库从 LibreOffice `en_US` Hunspell 2020.12.07 版提取，只保留 3–10 个小写英文字母组成的词条。

- [SCOWL / ESDB 项目](https://github.com/en-wl/wordlist)
- 版权所有 © 2000–2018 Kevin Atkinson 及贡献者
- 允许在保留版权与许可说明的前提下使用、复制、修改和分发

### 实现参考

部分经典玩法参考了开源项目的规则、边界条件与测试案例，包括 Chromium 恐龙跑酷、2048、sudoku.js、chess.js、xiangqi.js、JSMinesweeper 和 Nonogram。当前游戏实现没有在运行时加载这些项目，也没有直接复制其美术资源。

完整来源、项目地址和授权说明见仓库中的 `THIRD_PARTY_NOTICES.md`。
