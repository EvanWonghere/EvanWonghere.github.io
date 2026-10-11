import test from 'node:test';
import assert from 'node:assert/strict';
import { hasCJK, protectInline, restoreInline, classifyLines, splitFrontMatter, frontMatterPlan, structure, sameStructure, translatePost, makeTranslator } from '../tools/translate-posts.mjs';

// A stand-in translator: keeps the tags and placeholders, and turns the Chinese text into "EN(...)".
const fake = async texts => texts.map(html => html.replace(/([㐀-鿿][^<⟦]*)/g, m => `EN(${m.length})`));

test('Chinese is recognised, English and symbols are not', () => {
    assert.ok(hasCJK('你好 world')); assert.ok(!hasCJK('Hello, world! 123 `代码` '.replace('代码', 'code')));
});

test('protected pieces and markup survive a round trip through the translator format', () => {
    const line = '使用 `git rebase -i` 修改**重要的**提交，参见[文档](https://git-scm.com/docs "x")和 ![图](a.png)，公式 \\(a<b\\) 与 $$x$$，*斜体* https://example.com/a?b=1&c=2';
    const { html, tokens } = protectInline(line);
    assert.ok(!html.includes('`') && !html.includes('git-scm'), 'code and addresses are not visible to the translator');
    assert.match(html, /<b>重要的<\/b>/); assert.match(html, /<i>斜体<\/i>/); assert.match(html, /<a href="⟦\d+⟧">文档<\/a>/);
    assert.equal(restoreInline(html, tokens), line, 'nothing changes when nothing is translated');
    // text with a < or & in it is escaped for the translator and restored
    const t = protectInline('比较 a < b & c > d');
    assert.match(t.html, /a &lt; b &amp; c &gt; d/); assert.equal(restoreInline(t.html, t.tokens), '比较 a < b & c > d');
});

test('the alternative text of an image is translated and its address is not', () => {
    const { html, tokens } = protectInline('见 ![终端运行 git remote](remote.png) 图');
    assert.match(html, /终端运行 git remote/); assert.ok(!html.includes('remote.png'));
    assert.equal(restoreInline(html.replace('终端运行 git remote', 'Terminal running git remote'), tokens), '见![Terminal running git remote](remote.png)图'.replace('见!', '见 !').replace(')图', ') 图'));
    const empty = protectInline('![](a.png)');
    assert.equal(restoreInline(empty.html, empty.tokens), '![](a.png)');
});

test('a translation that loses or invents a placeholder, or leaves a stray tag, is refused', () => {
    const { html, tokens } = protectInline('看 `a` 和 `b`');
    assert.equal(restoreInline(html.replace(/<span class="notranslate">⟦1⟧<\/span>/, ''), tokens), null, 'a lost placeholder');
    assert.equal(restoreInline(`${html}<span class="notranslate">⟦9⟧</span>`, tokens), null, 'an invented placeholder');
    assert.equal(restoreInline(`${html}<font color="red">x</font>`, tokens), null, 'a tag the translator added');
    assert.equal(restoreInline(html.replace('⟦0⟧', '⟦0⟧⟦0⟧'), tokens), null, 'a placeholder twice');
});

test('only prose lines are sent: code, formulas, tables, HTML, rules and English lines are kept', () => {
    const body = ['# 标题', '', '正文 **粗体**', '```cpp', '// 注释里的中文', 'int x;', '```', '$$', '公式 中文', '$$', '| 列 | 值 |', '<div>中文</div>', '---', '- 列表项', '  1. 编号项', '> 引用一', 'English only line', '[a]: http://x.y/中文', '正文结束  '].join('\n');
    const lines = classifyLines(body);
    const sent = lines.filter(l => l.translate).map(l => `${l.translate.prefix}|${l.translate.content}|${JSON.stringify(l.translate.tail)}`);
    assert.deepEqual(sent, ['# |标题|""', '|正文 **粗体**|""', '- |列表项|""', '  1. |编号项|""', '> |引用一|""', '|正文结束|"  "']);
    assert.equal(lines.length, 19);
});

test('inline code that touched Chinese text gets spaces around it in English', () => {
    const { html, tokens } = protectInline('使用`Ctrl`打开');
    assert.equal(restoreInline(html.replace('使用', 'Use').replace('打开', 'to open'), tokens), 'Use `Ctrl` to open');
    assert.equal(restoreInline(html.replace('使用', 'Use ').replace('打开', ' to open'), tokens), 'Use `Ctrl` to open', 'no double spaces');
    assert.equal(restoreInline(protectInline('`a`').html, protectInline('`a`').tokens), '`a`');
});

test('a code fence inside a quote hides its lines from translation', () => {
    const lines = classifyLines(['> ```c#', '> // 中文注释', '> ```', '> 引用正文'].join('\n'));
    assert.deepEqual(lines.map(l => Boolean(l.translate)), [false, false, false, true]);
});

test('a zero-width space and a tab before a list marker are kept in the prefix', () => {
    const [line] = classifyLines('\u200b\t1. 创建一个文件夹');
    assert.deepEqual(line.translate, { prefix: '\u200b\t1. ', content: '创建一个文件夹', tail: '' });
});

test('front matter: the strings to translate, and the rewritten block is a draft', () => {
    const front = ['title: "实验室 C++ 课程"', 'date: 2023-10-22', 'description: "这是课件"', 'image: "cover.png"', 'tags: ["C++", "学习笔记"]', 'categories: ["学习笔记"]', 'series: ["实验室课程"] ', 'draft: false', 'math: true'].join('\n');
    const plan = frontMatterPlan(front);
    assert.deepEqual(plan.strings, ['实验室 C++ 课程', '这是课件', '学习笔记', '实验室课程']);
    const out = plan.rewrite(new Map([['实验室 C++ 课程', 'Lab C++ Course'], ['这是课件', 'These are slides'], ['学习笔记', 'Study notes'], ['实验室课程', 'Lab courses']])).split('\n');
    assert.deepEqual(out, ['title: "Lab C++ Course"', 'date: 2023-10-22', 'description: "These are slides"', 'image: "cover.png"', 'tags: ["C++","Study notes"]', 'categories: ["Study notes"]', 'series: ["Lab courses"]', 'draft: true', 'math: true']);
    assert.ok(frontMatterPlan('title: "x"').rewrite(new Map()).endsWith('draft: true'), 'a draft flag is added when there is none');
    assert.deepEqual(splitFrontMatter('no front matter\ntext'), { front: '', body: 'no front matter\ntext', has: false });
});

test('a post is translated line by line, with the same structure and as a draft', async () => {
    const post = ['---', 'title: "测试文章"', 'tags: ["学习笔记"]', 'draft: false', '---', '# 一级标题', '', '这是 `code` 和[链接](http://a.b)。', '', '```py', 'print("中文")', '```', '', '- 项目一', '- Item two', '![](pic.png)', '$$', 'x^2', '$$', ''].join('\n');
    const terms = new Map();
    const result = await translatePost(post, { translate: fake, terms });
    assert.ok(result.ok); assert.equal(result.sent, 3);
    assert.match(result.text, /^---\ntitle: "EN\(4\)"\ntags: \["EN\(4\)"\]\ndraft: true\n---\n# EN\(4\)/);
    assert.match(result.text, /print\("中文"\)/, 'code is untouched'); assert.match(result.text, /\[EN\(2\)\]\(http:\/\/a\.b\)/, 'the link address is kept'); assert.match(result.text, /- EN\(3\)\n- Item two/);
    assert.ok(sameStructure(post.split('---\n')[2], result.text.split('---\n')[2]));
    assert.equal(terms.get('学习笔记'), 'EN(4)', 'the same tag is translated once for every post');
});

test('a translation that changes the structure is not accepted', async () => {
    const post = '## 标题\n\n正文一\n\n正文二\n';
    const adds = async texts => texts.map(t => `${t}\n## extra`);   // the translator invents a line
    const result = await translatePost(post, { translate: adds });
    assert.equal(result.ok, true, 'the extra line is folded into the same line');
    const brokenLine = async texts => texts.map(t => t.startsWith('正文一') ? '```\nx\n```' : t);
    assert.equal((await translatePost(post, { translate: brokenLine })).ok, false, 'an invented code fence changes the structure, so the post is not written');
    // a line that came back unusable (a placeholder lost) stays in Chinese and is reported
    const lossy = async texts => texts.map(t => t.replace(/<span class="notranslate">⟦0⟧<\/span>/, ''));
    const kept = await translatePost('说 `a` 好\n', { translate: lossy });
    assert.deepEqual(kept.kept, [1]); assert.equal(kept.text, '说 `a` 好\n');
});

test('the same string is sent once, in batches', async () => {
    const calls = [];
    const translate = makeTranslator(async (route, body) => { calls.push(body.map(b => b.Text)); return body.map(b => ({ translations: [{ text: `E:${b.Text}` }] })); });
    assert.deepEqual(await translate(['甲', '乙', '甲']), ['E:甲', 'E:乙', 'E:甲']);
    assert.deepEqual(calls, [['甲', '乙']]);
    assert.deepEqual(await translate(['甲', '丙']), ['E:甲', 'E:丙']); assert.deepEqual(calls.at(-1), ['丙'], 'what was translated before is not sent again');
    const many = Array.from({ length: 95 }, (_, i) => `句${i}`);
    calls.length = 0; await translate(many); assert.deepEqual(calls.map(c => c.length), [40, 40, 15]);
    assert.equal(structure('a\n```\nb\n```\n').fences, 2);
});
