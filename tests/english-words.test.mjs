import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';
import { loadWordIndex, wordClip } from '../static/english/wordaudio.mjs';
import { pool } from '../tools/render-english-words.mjs';
import { distinctWords } from '../tools/render-english-gloss.mjs';
import { FORMATS } from '../static/english/voice.mjs';

const BASE = 'http://x.test/english/app.mjs';
const withFetch = async (files, run) => {
    const real = globalThis.fetch;
    globalThis.fetch = async url => { const name = new URL(url).pathname.replace(/^.*?(words\/.*)$/, '$1'); return files[name] ? new Response(files[name]) : new Response('no', { status: 404 }); };
    try { await run(); } finally { globalThis.fetch = real; }
};

test('the word list loads, and a clip address is given only for a word that has one', async () => {
    // loadWordIndex remembers its first answer, so every case runs in one test
    await withFetch({ 'words/index.json': JSON.stringify({ version: 1, rev: 'ab1', words: { 'en-US': ['arise', "don't", 'bean-rows'], 'en-GB': ['arise'] } }) }, async () => {
        const index = await loadWordIndex(BASE);
        assert.equal(index.rev, 'ab1');
        assert.equal(wordClip(index, 'en-US', 'arise', BASE), 'http://x.test/english/words/en-US/arise.mp3?v=ab1');
        assert.equal(wordClip(index, 'en-GB', 'arise', BASE), 'http://x.test/english/words/en-GB/arise.mp3?v=ab1');
        assert.match(wordClip(index, 'en-US', "don't", BASE), /words\/en-US\/don't\.mp3\?v=ab1$/);
        assert.equal(wordClip(index, 'en-GB', "don't", BASE), null, 'this accent has no clip for it');
        assert.equal(wordClip(index, 'en-US', 'wattles', BASE), null);
        assert.equal(wordClip(index, 'fr-FR', 'arise', BASE), null);
        assert.equal(wordClip(null, 'en-US', 'arise', BASE), null, 'no list at all');
        assert.equal(wordClip(index, 'en-US', '../x', BASE), null, 'only words in the list');
    });
});

test('a missing or unusable list means no clips, not an error', async () => {
    // a fresh module instance, because the list request is remembered
    const fresh = await import(`../static/english/wordaudio.mjs?case=${Date.now()}`);
    await withFetch({}, async () => assert.equal(await fresh.loadWordIndex(BASE), null));
    const other = await import(`../static/english/wordaudio.mjs?case=${Date.now()}b`);
    await withFetch({ 'words/index.json': JSON.stringify({ version: 2, rev: 'x', words: {} }) }, async () => assert.equal(await other.loadWordIndex(BASE), null));
});

test('the render pool runs every item, never more than the limit at once', async () => {
    let running = 0, peak = 0; const seen = [];
    await pool([1, 2, 3, 4, 5, 6, 7], 3, async item => { running += 1; peak = Math.max(peak, running); await new Promise(r => setTimeout(r, 5)); seen.push(item); running -= 1; });
    assert.deepEqual(seen.sort(), [1, 2, 3, 4, 5, 6, 7]); assert.ok(peak <= 3 && peak >= 2);
    await pool([], 3, async () => assert.fail('nothing to do'));
});

test('every word of the library has a clip in the repository, in both accents', async () => {
    const dir = new URL('../static/english/words/', import.meta.url);
    let index;
    try { index = JSON.parse(await readFile(new URL('index.json', dir), 'utf8')); } catch { return; }   // none rendered
    assert.equal(index.version, 1); assert.ok(index.rev); assert.ok(FORMATS[index.format]);
    const library = JSON.parse(await readFile(new URL('../static/english/library/index.json', import.meta.url), 'utf8'));
    const works = [];
    for (const entry of library.works) works.push(JSON.parse(await readFile(new URL(`../static/english/library/${entry.id}.json`, import.meta.url), 'utf8')));
    const words = distinctWords(works);
    for (const accent of ['en-US', 'en-GB']) {
        const listed = new Set(index.words[accent]);
        const missing = words.filter(w => !listed.has(w));
        assert.deepEqual(missing, [], `${accent}: words with no clip; run tools/render-english-words.mjs`);
        const files = new Set((await readdir(new URL(`${accent}/`, dir))).filter(n => n.endsWith('.mp3')).map(n => n.slice(0, -4)));
        for (const w of index.words[accent]) assert.ok(files.has(w), `${accent}/${w}: listed but there is no file`);
        for (const w of words.slice(0, 40)) {   // a sample: a real mp3 of a plausible length
            const file = new URL(`${accent}/${w}.mp3`, dir), size = (await stat(file)).size, head = (await readFile(file)).subarray(0, 3);
            assert.ok(head.toString('latin1') === 'ID3' || head[0] === 0xff, `${accent}/${w}: not an mp3`);
            assert.ok(size / FORMATS[index.format] > 0.1 && size / FORMATS[index.format] < 4, `${accent}/${w}: odd length`);
        }
    }
});
