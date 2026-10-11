import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { alignRecording, buildTimeline, checkHumanTimeline, humanWordAt, loadHumanTimeline, segmentKeys, MIN_COVERAGE } from '../static/english/humanalign.mjs';
import { heardWords, transcribe } from '../tools/render-english-human.mjs';
import { workTextHash } from '../static/english/library.mjs';

const work = { id: 'demo', kind: 'poem', segments: [{ id: 's1', text: 'Hope is the thing with feathers,\nThat perches in the soul.' }, { id: 's2', text: 'And never stops at all.' }] };
// Words said one after another, 300 ms each with a 100 ms gap.
const said = (text, from = 0) => text.split(/\s+/).map((w, i) => ({ text: w, startMs: from + i * 400, endMs: from + i * 400 + 300 }));

test('every word of the text gets a time when the recording says the text', () => {
    const r = alignRecording(work, said('Hope is the thing with feathers that perches in the soul and never stops at all'));
    assert.equal(r.found, 16); assert.equal(r.total, 16);
    assert.deepEqual(r.segments[0][0], [0, 300]); assert.equal(r.segments[0].length, 11); assert.equal(r.segments[1].length, 5);
    assert.deepEqual(segmentKeys(work).map(l => l.length), [11, 5]);
});

test('an introduction, an ending and misheard words leave those words dark, and only those', () => {
    const heard = [...said('Hope is a thing with feathers by Emily Dickinson read for librivox'), ...said('Hope is the thing with feathers that perches in the sole and never stops at all end of poem', 10000)];
    const r = alignRecording(work, heard);
    assert.equal(r.found, 15); assert.equal(r.total, 16);
    // the title read before the poem is not taken for the poem: the first word is the one said at 10000 ms, not the one at 0
    assert.equal(r.segments[0][0][0], 10000);
    const dark = r.segments.flat().map((w, i) => w ? null : i).filter(i => i !== null);
    assert.deepEqual(dark, [10]);   // "soul"
});

test('two heard words that make one word of the text count as that word', () => {
    const hyphen = { id: 'h', kind: 'poem', segments: [{ id: 's', text: 'In the bee-loud glade' }] };
    const r = alignRecording(hyphen, said('in the bee loud glade'));
    assert.equal(r.found, 4); assert.deepEqual(r.segments[0][2], [800, 1500]);   // spans "bee" and "loud"
});

test('punctuation and case in the heard words do not matter, and empty words are ignored', () => {
    const r = alignRecording(work, [{ text: 'Hope,', startMs: 0, endMs: 200 }, { text: '', startMs: 200, endMs: 200 }, { text: 'IS', startMs: 300, endMs: 500 }]);
    assert.equal(r.found, 2);
});

test('a recording with too few of the text\'s words found gets no timeline', () => {
    assert.equal(buildTimeline(work, said('something else entirely'), 3), null);
    const mostly = said('Hope is the thing with feathers that perches in the soul and never stops');   // 14 of 16
    assert.equal(buildTimeline(work, mostly, 6), null);
    const good = buildTimeline(work, said('Hope is the thing with feathers that perches in the soul and never stops at all'), 6);
    assert.ok(good && good.found === 16 && good.textHash === workTextHash(work) && good.source === 'Azure fast transcription');
    assert.ok(MIN_COVERAGE >= 0.9);
});

test('a timeline is used only when it fits the text and its times are in order', () => {
    const good = buildTimeline(work, said('Hope is the thing with feathers that perches in the soul and never stops at all'), 6);
    assert.ok(checkHumanTimeline(good, work));
    const changed = { ...work, segments: [{ id: 's1', text: 'Hope is the thing with feathers,\nThat perches in the soul!' }, work.segments[1]] };
    assert.equal(checkHumanTimeline(good, changed), null, 'the text changed');
    const clone = () => JSON.parse(JSON.stringify(good));
    const outOfOrder = clone(); outOfOrder.segments[0][3] = [0, 10];
    const shortList = clone(); shortList.segments[1].pop();
    const backwards = clone(); backwards.segments[0][1] = [500, 100];
    const mostlyDark = clone(); mostlyDark.segments[0] = mostlyDark.segments[0].map(() => null); mostlyDark.segments[1] = mostlyDark.segments[1].map(() => null);
    for (const bad of [null, { version: 2 }, { ...clone(), id: 'other' }, outOfOrder, shortList, backwards, mostlyDark]) assert.equal(checkHumanTimeline(bad, work), null, JSON.stringify(bad)?.slice(0, 60));
});

test('the word being said at a moment', () => {
    const t = buildTimeline(work, said('Hope is the thing with feathers that perches in the soul and never stops at all'), 6);
    assert.equal(humanWordAt(t, -5), null); assert.deepEqual(humanWordAt(t, 0), [0, 0]); assert.deepEqual(humanWordAt(t, 350), [0, 0], 'a pause keeps the last word lit');
    assert.deepEqual(humanWordAt(t, 400), [0, 1]); assert.deepEqual(humanWordAt(t, 11 * 400 + 10), [1, 0]);
    assert.deepEqual(humanWordAt(t, 15 * 400 + 100), [1, 4]); assert.equal(humanWordAt(t, 15 * 400 + 5000), null, 'long after the last word nothing is lit');
});

test('a transcription answer becomes words with a start and an end', () => {
    const words = heardWords({ phrases: [{ words: [{ text: 'Hope', offsetMilliseconds: 1150, durationMilliseconds: 400 }, { text: 'is', offsetMilliseconds: 1550, durationMilliseconds: 160 }] }, { words: [{ text: 'a', offsetMilliseconds: 2000, durationMilliseconds: 80 }] }] });
    assert.deepEqual(words, [{ text: 'Hope', startMs: 1150, endMs: 1550 }, { text: 'is', startMs: 1550, endMs: 1710 }, { text: 'a', startMs: 2000, endMs: 2080 }]);
    assert.deepEqual(heardWords({}), []);
});

test('transcription retries a busy service and gives up at once on a refused key', async () => {
    let calls = 0;
    const flaky = async () => { calls += 1; return calls < 3 ? new Response('busy', { status: 429 }) : new Response(JSON.stringify({ phrases: [] })); };
    assert.deepEqual(await transcribe({ audio: Buffer.from('x'), key: 'k', region: 'r', backoff: 1, fetcher: flaky }), { phrases: [] }); assert.equal(calls, 3);
    let refused = 0;
    await assert.rejects(transcribe({ audio: Buffer.from('x'), key: 'wrong', region: 'r', backoff: 1, fetcher: async () => { refused += 1; return new Response('no', { status: 401 }); } }), /HTTP 401/);
    assert.equal(refused, 1);
});

test('the word times load from the index, and a missing or unfitting file is simply absent', async () => {
    const good = buildTimeline(work, said('Hope is the thing with feathers that perches in the soul and never stops at all'), 6);
    const files = { 'human/index.json': JSON.stringify({ version: 1, works: { demo: { rev: 'a' } } }), 'human/demo.json': JSON.stringify(good) };
    const real = globalThis.fetch;
    globalThis.fetch = async url => { const name = new URL(url).pathname.replace(/^.*?(human\/.*)$/, '$1'); return files[name] ? new Response(files[name]) : new Response('no', { status: 404 }); };
    try {
        assert.equal((await loadHumanTimeline(work, 'http://x.test/english/app.mjs')).id, 'demo');
        assert.equal(await loadHumanTimeline({ ...work, id: 'other' }, 'http://x.test/english/app.mjs'), null);
        assert.equal(await loadHumanTimeline({ ...work, segments: [{ id: 's1', text: 'Different words' }] }, 'http://x.test/english/app.mjs'), null);
    } finally { globalThis.fetch = real; }
});

test('every recording timeline in the repository fits the text it was made for', async () => {
    let index;
    try { index = JSON.parse(await readFile(new URL('../static/english/human/index.json', import.meta.url), 'utf8')); } catch { return; }   // none generated
    assert.equal(index.version, 1);
    const library = JSON.parse(await readFile(new URL('../static/english/library/index.json', import.meta.url), 'utf8'));
    let checked = 0;
    for (const entry of library.works) {
        const text = JSON.parse(await readFile(new URL(`../static/english/library/${entry.id}.json`, import.meta.url), 'utf8'));
        if (!text.human) continue;
        const info = index.works[entry.id];
        if (!info) continue;   // a recording where too few words were found keeps the plain player
        const timeline = JSON.parse(await readFile(new URL(`../static/english/human/${entry.id}.json`, import.meta.url), 'utf8'));
        assert.ok(checkHumanTimeline(timeline, text), `${entry.id}: the text changed since the recording was timed; run tools/render-english-human.mjs`);
        assert.ok(info.rev && info.found === timeline.found && info.total === timeline.total);
        assert.ok(Math.abs(timeline.seconds - text.human.seconds) <= 3, `${entry.id}: the transcribed length differs from the recording's`);
        checked += 1;
    }
    assert.ok(checked >= 1);
});
