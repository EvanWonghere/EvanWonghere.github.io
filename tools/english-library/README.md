# 英语朗读室文库：作品 spec

`static/english/library/` 是生成物，不要手改。它由本目录的 `specs/<id>.json` 加上下载的原文，经 `tools/import-english-text.mjs` 生成。

```sh
node tools/import-english-text.mjs fetch --cache <dir> [id…]       # 下载原文到 <dir>（需要联网，可能要重试）
node tools/import-english-text.mjs build --cache <dir> --show id…  # 只检查并打印指定作品，不写文件
node tools/import-english-text.mjs build --cache <dir>             # 全部通过后写入 static/english/library/
```

## spec 字段

| 字段 | 说明 |
|---|---|
| `id` | 与文件名相同，小写字母、数字、连字符。发布后永不改变（历史记录靠它对应）。 |
| `kind` | `poem` `prose` `speech` `fiction` `letter` `lesson` |
| `title` `author` `year` | 英文标题、作者（译本写 `作者, tr. 译者`）、写作或出版年份 |
| `level` | `A2` `B1` `B2` `C1`，按词汇和句式难度判断 |
| `firstPublished` `authorDied` | 版权依据。必须同时满足：美国 1930 年或之前出版（或美国政府作品，`usGovWork: true`），且作者（有译者时取较晚者，`translated: true`）去世年份 ≤ 1975。不满足时 build 会失败。 |
| `source` | `{type:"wikisource", title}` 或 `{type:"gutenberg", id}`；可加 `from` / `to`，只取从 `from` 开头到 `to` 结尾的一段。原创课文用 `{type:"original"}`，并写 `segments` 数组。 |
| `intro` | 中文导读，100–200 字，只写确定的事实 |
| `tips` | 0–3 条朗读提示，每条一句中文 |
| `glossary` | `{ "单词": "中文释义" }`，单词必须是原文里出现的小写词 |

`from` / `to` 作用在“清洗后”的文本上（弯引号变直引号，段内换行并成空格）。每个标记请取原文同一行内的一小段（约 20–60 个字符），并确保它是唯一的。

## 规则

- 原文由工具切出，不手打、不改写、不补全。要改文本，只能改 `from` / `to`。
- 每段不超过 40 个词（约 20–24 秒；录音上限 25 秒，评分上限 30 秒）。工具自动分段。
- 导读、提示、释义是我们自己写的，不得照抄维基百科或其他网站。拿不准的事实就不写。
- 不收录有版权的作品。拿不准的作品不收。
