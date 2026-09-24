// Arrangement document model: operations, realization into timed events, key-aware spelling,
// Roman numeral analysis and browser storage. Pure functions; the UI lives in arrange.mjs.
import { makeChord, rootPC, spellPitch, chordType, PROGRESSIONS } from './harmony.mjs';
import { generateStyle, STYLES } from './arrange-styles.mjs';
import { LIMITS, ROLES, ROOTS, GRID, MAJOR_KEYS, MINOR_KEYS, beatsPerBar, validateChord, validateDocument, validateOp } from './arrangement-schema.mjs';

export const ARRANGE_KEY = 'hive-music-arrange-v1';
const clone = value => JSON.parse(JSON.stringify(value));
const NATURAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MODE_STEPS = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const SHARP_KEYS = { major: ['G', 'D', 'A', 'E', 'B', 'F♯'], minor: ['E', 'B', 'F♯', 'C♯', 'G♯'] };
const FLAT_KEYS = { major: ['F', 'B♭', 'E♭', 'A♭', 'D♭'], minor: ['D', 'G', 'C', 'F', 'B♭', 'E♭'] };

export const keySignature = (key, mode) => {
    const sharps = SHARP_KEYS[mode].indexOf(key), flats = FLAT_KEYS[mode].indexOf(key);
    return sharps >= 0 ? sharps + 1 : flats >= 0 ? -(flats + 1) : 0;
};
/** Accidental (in semitones) that the key signature applies to each letter. */
export function signatureAccidentals(key, mode) {
    const count = keySignature(key, mode), out = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
    const order = count > 0 ? 'FCGDAEB' : 'BEADGCF';
    for (let i = 0; i < Math.abs(count); i++) out[order[i]] = Math.sign(count);
    return out;
}
export const spellingMidi = spelling => {
    const m = /^([A-G])(𝄫|♭|♯|𝄪)?(-?\d)$/u.exec(spelling);
    return (Number(m[3]) + 1) * 12 + NATURAL[m[1]] + ({ '𝄫': -2, '♭': -1, '♯': 1, '𝄪': 2 }[m[2]] || 0);
};
/** Spells a MIDI pitch inside a key: scale tones by scale degree, others by the key's side. */
export function spellInKey(midi, key, mode) {
    const tonic = rootPC(key), degree = MODE_STEPS[mode].indexOf(((midi - tonic) % 12 + 12) % 12);
    if (degree >= 0) return spellPitch(key, degree + 1, midi);
    const flats = keySignature(key, mode) < 0 || (keySignature(key, mode) === 0 && mode === 'minor');
    const names = flats ? ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'] : ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    const name = names[midi % 12];
    return spellPitch(name, 1, midi);
}
/** Chord roots follow the same side of the circle as the key. */
export function transposeRoot(root, semitones, key, mode) {
    const pc = (rootPC(root) + semitones + 120) % 12;
    return spellInKey(60 + pc, key, mode).replace(/-?\d+$/, '');
}

const ROMAN = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];
/** Roman numeral and a coarse function (T/S/D) relative to the key; not a full harmonic analysis. */
export function analyzeChord(chord, key, mode) {
    const type = chordType(chord.type), interval = (rootPC(chord.root) - rootPC(key) + 12) % 12;
    const minorThird = type.semitones.includes(3) && !type.semitones.includes(4);
    let numeral = ROMAN[interval];
    if (mode === 'minor') numeral = ({ 3: 'III', 8: 'VI', 10: 'VII' })[interval] ?? numeral;
    if (minorThird) numeral = numeral.toLowerCase();
    const suffix = { dim: '°', m7b5: 'ø7', dim7: '°7', aug: '+', maj7: 'maj7', maj9: 'maj9', mMaj7: '(maj7)', '7': '7', m7: '7', '9': '9', m9: '9', '13': '13', '7b9': '7(♭9)', '7s9': '7(♯9)', '7s11': '7(♯11)', '6': '6', m6: '6', sus2: 'sus2', sus4: 'sus4', add9: 'add9' }[chord.type] ?? '';
    const tonic = mode === 'major' ? [0, 4, 9] : [0, 3, 8], sub = mode === 'major' ? [2, 5] : [2, 5], dom = [7, 11, mode === 'minor' ? 10 : -1];
    const fn = tonic.includes(interval) ? 'T' : sub.includes(interval) ? 'S' : dom.includes(interval) ? 'D' : '';
    return { numeral: numeral + suffix + (chord.bass ? `/${chord.bass}` : ''), fn };
}
export const chordSymbol = chord => chord.root + chordType(chord.type).symbol + (chord.bass ? `/${chord.bass}` : '');
export function positionLabel(beat, bpb) {
    const bar = Math.floor(beat / bpb + 1e-9), inBar = beat - bar * bpb;
    return `${bar + 1}.${+(inBar + 1).toFixed(2)}`;
}

// ---------- operations ----------
const nextId = (taken, prefix) => { let i = 1; while (taken.has(`${prefix}${i}`)) i++; const value = `${prefix}${i}`; taken.add(value); return value; };
const sectionOf = (doc, sid) => doc.sections.find(s => s.id === sid) || (() => { throw new Error(`段落不存在：${sid}`); })();
const trackOf = (doc, tid) => doc.tracks.find(t => t.id === tid) || (() => { throw new Error(`声部不存在：${tid}`); })();

// Keeps chords and notes inside their (possibly shortened) sections.
function trimToSections(doc) {
    const bpb = beatsPerBar(doc.meta.meter), length = Object.fromEntries(doc.sections.map(s => [s.id, s.bars * bpb]));
    doc.chords = doc.chords.filter(c => c.at < length[c.section]).map(c => ({ ...c, beats: Math.min(c.beats, length[c.section] - c.at) }));
    for (const t of doc.tracks) for (const [sid, clip] of Object.entries(t.clips)) {
        if (clip.kind === 'notes') clip.events = clip.events.filter(e => e.at < length[sid]).map(e => ({ ...e, beats: Math.min(e.beats, length[sid] - e.at) }));
    }
}

function applyOne(doc, op, ids) {
    const bpb = beatsPerBar(doc.meta.meter);
    switch (op.type) {
    case 'setMeta': {
        if (op.title !== undefined) doc.title = op.title;
        for (const key of ['tempo', 'meter', 'key', 'mode', 'swing', 'tags', 'classical']) if (op[key] !== undefined) doc.meta[key] = op[key];
        if (op.meter !== undefined) trimToSections(doc);
        break;
    }
    case 'setChords': {
        const section = sectionOf(doc, op.section), length = section.bars * bpb;
        const from = op.from, to = op.to;
        if (!(from >= 0 && to > from && to <= length + 1e-9)) throw new Error('和弦改写范围超出段落。');
        const kept = [];
        for (const c of doc.chords) {
            if (c.section !== op.section || c.at + c.beats <= from || c.at >= to) { kept.push(c); continue; }
            if (c.at < from) kept.push({ ...c, beats: from - c.at });
            if (c.at + c.beats > to) kept.push({ ...c, id: nextId(ids, 'c'), at: to, beats: c.at + c.beats - to });
        }
        const added = op.chords.map((c, i) => {
            const valid = validateChord(c, length, `第 ${i + 1} 个新和弦`);
            if (valid.at < from - 1e-9 || valid.at + valid.beats > to + 1e-9) throw new Error('新和弦须位于改写范围内。');
            return { ...valid, id: nextId(ids, 'c'), section: op.section };
        });
        doc.chords = [...kept, ...added];
        break;
    }
    case 'addSection': {
        const sid = op.id && !ids.has(op.id) ? (ids.add(op.id), op.id) : nextId(ids, 's');
        const index = op.after == null ? doc.sections.length : doc.sections.findIndex(s => s.id === op.after) + 1;
        if (index === 0 && op.after != null) throw new Error(`段落不存在：${op.after}`);
        doc.sections.splice(index, 0, { id: sid, name: op.name, bars: op.bars });
        if (op.copyFrom != null) {
            const source = sectionOf(doc, op.copyFrom);
            for (const c of doc.chords.filter(c => c.section === source.id)) doc.chords.push({ ...c, id: nextId(ids, 'c'), section: sid });
            for (const t of doc.tracks) if (t.clips[source.id]) t.clips[sid] = clone(t.clips[source.id]);
            trimToSections(doc);
        }
        break;
    }
    case 'removeSection': {
        sectionOf(doc, op.section);
        if (doc.sections.length === 1) throw new Error('至少保留一个段落。');
        doc.sections = doc.sections.filter(s => s.id !== op.section);
        doc.chords = doc.chords.filter(c => c.section !== op.section);
        for (const t of doc.tracks) delete t.clips[op.section];
        break;
    }
    case 'moveSection': {
        const section = sectionOf(doc, op.section);
        if (!Number.isInteger(op.index) || op.index < 0 || op.index >= doc.sections.length) throw new Error('段落位置无效。');
        doc.sections = doc.sections.filter(s => s !== section); doc.sections.splice(op.index, 0, section);
        break;
    }
    case 'resizeSection': sectionOf(doc, op.section).bars = op.bars; trimToSections(doc); break;
    case 'renameSection': sectionOf(doc, op.section).name = op.name; break;
    case 'addTrack': {
        if (!ROLES[op.role]) throw new Error('声部类型无效。');
        const tid = op.id && !ids.has(op.id) ? (ids.add(op.id), op.id) : nextId(ids, 't');
        doc.tracks.push({ id: tid, name: op.name ?? ROLES[op.role], role: op.role, instrument: op.instrument ?? 'grand', volume: 0.8, mute: false, solo: false, clips: {} });
        break;
    }
    case 'removeTrack': trackOf(doc, op.track); doc.tracks = doc.tracks.filter(t => t.id !== op.track); break;
    case 'setTrack': {
        const track = trackOf(doc, op.track);
        for (const key of ['name', 'instrument', 'volume', 'mute', 'solo']) if (op[key] !== undefined) track[key] = op[key];
        if (op.role !== undefined && op.role !== track.role) {
            // Clips that the new role cannot play are dropped instead of failing the whole edit.
            track.role = op.role;
            for (const [sid, clip] of Object.entries(track.clips)) if ((clip.kind === 'style' && !STYLES[clip.style].roles.includes(op.role)) || (clip.kind === 'notes' && op.role === 'drums')) delete track.clips[sid];
        }
        break;
    }
    case 'setClipStyle': {
        const track = trackOf(doc, op.track); sectionOf(doc, op.section);
        const old = track.clips[op.section];
        track.clips[op.section] = { kind: 'style', style: op.style, params: op.params ?? (old?.kind === 'style' && old.style === op.style ? old.params : {}), seed: op.seed ?? (old?.kind === 'style' ? old.seed : 1) };
        break;
    }
    case 'setClipNotes': trackOf(doc, op.track).clips[sectionOf(doc, op.section).id] = { kind: 'notes', events: op.events }; break;
    case 'clearClip': delete trackOf(doc, op.track).clips[sectionOf(doc, op.section).id]; break;
    case 'transpose': {
        const whole = op.section == null && op.track == null;
        if (op.section != null) sectionOf(doc, op.section);
        if (op.track != null) trackOf(doc, op.track);
        // Both key lists are in chromatic order from C, so the new key is found by pitch class.
        const keys = doc.meta.mode === 'major' ? MAJOR_KEYS : MINOR_KEYS;
        const keyAfter = whole ? keys[(rootPC(doc.meta.key) + op.semitones + 120) % 12] : doc.meta.key;
        const inScope = sid => op.section == null || sid === op.section;
        if (op.track == null) doc.chords = doc.chords.map(c => inScope(c.section) ? { ...c, root: transposeRoot(c.root, op.semitones, keyAfter, doc.meta.mode), bass: c.bass ? transposeRoot(c.bass, op.semitones, keyAfter, doc.meta.mode) : null } : c);
        for (const t of doc.tracks) {
            if (op.track != null && t.id !== op.track) continue;
            for (const [sid, clip] of Object.entries(t.clips)) {
                if (!inScope(sid) || clip.kind !== 'notes') continue;
                clip.events = clip.events.map(e => { const pitch = e.pitch + op.semitones; if (pitch < 21 || pitch > 108) throw new Error('移调后有音符超出钢琴音域。'); return { ...e, pitch, spelling: spellInKey(pitch, keyAfter, doc.meta.mode) }; });
            }
        }
        if (whole) doc.meta.key = keyAfter;
        break;
    }
    default: throw new Error(`未知的编曲操作：${op.type}`);
    }
}

/** Applies operations atomically: either all succeed and the result validates, or nothing changes. */
export function applyOps(doc, ops, now = Date.now()) {
    if (!Array.isArray(ops) || !ops.length || ops.length > LIMITS.ops) throw new Error(`一次最多 ${LIMITS.ops} 项修改。`);
    const next = clone(doc);
    const ids = new Set([...next.sections.map(s => s.id), ...next.chords.map(c => c.id), ...next.tracks.map(t => t.id)]);
    for (const op of ops) applyOne(next, validateOp(op), ids);
    next.updatedAt = now;
    return validateDocument(next);
}

// ---------- proposals ----------
/** Stable JSON (sorted keys) used for hashing on both the page and the server. */
export function canonicalJSON(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`).join(',')}}`;
    return JSON.stringify(value);
}
/** SHA-256 of the document content; the save time is left out so only real edits change it. */
export async function docHash(doc) {
    const { updatedAt, ...content } = doc;
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJSON(content)));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
/**
 * Applies the chosen proposal operations. The batch is tried first; if the document changed since
 * the proposal was made and the batch no longer applies, each operation is tried on its own and the
 * ones that conflict are reported instead of failing everything.
 */
export function applySelected(doc, ops, now = Date.now()) {
    if (!ops.length) return { doc, applied: [], skipped: [] };
    try { return { doc: applyOps(doc, ops, now), applied: ops.map((_, i) => i), skipped: [] }; } catch { /* fall back to one at a time */ }
    let current = doc; const applied = [], skipped = [];
    ops.forEach((op, i) => {
        try { current = applyOps(current, [op], now); applied.push(i); } catch (error) { skipped.push({ index: i, error: error.message }); }
    });
    return { doc: current, applied, skipped };
}
/** One-line Chinese description of an operation, for reviewing proposals. */
export function describeOp(op, doc) {
    const section = id => doc.sections.find(s => s.id === id)?.name ?? id, track = id => doc.tracks.find(t => t.id === id)?.name ?? id;
    const bpb = beatsPerBar(doc.meta.meter), at = (sid, beat) => `${section(sid)} ${positionLabel(beat, bpb)}`;
    switch (op.type) {
    case 'setMeta': return `基本信息：${[op.title && `标题“${op.title}”`, op.tempo && `速度 ${op.tempo}`, op.meter && `拍号 ${op.meter}`, op.key && `调 ${op.key}`, op.mode && (op.mode === 'minor' ? '小调' : '大调'), op.swing !== undefined && (op.swing > 0.5 ? `摇摆 ${Math.round(op.swing * 100)}%` : '直拍'), op.tags && `标签 ${op.tags.join('、')}`, op.classical !== undefined && (op.classical ? '启用古典规则' : '关闭古典规则')].filter(Boolean).join('，')}`;
    case 'setChords': return `和弦：${at(op.section, op.from)} 到 ${positionLabel(op.to, bpb)} 改为 ${op.chords.map(c => chordSymbol({ bass: null, inversion: 0, ...c })).join(' ') || '（清空）'}`;
    case 'addSection': return `新增段落“${op.name}”，${op.bars} 小节${op.copyFrom ? `，复制自“${section(op.copyFrom)}”` : ''}`;
    case 'removeSection': return `删除段落“${section(op.section)}”`;
    case 'moveSection': return `把“${section(op.section)}”移到第 ${op.index + 1} 段`;
    case 'resizeSection': return `“${section(op.section)}”改为 ${op.bars} 小节`;
    case 'renameSection': return `“${section(op.section)}”改名为“${op.name}”`;
    case 'addTrack': return `新增${ROLES[op.role] ?? ''}声部${op.name ? `“${op.name}”` : ''}`;
    case 'removeTrack': return `删除声部“${track(op.track)}”`;
    case 'setTrack': return `声部“${track(op.track)}”：${[op.name && `改名“${op.name}”`, op.role && `类型${ROLES[op.role]}`, op.instrument && `导出音色 ${op.instrument}`, op.volume !== undefined && `音量 ${Math.round(op.volume * 100)}%`, op.mute !== undefined && (op.mute ? '静音' : '取消静音'), op.solo !== undefined && (op.solo ? '独奏' : '取消独奏')].filter(Boolean).join('，')}`;
    case 'setClipStyle': return `“${track(op.track)}”在“${section(op.section)}”使用${STYLES[op.style]?.name ?? op.style}${op.params && Object.keys(op.params).length ? `（${Object.entries(op.params).map(([k, v]) => `${STYLES[op.style]?.params[k]?.label ?? k} ${typeof v === 'boolean' ? (v ? '开' : '关') : STYLES[op.style]?.params[k]?.values?.[v] ?? v}`).join('，')}）` : ''}`;
    case 'setClipNotes': return `“${track(op.track)}”在“${section(op.section)}”写入 ${op.events.length} 个音符`;
    case 'clearClip': return `清空“${track(op.track)}”在“${section(op.section)}”的片段`;
    case 'transpose': return `${op.track ? `声部“${track(op.track)}”` : op.section ? `段落“${section(op.section)}”` : '整首'}移调 ${op.semitones > 0 ? '+' : ''}${op.semitones} 个半音`;
    default: return op.type;
    }
}

// ---------- realization ----------
/** Expands chords and clips into timed events (beats from the start of the piece). */
export function realize(doc) {
    const bpb = beatsPerBar(doc.meta.meter), sections = [], chords = [], events = [];
    let start = 0;
    for (const s of doc.sections) { sections.push({ ...s, start, beats: s.bars * bpb }); start += s.bars * bpb; }
    const totalBeats = start;
    for (const section of sections) {
        const local = doc.chords.filter(c => c.section === section.id).sort((a, b) => a.at - b.at);
        for (const c of local) {
            const voiced = makeChord(c.root, c.type, { inversion: c.inversion, voicing: c.voicing, octave: 4 });
            chords.push({ ...c, start: section.start + c.at, symbol: chordSymbol(c), ...analyzeChord(c, doc.meta.key, doc.meta.mode), notes: voiced.right, spellings: voiced.spellings });
        }
        for (const track of doc.tracks) {
            const clip = track.clips[section.id];
            if (!clip) continue;
            const raw = clip.kind === 'style'
                ? generateStyle({ style: clip.style, params: clip.params, seed: clip.seed, role: track.role, chords: local, sectionBeats: section.beats, bpb, key: `${track.id}|${section.id}` })
                : clip.events;
            raw.forEach((e, i) => {
                const beats = Math.min(e.beats, section.beats - e.at);
                if (beats <= 0) return;
                events.push({
                    id: clip.kind === 'style' ? `${track.id}~${section.id}~${i}` : e.id, trackId: track.id, role: track.role, sectionId: section.id, generated: clip.kind === 'style',
                    start: section.start + e.at, beats, pitch: e.pitch, vel: e.vel, drum: e.drum ?? null,
                    spelling: e.drum ? null : e.spelling || spellInKey(e.pitch, doc.meta.key, doc.meta.mode)
                });
            });
        }
    }
    events.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
    return { bpb, totalBeats, sections, chords, events };
}

// ---------- templates ----------
const chordAt = (at, beats, root, type, extra = {}) => ({ at, beats, root, type, ...extra });
function baseDoc(id, title, meta, sections) {
    return { version: 1, id, title, updatedAt: 0, meta: { swing: 0.5, tags: [], classical: false, ...meta }, sections, chords: [], tracks: [] };
}
function withChords(doc, sid, list) { list.forEach((c, i) => doc.chords.push({ ...c, id: `${sid}c${i + 1}`, section: sid })); return doc; }
const track = (id, role, name, instrument, clips) => ({ id, role, name, instrument, volume: role === 'drums' ? 0.7 : 0.8, mute: false, solo: false, clips });
const notes = list => ({ kind: 'notes', events: list.map(([at, beats, spelling]) => ({ at, beats, pitch: spellingMidi(spelling), spelling, vel: 84 })) });

export const TEMPLATES = {
    pop: { name: '流行 · I–V–vi–IV', build: id => {
        const doc = baseDoc(id, '窗外的晴天', { tempo: 88, meter: '4/4', key: 'C', mode: 'major', tags: ['流行'] }, [{ id: 'intro', name: '前奏', bars: 4 }, { id: 'verse', name: '主歌', bars: 8 }, { id: 'chorus', name: '副歌', bars: 8 }]);
        const loop = (sid, bars) => withChords(doc, sid, Array.from({ length: bars }, (_, i) => chordAt(i * 4, 4, ['C', 'G', 'A', 'F'][i % 4], ['major', 'major', 'minor', 'major'][i % 4])));
        loop('intro', 4); loop('verse', 8); loop('chorus', 8);
        doc.tracks = [
            track('mel', 'melody', '旋律', 'grand', { verse: notes([[0, 1, 'E4'], [1, 1, 'G4'], [2, 1.5, 'C5'], [3.5, 0.5, 'B4'], [4, 2, 'B4'], [6, 1, 'G4'], [7, 1, 'D4'], [8, 1.5, 'C5'], [9.5, 0.5, 'B4'], [10, 1, 'A4'], [11, 1, 'E4'], [12, 2, 'F4'], [14, 1, 'A4'], [15, 1, 'G4']]) }),
            track('comp', 'comp', '钢琴伴奏', 'grand', { intro: { kind: 'style', style: 'arpeggio', params: {}, seed: 1 }, verse: { kind: 'style', style: 'arpeggio', params: {}, seed: 1 }, chorus: { kind: 'style', style: 'pulse', params: {}, seed: 1 } }),
            track('bass', 'bass', '低音', 'grand', { intro: { kind: 'style', style: 'root', params: {}, seed: 1 }, verse: { kind: 'style', style: 'root-fifth', params: {}, seed: 1 }, chorus: { kind: 'style', style: 'octave', params: {}, seed: 1 } }),
            track('drum', 'drums', '鼓组', 'grand', { verse: { kind: 'style', style: 'rock', params: {}, seed: 1 }, chorus: { kind: 'style', style: 'rock', params: { fill: true }, seed: 1 } })
        ];
        return doc;
    } },
    lofi: { name: 'Lo-fi · ii–V–I–vi', build: id => {
        const doc = baseDoc(id, '深夜的台灯', { tempo: 72, meter: '4/4', key: 'E♭', mode: 'major', swing: 0.6, tags: ['lo-fi', '温暖'] }, [{ id: 'a', name: 'A 段', bars: 8 }]);
        withChords(doc, 'a', Array.from({ length: 8 }, (_, i) => chordAt(i * 4, 4, ['F', 'B♭', 'E♭', 'C'][i % 4], ['m9', '13', 'maj9', 'm7'][i % 4])));
        doc.tracks = [track('keys', 'comp', '电钢', 'electric', { a: { kind: 'style', style: 'lofi-rhodes', params: {}, seed: 3 } }), track('bass', 'bass', '低音', 'grand', { a: { kind: 'style', style: 'root', params: {}, seed: 1 } }), track('drum', 'drums', '鼓组', 'grand', { a: { kind: 'style', style: 'boom-bap', params: {}, seed: 2 } })];
        return doc;
    } },
    bossa: { name: 'Bossa · ii–V–I', build: id => {
        const doc = baseDoc(id, '海边的周日', { tempo: 120, meter: '4/4', key: 'F', mode: 'major', tags: ['bossa'] }, [{ id: 'a', name: 'A 段', bars: 8 }]);
        withChords(doc, 'a', [['G', 'm7'], ['C', '7'], ['F', 'maj7'], ['F', 'maj7'], ['G', 'm7'], ['C', '7b9'], ['F', '6'], ['F', '6']].map(([r, t], i) => chordAt(i * 4, 4, r, t)));
        doc.tracks = [track('guitar', 'comp', '伴奏', 'grand', { a: { kind: 'style', style: 'bossa', params: {}, seed: 1 } }), track('bass', 'bass', '低音', 'grand', { a: { kind: 'style', style: 'root-fifth', params: {}, seed: 1 } }), track('perc', 'drums', '打击乐', 'grand', { a: { kind: 'style', style: 'bossa-perc', params: {}, seed: 1 } })];
        return doc;
    } },
    waltz: { name: '圆舞曲 · 3/4', build: id => {
        const doc = baseDoc(id, '午后圆舞', { tempo: 108, meter: '3/4', key: 'G', mode: 'major', tags: ['圆舞曲'], classical: true }, [{ id: 'a', name: 'A 段', bars: 8 }]);
        withChords(doc, 'a', [['G', 'major'], ['C', 'major'], ['D', '7'], ['G', 'major'], ['E', 'minor'], ['A', 'minor'], ['D', '7'], ['G', 'major']].map(([r, t], i) => chordAt(i * 3, 3, r, t)));
        doc.tracks = [track('mel', 'melody', '旋律', 'grand', {}), track('left', 'comp', '左手', 'grand', { a: { kind: 'style', style: 'alberti', params: {}, seed: 1 } }), track('drum', 'drums', '节拍', 'grand', { a: { kind: 'style', style: 'waltz', params: {}, seed: 1 } })];
        return doc;
    } },
    blank: { name: '空白', build: id => {
        const doc = baseDoc(id, '未命名编曲', { tempo: 80, meter: '4/4', key: 'C', mode: 'major' }, [{ id: 'a', name: 'A 段', bars: 4 }]);
        doc.tracks = [track('mel', 'melody', '旋律', 'grand', {}), track('comp', 'comp', '伴奏', 'grand', {})];
        return doc;
    } }
};
/** Builds an arrangement from a chord-workshop progression, one chord per bar. */
export function fromProgression(id, progressionId, key = 'C') {
    const p = PROGRESSIONS.find(x => x.id === progressionId) || PROGRESSIONS[0];
    const doc = baseDoc(id, p.name.split(' · ')[0], { tempo: 80, meter: '4/4', key, mode: p.id === 'jazz-minor' ? 'minor' : 'major' }, [{ id: 'a', name: 'A 段', bars: p.steps.length }]);
    withChords(doc, 'a', p.steps.map((s, i) => chordAt(i * 4, 4, spellPitch(key, s.degree, 60 + rootPC(key) + s.offset).replace(/-?\d+$/, ''), s.type)));
    doc.tracks = [track('mel', 'melody', '旋律', 'grand', {}), track('comp', 'comp', '伴奏', 'grand', { a: { kind: 'style', style: 'block', params: {}, seed: 1 } }), track('bass', 'bass', '低音', 'grand', { a: { kind: 'style', style: 'root', params: {}, seed: 1 } })];
    return doc;
}
export const newDocId = (rng = Math.random) => `arr-${Date.now().toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`;
export const createFromTemplate = (templateId, id = newDocId()) => validateDocument(templateId.startsWith('progression:') ? fromProgression(id, templateId.slice(12)) : TEMPLATES[templateId in TEMPLATES ? templateId : 'blank'].build(id));

// ---------- storage ----------
export const freshStore = () => ({ version: 1, active: '', arrangements: [] });
export function validateStore(raw) {
    if (!raw || typeof raw !== 'object' || raw.version !== 1 || !Array.isArray(raw.arrangements)) throw new Error('不是支持的编曲存档（需要 version: 1）。');
    if (raw.arrangements.length > LIMITS.docs) throw new Error(`最多保存 ${LIMITS.docs} 份编曲。`);
    const arrangements = raw.arrangements.map(validateDocument);
    if (new Set(arrangements.map(a => a.id)).size !== arrangements.length) throw new Error('编曲 ID 重复。');
    const active = arrangements.some(a => a.id === raw.active) ? raw.active : arrangements[0]?.id || '';
    return { version: 1, active, arrangements };
}
/** Unreadable or newer data is reported and left untouched; saving is blocked until resolved. */
export function loadStore(storage) {
    try { const raw = storage.getItem(ARRANGE_KEY); return { store: raw ? validateStore(JSON.parse(raw)) : freshStore(), error: null, blocked: false }; }
    catch { return { store: freshStore(), error: '无法读取本地编曲存档。原记录未覆盖；请先导出进度备份，或导入有效备份。', blocked: true }; }
}
export function saveStore(storage, store) {
    try { storage.setItem(ARRANGE_KEY, JSON.stringify(store)); return null; }
    catch { return '浏览器未能保存编曲，请导出备份，避免关闭页面后丢失。'; }
}
export { GRID, ROOTS, beatsPerBar };
