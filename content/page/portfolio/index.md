---
title: "作品集"
slug: "portfolio"
description: "EvanWong 的作品：《宫廷理发师》（HeirCut），技术负责人 / 唯一程序。"
date: 2026-10-14T10:00:00+08:00
comments: false
toc: false
hideMeta: true
---

<div class="pf-hero">
<h2>《宫廷理发师》HeirCut</h2>
<div class="pf-hero__meta">
<span>技术负责人 / 唯一程序</span>
<span>2025.03 至今</span>
<span>Unity 6 · C#</span>
<span>6 人团队</span>
</div>
<p class="pf-hero__pitch">人类公主和兽人王大婚在即，玩家是宫廷里的理发师：给宾客剪、烫、染，再把他们说过的话「剪」下来、重新拼起来，改写公主乃至整个王国的命运。一款 2D 理发 + 换词的推理叙事游戏。</p>
<div class="pf-links">
<a class="pf-links__primary" href="https://store.steampowered.com/app/4268650/">Steam 商店页</a>
<a href="https://www.bilibili.com/video/BV1dkbDzoE9q/">演示视频</a>
<a href="/p/heircut-devlog-submit-guidance/">开发手记（11 篇）</a>
<a href="/resume/">简历</a>
</div>
</div>

<div class="pf-media">
<figure><img src="/p/heircut-devlog-cuttable-hair/cut.gif" alt="游戏中给公主剪发：白色轨迹划过长发，轨迹以下的头发被剪断" loading="lazy"><figcaption>可以沿任意曲线剪开的 2D 头发</figcaption></figure>
<figure><img src="/p/heircut-devlog-content-editor/editor-flow.jpg" alt="策划编辑器：一个客人组的流程图，节点是演出，边是规则" loading="lazy"><figcaption>给策划用的剧情编辑器</figcaption></figure>
<figure><img src="/p/heircut-devlog-notebook-layout/notebook-tool.jpg" alt="笔记本摆放工具：美术在浏览器里调参数、对比方案、拖动词语" loading="lazy"><figcaption>给美术用的笔记本摆放工具</figcaption></figure>
</div>

## 获奖

- 第五届 CUSGA 中国大学生游戏开发大赛 **最佳剧情设计奖**
- 第十七届厦门国际动漫节「金海豚奖」**最佳学生游戏奖**
- 2026「指尖星图」游戏创新大赛 叙事与沉浸体验赛道 **优胜奖**
- 2025 Unity 中国开发挑战赛 PC 端游戏赛道 决赛入围
- 2025 IGN 中国单机游戏年度评选「年度课外作业」入围
- 2026 开拓芯大学生游戏创作大赛 / 网易高校 MINI-GAME 决赛入围

## 我负责的

团队为 GameJam 组建，六个人：两位策划、两位美术、一位音效，程序由我一个人负责。玩法方向由主策划定，细节一起讨论；程序侧的架构、系统、工具链和验证都由我负责，后半程与 AI 编程助手协作完成了大部分实现。

## 技术亮点

每一项都有一篇开发手记，记录它是怎么做出来的、走过哪些弯路。

<div class="pf-cards">
<a class="pf-card" href="/p/heircut-devlog-cuttable-hair/"><strong>可以剪的 2D 头发</strong><span>头发是多边形拓扑，剪刀轨迹膨胀成带子做布尔差集（Clipper2），Poly2Tri 三角化；评分从 IoU 演进为「剪得对不对 × 形状像不像」的软最小值。</span><em>开发手记（二）→</em></a>
<a class="pf-card" href="/p/heircut-devlog-encounter-refactor/"><strong>剧情系统重构</strong><span>把膨胀到 14 个剧情专属状态的角色状态机，换成内容驱动、不依赖 Unity 的纯逻辑架构；新旧并行，游戏全程可玩，9 组客人逐组迁移。</span><em>开发手记（三）→</em></a>
<a class="pf-card" href="/p/heircut-devlog-content-editor/"><strong>内容管线与策划编辑器</strong><span>剧情从表格换成 JSON，编译后经 103 种诊断校验；React Flow 编辑器让策划自己编辑、试玩、导出内容包，Unity 端一键导入并可回滚。</span><em>开发手记（六）→</em></a>
<a class="pf-card" href="/p/heircut-devlog-playthrough-automation/"><strong>整局自动化</strong><span>离线推演器穷举整局（5 个结局、113 条规则、303 句可达台词），实机机器人走真实射线从新游戏玩到结局；两者互相纠错。</span><em>开发手记（八）→</em></a>
<a class="pf-card" href="/p/heircut-devlog-save-system/"><strong>存档到对话中的某一句</strong><span>从「第几天第几组」到恢复会面中途状态；继续与回溯两条语义分离，快照随主档一次原子写盘。</span><em>开发手记（七）→</em></a>
<a class="pf-card" href="/p/heircut-devlog-size-and-performance/"><strong>包体 2.2 GB → 860 MB</strong><span>定位到透明画布占满贴图预算，用 Sprite Atlas 解决；首次进场景 1.7 秒卡顿定位到一轨音频解压；加导入守卫与测试防回归。</span><em>开发手记（十）→</em></a>
</div>

另外几篇：[理发什么时候算剪完了]({{< relref "post/HeirCut/01-理发什么时候算剪完了/index.md" >}}) · [换词机制]({{< relref "post/HeirCut/04-把客人说的话剪下来/index.md" >}}) · [笔记本词语摆放]({{< relref "post/HeirCut/05-笔记本里的词怎么摆/index.md" >}}) · [验证陷阱]({{< relref "post/HeirCut/09-看起来在验证/index.md" >}}) · [和 AI 一起做游戏]({{< relref "post/HeirCut/11-和AI一起做游戏/index.md" >}})

## 技术栈

<ul class="pf-tags">
<li>Unity 6</li><li>C#</li><li>Clipper2</li><li>Poly2Tri</li><li>DOTween</li><li>Spine</li><li>Addressables</li><li>NUnit / EditMode 测试</li><li>.NET 命令行工具</li><li>React + TypeScript</li><li>React Flow</li><li>Python</li><li>Git / Plastic SCM</li><li>Claude Code / Codex</li>
</ul>

## 团队

策划：尽欢、陈2333 · 美术：Nya、勺（主美） · 音效：肉丸 · 程序：hushh（我）

团队名「闭嘴！理发」。
