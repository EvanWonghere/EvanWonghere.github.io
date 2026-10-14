---
title: "简历"
slug: "resume"
description: "黄昱峰（EvanWong）：游戏客户端开发，Unity 方向。"
date: 2026-10-14T10:00:00+08:00
comments: false
toc: false
hideMeta: true
---

<div class="pf-hero">
<h2>黄昱峰（EvanWong）</h2>
<div class="pf-hero__meta">
<span>求职意向：游戏客户端开发（Unity 方向）</span>
</div>
<div class="pf-links">
<a class="pf-links__primary" href="mailto:yufenghuang009@gmail.com">yufenghuang009@gmail.com</a>
<a href="https://github.com/EvanWonghere">GitHub</a>
<a href="/portfolio/">作品集</a>
</div>
</div>

## 教育背景

<div class="cv-row"><strong>山东师范大学 · 计算机科学与技术</strong><span>2022.09 – 2026.07</span></div>

主修课程：高等数学、线性代数、概率论、数据结构与算法、人工智能导论、C++。语言能力：CET-6。

## 项目经历

<div class="cv-row"><strong>《宫廷理发师》HeirCut</strong><span>技术负责人 / 唯一程序 · 2025.03 至今</span></div>

[作品集](/portfolio/) · [开发手记]({{< relref "post/HeirCut/01-理发什么时候算剪完了/index.md" >}}) · [演示视频](https://www.bilibili.com/video/BV1dkbDzoE9q/) · [Steam](https://store.steampowered.com/app/4268650/)

项目成果：第五届 CUSGA 中国大学生游戏开发大赛**最佳剧情设计奖**；第十七届厦门国际动漫节「金海豚奖」**最佳学生游戏奖**；2026「指尖星图」游戏创新大赛叙事与沉浸体验赛道**优胜奖**；2025 Unity 中国开发挑战赛 PC 端游戏赛道决赛入围；2025 IGN 中国单机游戏年度评选「年度课外作业」入围奖；2026 开拓芯大学生游戏创作大赛 / 网易高校 MINI-GAME 决赛入围。

- **设计并实现统一的数据驱动剧情框架**：将 9 组客人的独立状态机迁移至统一流程；进出场、对话推进、条件分支与结算均由脱离 Unity API 的纯逻辑层执行，场景层仅负责表现与输入。配套 600+ 项自动化测试，支持无需启动游戏场景即可验证完整剧情逻辑。
- **搭建剧情内容编译与验证管线**：将客人顺序、台词、线索、关键词填空及结局条件结构化配置，并编译为运行时内容库；当前覆盖约 316 句台词、113 条分支规则。在进入引擎前自动执行一致性检查、结局可达性分析与不可达内容检测，并可整局推演 5 个结局。
- **开发剧情节点图编辑器**：支持可视化编排每日客人顺序、对话节点、关键词槽位、剪发要求及道具配置；保存时自动格式化数据并触发内容校验与剧情推演，错误可直接定位至对应节点，降低手工编辑配置与运行游戏排查剧情分支的成本。
- **独立实现实时 2D 剪发系统**：将玩家划线与头发轮廓通过 Clipper2 进行多边形布尔运算，并使用 Poly2Tri 重新三角化生成运行时 Mesh 与 Collider；剪落区域生成 2D 刚体碎发，并通过对象池与运行时网格回收控制动态生成带来的性能开销。
- **实现游戏存档、对话断点恢复与画面适配**：将主线进度与当前对话运行时状态原子化保存，支持中途继续及回溯重玩时的状态重置与发型恢复；同时完成 16:9 安全画幅、相机取景及 UI Safe Area 适配。

<div class="cv-row"><strong>《心声桌宠》</strong><span>合作开发 / 主要程序 · 2024.02 – 2025.04</span></div>

[项目展示](https://www.bilibili.com/video/BV1np5yzjEuD/)

项目成果：心理学创新创业论坛产品设计赛道**全国一等奖**；已登记计算机软件著作权、完成 ICP 备案、完成 TapTap 上架。

- **桌宠状态与交互架构**：基于 WindowManager 实现系统级悬浮宠物，手写轻量级 FSM 管理 10+ 行为状态，统一驱动动画切换、菜单交互、对话气泡与养成属性反馈。
- **动画资源与实时性能优化**：封装逐帧动画加载器，支持内置 / 自定义角色资源、异步加载、缓存清理、左右朝向翻转复用与过渡动画回退；接入 Choreographer 对齐 VSync，并对重力传感器输入进行采样节流、插值与边界限制，提升拖拽 / 漂浮反馈流畅度。
- **AI 交互与上线合规接入**：使用 OkHttp + Gson 异步调用大模型 API，结合悬浮输入框与角色化对白实现沉浸式对话；独立完成 TapTap 登录、防沉迷回调、剩余时长倒计时、强制退出及隐私协议持久化等上架合规流程。

## 实践经历

<div class="cv-row"><strong>山东师范大学机器人与人工智能实验室</strong><span>技术负责人 · 2022.09 – 2024.09</span></div>

- **搭建实验室官网与 CI/CD 流程**：负责实验室网站建设，并基于 GitHub Actions 配置自动化构建与部署，实现网站内容更新后的自动发布。
- **主导 GitHub 协作体系建设**：建立实验室 GitHub 账号与比赛项目仓库规范，制定仓库结构、分支策略、提交规范、代码风格与工作流，提升团队代码管理和项目交接效率。

## 荣誉与奖项

- 2024 年 高教社杯全国大学生数学建模大赛 **全国二等奖**
- 2024 年 ASC 世界大学生超级计算机竞赛 **预赛二等奖**
- 第二十五届中国机器人及人工智能大赛决赛 仿人短跑组 **全国一等奖**
- 2023 年 全国机器人科技创新交流营暨机器人大赛终审决赛 **全国二等奖**
- 2023 年度 山东师范大学 **竞赛优秀学生**
- 山东师范大学 2022–2023 学年 **一等奖学金**

## 技能

- **技术能力**：熟练使用 Unity（UGUI / Animator / Addressables / ScriptableObject），熟悉生命周期、协程、2D 物理系统、资源加载与运行时数据管理。
- **编程语言**：熟悉 C#、C++、C、Python，掌握 Java、Kotlin。
- **工程工具**：熟悉 Git、Plastic SCM 协作流程以及 GitHub Actions CI/CD、常用设计模式；熟悉使用 Claude Code、Codex、Cursor 等 Coding Agent 辅助开发。
