import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseQuotes, shortQuotes, spoken, clipName } from '../tools/render-quote-audio.mjs';

const yaml = `# comment
prose_quotes:
  - content: "一句“引文”，带\\"引号\\"。"
    author: "甲"
    source: "书"
    thoughts: "想法"
  - content: "另一句。"
    author: "乙"

poetry_and_passages:
  - content: |
      第一行
      第二行

      第三行
    author: "丙"
    is_poem: true
    thoughts: "诗"
  - content: |
      只有一行
    author: "丁"

articles:
  - title: "文章"
    excerpt: "摘要"
`;

test('the quotes file is read: quoted values, block values, flags, and the lists in it', () => {
    const lists = parseQuotes(yaml);
    assert.deepEqual(Object.keys(lists), ['prose_quotes', 'poetry_and_passages', 'articles']);
    assert.equal(lists.prose_quotes[0].content, '一句“引文”，带"引号"。'); assert.equal(lists.prose_quotes[0].thoughts, '想法'); assert.equal(lists.prose_quotes.length, 2);
    assert.equal(lists.poetry_and_passages[0].content, '第一行\n第二行\n\n第三行\n'); assert.equal(lists.poetry_and_passages[0].is_poem, true);
    assert.equal(lists.poetry_and_passages[1].content, '只有一行\n');
    assert.equal(lists.articles[0].title, '文章');
});

test('the spoken text and the file name do not depend on how white space is written', () => {
    assert.equal(spoken('第一行\n第二行\n\n第三行\n'), '第一行 第二行 第三行'); assert.equal(spoken('  甲  乙 '), '甲 乙');
    assert.equal(clipName('第一行\n第二行'), clipName('第一行  第二行 ')); assert.notEqual(clipName('甲'), clipName('乙'));
    assert.equal(clipName('甲'), createHash('sha1').update('甲').digest('hex').slice(0, 10));
    assert.equal(spoken('全角　空格'), '全角　空格', 'a full-width space is not white space for Hugo, so it is kept');
});

test('only quotes up to the length limit are chosen, articles never', () => {
    const lists = parseQuotes(yaml);
    assert.deepEqual(shortQuotes(lists, 300).map(q => `${q.group}[${q.i}]`), ['prose_quotes[0]', 'prose_quotes[1]', 'poetry_and_passages[0]', 'poetry_and_passages[1]']);
    assert.deepEqual(shortQuotes(lists, 6).map(q => `${q.group}[${q.i}]`), ['prose_quotes[1]', 'poetry_and_passages[1]']);
});

test('every short quote of the real quotes file has its audio, and the index lists exactly those', async () => {
    const dir = new URL('../static/quotes/audio/', import.meta.url);
    let index;
    try { index = JSON.parse(await readFile(new URL('index.json', dir), 'utf8')); } catch { return; }   // none rendered
    assert.equal(index.version, 1);
    const lists = parseQuotes(await readFile(new URL('../data/quotes.yaml', import.meta.url), 'utf8'));
    const names = shortQuotes(lists, 300).map(q => clipName(q.content)).sort();
    assert.deepEqual(index.files, names, 'a quote changed since its audio was rendered; run tools/render-quote-audio.mjs');
    for (const name of names) { await access(new URL(`${name}.mp3`, dir)); const head = (await readFile(new URL(`${name}.mp3`, dir))).subarray(0, 3); assert.ok(head.toString('latin1') === 'ID3' || head[0] === 0xff, `${name}: not an mp3`); }
});
