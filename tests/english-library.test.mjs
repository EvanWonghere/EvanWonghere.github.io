import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { KINDS, ROTATION, MAX_SEGMENT_WORDS, estimateSeconds, validateWork, validateIndex, indexEntry, todaysPick, tokenize, sentences, splitUnits, splitSegments, flatten } from '../static/english/library.mjs';
import { wordCount, validateReference } from '../static/english/core.mjs';
import { describeRecognitionError, probeRecognition, recognitionSupported, createLive } from '../static/english/live.mjs';
import { pickVoice, wordAtChar, canSpeak, accentMatches } from '../static/english/speak.mjs';

const work = (over = {}) => {
    const segments = [{ id: 's1', text: 'I will arise and go now.\nAnd a small cabin build there.' }];
    const words = wordCount(segments[0].text);
    return { version: 1, id: 'test-work', kind: 'poem', title: 'Test', author: 'Someone', year: 1890, level: 'B1', source: { name: 'Wikisource', url: '' }, rights: '美国：1890 年出版；中国：作者 1939 年去世', intro: '这是一首用于测试的短诗，导读至少需要三十个字才算有效，所以这里多写一些内容来满足长度要求。', tips: ['慢一点。'], glossary: { cabin: '小屋' }, words, seconds: estimateSeconds(words), segments, ...over };
};

test('a work needs rights, a bounded intro, short segments and consistent counts', () => {
    assert.equal(validateWork(work()).id, 'test-work');
    for (const bad of [{ version: 2 }, { id: 'Bad Id' }, { kind: 'song' }, { level: 'Z9' }, { rights: '' }, { intro: '太短' }, { tips: ['a', 'b', 'c', 'd'] }, { words: 99 }, { glossary: { missing: '不在原文' } }, { glossary: { Cabin: '大写' } }, { segments: [] },
        { segments: [{ id: 's1', text: 'word '.repeat(MAX_SEGMENT_WORDS + 1).trim() }], words: MAX_SEGMENT_WORDS + 1, seconds: estimateSeconds(MAX_SEGMENT_WORDS + 1) },
        { segments: [{ id: 's1', text: 'Hello there.' }, { id: 's1', text: 'Again here.' }], words: 4, seconds: estimateSeconds(4) }]) {
        assert.throws(() => validateWork(work(bad)), undefined, JSON.stringify(bad).slice(0, 60));
    }
});

test('the index rejects duplicate ids and unknown kinds', () => {
    const entry = indexEntry(work());
    assert.equal(validateIndex({ version: 1, works: [entry] }).works.length, 1);
    assert.throws(() => validateIndex({ version: 1, works: [entry, entry] }));
    assert.throws(() => validateIndex({ version: 1, works: [{ ...entry, kind: 'song' }] }));
    assert.throws(() => validateIndex({ version: 2, works: [] }));
});

const fake = (kind, n) => Array.from({ length: n }, (_, i) => ({ id: `${kind}-${i}`, kind, title: `${kind} ${i}` }));
const library = [...fake('poem', 12), ...fake('prose', 6), ...fake('speech', 5), ...fake('fiction', 5), ...fake('letter', 2), ...fake('lesson', 5)];
const days = (start, count) => Array.from({ length: count }, (_, i) => { const d = new Date(Date.UTC(2026, 9, 1 + i)); return d.toISOString().slice(0, 10); });

test('the daily pick follows the weekly rotation and is stable for a day', () => {
    // 2026-10-09 is a Friday, which is a letter day; 2026-10-08 is a Thursday, a poem day.
    assert.equal(todaysPick(library, '2026-10-09').kind, 'letter');
    assert.equal(todaysPick(library, '2026-10-08').kind, 'poem');
    for (const day of days(0, 14)) {
        const [y, m, d] = day.split('-').map(Number);
        assert.equal(todaysPick(library, day).kind, ROTATION[new Date(y, m - 1, d).getDay()]);
        assert.equal(todaysPick(library, day).id, todaysPick(library, day).id);
    }
    assert.notEqual(todaysPick(library, '2026-10-08', 1).id, todaysPick(library, '2026-10-08').id);
    assert.equal(todaysPick(library.filter(w => w.kind !== 'poem'), '2026-10-08'), null);
    assert.throws(() => todaysPick(library, '10/08/2026'));
});

test('a poem repeats only after the whole pool is used up; lessons are never picked', () => {
    const seen = [];
    for (const day of days(0, 140)) { const w = todaysPick(library, day); assert.notEqual(w.kind, 'lesson'); if (w.kind === 'poem') seen.push(w.id); }
    const firstCycle = seen.slice(0, 12);
    assert.equal(new Set(firstCycle).size, 12, 'the first 12 poem days must cover all 12 poems');
});

test('tokenize keeps hyphenated words and apostrophes together and records offsets', () => {
    const tokens = tokenize("the bee-loud glade, don't go");
    assert.deepEqual(tokens.filter(t => t.word).map(t => t.text), ['the', 'bee-loud', 'glade', "don't", 'go']);
    for (const t of tokens) assert.equal("the bee-loud glade, don't go".slice(t.start, t.start + t.text.length), t.text);
});

test('sentences do not split on abbreviations or inside quotes', () => {
    assert.deepEqual(sentences('Mr. Bennet said "No." Then he left. Why?'), ['Mr. Bennet said "No."', 'Then he left.', 'Why?']);
    const long = `${'one two three four five six seven eight nine ten, '.repeat(7)}end.`;
    for (const piece of sentences(long)) assert.ok(wordCount(piece) <= MAX_SEGMENT_WORDS);
});

test('units follow lines for poems and sentences for prose', () => {
    assert.deepEqual(splitUnits('Line one,\n\nLine two.', 'poem', { byLine: true }), ['Line one,', 'Line two.']);
    assert.deepEqual(splitUnits('First one. Second one.', 'speech'), ['First one.', 'Second one.']);
    assert.deepEqual(splitUnits('First one. Second one.', 'lesson'), ['First one. Second one.']);
});

test('segments stay under the word limit and never lose or reorder words', () => {
    const stanza = n => Array.from({ length: 4 }, (_, i) => `line ${n} number ${i} has some seven words`).join('\n');
    const poem = [1, 2, 3, 4, 5].map(stanza).join('\n\n');
    const parts = splitSegments(poem, 'poem');
    assert.ok(parts.length >= 2);
    for (const p of parts) assert.ok(wordCount(p) <= MAX_SEGMENT_WORDS);
    assert.equal(parts.join(' ').split(/\s+/).join(' '), poem.split(/\s+/).join(' '));
    const prose = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} is short.`).join(' ');
    const chunks = splitSegments(prose, 'prose');
    for (const c of chunks) assert.ok(wordCount(c) <= MAX_SEGMENT_WORDS);
    assert.equal(chunks.join(' '), prose);
});

test('recognition errors become advice and the probe never claims success on silence', () => {
    assert.match(describeRecognitionError('not-allowed'), /麦克风/);
    assert.match(describeRecognitionError('network'), /网络|服务/);
    assert.match(describeRecognitionError('no-speech'), /没有听到/);
    assert.match(describeRecognitionError('something-new'), /something-new/);
    assert.equal(recognitionSupported(), false);   // no browser here
    return probeRecognition().then(result => assert.deepEqual(result, { ok: false, code: 'unsupported' }));
});

test('voice choice prefers a local natural US voice and word boundaries map to word numbers', () => {
    const v = (name, lang, localService) => ({ name, lang, localService });
    const voices = [v('Google UK English Female', 'en-GB', false), v('Fred', 'en_US', true), v('Samantha', 'en-US', true), v('Anna', 'de-DE', true), v('Aria', 'en-US', false)];
    assert.equal(pickVoice(voices, 'en-US').name, 'Samantha');
    assert.equal(pickVoice(voices, 'en-GB').name, 'Google UK English Female');
    assert.equal(pickVoice([v('Anna', 'de-DE', true)], 'en-US'), null);
    const tokens = tokenize("I will, bee-loud glade");
    assert.deepEqual([0, 2, 5, 7, 12, 99].map(i => wordAtChar(tokens, i)), [0, 1, 1, 2, 2, 3]);
    assert.equal(canSpeak(), false);
});

// Every file under static/english/library must satisfy the same rules as the build.
test('the published library is valid and lists every work exactly once', async () => {
    const dir = new URL('../static/english/library/', import.meta.url);
    let names;
    try { names = (await readdir(dir)).filter(n => n.endsWith('.json') && n !== 'index.json'); } catch { return; }   // library not generated yet
    const index = validateIndex(JSON.parse(await readFile(new URL('index.json', dir), 'utf8')));
    assert.deepEqual(index.works.map(w => `${w.id}.json`).sort(), names.sort());
    for (const name of names) {
        const w = validateWork(JSON.parse(await readFile(new URL(name, dir), 'utf8')));
        assert.equal(`${w.id}.json`, name);
        assert.ok(Object.hasOwn(KINDS, w.kind));
        assert.deepEqual(index.works.find(e => e.id === w.id), indexEntry(w));
        if (w.kind !== 'lesson') assert.match(w.rights, /美国.*中国/);
    }
});

test('a long sentence is cut at dashes without changing a single character', () => {
    const clause = 'one two three four five six seven eight nine ten';
    const sentence = `${clause} ${clause} ${clause}—${clause} ${clause} ${clause}.`;
    const parts = sentences(sentence);
    assert.ok(parts.length >= 2);
    for (const p of parts) assert.ok(wordCount(p) <= MAX_SEGMENT_WORDS);
    assert.equal(parts.join(' ').replace(/— /, '—'), sentence);
});

// Follow-reading sends one unit at a time to scoring, so every unit must pass the same check as typed text.
test('every unit of the published library is scorable and no word is lost', async () => {
    const dir = new URL('../static/english/library/', import.meta.url);
    let index;
    try { index = JSON.parse(await readFile(new URL('index.json', dir), 'utf8')); } catch { return; }
    for (const entry of index.works) {
        const w = JSON.parse(await readFile(new URL(`${entry.id}.json`, dir), 'utf8'));
        let words = 0;
        for (const segment of w.segments) {
            // whole-text reading records and scores one segment at a time
            assert.equal(validateReference(flatten(segment.text)), flatten(segment.text), `${w.id} ${segment.id}`);
            const units = splitUnits(segment.text, w.kind);
            assert.ok(units.length > 0, `${w.id} ${segment.id}`);
            for (const unit of units) { assert.equal(validateReference(unit), unit); words += wordCount(unit); }
        }
        assert.equal(words, w.words, `${w.id} lost or gained words`);
    }
});

test('a poem is followed by sentence, not by line, unless asked', () => {
    const stanza = ["Shall I compare thee to a summer's day?", 'Thou art more lovely and more temperate:', 'Rough winds do shake the darling buds of May,', "And summer's lease hath all too short a date:"].join('\n');
    assert.deepEqual(splitUnits(stanza, 'poem'), ["Shall I compare thee to a summer's day?", 'Thou art more lovely and more temperate:', "Rough winds do shake the darling buds of May,\nAnd summer's lease hath all too short a date:"]);
    assert.equal(splitUnits(stanza, 'poem', { byLine: true }).length, 4);
    // four lines joined by commas are cut after the fourth, and a unit never passes the word limit
    const commas = Array.from({ length: 6 }, (_, i) => `line number ${i} ends with a comma,`).join('\n');
    assert.deepEqual(splitUnits(commas, 'poem').map(u => u.split('\n').length), [4, 2]);
    for (const unit of splitUnits(Array.from({ length: 12 }, () => 'one two three four five six seven eight,').join('\n'), 'poem')) assert.ok(wordCount(unit) <= MAX_SEGMENT_WORDS);
    assert.equal(flatten('a b,\n  c d.'), 'a b, c d.');
});

// A scripted stand-in for the browser's recognizer.
function fakeEngine() {
    const made = [];
    class Engine {
        constructor() { made.push(this); }
        start() { this.started = true; }
        stop() { setTimeout(() => this.onend?.(), 0); }
        abort() { this.aborted = true; }
        say(...parts) { this.onresult?.({ results: parts.map(p => [{ transcript: p }]) }); }
    }
    globalThis.webkitSpeechRecognition = Engine;
    return made;
}

test('live dictation joins results, keeps words across restarts and returns them on stop', async () => {
    const made = fakeEngine(); const seen = [];
    try {
        const live = createLive({ onText: t => seen.push(t) });
        live.start();
        made[0].say('i will arise', 'and go now');
        assert.equal(seen.at(-1), 'i will arise and go now');
        made[0].onend();                                   // the browser closed the session after a pause
        assert.equal(made.length, 2); assert.ok(made[1].started);
        made[1].say('to innisfree');
        assert.equal(seen.at(-1), 'i will arise and go now to innisfree');
        assert.equal(await live.stop(), 'i will arise and go now to innisfree');
    } finally { delete globalThis.webkitSpeechRecognition; }
});

test('live dictation stops on a fatal error, ignores silence, and gives up on an endless restart loop', () => {
    const made = fakeEngine(); const errors = [];
    try {
        const live = createLive({ onError: c => errors.push(c) });
        live.start();
        made[0].onerror({ error: 'no-speech' }); made[0].onerror({ error: 'aborted' });
        assert.deepEqual(errors, []);
        made[0].onerror({ error: 'network' });
        assert.deepEqual(errors, ['network']);
        made[0].onend();
        assert.equal(made.length, 1, 'no restart after a fatal error');
        const again = createLive({ onError: c => errors.push(c) });
        again.start();
        for (let k = 0; k < 6; k++) made.at(-1).onend();    // each session ends immediately
        assert.equal(errors.at(-1), 'network');
        assert.ok(made.length <= 9);
    } finally { delete globalThis.webkitSpeechRecognition; }
    assert.equal(createLive(), null);
});

test('a voice fits an accent by its language tag, and a missing accent falls back to another English voice', () => {
    assert.ok(accentMatches('en-GB', 'en-GB')); assert.ok(accentMatches('en_gb', 'en-GB')); assert.ok(!accentMatches('en-US', 'en-GB')); assert.ok(!accentMatches(null, 'en-GB'));
    const v = (name, lang, localService = true) => ({ name, lang, localService });
    assert.equal(pickVoice([v('Daniel', 'en-GB'), v('Samantha', 'en-US')], 'en-GB').name, 'Daniel');
    assert.equal(pickVoice([v('Daniel', 'en-GB'), v('Samantha', 'en-US')], 'en-US').name, 'Samantha');
    assert.equal(pickVoice([v('Samantha', 'en-US')], 'en-GB').name, 'Samantha');
});

test('words that arrive after dictation was stopped or aborted are ignored', async () => {
    const made = fakeEngine(); const seen = [];
    try {
        const live = createLive({ onText: t => seen.push(t) });
        live.start(); made[0].say('first reading');
        assert.equal(await live.stop(), 'first reading');
        made[0].say('first reading and a late tail');   // the recognizer was slow to close
        assert.deepEqual(seen, ['first reading']);
        const other = createLive({ onText: t => seen.push(t) });
        other.start(); other.abort(); made.at(-1).say('after abort');
        assert.deepEqual(seen, ['first reading']);
    } finally { delete globalThis.webkitSpeechRecognition; }
});

test('a dialogue lesson names two roles and every line says who speaks it', () => {
    const line = (id, speaker, text) => ({ id, ...(speaker ? { speaker } : {}), text });
    const dialogue = (over = {}) => {
        const segments = [line('s1', 'Host', 'Welcome to the show, and thanks for joining us.'), line('s2', 'Guest', 'Thank you, it is a pleasure to be here.')];
        const words = segments.reduce((n, s) => n + wordCount(s.text), 0);
        return work({ kind: 'lesson', roles: ['Host', 'Guest'], segments, words, seconds: estimateSeconds(words), glossary: {}, ...over });
    };
    assert.equal(validateWork(dialogue()).roles.length, 2);
    for (const bad of [{ roles: ['Host'] }, { roles: ['Host', 'Host'] }, { roles: 'Host,Guest' }, { kind: 'poem' }, { segments: [line('s1', 'Nobody', 'Welcome to the show, and thanks for joining us.')], words: 9, seconds: estimateSeconds(9) }, { segments: [line('s1', null, 'Welcome to the show, and thanks for joining us.')], words: 9, seconds: estimateSeconds(9) }]) {
        assert.throws(() => validateWork(dialogue(bad)), undefined, JSON.stringify(bad).slice(0, 50));
    }
    // speakers belong to dialogues only
    assert.throws(() => validateWork(work({ segments: [line('s1', 'Host', 'I will arise and go now.')], words: 6, seconds: estimateSeconds(6) })));
});

test('a human recording is a local mp3 with a credit and an archive.org page', () => {
    const human = over => ({ src: 'human/test-work.mp3', credit: 'LibriVox 志愿者朗读 · Short Poetry Collection 137 · 11 - The Lake Isle of Innisfree', url: 'https://archive.org/details/spc137_1411_librivox', seconds: 78, ...over });
    assert.equal(validateWork(work({ human: human() })).human.seconds, 78);
    for (const bad of [{ src: '../x.mp3' }, { src: 'human/a.wav' }, { src: 'https://evil.example/a.mp3' }, { credit: '' }, { url: 'https://evil.example/details/a' }, { url: 'javascript:alert(1)' }, { seconds: 2 }, { seconds: 1.5 }]) {
        assert.throws(() => validateWork(work({ human: human(bad) })), undefined, JSON.stringify(bad));
    }
    assert.throws(() => validateWork(work({ human: null })));
});

test('every human recording in the library has its file, and its length fits the text', async () => {
    const dir = new URL('../static/english/library/', import.meta.url);
    let index;
    try { index = JSON.parse(await readFile(new URL('index.json', dir), 'utf8')); } catch { return; }
    let found = 0;
    for (const entry of index.works) {
        const w = JSON.parse(await readFile(new URL(`${entry.id}.json`, dir), 'utf8'));
        if (!w.human) continue;
        found += 1;
        const bytes = (await readFile(new URL(`../static/english/${w.human.src}`, import.meta.url)));
        assert.ok(bytes.length > 50000, `${w.id}: mp3 too small`);
        assert.ok(bytes.subarray(0, 3).toString('latin1') === 'ID3' || bytes[0] === 0xff, `${w.id}: not an mp3`);
        // reading speed between 40 and 200 words a minute, so the recording is plausibly of this text
        const perMinute = w.words / (w.human.seconds / 60);
        assert.ok(perMinute > 40 && perMinute < 200, `${w.id}: ${Math.round(perMinute)} words a minute`);
    }
    assert.ok(found >= 1);
});
