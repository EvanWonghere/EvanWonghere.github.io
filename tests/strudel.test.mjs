import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ONLINE_HOSTS, PIANO_SAMPLE_NOTES, STRUDEL_BUNDLE, STRUDEL_RUNTIME, cycleToBeat, encodeWav, midiName, readSandboxMessage, sandboxDocument, sandboxPolicy } from '../static/music/strudel-bridge.mjs';
import { MAX_CYCLES, appendLayer, arithmetic, parseMini, parseNoteName, parseStrudel, parsedScore } from '../static/music/strudel-parse.mjs';
import { TEMPLATES, createFromTemplate, realize } from '../static/music/arrangement.mjs';
import { compileStrudel } from '../static/music/arrange-strudel.mjs';
import { compileABC } from '../static/music/arrange-abc.mjs';
import { LIVE_PRESETS } from '../static/music/composition.mjs';
import { STRUDEL_LIMITS, STRUDEL_PENDING_KEY, buildStrudelRequest, classifySnippet, clearStrudelPending, loadStrudelPending, saveStrudelPending, snippetFromHistory } from '../static/music/ai-context.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const memory = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k), data }; };

test('vendored Strudel bundle is the unmodified 1.3.0 build and its licences are recorded', () => {
    const bundle = readFileSync(new URL('../static/music/vendor/strudel-web-1.3.0.js', import.meta.url));
    assert.equal(createHash('sha256').update(bundle).digest('hex'), '265cae9cf769a7dc2c1ac253784fce80fef5062db9a1aac5be7fa5f205af5e86');
    assert.equal(STRUDEL_BUNDLE, '/music/vendor/strudel-web-1.3.0.js'); assert.equal(STRUDEL_RUNTIME, '/music/strudel-runtime.js');
    const notice = read('static/music/vendor/NOTICE.md');
    assert.match(notice, /AGPL/); assert.match(notice, /265cae9cf769a7dc/);
    assert.match(read('static/music/vendor/strudel-LICENSES.txt'), /GNU AFFERO GENERAL PUBLIC LICENSE/);
    assert.match(read('THIRD_PARTY_NOTICES.md'), /strudel-web-1\.3\.0\.js/);
});

test('sandbox policy: no network offline, GitHub samples only when switched on', () => {
    const off = sandboxPolicy(), on = sandboxPolicy({ online: true });
    assert.match(off, /default-src 'none'/);
    assert.ok(!/https?:/.test(off), 'offline allows no host');
    for (const host of ONLINE_HOSTS) assert.ok(on.includes(host));
    assert.deepEqual(ONLINE_HOSTS, ['https://raw.githubusercontent.com']);
    assert.ok(!/allow-same-origin/.test(read('static/music/strudel-sandbox.mjs')), 'the frame never gets its origin back');
    assert.match(read('static/music/strudel-sandbox.mjs'), /setAttribute\('sandbox', 'allow-scripts'\)/);
    assert.match(read('static/music/strudel-sandbox.mjs'), /\+\+loads > 1[^\n]*this\.destroy\(\)/, 'a sandbox that navigates itself is closed');
});

test('sandbox document inlines code without letting it close the script element', () => {
    const doc = sandboxDocument({ bundle: 'var a = "</script><img src=x>";', runtime: 'post("</SCRIPT>")' });
    assert.equal((doc.match(/<\/script>/g) || []).length, 2);
    assert.match(doc, /<\\\/script><img/); assert.match(doc, /<\\\/SCRIPT>/, 'case is kept');
    assert.ok(doc.indexOf('Content-Security-Policy') < doc.indexOf('<script>'), 'policy comes first');
});

test('messages from the sandbox are validated and copied', () => {
    assert.equal(readSandboxMessage(null), null); assert.equal(readSandboxMessage({ type: 'eval' }), null);
    assert.equal(readSandboxMessage({ type: 'hap', cycle: 'x' }), null);
    const hap = readSandboxMessage({ type: 'hap', id: 'a'.repeat(200), cycle: 3.5, length: 0.25, note: 'c4', n: 2, s: 'piano', delay: 99, extra: { evil: true } });
    assert.deepEqual(hap, { type: 'hap', id: 'a'.repeat(80), cycle: 3.5, length: 0.25, delay: 10, note: 'c4', n: 2, s: 'piano' });
    assert.equal(readSandboxMessage({ type: 'hap', cycle: 1, note: 300 }).note, 127);
    assert.equal(readSandboxMessage({ type: 'error', message: 'x'.repeat(900) }).message.length, 500);
    assert.deepEqual(readSandboxMessage({ type: 'ready', html: '<b>' }), { type: 'ready' });
});

test('WAV encoding, sample names and cycle mapping', () => {
    const wav = new DataView(encodeWav(new Float32Array([0, 1, -1, 2]), 8000));
    assert.equal(String.fromCharCode(...new Uint8Array(wav.buffer, 0, 4)), 'RIFF');
    assert.equal(wav.getUint32(24, true), 8000); assert.equal(wav.getUint32(40, true), 8);
    assert.deepEqual([wav.getInt16(44, true), wav.getInt16(46, true), wav.getInt16(48, true), wav.getInt16(50, true)], [0, 32767, -32767, 32767]);
    assert.equal(PIANO_SAMPLE_NOTES[0], 21); assert.ok(PIANO_SAMPLE_NOTES.every(n => n <= 108 && (n - 21) % 3 === 0));
    assert.equal(midiName(60), 'c4'); assert.equal(midiName(61), 'c#4');
    assert.equal(cycleToBeat(0, 8, 4), 0); assert.equal(cycleToBeat(2.5, 8, 4), 10); assert.equal(cycleToBeat(9.25, 8, 3), 3.75); assert.equal(cycleToBeat(5, 0, 4), 0);
});

test('mini-notation and helpers', () => {
    assert.equal(parseNoteName('c4'), 60); assert.equal(parseNoteName('Eb3'), 51); assert.equal(parseNoteName('f#'), 54); assert.equal(parseNoteName('h4'), null);
    assert.equal(arithmetic('72/4'), 18); assert.equal(arithmetic('(1+2)*3'), 9); assert.equal(arithmetic('alert(1)'), null);
    assert.deepEqual(parseMini('c4 [e4 g4]').unsupported, []);
    const p = parseStrudel('setcpm(30)\nnote("c4 [e4 g4] <a4 b4> c5@2 ~")');
    assert.equal(p.cpm, 30); assert.equal(p.cycles, 2);
    const first = p.voices[0].events.filter(e => e.time < 1).map(e => [e.pitch, +e.time.toFixed(4), +e.dur.toFixed(4)]);
    assert.deepEqual(first, [[60, 0, 0.1667], [64, 0.1667, 0.0833], [67, 0.25, 0.0833], [69, 0.3333, 0.1667], [72, 0.5, 0.3333]]);
    assert.equal(p.voices[0].events.find(e => e.time >= 1 && e.pitch >= 69 && e.pitch <= 71).pitch, 71, 'alternation advances per cycle');
});

test('scale degrees, stacks, $: blocks, slow/fast and add', () => {
    const p = parseStrudel('setcps(0.5)\n$: n("0 2 4 7").scale("C4:major")\n$: stack(note("c2*2").slow(2), s("bd sd"))\n$: note("c4").add(12)');
    assert.equal(p.cpm, 30);
    assert.deepEqual(p.voices[0].events.filter(e => e.time < 1).map(e => e.pitch), [60, 64, 67, 72]);
    assert.deepEqual(p.voices[1].events.map(e => [e.pitch, e.time, e.dur]), [[36, 0, 1], [36, 1, 1]], 'slow(2) spreads c2*2 over two cycles');
    assert.equal(p.voices[2].kind, 'drum'); assert.deepEqual(p.voices[2].events.map(e => e.drum), ['kick', 'snare', 'kick', 'snare']);
    assert.equal(p.voices[3].events[0].pitch, 72);
    assert.deepEqual(parseStrudel('silence'), { cpm: null, cycles: 1, voices: [], warnings: [] });
    assert.equal(p.cycles, 2);
});

test('unsupported parts are reported, never guessed', () => {
    const p = parseStrudel('note("c4(3,8) e4?").jux(rev)\n');
    assert.ok(p.warnings.length >= 2, p.warnings.join(' | '));
    assert.ok(parseStrudel('const x = 1; foo(x)').warnings.length);
    assert.ok(parseStrudel(`note("<${Array.from({ length: 40 }, () => 'c4').join(' ')}>")`).cycles <= MAX_CYCLES);
    assert.ok(parseStrudel('n("0 1 2")').warnings.some(w => /scale/.test(w)));
});

test('every live preset parses and compiles to a staff', () => {
    for (const preset of LIVE_PRESETS) {
        const parsed = parseStrudel(preset.code);
        const score = parsedScore(parsed, { meter: '4/4' });
        const { abc } = compileABC(score.real, score.doc, { mode: 'score' });
        assert.match(abc, /^X:1/m, preset.id); assert.ok(parsed.cycles >= 1 && parsed.cycles <= MAX_CYCLES, preset.id);
    }
});

test('arrangement exports round-trip through the parser note for note', () => {
    for (const id of Object.keys(TEMPLATES)) {
        const doc = createFromTemplate(id, 'rt'), real = realize(doc), parsed = parseStrudel(compileStrudel(real, doc));
        if (!real.events.length) { assert.deepEqual(parsed.warnings, [], id); continue; }
        const pitched = real.events.filter(e => !e.drum && Math.abs(e.start * 4 - Math.round(e.start * 4)) < 1e-6);
        const parsedCount = parsed.voices.filter(v => v.kind === 'pitched').reduce((n, v) => n + v.events.length, 0);
        assert.equal(parsedCount, pitched.length, id);
        assert.equal(parsed.cycles, Math.round(real.totalBeats / real.bpb), id);
        const score = parsedScore(parsed, { meter: doc.meta.meter });
        assert.equal(score.real.totalBeats, real.totalBeats, id);
    }
});

test('off-grid notes are rounded on the staff with a note', () => {
    const score = parsedScore(parseStrudel('note("[c4 e4 g4]")'), { meter: '4/4' });
    assert.ok(score.notes.some(n => /十六分/.test(n)));
    assert.ok(score.real.events.every(e => Math.abs(e.start * 4 - Math.round(e.start * 4)) < 1e-9));
});

test('appendLayer turns both codes into $: blocks so every layer plays', () => {
    const out = appendLayer('setcpm(24)\n// melody\nnote("c4 e4").s("piano");\n', 'setcpm(30)\nstack(note("c2"), s("bd*4"))');
    assert.equal(out, 'setcpm(24)\n\n// melody\n$: note("c4 e4").s("piano")\n\n// AI 片段\n$: stack(note("c2"), s("bd*4"))\n');
    assert.equal(parseStrudel(out).voices.length, 3);
    assert.equal(appendLayer('', 'note("c4")'), '// AI 片段\n$: note("c4")\n');
    assert.equal(appendLayer('$: s("bd")', '$: note("c4")'), '$: s("bd")\n\n// AI 片段\n$: note("c4")\n');
    assert.equal(appendLayer('const x = "c4"\nnote(x)', 'note("c4")'), null);
    assert.equal(appendLayer('note("c4"); s("bd")', 'note("c4")'), null);
});

test('Strudel snippet requests: validation, pending recovery, classification', () => {
    const requestId = '11111111-1111-4111-8111-111111111111';
    const payload = buildStrudelRequest({ draft: 'note("c4")', workId: 'draft', message: ' 慵懒的低音 ', requestId });
    assert.deepEqual(payload, { action: 'music-strudel', requestId, workId: 'draft', draft: 'note("c4")', message: '慵懒的低音' });
    assert.throws(() => buildStrudelRequest({ message: '', requestId }), /描述/);
    assert.throws(() => buildStrudelRequest({ message: 'x', requestId: 'bad' }), /请求 ID/);
    assert.throws(() => buildStrudelRequest({ message: 'x', requestId, workId: '../x' }), /手稿/);
    assert.throws(() => buildStrudelRequest({ message: 'x', requestId, draft: 'x'.repeat(STRUDEL_LIMITS.draft + 1) }), /12000/);
    const store = memory();
    assert.ok(saveStrudelPending(store, payload)); assert.deepEqual(loadStrudelPending(store).payload, payload);
    assert.ok(store.data.has(STRUDEL_PENDING_KEY)); assert.notEqual(STRUDEL_PENDING_KEY, 'hive-music-v1');
    store.setItem(STRUDEL_PENDING_KEY, JSON.stringify({ payload: { ...payload, action: 'music-chat' } })); assert.equal(loadStrudelPending(store), null);
    clearStrudelPending(store); assert.equal(store.data.size, 0);
    assert.equal(classifySnippet(200, { summary: 's', code: 'note("c4")' }), 'done');
    assert.equal(classifySnippet(200, { summary: 's', code: 'x'.repeat(7000) }), 'failed');
    assert.equal(classifySnippet(409, { settled: false }), 'wait'); assert.equal(classifySnippet(422, { settled: true }), 'failed');
    const rows = [{ request_id: requestId, role: 'assistant', status: 'complete', body: 'why', payload: { code: 'note("c4")' } }];
    assert.deepEqual(snippetFromHistory(rows, requestId), { summary: 'why', code: 'note("c4")', recovered: true });
    assert.equal(snippetFromHistory([{ ...rows[0], status: 'running' }], requestId), null);
});

test('page wiring: runtime only in the sandbox, AI snippet card only when the AI is enabled', () => {
    const layout = read('layouts/music/single.html');
    assert.ok(!layout.includes('strudel-runtime'), 'the page never loads the sandbox runtime itself');
    assert.ok(!layout.includes('strudel-web-1.3.0'), 'the bundle is only injected into the sandbox');
    const ai = layout.indexOf('<div id="live-ai"'), open = layout.lastIndexOf('{{ if $ai -}}', ai), close = layout.indexOf('{{- end }}', ai);
    assert.ok(ai > 0 && open > 0 && close > ai && layout.slice(open, ai).split('{{').length === 2, 'live AI card sits inside the $ai conditional');
    for (const file of ['live-sandbox.mjs', 'strudel-sandbox.mjs', 'strudel-parse.mjs', 'strudel-bridge.mjs']) {
        const source = read(`static/music/${file}`);
        assert.ok(!/from '\.\/ai(-context)?\.mjs'/.test(source), `${file} does not import the AI modules`);
        assert.ok(!/hive-music-v1|saveProgress|recordAnswer/.test(source), `${file} never touches practice progress`);
    }
    assert.ok(!/\beval\s*\(|new Function/.test(read('static/music/strudel-parse.mjs')), 'the parser never evaluates code');
});
