import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { glossKey, checkGloss, unitZh, segmentZh, wordHelp, sensesLine, loadGloss, loadDictionary } from '../static/english/gloss.mjs';
import { parseAlignment, alignedRanges, contextSense, senses, buildGloss, distinctWords } from '../tools/render-english-gloss.mjs';
import { workTextHash } from '../static/english/library.mjs';

const work = { id: 'demo', kind: 'speech', segments: [{ id: 's1', text: 'I will arise. Clay and wattles made.' }, { id: 's2', text: 'Seven eight.' }] };
const gloss = () => ({ version: 1, id: 'demo', textHash: workTextHash(work), engine: 'Azure Translator', segments: [
    [{ zh: '我要起身。', w: ['我', '', '起身'] }, { zh: '泥土和编条做成。', w: ['泥土', '和', '编条', ''] }],
    [{ zh: '七八。', w: ['七', '八'] }]] });

test('keys ignore case, curly quotes and edge punctuation', () => {
    assert.equal(glossKey('Lincoln’s'), "lincoln's"); assert.equal(glossKey('"Arise,"'), 'arise'); assert.equal(glossKey('Bean-rows'), 'bean-rows');
});

test('Translator alignment is parsed, and each word gets the stretches of Chinese aligned to it', () => {
    assert.deepEqual(parseAlignment('0:0-0:0 2:5-1:2 bad 7:9-3:4'), [{ s: [0, 0], t: [0, 0] }, { s: [2, 5], t: [1, 2] }, { s: [7, 9], t: [3, 4] }]);
    assert.deepEqual(parseAlignment(undefined), []);
    // "I will arise": I → 0, will → 1–2 and 4, arise → 5–6
    const ranges = alignedRanges('I will arise', '0:0-0:0 2:5-1:2 2:5-4:4 7:11-5:6');
    assert.deepEqual(ranges, [[[0, 0]], [[1, 2], [4, 4]], [[5, 6]]]);
    assert.deepEqual(alignedRanges('One two', '0:2-0:0'), [[[0, 0]], []], 'a word with nothing aligned has no stretches');
    // Touching stretches are joined.
    assert.deepEqual(alignedRanges('Big', '0:0-0:1 1:2-2:3'), [[[0, 3]]]);
});

test('the sense that the translation uses is found next to where the word was aligned, never elsewhere', () => {
    const zh = '我要起身，去伊尼斯弗里。起身很好。';
    const list = [['v.', '出现', '起身'], ['n.', '兴起']];
    assert.equal(contextSense(zh, [[2, 3]], list), '起身');                      // appears at 2–3, where the word was aligned
    assert.equal(contextSense(zh, [[0, 0]], list), '', 'the sense is further away than the aligned stretch');
    assert.equal(contextSense(zh, [[2, 3]], [['v.', '出现']]), '', 'a sense that is not in the translation');
    assert.equal(contextSense(zh, [[2, 3]], null), '');
    assert.equal(contextSense('他是个好学生', [[1, 2]], [['n.', '学生', '好学生']]), '好学生', 'the longest sense wins');
    assert.equal(contextSense('我是学生', [[0, 3]], [['n.', '我', '学生']], 2), '学生', 'a minimum length leaves out one-character senses');
});

test('a dictionary answer becomes at most three parts of speech with three senses each', () => {
    const answer = { translations: [
        { posTag: 'VERB', normalizedTarget: '出现' }, { posTag: 'VERB', normalizedTarget: '产生' }, { posTag: 'VERB', normalizedTarget: '出现' }, { posTag: 'VERB', normalizedTarget: '引起' }, { posTag: 'VERB', normalizedTarget: '起身' },
        { posTag: 'NOUN', normalizedTarget: '兴起' }, { posTag: 'ADJ', normalizedTarget: 'a' }, { posTag: 'ADV', normalizedTarget: 'b' }, { posTag: 'WEIRD', normalizedTarget: 'c' }] };
    assert.deepEqual(senses(answer), [['v.', '出现', '产生', '引起'], ['n.', '兴起'], ['adj.', 'a']]);
    assert.deepEqual(senses({ translations: [] }), []); assert.deepEqual(senses(undefined), []);
    assert.equal(sensesLine([['v.', '出现', '起身'], ['', '编条']]), 'v. 出现、起身；编条');
});

test('a work is glossed unit by unit, with the sense the translation uses, and corrections win', async () => {
    const asked = [];
    const translate = async texts => {
        asked.push(texts);
        return texts.map(text => ({ text: { 'I will arise.': '我要起身。', 'Clay and wattles made.': '泥土和肉桂做成。', 'Seven eight.': '七八。' }[text], alignment: { 'I will arise.': '0:0-0:0 2:5-1:2 7:11-2:3', 'Clay and wattles made.': '0:3-0:1 5:7-2:2 9:15-3:4', 'Seven eight.': '0:4-0:0 6:10-1:1' }[text] }));
    };
    const dictionary = { words: { arise: [['v.', '起身', '出现']], clay: [['n.', '泥土']], and: [['conj.', '和']], wattles: [['n.', '肉桂']] } };
    const built = await buildGloss({ work, translate, dictionary, overrides: { words: { wattles: '编条' }, units: { 'demo/0/1': '泥土和编条做成。' } } });
    assert.deepEqual(asked, [['I will arise.', 'Clay and wattles made.'], ['Seven eight.']]);
    assert.ok(checkGloss(built, work));
    assert.equal(built.segments[0][0].zh, '我要起身。'); assert.deepEqual(built.segments[0][0].w, ['', '', '起身']);
    assert.equal(built.segments[0][1].zh, '泥土和编条做成。', 'the corrected sentence');
    assert.deepEqual(built.segments[0][1].w, ['泥土', '', '编条', ''], 'a corrected sentence has no alignment: a sense of two or more characters counts if it is in the sentence; a word correction still applies');
    assert.equal(built.engine, 'Azure Translator'); assert.equal(built.textHash, workTextHash(work));
    await assert.rejects(buildGloss({ work, translate: async () => [] }), /1 units but 0 translations|2 units but 0 translations/);
});

test('a gloss is used only when it fits the text it was made from', () => {
    assert.ok(checkGloss(gloss(), work));
    const changed = { ...work, segments: [{ id: 's1', text: 'I will arise. Clay and wattles made!' }, work.segments[1]] };
    assert.equal(checkGloss(gloss(), changed), null, 'the text changed');
    assert.equal(checkGloss(null, work), null);
    for (const bad of [{ version: 2 }, { id: 'other' }, { segments: [] },
        { segments: [gloss().segments[0]] },                                                                // a segment missing
        { segments: [[gloss().segments[0][0]], gloss().segments[1]] },                                      // a unit missing
        { segments: [[{ zh: '我要起身。', w: ['我', ''] }, gloss().segments[0][1]], gloss().segments[1]] },  // too few words
        { segments: [[{ zh: '', w: ['我', '', '起身'] }, gloss().segments[0][1]], gloss().segments[1]] },    // no translation
        { segments: [[{ zh: '我要起身。', w: ['我', 3, '起身'] }, gloss().segments[0][1]], gloss().segments[1]] }]) {
        assert.equal(checkGloss({ ...gloss(), ...bad }, work), null, JSON.stringify(bad).slice(0, 70));
    }
});

test('what the page shows for a word', () => {
    const g = gloss(), dictionary = { words: { arise: [['v.', '起身']], wattles: [['', '编条']] } };
    assert.equal(unitZh(g, 0, 1), '泥土和编条做成。'); assert.equal(unitZh(g, 5, 0), ''); assert.equal(unitZh(null, 0, 0), '');
    assert.equal(segmentZh(g, 0), '我要起身。泥土和编条做成。'); assert.equal(segmentZh(g, 9), '');
    assert.deepEqual(wordHelp(g, dictionary, 0, 0, 2, 'arise.'), { here: '起身', senses: [['v.', '起身']] });
    assert.deepEqual(wordHelp(g, dictionary, 0, 1, 3, 'made'), { here: '', senses: null });
    assert.deepEqual(wordHelp(null, null, 0, 0, 0, 'I'), { here: '', senses: null });
});

test('distinct words are the dictionary keys of the text, lower case, without numbers and fragments', () => {
    assert.deepEqual(distinctWords([{ id: 'x', kind: 'speech', segments: [{ id: 's', text: 'Arise, arise! In 1864 “Mrs. Bixby’s” bean-rows.' }] }]), ['arise', 'bean-rows', 'bixby\'s', 'in', 'mrs']);
});

// loadGloss and loadDictionary fetch the index first, then the files it names.
test('the gloss and the dictionary load from the index, and a bad file is simply absent', async () => {
    const files = { 'gloss/index.json': JSON.stringify({ version: 1, works: { demo: { rev: 'a' } }, dictionary: { rev: 'd' } }), 'gloss/demo.json': JSON.stringify(gloss()), 'gloss/dictionary.json': JSON.stringify({ version: 1, words: { arise: [['v.', '起身']] } }) };
    const real = globalThis.fetch;
    globalThis.fetch = async url => { const name = new URL(url).pathname.replace(/^.*?(gloss\/.*)$/, '$1'); return files[name] ? new Response(files[name]) : new Response('no', { status: 404 }); };
    try {
        assert.equal((await loadGloss(work, 'http://x.test/english/app.mjs')).id, 'demo');
        assert.deepEqual((await loadDictionary('http://x.test/english/app.mjs')).words.arise, [['v.', '起身']]);
        assert.equal(await loadGloss({ ...work, id: 'other' }, 'http://x.test/english/app.mjs'), null, 'a work the index does not list');
        assert.equal(await loadGloss({ ...work, segments: [{ id: 's1', text: 'different' }] }, 'http://x.test/english/app.mjs'), null, 'a text the gloss does not fit');
    } finally { globalThis.fetch = real; }
});

test('every gloss in the repository fits the text it was made for, and the index lists them all', async () => {
    const dir = new URL('../static/english/gloss/', import.meta.url);
    let index;
    try { index = JSON.parse(await readFile(new URL('index.json', dir), 'utf8')); } catch { return; }   // nothing generated
    assert.equal(index.version, 1);
    const library = JSON.parse(await readFile(new URL('../static/english/library/index.json', import.meta.url), 'utf8'));
    for (const entry of library.works) {
        const text = JSON.parse(await readFile(new URL(`../static/english/library/${entry.id}.json`, import.meta.url), 'utf8'));
        assert.ok(index.works[entry.id]?.rev, `${entry.id}: not in the gloss index; run tools/render-english-gloss.mjs`);
        const g = JSON.parse(await readFile(new URL(`${entry.id}.json`, dir), 'utf8'));
        assert.ok(checkGloss(g, text), `${entry.id}: the text changed since it was translated; run tools/render-english-gloss.mjs`);
        assert.equal(g.engine, 'Azure Translator');
    }
    const dictionary = JSON.parse(await readFile(new URL('dictionary.json', dir), 'utf8'));
    assert.equal(dictionary.version, 1); assert.ok(index.dictionary?.rev);
    const keys = Object.keys(dictionary.words);
    assert.ok(keys.length > 1000, 'the dictionary is nearly empty');
    for (const key of keys) assert.ok(Array.isArray(dictionary.words[key]) && dictionary.words[key].every(group => Array.isArray(group) && typeof group[0] === 'string' && group.length >= 2 && group.slice(1).every(x => typeof x === 'string' && x)), `${key}: malformed entry`);
    assert.equal((await readdir(dir)).filter(n => n.endsWith('.json') && !['index.json', 'dictionary.json'].includes(n)).length, library.works.length, 'a gloss file that no work has');
});
