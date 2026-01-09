---
title: "Reading Notes of Introduction to GAME DESIGN, PROTOTYPING, and DEVELOPMENT, Chapter 3"
date: 2024-06-03
image: "cover.png"
tags: ["ReadingNote", "读书笔记", "Game Analysis Framework", "游戏分析框架"]
categories: ["游戏设计"]
series: ["Reading Notes of Introduction to GAME DESIGN, PROTOTYPING, and DEVELOPMENT"] 
---

## Chapter 3 The Layered Tetrad

> *分层四元法帮助你分析你爱的游戏，并且帮助能能够以一个总体的视角去看待你的游戏，让你不仅是了解游戏的机制，更包括他们的游玩的含义、社会属性、意义和文化的实现。*

​	分层四元法是前面所提的三个框架的理念的拓展和组合。分层四元法并不定义什么是游戏，而是一个帮助你理解所有制作游戏需要设计的不同元素，和它们在游戏内外的意义。

​	分层四元法由 Schell 的四元法中的四个元素组成，但这些元素通过三个层次来体验。

​	前两个为**内嵌层** (*inscribed*) 和**动态层** (*dynamic*) ，基于 Fullerton 的形式元素 (formal elements) 和动态元素 (dynamic elements) 来划分。第三个是**文化层** (*culture*)，涵盖了游戏的生命 (game's life) 和游玩之外的影响，还提供了链接游戏和文化的纽带，这对我们成为有意义的艺术创作者和负责人的游戏设计师极其重要。

​	本章会简短描述每一层，后面章节会细讲。

### The Inscribed Layer

​	这层与Schell的四元法极其相似，定义也十分相似，但是它们被限制只存在于游戏未被游玩时游戏层面。 

![img](https://picx.zhimg.com/80/v2-4ba0410d18e1d9d616bdebe69410740e_1440w.png?source=ccfced1a)

> 内嵌层

- **Mechanics**

  ​	内嵌系统 (inscribed system) 定义了玩家和游戏如何交互的。

  ​	这包括游戏的规则和 Fullerton 的形式元素：玩家交互模式、目标、资源、边界等。

- **Aesthetics**

  ​	内嵌美学 (inscribed aesthetics) 描述了游戏看起来如何、听起来如何、闻起来如何、尝起来如何和感觉起来如何（how the game looks, sounds, smells, tastes, and feels）。实际上这和 Schell 的定义相同。

- **Technology**

  ​	也和 Schell 的一样！

- **Narrative**

  ​	 Schell 在他的四元法中用了 *story* 这个术语，但分层四元法采用 *narrative* 这个更广泛的术语来表示，与 Fullerton 的用法类似，涵盖了前提、角色和情节。内在叙事（inscribed narrative）包括所有游戏中的预设剧本故事（pre-scripted story）和预设角色（pre-generated characters）。

### The Dynamic Layer

​	正如 Fullerton 的书 *Game Design Workshop* 和 MDA 框架所描述的，动态层在游玩过程中涌现。

![img](https://picx.zhimg.com/80/v2-48fc0d573133edb1f782fcbb97e9650d_1440w.png?source=ccfced1a)

> 内嵌层 + 动态层
>
> *通过游玩游戏，玩家从内嵌层中生成动态层。*

​	正如图中所示，玩家从静态的内嵌层（inscribed layer）中构建出动态层（dynamic layer）。动态层中的一切都通过游玩产生，并且动态层由玩家直接控制的元素和玩家和内嵌层元素产生的交互一同构成。动态层是涌现（**emergence**）的领域，即从看似简单的规则中产生复杂的行为的现象。游戏的涌现行为通常很难预测，但是你将会反复构建的一个游戏设计中的强大技能就是去预测涌现行为的能力，或者至少做出相当不错的猜测。

动态层中的四个动态元素是：

- **Mechanics**

  ​	内嵌机制涵盖了规则、目标等，而动态机制则是玩家如何与内嵌元素交互。

  ​	动态机制包括过程（*procedure*）、策略（*strategies*）、涌现游戏行为（*emergent game behavior*），最终包括游戏的结果（*the outcome of the game*）。

- **Aesthetics**

  ​	动态美学涵盖了在游戏过程中为玩家生成美学元素的方式（the way that aesthetic elements are generated for the player during play）。

  ​	这包括从程序艺术（procedural art，从给的定义看不是process art而更像生成式艺术generative art，由计算机代码即时生成的数字游戏艺术或者音乐）到身体负担比如长时间反复按按钮（比如你可能听过“任天堂拇指，nintendo thumb”）。 *不是？真要把physical strain算作aesthetics吗？*

- **Technology**

  ​	动态技术描述了游戏的技术组件在游玩时的行为。

  ​	这包括了一对骰子实际上似乎从不产生数学概率预测的平滑钟曲线的结果（意思是并不一定服从正态分布？），还涵盖了数字游戏中的计算机代码所做的几乎所有事情。这方面的一个具体例子可能是游戏中敌人的AI代码的性能，但是从更广泛的意义上说，动态技术绝对涵盖了数字游戏的代码在游戏运行时所做的一切。

- **Narrative**

  ​	动态叙事指代的是从游戏系统中过程性地/程序性地（procedurally）涌现的故事。这可以意味着一个玩家分支剧情叙事的路径。

### The Culture Layer

​	文化层描述了超越游玩之外的游戏，涵盖了游戏和文化之间的相互影响。

​	游戏的玩家社区产生了文化层，在这里，玩家的控制比游戏设计师更强，而设计师的社会责任在这里清晰起来。

![img](https://picx.zhimg.com/80/v2-b13b74750a8bd4e4a7a120da04ae18d6_1440w.png?source=ccfced1a)

> *玩家社区和社会的碰撞产生了文化层*

​	在文化层中四个元素之间更加模糊，但是仍值得从四个元素的角度来解读。

- **Mechanics**

  ​	文化层机制的最简单的呈现就是游戏 mod，也涵盖了复杂如游戏的涌现游玩 (emergent play) 对社会的影响。

- **Aesthetics**

  ​	与机制类似，文化层的美学涵盖了同人作品、游戏音乐的 remix 或者其他的美学上的粉丝行为如 cosplay。

  ​	很重要的一点是*授权了的*跨媒体产品*不属于*文化层，因为它们的控制者仍是游戏知识产权的所有者，而文化层的美学是由游戏玩家社区所控制的。

- **Technology**

  ​	文化层技术涵盖了非游戏目的的游戏技术的使用和能够影响游戏体验的技术。

  ​	文化层技术还涵盖了游戏的可能性的拓展（the expansion of possibilities of what *game* can mean by continually expanding the possibility space of gaming）以及玩家使用 mod 修改游戏内嵌元素的技术方面。

- **Narrative**

  ​	文化层叙事涵盖了同人跨媒体作品的叙事方面，也包括文化和社会中关于游戏的故事，比如对 GTA 的恶评和对风之旅人或 Ico 的美谈。

### The Responsibility of the Designer

​	所有设计师都明白他们对游戏内嵌层的责任。很明显，游戏开发必须具有清晰的规则、有趣的美术等鼓励玩家进行游戏。

​	到了动态层，设计师们就更不清楚（muddier）自己的责任了。游戏设计师会惊叹于他们的游戏的涌现并且想把该行为的责任推卸给玩家，但其实设计师仍要对玩家在动态层于设计师设计的系统的影响中的体验（the experiences of players at the dynamic layer through the implications of the systems they designed）负责。事实上，游戏设计最重要的一方面就是预测并打造动态层体验。这当然是个很艰难的任务，但也正是它有趣的部分原因。

​	那么，设计师在文化层上的责任是什么呢？简短来说，你要对你的游戏产生的社会影响和对玩家造成的影响负责，我们有责任通过游戏促进亲社会和thoughtful的行为，并且尊重玩家以及他们花费在体验我们所创造的上的时间，而不是损坏游戏在社会上的形象，如诱骗小孩充巨资（书上就有，不是我影射某公司）。
