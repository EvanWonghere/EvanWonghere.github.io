// Arrangement document format and edit operations. Every edit, by hand or (later) from an AI
// proposal, is one of these operations; documents and operations are validated here.
import { CHORD_TYPES } from './harmony.mjs';
import { STYLES, normalizeParams } from './arrange-styles.mjs';

export const LIMITS = { sections: 16, barsPerSection: 64, bars: 256, tracks: 8, chordsPerSection: 128, notesPerClip: 512, docBytes: 200000, docs: 20, ops: 40, title: 100, name: 40, tags: 8, tag: 20 };
export const ROLES = { melody: '旋律', comp: '伴奏', bass: '低音', pad: '铺底', drums: '鼓组' };
export const INSTRUMENT_IDS = ['grand', 'electric', 'harpsichord', 'organ'];
export const METERS = ['2/4', '3/4', '4/4', '6/8'];
export const ROOTS = ['C', 'C♯', 'D♭', 'D', 'D♯', 'E♭', 'E', 'F', 'F♯', 'G♭', 'G', 'G♯', 'A♭', 'A', 'A♯', 'B♭', 'B'];
export const MAJOR_KEYS = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const MINOR_KEYS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
export const VOICINGS = { close: '密集', open: '开放', shell: 'Shell', rootless: '无根音' };
export const GRID = 0.25;
const CHORD_IDS = new Set(CHORD_TYPES.map(t => t.id));
const ID = /^[A-Za-z0-9_-]{1,40}$/;
export const SPELLING = /^([A-G])(𝄫|♭|♯|𝄪)?(-?\d)$/u;

export const beatsPerBar = meter => { const [n, d] = meter.split('/').map(Number); return n * 4 / d; };
const fail = message => { throw new Error(message); };
const isObject = v => v && typeof v === 'object' && !Array.isArray(v);
const onGrid = (x, label) => { if (typeof x !== 'number' || !Number.isFinite(x)) fail(`${label}必须是数字。`); const q = Math.round(x / GRID) * GRID; if (Math.abs(q - x) > 1e-9) fail(`${label}须以十六分音符（0.25 拍）为单位。`); return q; };
const text = (v, max, label) => { if (typeof v !== 'string') fail(`${label}必须是文字。`); const t = v.replace(/[\r\n\t]/g, ' ').trim(); if (!t) fail(`${label}不能为空。`); return t.slice(0, max); };
const id = (v, label) => { if (typeof v !== 'string' || !ID.test(v)) fail(`${label}无效。`); return v; };

export function validateChord(raw, sectionBeats, label = '和弦') {
    if (!isObject(raw)) fail(`${label}格式不正确。`);
    const at = onGrid(raw.at, `${label}位置`), beats = onGrid(raw.beats, `${label}时值`);
    if (at < 0 || beats < GRID || at + beats > sectionBeats + 1e-9) fail(`${label}超出段落范围。`);
    if (!ROOTS.includes(raw.root)) fail(`${label}根音无效：${raw.root}`);
    if (!CHORD_IDS.has(raw.type)) fail(`${label}性质无效：${raw.type}`);
    if (raw.bass != null && !ROOTS.includes(raw.bass)) fail(`${label}低音无效。`);
    const inversion = raw.inversion ?? 0;
    if (!Number.isInteger(inversion) || inversion < 0 || inversion > 3) fail(`${label}转位须为 0–3。`);
    const voicing = raw.voicing ?? 'close';
    if (!VOICINGS[voicing]) fail(`${label}配置无效。`);
    return { id: raw.id, at, beats, root: raw.root, type: raw.type, bass: raw.bass ?? null, inversion, voicing };
}

export function validateNote(raw, sectionBeats, label = '音符') {
    if (!isObject(raw)) fail(`${label}格式不正确。`);
    const at = onGrid(raw.at, `${label}位置`), beats = onGrid(raw.beats, `${label}时值`);
    if (at < 0 || beats < GRID || at >= sectionBeats) fail(`${label}超出段落范围。`);
    if (!Number.isInteger(raw.pitch) || raw.pitch < 21 || raw.pitch > 108) fail(`${label}音高须在钢琴音域 A0–C8 内。`);
    const spelling = raw.spelling ?? null;
    if (spelling !== null && !SPELLING.test(spelling)) fail(`${label}拼写无效：${spelling}`);
    const vel = raw.vel ?? 80;
    if (!Number.isInteger(vel) || vel < 1 || vel > 127) fail(`${label}力度须为 1–127。`);
    return { id: raw.id, at, beats: Math.min(beats, sectionBeats - at), pitch: raw.pitch, spelling, vel };
}

export function validateClip(raw, role, sectionBeats) {
    if (raw == null) return null;
    if (!isObject(raw)) fail('片段格式不正确。');
    if (raw.kind === 'style') {
        const seed = raw.seed ?? 1;
        if (!Number.isInteger(seed) || seed < 0 || seed > 1e9) fail('变化编号须为非负整数。');
        return { kind: 'style', style: raw.style, params: normalizeParams(raw.style, raw.params ?? {}, role), seed };
    }
    if (raw.kind === 'notes') {
        if (role === 'drums') fail('鼓组声部只能使用鼓型。');
        if (!Array.isArray(raw.events) || raw.events.length > LIMITS.notesPerClip) fail(`每个片段最多 ${LIMITS.notesPerClip} 个音符。`);
        const events = raw.events.map((e, i) => validateNote(e, sectionBeats, `第 ${i + 1} 个音符`)).sort((a, b) => a.at - b.at || a.pitch - b.pitch);
        return { kind: 'notes', events };
    }
    fail('片段类型只能是伴奏型或手写音符。');
}

/** Full check of a stored or edited document. Returns a normalized copy or throws. */
export function validateDocument(raw) {
    if (!isObject(raw) || raw.version !== 1) fail('不是支持的编曲文件（需要 version: 1）。');
    const doc = { version: 1, id: id(raw.id, '编曲 ID'), title: text(raw.title ?? '未命名编曲', LIMITS.title, '标题'), updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0 };
    const m = raw.meta;
    if (!isObject(m)) fail('缺少速度、调号等基本信息。');
    if (!Number.isInteger(m.tempo) || m.tempo < 40 || m.tempo > 200) fail('速度须为 40–200 BPM 的整数。');
    if (!METERS.includes(m.meter)) fail('拍号只支持 2/4、3/4、4/4、6/8。');
    if (!['major', 'minor'].includes(m.mode)) fail('调式只支持大调或小调。');
    if (!(m.mode === 'major' ? MAJOR_KEYS : MINOR_KEYS).includes(m.key)) fail(`调号无效：${m.key}${m.mode === 'minor' ? ' 小调' : ' 大调'}`);
    const swing = m.swing ?? 0.5;
    if (typeof swing !== 'number' || swing < 0.5 || swing > 0.75) fail('摇摆比例须在 0.5–0.75 之间。');
    const tags = (Array.isArray(m.tags) ? m.tags : []).slice(0, LIMITS.tags).map(t => text(t, LIMITS.tag, '风格标签'));
    doc.meta = { tempo: m.tempo, meter: m.meter, key: m.key, mode: m.mode, swing, tags, classical: m.classical === true };
    const bpb = beatsPerBar(doc.meta.meter);
    if (!Array.isArray(raw.sections) || !raw.sections.length || raw.sections.length > LIMITS.sections) fail(`段落数须为 1–${LIMITS.sections}。`);
    const seen = new Set();
    doc.sections = raw.sections.map(s => {
        if (!isObject(s)) fail('段落格式不正确。');
        const sid = id(s.id, '段落 ID'); if (seen.has(sid)) fail('段落 ID 重复。'); seen.add(sid);
        if (!Number.isInteger(s.bars) || s.bars < 1 || s.bars > LIMITS.barsPerSection) fail(`每段 1–${LIMITS.barsPerSection} 小节。`);
        return { id: sid, name: text(s.name ?? sid, LIMITS.name, '段落名'), bars: s.bars };
    });
    if (doc.sections.reduce((n, s) => n + s.bars, 0) > LIMITS.bars) fail(`全曲最多 ${LIMITS.bars} 小节。`);
    const sectionBeats = Object.fromEntries(doc.sections.map(s => [s.id, s.bars * bpb]));
    if (!Array.isArray(raw.chords)) fail('和弦轨格式不正确。');
    const chordIds = new Set();
    doc.chords = raw.chords.map((c, i) => {
        if (!isObject(c) || !sectionBeats[c.section]) fail(`第 ${i + 1} 个和弦所在段落不存在。`);
        const cid = id(c.id, '和弦 ID'); if (chordIds.has(cid)) fail('和弦 ID 重复。'); chordIds.add(cid);
        return { ...validateChord({ ...c, id: cid }, sectionBeats[c.section]), section: c.section };
    });
    for (const s of doc.sections) {
        const list = doc.chords.filter(c => c.section === s.id).sort((a, b) => a.at - b.at);
        if (list.length > LIMITS.chordsPerSection) fail(`每段最多 ${LIMITS.chordsPerSection} 个和弦。`);
        list.forEach((c, i) => { if (i && list[i - 1].at + list[i - 1].beats > c.at + 1e-9) fail(`“${s.name}”中的和弦重叠。`); });
    }
    doc.chords.sort((a, b) => doc.sections.findIndex(s => s.id === a.section) - doc.sections.findIndex(s => s.id === b.section) || a.at - b.at);
    if (!Array.isArray(raw.tracks) || raw.tracks.length > LIMITS.tracks) fail(`声部数最多 ${LIMITS.tracks} 个。`);
    const trackIds = new Set();
    doc.tracks = raw.tracks.map(t => {
        if (!isObject(t)) fail('声部格式不正确。');
        const tid = id(t.id, '声部 ID'); if (trackIds.has(tid)) fail('声部 ID 重复。'); trackIds.add(tid);
        if (!ROLES[t.role]) fail('声部类型无效。');
        const instrument = t.instrument ?? 'grand'; if (!INSTRUMENT_IDS.includes(instrument)) fail('音色无效。');
        const volume = t.volume ?? 0.8; if (typeof volume !== 'number' || volume < 0 || volume > 1) fail('音量须在 0–1 之间。');
        const clips = {};
        if (t.clips != null && !isObject(t.clips)) fail('片段格式不正确。');
        for (const [sid, clip] of Object.entries(t.clips || {})) {
            if (!sectionBeats[sid]) fail('片段所在段落不存在。');
            const valid = validateClip(clip, t.role, sectionBeats[sid]);
            if (valid) clips[sid] = valid.kind === 'notes' ? { ...valid, events: valid.events.map((e, i) => ({ ...e, id: `${tid}-${sid}-${i}` })) } : valid;
        }
        return { id: tid, name: text(t.name ?? ROLES[t.role], LIMITS.name, '声部名'), role: t.role, instrument, volume, mute: t.mute === true, solo: t.solo === true, clips };
    });
    if (JSON.stringify(doc).length > LIMITS.docBytes) fail('编曲过大，请拆分段落或减少手写音符。');
    return doc;
}

// Operation shapes. `fields` lists what each operation accepts; the arrangement module applies them.
export const OPS = {
    setMeta: { label: '修改基本信息', fields: ['title', 'tempo', 'meter', 'key', 'mode', 'swing', 'tags', 'classical'] },
    setChords: { label: '改写和弦', fields: ['section', 'from', 'to', 'chords'] },
    addSection: { label: '添加段落', fields: ['id', 'name', 'bars', 'after', 'copyFrom'] },
    removeSection: { label: '删除段落', fields: ['section'] },
    moveSection: { label: '移动段落', fields: ['section', 'index'] },
    resizeSection: { label: '改变段落长度', fields: ['section', 'bars'] },
    renameSection: { label: '重命名段落', fields: ['section', 'name'] },
    addTrack: { label: '添加声部', fields: ['id', 'role', 'name', 'instrument'] },
    removeTrack: { label: '删除声部', fields: ['track'] },
    setTrack: { label: '修改声部', fields: ['track', 'name', 'role', 'instrument', 'volume', 'mute', 'solo'] },
    setClipStyle: { label: '选择伴奏型', fields: ['track', 'section', 'style', 'params', 'seed'] },
    setClipNotes: { label: '改写音符', fields: ['track', 'section', 'events'] },
    clearClip: { label: '清空片段', fields: ['track', 'section'] },
    transpose: { label: '移调', fields: ['semitones', 'section', 'track'] }
};
const REQUIRED = { setChords: ['section', 'from', 'to', 'chords'], addSection: ['name', 'bars'], removeSection: ['section'], moveSection: ['section', 'index'], resizeSection: ['section', 'bars'], renameSection: ['section', 'name'], addTrack: ['role'], removeTrack: ['track'], setTrack: ['track'], setClipStyle: ['track', 'section', 'style'], setClipNotes: ['track', 'section', 'events'], clearClip: ['track', 'section'], transpose: ['semitones'] };

/** Shape check for one operation; semantic checks happen when it is applied to a document. */
export function validateOp(op) {
    if (!isObject(op) || !OPS[op.type]) fail(`未知的编曲操作：${op?.type}`);
    for (const key of Object.keys(op)) if (key !== 'type' && key !== 'reason' && !OPS[op.type].fields.includes(key)) fail(`操作 ${op.type} 不接受字段 ${key}。`);
    for (const key of REQUIRED[op.type] || []) if (op[key] === undefined) fail(`操作 ${op.type} 缺少 ${key}。`);
    if (op.reason !== undefined && (typeof op.reason !== 'string' || op.reason.length > 300)) fail('操作理由最多 300 字。');
    if (op.type === 'transpose' && (!Number.isInteger(op.semitones) || Math.abs(op.semitones) > 12 || op.semitones === 0)) fail('移调须为 ±1–12 个半音。');
    if (op.type === 'setChords' && (!Array.isArray(op.chords) || op.chords.length > LIMITS.chordsPerSection)) fail('和弦列表格式不正确。');
    if (op.type === 'setClipStyle' && !STYLES[op.style]) fail(`未知的伴奏型：${op.style}`);
    return op;
}
