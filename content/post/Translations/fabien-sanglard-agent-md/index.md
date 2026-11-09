---
title: "Fabien Sanglard 如何用 agent.md 改进 AI 生成的代码"
date: 2026-11-09T00:00:00-08:00
slug: "fabien-sanglard-agent-md"
description: "把反复出现的代码审查意见写成项目规则，让下一次会话也能用上。"
categories: ["译介"]
tags: ["编程", "AI"]
toc: false
math: false
license: false
draft: false
---

**原作者** [Fabien Sanglard](https://fabiensanglard.net/) · **原文发布于** 2026 年 8 月 21 日

[阅读英文原文《My agent.md to improve LLM-assisted code quality》](https://fabiensanglard.net/agent.md/index.html)

Sanglard 在审查 AI 生成的代码时，发现自己在不同会话里反复提同样的意见。他把这些反馈写进项目的 `agent.md`，例如让修复从一个能复现问题的失败测试开始。这样一来，他可以把更多审查时间花在架构和设计上。

他也提到，长会话里模型有时会逐渐偏离已有规则。他的做法是为每个功能开一个短会话，或在发现偏离时请助手重新读取规则。

## `agent.md` 双语要点 {#agent-md-bilingual}

[阅读 Fabien Sanglard 的英文 `agent.md` 原文件](https://fabiensanglard.net/agent.md/agent.md)

### 中文要点

1. 注释、提交信息和回复直接说重点，省去夸张和恭维。
2. 把反复出现、有特定含义或由规范规定的值提取为命名常量或枚举。用提前返回和 `continue` 减少嵌套，单行 `if` 也加花括号。
3. 函数名少于 30 个字符。用枚举替代布尔开关参数，用空行分隔逻辑段，简短说明代码做什么、为什么这样做。
4. 成员默认私有，改为 `internal` 或 `public` 前先获明确同意。把底层操作封装起来，每层只调用紧邻的下一层。
5. 改动限于当前任务。修复前先写复现测试，看到它失败后再修，最后重跑确认通过。
6. 提交标题以大写字母开头，用祈使句，省略句号。目标 50 字符，上限 72。用空行分隔正文，正文按 72 字符折行，交代改了什么、为什么改。

### English summary

1. Get to the point in comments, commit messages, and replies. Skip superlatives and flattery.
2. Use named constants or enums for recurring, meaningful, or spec-defined values. Flatten nesting with early exits and `continue`. Brace even single-line `if` blocks.
3. Keep function names under 30 characters. Use enums for options passed as boolean flags. Separate logical blocks and briefly explain their purpose and rationale.
4. Default to private members and get explicit approval before making them `internal` or `public`. Encapsulate low-level operations and call only the layer directly below.
5. Limit edits to the task. For a bug, reproduce it with a failing test, make the fix, then rerun the test.
6. Use a capitalized, imperative commit subject without a period. Aim for 50 characters and cap it at 72. After a blank line, explain what changed and why, wrapping at 72.
