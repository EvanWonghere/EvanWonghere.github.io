# 真人朗读录音的出处

这些 mp3 来自 [LibriVox](https://librivox.org/) 志愿者的朗读，LibriVox 把录音释放到公有领域，不需要许可或署名；这里仍然写明出处，页面上也会显示。
录音取自 archive.org 上的 64 kbps mp3，未改动。录音用的文本版本可能和站内文字略有出入。

| 文件 | 作品 | 来源条目 | 轨道 |
|---|---|---|---|
| `blake-the-tyger.mp3` | The Tyger | [Short Poetry Collection 164](https://archive.org/details/spc164_1702_librivox) | 25 - The Tyger |
| `dickinson-hope.mp3` | "Hope" is the thing with feathers | [Short Poetry Collection 119](https://archive.org/details/shortpoetry119_1305_librivox) | Hope is the thing with feathers |
| `frost-road-not-taken.mp3` | The Road Not Taken | [Short Poetry Collection 123](https://archive.org/details/shortpoetry123_1309_librivox) | 15 - The Road Not Taken |
| `frost-stopping-by-woods.mp3` | Stopping by Woods on a Snowy Evening | [New Hampshire - A Poem with Notes and Grace Notes](https://archive.org/details/newhampshire_1902_librivox) | 24 - Stopping by Woods on a Snowy Evening |
| `henley-invictus.mp3` | Invictus | [Short Poetry Collection 174](https://archive.org/details/spc174_1712_librivox) | 14 - Invictus |
| `keats-to-autumn.mp3` | To Autumn | [Ode to Autumn](https://archive.org/details/odetoautumn_0711_librivox) | Ode to Autumn - Read by CJRG |
| `kipling-if.mp3` | If— | [If](https://archive.org/details/if_kipling_librivox) | If - Read by CE |
| `lincoln-gettysburg-address.mp3` | The Gettysburg Address | [Gettysburg Address](https://archive.org/details/gettysburg_johng_librivox) | Gettysburg Address |
| `rossetti-remember.mp3` | Remember | [Sonnets](https://archive.org/details/sonnets_rossetti_2307_librivox) | 13 - Remember |
| `shakespeare-sonnet-18.mp3` | Sonnet 18 | [Sonnet 18](https://archive.org/details/sonnet_18_1604.poem_librivox) | 01 - Sonnet 18 - Read by ALP |
| `tennyson-crossing-the-bar.mp3` | Crossing the Bar | [Short Poetry Collection 184](https://archive.org/details/spc184_1810_librivox) | 08 - Crossing the Bar |
| `wordsworth-daffodils.mp3` | I Wandered Lonely as a Cloud | [I Wandered Lonely As a Cloud](https://archive.org/details/wandered_lonely_as_a_cloud_librivox) | I Wandered Lonely as a Cloud - Read by DJS |
| `yeats-innisfree.mp3` | The Lake Isle of Innisfree | [Short Poetry Collection 137](https://archive.org/details/spc137_1411_librivox) | 11 - The Lake Isle of Innisfree |

新增或替换录音：把文件放进本目录，在对应的 `tools/english-library/specs/<id>.json` 里写 `human`（`item`、`itemTitle`、`track`、`seconds`），再运行 `node tools/import-english-text.mjs build --cache <dir>`。
