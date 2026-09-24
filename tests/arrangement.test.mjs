import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkABC } from '../static/music/composition.mjs';
import { STYLES, generateStyle, normalizeParams, stylesForRole } from '../static/music/arrange-styles.mjs';
import { LIMITS, OPS, validateDocument, validateOp } from '../static/music/arrangement-schema.mjs';
import { applySelected, describeOp, docHash, ARRANGE_KEY, TEMPLATES, analyzeChord, applyOps, createFromTemplate, freshStore, keySignature, loadStore, realize, saveStore, spellInKey, validateStore, positionLabel } from '../static/music/arrangement.mjs';
import { abcKey, compileABC, splitDuration } from '../static/music/arrange-abc.mjs';
import { compileStrudel, strudelNote } from '../static/music/arrange-strudel.mjs';
import { checkArrangement } from '../static/music/arrange-check.mjs';
import { ArrangePlayer, playbackNotes } from '../static/music/arrange-player.mjs';

// abcjs is the renderer the page uses; its parser checks the generated notation.
const abcModule = { exports: {} };
new Function('module', 'exports', 'window', readFileSync(new URL('../static/music/vendor/abcjs-6.7.0.min.js', import.meta.url), 'utf8'))(abcModule, abcModule.exports, {});
const ABCJS = abcModule.exports;
const memory = (entries = {}) => { const data = new Map(Object.entries(entries)); return { getItem: k => data.has(k) ? data.get(k) : null, setItem: (k, v) => data.set(k, String(v)), data }; };
const templates = [...Object.keys(TEMPLATES), 'progression:jazz251', 'progression:blues', 'progression:jazz-minor'];

test('every template validates, realizes and stays inside its sections', () => {
    for (const id of templates) {
        const doc = createFromTemplate(id, 'doc-1'), real = realize(doc);
        assert.deepEqual(validateDocument(doc), doc, id);
        for (const e of real.events) {
            const s = real.sections.find(x => x.id === e.sectionId);
            assert.ok(e.start >= s.start && e.start + e.beats <= s.start + s.beats + 1e-9, `${id}: ${e.id}`);
            assert.ok(e.drum || /^[A-G](𝄫|♭|♯|𝄪)?-?\d$/u.test(e.spelling), `${id}: spelled ${e.id}`);
        }
    }
});

test('styles are deterministic for the same seed and vary with another seed', () => {
    const chords = [{ at: 0, beats: 4, root: 'F', type: 'm9', inversion: 0, voicing: 'close' }, { at: 4, beats: 4, root: 'B♭', type: '13', inversion: 0, voicing: 'close' }];
    for (const [id, style] of Object.entries(STYLES)) {
        const run = seed => generateStyle({ style: id, params: {}, seed, role: style.roles[0], chords, sectionBeats: 8, bpb: 4, key: 'k' });
        assert.deepEqual(run(1), run(1), id);
        for (const e of run(1)) { assert.ok(e.at >= 0 && e.at < 8 && e.beats >= 0.25, id); assert.equal(e.at * 4 % 1, 0, `${id} on the sixteenth grid`); }
    }
    const lofi = seed => JSON.stringify(generateStyle({ style: 'lofi-rhodes', params: { density: 0.8 }, seed, role: 'comp', chords, sectionBeats: 8, bpb: 4, key: 'k' }));
    assert.notEqual(lofi(1), lofi(2));
});

test('style parameters: defaults, clamping, unknown keys and wrong roles are handled', () => {
    assert.equal(normalizeParams('lofi-rhodes', {}).density, 0.45);
    assert.equal(normalizeParams('lofi-rhodes', { density: 9 }).density, 1);
    assert.throws(() => normalizeParams('lofi-rhodes', { swing: 1 }), /没有参数/);
    assert.throws(() => normalizeParams('rock', {}, 'bass'), /不适用/);
    assert.throws(() => normalizeParams('nope', {}), /未知/);
    assert.deepEqual(stylesForRole('melody').map(s => s.id), ['arpeggio']);
});

test('operations apply atomically and never mutate the original', () => {
    const doc = createFromTemplate('pop', 'doc-1'), before = JSON.stringify(doc);
    const next = applyOps(doc, [{ type: 'setMeta', tempo: 100 }, { type: 'setChords', section: 'verse', from: 0, to: 8, chords: [{ at: 0, beats: 4, root: 'D', type: 'm7' }, { at: 4, beats: 4, root: 'G', type: '7' }] }], 1);
    assert.equal(JSON.stringify(doc), before);
    assert.equal(next.meta.tempo, 100);
    assert.deepEqual(next.chords.filter(c => c.section === 'verse').slice(0, 3).map(c => c.root + c.type), ['Dm7', 'G7', 'Aminor']);
    assert.throws(() => applyOps(doc, [{ type: 'setMeta', tempo: 90 }, { type: 'setChords', section: 'verse', from: 0, to: 4, chords: [{ at: 0, beats: 8, root: 'C', type: 'major' }] }]), /改写范围/);
    assert.equal(JSON.stringify(doc), before, 'a failing batch changes nothing');
    assert.throws(() => applyOps(doc, [{ type: 'explode' }]), /未知/);
    assert.throws(() => applyOps(doc, [{ type: 'setMeta', tempo: 90, secret: 1 }]), /不接受字段/);
    assert.throws(() => applyOps(doc, Array(LIMITS.ops + 1).fill({ type: 'setMeta', tempo: 90 })), /最多/);
});

test('setChords trims neighbours that overlap the rewritten range', () => {
    const doc = createFromTemplate('pop', 'doc-1');
    const next = applyOps(doc, [{ type: 'setChords', section: 'intro', from: 2, to: 6, chords: [{ at: 2, beats: 4, root: 'E', type: 'minor' }] }]);
    assert.deepEqual(next.chords.filter(c => c.section === 'intro').map(c => [c.at, c.beats, c.root]), [[0, 2, 'C'], [2, 4, 'E'], [6, 2, 'G'], [8, 4, 'A'], [12, 4, 'F']]);
});

test('sections: add with copy, move, resize trims, remove keeps at least one', () => {
    let doc = createFromTemplate('pop', 'doc-1');
    doc = applyOps(doc, [{ type: 'addSection', name: '副歌 反复', bars: 8, after: 'chorus', copyFrom: 'chorus' }]);
    const copy = doc.sections.at(-1);
    assert.equal(doc.chords.filter(c => c.section === copy.id).length, 8);
    assert.equal(doc.tracks.find(t => t.id === 'drum').clips[copy.id].style, 'rock');
    doc = applyOps(doc, [{ type: 'moveSection', section: copy.id, index: 0 }, { type: 'resizeSection', section: 'verse', bars: 2 }]);
    assert.equal(doc.sections[0].id, copy.id);
    assert.ok(doc.tracks.find(t => t.id === 'mel').clips.verse.events.every(e => e.at + e.beats <= 8));
    const single = createFromTemplate('blank', 'doc-2');
    assert.throws(() => applyOps(single, [{ type: 'removeSection', section: 'a' }]), /至少保留/);
});

test('changing a track role drops clips the new role cannot play', () => {
    const doc = applyOps(createFromTemplate('pop', 'doc-1'), [{ type: 'setTrack', track: 'comp', role: 'bass' }]);
    assert.deepEqual(doc.tracks.find(t => t.id === 'comp').clips, {});
    assert.throws(() => applyOps(doc, [{ type: 'setClipStyle', track: 'comp', section: 'intro', style: 'rock' }]), /不适用/);
});

test('transposition respells chords and notes in the new key', () => {
    const doc = createFromTemplate('lofi', 'doc-1');
    const up = applyOps(doc, [{ type: 'transpose', semitones: 2 }]);
    assert.equal(up.meta.key, 'F');
    assert.deepEqual(up.chords.slice(0, 4).map(c => c.root), ['G', 'C', 'F', 'D']);
    const pop = applyOps(createFromTemplate('pop', 'doc-2'), [{ type: 'transpose', semitones: 3 }]);
    assert.equal(pop.meta.key, 'E♭');
    assert.equal(pop.tracks[0].clips.verse.events[0].spelling, 'G4');
    assert.equal(pop.chords[1].root, 'B♭');
    const local = applyOps(createFromTemplate('pop', 'doc-3'), [{ type: 'transpose', semitones: -1, section: 'chorus' }]);
    assert.equal(local.meta.key, 'C'); assert.equal(local.chords.find(c => c.section === 'chorus').root, 'B');
});

test('key-aware spelling and Roman numerals', () => {
    assert.equal(keySignature('E♭', 'major'), -3); assert.equal(keySignature('F♯', 'minor'), 3); assert.equal(keySignature('C', 'major'), 0);
    assert.equal(spellInKey(63, 'E♭', 'major'), 'E♭4'); assert.equal(spellInKey(66, 'D', 'major'), 'F♯4');
    assert.equal(spellInKey(66, 'F', 'major'), 'G♭4', 'chromatic notes follow the flat side in flat keys');
    assert.equal(spellInKey(68, 'A', 'minor'), 'A♭4');
    assert.deepEqual(analyzeChord({ root: 'D', type: 'm7' }, 'C', 'major'), { numeral: 'ii7', fn: 'S' });
    assert.deepEqual(analyzeChord({ root: 'G', type: '7' }, 'C', 'major'), { numeral: 'V7', fn: 'D' });
    assert.deepEqual(analyzeChord({ root: 'B', type: 'm7b5' }, 'A', 'minor'), { numeral: 'iiø7', fn: 'S' });
    assert.equal(analyzeChord({ root: 'C', type: 'major', bass: 'E' }, 'C', 'major').numeral, 'I/E');
    assert.equal(positionLabel(9.5, 4), '3.2.5');
});

test('ABC output parses in abcjs without warnings and every attacked note is mapped', () => {
    for (const id of templates) for (const mode of ['score', 'lead']) {
        const doc = createFromTemplate(id, 'doc-1'), real = realize(doc), { abc, map, voices } = compileABC(real, doc, { mode });
        assert.doesNotThrow(() => checkABC(abc));
        const tune = ABCJS.parseOnly(abc)[0];
        assert.equal(tune.warnings, undefined, `${id}/${mode}: ${tune.warnings}`);
        const shown = new Set(voices.map(v => v.trackId));
        const expected = real.events.filter(e => !e.drum && shown.has(e.trackId));
        assert.equal(Object.keys(map).length, expected.length, `${id}/${mode}`);
        // The page matches a clicked or playing abcjs note by the character range it covers.
        const notes = tune.lines.flatMap(l => l.staff.flatMap(st => st.voices.flat())).filter(el => el.el_type === 'note');
        for (const [start] of Object.values(map)) assert.equal(notes.filter(n => start >= n.startChar && start < n.endChar).length, 1, `${id}/${mode}: ${start}`);
    }
});

test('ABC voices fill every bar with the right number of beats', () => {
    const doc = createFromTemplate('waltz', 'doc-1'), real = realize(doc), { abc } = compileABC(real, doc);
    const tune = ABCJS.parseOnly(abc)[0];
    for (const line of tune.lines) for (const staff of line.staff) for (const voice of staff.voices) {
        let beats = 0;
        for (const el of voice) {
            if (el.el_type === 'note') beats += el.duration * 4;
            if (el.el_type === 'bar') { assert.equal(Math.round(beats * 1000) / 1000, 3); beats = 0; }
        }
    }
    assert.equal(abcKey('E♭', 'major'), 'Eb'); assert.equal(abcKey('F♯', 'minor'), 'F#m');
    assert.deepEqual(splitDuration(2.25), [2, 0.25]); assert.deepEqual(splitDuration(5), [4, 1]);
});

test('ABC accidentals follow the key signature and reset at bar lines', () => {
    const doc = applyOps(createFromTemplate('blank', 'doc-1'), [
        { type: 'setMeta', key: 'F' },
        { type: 'setClipNotes', track: 'mel', section: 'a', events: [{ at: 0, beats: 1, pitch: 70, spelling: 'B♭4' }, { at: 1, beats: 1, pitch: 71, spelling: 'B4' }, { at: 2, beats: 1, pitch: 71, spelling: 'B4' }, { at: 4, beats: 1, pitch: 71, spelling: 'B4' }] }
    ]);
    const { abc } = compileABC(realize(doc), doc, { mode: 'lead' });
    const body = abc.slice(abc.indexOf('%%MIDI'));
    assert.match(body, /B =B B z \| =B/, body);
});

test('Strudel export: one cycle per bar, sixteenth steps, spelled note names', () => {
    const doc = createFromTemplate('lofi', 'doc-1'), code = compileStrudel(realize(doc), doc);
    assert.match(code, /setcpm\(18\)/);
    assert.match(code, /s\("<\[\[bd,hh\]/);
    assert.match(code, /note\("<\[f2@16\] \[bb2@16\]/);
    for (const pattern of code.match(/"<[^"]*>"/g)) {
        const bars = pattern.slice(2, -2).match(/\[(?:[^\[\]]|\[[^\]]*\])*\]|~/g);
        assert.equal(bars.length, 8);
        for (const bar of bars) if (bar !== '~') {
            const steps = bar.slice(1, -1).replace(/\[[^\]]*\]/g, 'x').split(' ').reduce((n, t) => n + Number(t.split('@')[1] || 1), 0);
            assert.equal(steps, 16, bar);
        }
    }
    assert.equal(strudelNote(70, 'B♭4'), 'bb4'); assert.equal(strudelNote(61, 'B𝄪3'), 'c#4');
    const muted = applyOps(doc, [{ type: 'setTrack', track: 'drum', mute: true }]);
    assert.ok(!compileStrudel(realize(muted), muted).includes('bd'));
});

test('rule checks: range, crossing, gaps and classical parallels', () => {
    let doc = applyOps(createFromTemplate('blank', 'doc-1'), [
        { type: 'setClipNotes', track: 'mel', section: 'a', events: [{ at: 0, beats: 1, pitch: 96 }] },
        { type: 'setChords', section: 'a', from: 0, to: 4, chords: [{ at: 0, beats: 4, root: 'C', type: 'major' }] }
    ]);
    const codes = checkArrangement(realize(doc), doc).map(i => i.code);
    assert.ok(codes.includes('range')); assert.ok(codes.includes('chord-gaps'));
    doc = applyOps(createFromTemplate('blank', 'doc-2'), [
        { type: 'setMeta', classical: true }, { type: 'addTrack', id: 'bass', role: 'bass' },
        { type: 'setClipNotes', track: 'mel', section: 'a', events: [{ at: 0, beats: 1, pitch: 67 }, { at: 1, beats: 1, pitch: 69 }] },
        { type: 'setClipNotes', track: 'bass', section: 'a', events: [{ at: 0, beats: 1, pitch: 48 }, { at: 1, beats: 1, pitch: 50 }] }
    ]);
    assert.ok(checkArrangement(realize(doc), doc).some(i => i.code === 'parallels'));
    const relaxed = applyOps(doc, [{ type: 'setMeta', classical: false }]);
    assert.ok(!checkArrangement(realize(relaxed), relaxed).some(i => i.code === 'parallels'));
});

test('playback applies mute, solo, volume, swing and the loop region', () => {
    const doc = applyOps(createFromTemplate('lofi', 'doc-1'), [{ type: 'setTrack', track: 'drum', solo: true }]);
    const notes = playbackNotes(realize(doc), doc, { from: 4, to: 8 });
    assert.ok(notes.length && notes.every(n => n.trackId === 'drum' && n.start >= 0 && n.start < 4));
    const offbeat = notes.find(n => Math.abs(n.start - 0.6) < 1e-9);
    assert.ok(offbeat, 'off-beat eighths move to the swing ratio');
    const quiet = applyOps(doc, [{ type: 'setTrack', track: 'drum', volume: 0.5 }]);
    assert.ok(playbackNotes(realize(quiet), quiet)[0].vel < playbackNotes(realize(doc), doc)[0].vel);
});

test('storage: separate key, round trip, corrupt data blocks saving instead of being replaced', () => {
    const doc = createFromTemplate('pop', 'doc-1'), storage = memory();
    assert.deepEqual(loadStore(storage).store, freshStore());
    assert.equal(saveStore(storage, { version: 1, active: doc.id, arrangements: [doc] }), null);
    assert.ok(storage.data.has(ARRANGE_KEY) && !storage.data.has('hive-music-v1'));
    assert.deepEqual(loadStore(storage).store.arrangements[0], doc);
    const corrupt = memory({ [ARRANGE_KEY]: '{"version":2}' }), loaded = loadStore(corrupt);
    assert.equal(loaded.blocked, true); assert.equal(corrupt.getItem(ARRANGE_KEY), '{"version":2}');
    assert.throws(() => validateStore({ version: 1, arrangements: [doc, doc] }), /重复/);
    assert.throws(() => validateStore({ version: 1, arrangements: Array(LIMITS.docs + 1).fill(doc) }), /最多/);
    assert.equal(saveStore({ setItem() { throw new Error('full'); } }, freshStore()).includes('未能保存'), true);
});

test('documents reject bad values instead of guessing', () => {
    const doc = createFromTemplate('pop', 'doc-1');
    const bad = patch => () => validateDocument({ ...JSON.parse(JSON.stringify(doc)), ...patch });
    assert.throws(bad({ version: 2 }), /version/);
    assert.throws(bad({ meta: { ...doc.meta, tempo: 300 } }), /速度/);
    assert.throws(bad({ meta: { ...doc.meta, key: 'D♭', mode: 'minor' } }), /调号/);
    assert.throws(bad({ chords: [...doc.chords, { ...doc.chords[0], id: 'dup' }] }), /重叠/);
    assert.throws(bad({ chords: [{ ...doc.chords[0], at: 0.1 }] }), /0.25/);
    assert.throws(bad({ tracks: [{ ...doc.tracks[0], clips: { intro: { kind: 'notes', events: [{ at: 0, beats: 1, pitch: 200 }] } } }] }), /音域/);
    assert.equal(Object.keys(OPS).length, 14);
    assert.throws(() => validateOp({ type: 'transpose', semitones: 0 }), /移调/);
});

test('proposal helpers: hash ignores save time, selected ops fall back one by one, every op type is described', async () => {
    const doc = createFromTemplate('pop', 'doc-1');
    assert.equal(await docHash(doc), await docHash({ ...doc, updatedAt: 123 }));
    assert.notEqual(await docHash(doc), await docHash(applyOps(doc, [{ type: 'setMeta', tempo: 90 }])));
    const ops = [{ type: 'setMeta', tempo: 90 }, { type: 'setClipStyle', track: 'gone', section: 'verse', style: 'block' }, { type: 'transpose', semitones: 2 }];
    const result = applySelected(doc, ops);
    assert.deepEqual(result.applied, [0, 2]); assert.equal(result.skipped[0].index, 1);
    assert.equal(result.doc.meta.tempo, 90); assert.equal(result.doc.meta.key, 'D');
    assert.deepEqual(applySelected(doc, []).applied, []);
    const samples = { setMeta: { tempo: 90 }, setChords: { section: 'verse', from: 0, to: 4, chords: [{ at: 0, beats: 4, root: 'D', type: 'm7' }] }, addSection: { name: '尾声', bars: 2 }, removeSection: { section: 'intro' }, moveSection: { section: 'intro', index: 1 }, resizeSection: { section: 'intro', bars: 2 }, renameSection: { section: 'intro', name: '引子' }, addTrack: { role: 'pad' }, removeTrack: { track: 'drum' }, setTrack: { track: 'comp', volume: 0.5, mute: true }, setClipStyle: { track: 'comp', section: 'verse', style: 'lofi-rhodes', params: { density: 0.3 } }, setClipNotes: { track: 'mel', section: 'intro', events: [] }, clearClip: { track: 'comp', section: 'intro' }, transpose: { semitones: -2, section: 'verse' } };
    assert.deepEqual(Object.keys(samples).sort(), Object.keys(OPS).sort());
    for (const [type, fields] of Object.entries(samples)) {
        const text = describeOp({ type, ...fields }, doc);
        assert.ok(text && !text.includes('undefined'), `${type}: ${text}`);
        assert.doesNotThrow(() => applyOps(doc, [{ type, ...fields }]), type);
    }
});

test('instrument ids, names and exports cover every sample bank', async () => {
    const { INSTRUMENTS } = await import('../static/music/audio.mjs');
    const { INSTRUMENT_IDS, INSTRUMENT_NAMES } = await import('../static/music/arrangement-schema.mjs');
    const { MIDI_PROGRAM } = await import('../static/music/arrange-abc.mjs');
    assert.deepEqual(INSTRUMENT_IDS, Object.keys(INSTRUMENTS), 'the schema copy used by the quiz function must list the page banks in the same order');
    for (const id of INSTRUMENT_IDS) {
        assert.equal(INSTRUMENT_NAMES[id], INSTRUMENTS[id].name, id);
        assert.ok(Number.isInteger(MIDI_PROGRAM[id]) && MIDI_PROGRAM[id] >= 0 && MIDI_PROGRAM[id] < 128, `MIDI program for ${id}`);
    }
    assert.equal(new Set(Object.values(MIDI_PROGRAM)).size, INSTRUMENT_IDS.length, 'each bank exports a distinct General MIDI program');
});

test('tracks play and export their own instrument; new tracks start with one that suits the role', () => {
    const doc = createFromTemplate('bossa', 'arr-inst');
    assert.equal(doc.tracks.find(t => t.id === 'guitar').instrument, 'nylon');
    const notes = playbackNotes(realize(doc), doc);
    const byTrack = new Map(notes.map(n => [n.trackId, n.instrument]));
    for (const t of doc.tracks) if (byTrack.has(t.id)) assert.equal(byTrack.get(t.id), t.instrument, t.id);
    const withCello = applyOps(doc, [{ type: 'addTrack', role: 'bass', id: 'low' }, { type: 'setTrack', track: 'low', instrument: 'cello' }]);
    assert.equal(withCello.tracks.find(t => t.id === 'low').instrument, 'cello');
    assert.equal(applyOps(doc, [{ type: 'addTrack', role: 'pad', id: 'wash' }]).tracks.find(t => t.id === 'wash').instrument, 'strings');
    assert.equal(applyOps(doc, [{ type: 'addTrack', role: 'bass', id: 'b2' }]).tracks.find(t => t.id === 'b2').instrument, 'bass');
    assert.throws(() => validateDocument({ ...doc, tracks: [{ ...doc.tracks[0], instrument: 'kazoo' }] }), /音色无效/);
    assert.match(describeOp({ type: 'setTrack', track: 'guitar', instrument: 'cleanguitar' }, doc), /音色清音电吉他/);
    const celloBass = applyOps(doc, [{ type: 'setTrack', track: 'bass', instrument: 'cello' }]);
    assert.match(compileABC(realize(celloBass), celloBass).abc, /%%MIDI program 42/);
});

test('changing a track instrument during playback starts loading the new bank without restarting', async () => {
    const doc = createFromTemplate('pop', 'arr-live');
    const loads = [], audio = { context: { currentTime: 0 }, load: async (pitch, instrument) => { loads.push(`${instrument}:${pitch}`); } };
    const player = new ArrangePlayer(audio);
    Object.assign(player, { running: true, notes: [], length: 80, loop: false, spb: 0.5, origin: 0, index: 0, iteration: 0, scheduled: -1 });
    const edited = applyOps(doc, [{ type: 'setTrack', track: 'bass', instrument: 'cello' }]);
    const notes = playbackNotes(realize(edited), edited);
    const generation = player.generation;
    player.update(notes, { tempo: edited.meta.tempo, length: 80 });
    await new Promise(r => setTimeout(r, 0));
    const bassPitches = new Set(notes.filter(n => n.trackId === 'bass').map(n => n.pitch));
    assert.ok(bassPitches.size > 0);
    for (const pitch of bassPitches) assert.ok(loads.includes(`cello:${pitch}`), `cello:${pitch} requested`);
    assert.ok(!loads.some(l => l.startsWith('undefined:')), 'drum hits are not loaded as samples');
    assert.equal(player.generation, generation, 'the edit does not restart playback');
    assert.equal(player.notes, notes);
});
