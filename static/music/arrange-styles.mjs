// Deterministic accompaniment generators for the arrangement desk. A style turns the chords of one
// section into note events; the same chords, parameters and seed always give the same notes.
import { makeChord, rootPC, spellPitch, chordType } from './harmony.mjs';

const REGISTER_OCTAVE = { low: 3, mid: 4, high: 5 };
const num = (label, min, max, fallback, step = 0.05) => ({ type: 'number', label, min, max, default: fallback, step });
const pick = (label, values, fallback) => ({ type: 'enum', label, values, default: fallback });
const flag = (label, fallback) => ({ type: 'boolean', label, default: fallback });
const register = pick('音区', { low: '低', mid: '中', high: '高' }, 'mid');
const voicing = pick('配置', { auto: '跟随和弦', close: '密集', open: '开放', shell: 'Shell', rootless: '无根音' }, 'auto');
const velocity = num('力度', 30, 120, 72, 1);

/** Small seeded PRNG (mulberry32) so "random" variation is reproducible. */
export function seededRandom(seed) {
    let a = 0;
    for (const ch of String(seed)) a = Math.imul(a ^ ch.codePointAt(0), 2654435761) >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Voicing for a chord entry, kept inside a playable window for its register. */
export function voiceChord(chord, { register: reg = 'mid', voicing: v = 'auto' } = {}) {
    const octave = REGISTER_OCTAVE[reg] ?? 4;
    const made = makeChord(chord.root, chord.type, { inversion: chord.inversion || 0, voicing: v === 'auto' ? chord.voicing || 'close' : v, octave });
    let notes = made.right, spellings = made.spellings;
    const [lo, hi] = reg === 'low' ? [45, 67] : reg === 'high' ? [64, 91] : [52, 81];
    const shift = notes.at(-1) > hi ? -12 : notes[0] < lo ? 12 : 0;
    if (shift) {
        const moved = {};
        notes = notes.map(n => { moved[n + shift] = spellings[n].replace(/-?\d+$/, m => String(+m + shift / 12)); return n + shift; });
        spellings = moved;
    }
    return { notes, spellings };
}

/** Bass root (or slash bass) placed between E1 and E3 by default. */
export function bassNote(chord, { octave = 2 } = {}) {
    const root = chord.bass || chord.root;
    let midi = (octave + 1) * 12 + rootPC(root);
    while (midi < 28) midi += 12;
    while (midi > 52) midi -= 12;
    return { midi, spelling: spellPitch(root, 1, midi) };
}
const fifthAbove = (chord, base) => {
    const type = chordType(chord.type), index = type.degrees.indexOf(5);
    const offset = index >= 0 ? type.semitones[index] : 7, midi = base.midi - rootPC(chord.bass || chord.root) + rootPC(chord.root) + offset;
    const m = midi - base.midi > 12 ? midi - 12 : midi < base.midi ? midi + 12 : midi;
    return { midi: m, spelling: spellPitch(chord.root, 5, m) };
};
const thirdAbove = (chord, base) => {
    const type = chordType(chord.type), index = type.degrees.indexOf(3);
    if (index < 0) return fifthAbove(chord, base);
    let midi = base.midi - rootPC(chord.bass || chord.root) + rootPC(chord.root) + type.semitones[index];
    while (midi <= base.midi) midi += 12;
    return { midi, spelling: spellPitch(chord.root, 3, midi) };
};

// Hits inside each chord's span; `at` is relative to the section start, in quarter-note beats.
function chordHits(chords, positions, { velocity: vel, register: reg, voicing: v }, lengthOf) {
    const events = [];
    for (const chord of chords) {
        const { notes, spellings } = voiceChord(chord, { register: reg, voicing: v });
        const hits = positions(chord).filter(p => p >= 0 && p < chord.beats);
        hits.forEach((p, i) => {
            const beats = Math.min(lengthOf(p, hits[i + 1] ?? chord.beats, chord), chord.beats - p);
            for (const n of notes) events.push({ at: chord.at + p, beats, pitch: n, spelling: spellings[n], vel });
        });
    }
    return events;
}
const everyBeat = (step, offset = 0) => chord => Array.from({ length: Math.ceil(chord.beats / step) }, (_, i) => offset + i * step);
const barPositions = (pattern, bpb) => chord => {
    const out = [];
    for (let bar = Math.floor(chord.at / bpb) * bpb; bar < chord.at + chord.beats; bar += bpb)
        for (const p of pattern(Math.floor(bar / bpb))) if (p < bpb && bar + p >= chord.at && bar + p < chord.at + chord.beats) out.push(bar + p - chord.at);
    return out;
};

export const STYLES = {
    block: { name: '柱式和弦', roles: ['comp', 'pad'], params: { register, voicing, velocity },
        generate: ({ chords, params }) => chordHits(chords, () => [0], params, (p, next) => next - p) },
    pulse: { name: '四分拍柱式', roles: ['comp'], params: { register, voicing, velocity },
        generate: ({ chords, params }) => chordHits(chords, everyBeat(1), params, (p, next) => Math.min(1, next - p)) },
    arpeggio: { name: '分解和弦', roles: ['comp', 'melody'], params: { register, voicing, velocity, direction: pick('方向', { up: '上行', updown: '上下' }, 'up') },
        generate: ({ chords, params }) => {
            const events = [];
            for (const chord of chords) {
                const { notes, spellings } = voiceChord(chord, params);
                const order = params.direction === 'updown' && notes.length > 2 ? [...notes, ...notes.slice(1, -1).reverse()] : notes;
                for (let p = 0, i = 0; p < chord.beats; p += 0.5, i++) { const n = order[i % order.length]; events.push({ at: chord.at + p, beats: Math.min(0.5, chord.beats - p), pitch: n, spelling: spellings[n], vel: params.velocity }); }
            }
            return events;
        } },
    alberti: { name: 'Alberti 低音', roles: ['comp'], params: { register: pick('音区', { low: '低', mid: '中' }, 'low'), velocity },
        generate: ({ chords, params }) => {
            const events = [];
            for (const chord of chords) {
                const { notes, spellings } = voiceChord({ ...chord, voicing: 'close' }, { register: params.register, voicing: 'close' });
                const [low, mid, high] = [notes[0], notes[1] ?? notes[0], notes.at(-1)], cycle = [low, high, mid, high];
                for (let p = 0, i = 0; p < chord.beats; p += 0.5, i++) { const n = cycle[i % 4]; events.push({ at: chord.at + p, beats: Math.min(0.5, chord.beats - p), pitch: n, spelling: spellings[n], vel: params.velocity - (i % 2 ? 12 : 0) }); }
            }
            return events;
        } },
    'lofi-rhodes': { name: 'Lo-fi 电钢', roles: ['comp'], params: { register, voicing: { ...voicing, default: 'rootless' }, velocity: { ...velocity, default: 64 }, density: num('密度', 0.1, 1, 0.45) },
        generate: ({ chords, params, rng, bpb }) => {
            const candidates = [0, 1.5, 2.5, 3.5, 3, 1];
            return chordHits(chords, barPositions(() => [0, ...candidates.slice(1).filter(() => rng() < params.density)].sort((a, b) => a - b), bpb),
                { ...params, velocity: params.velocity }, (p, next) => Math.min(2, next - p));
        } },
    bossa: { name: 'Bossa 伴奏', roles: ['comp'], params: { register, voicing: { ...voicing, default: 'shell' }, velocity: { ...velocity, default: 66 } },
        generate: ({ chords, params, bpb }) => chordHits(chords, barPositions(bar => bar % 2 ? [0.5, 2, 3.5] : [0, 1.5, 3], bpb), params, (p, next) => Math.min(1, next - p)) },
    sustain: { name: '长音铺底', roles: ['pad'], params: { register: { ...register, default: 'high' }, voicing: { ...voicing, default: 'open' }, velocity: { ...velocity, default: 50 } },
        generate: ({ chords, params }) => chordHits(chords, () => [0], params, (p, next) => next - p) },
    root: { name: '根音长音', roles: ['bass'], params: { velocity: { ...velocity, default: 80 } },
        generate: ({ chords, params }) => chords.map(c => { const b = bassNote(c); return { at: c.at, beats: c.beats, pitch: b.midi, spelling: b.spelling, vel: params.velocity }; }) },
    'root-fifth': { name: '根音–五音', roles: ['bass'], params: { velocity: { ...velocity, default: 80 } },
        generate: ({ chords, params }) => chords.flatMap(c => {
            const b = bassNote(c), half = c.beats >= 2 ? Math.floor(c.beats / 2) : c.beats, f = fifthAbove(c, b);
            return [{ at: c.at, beats: half, pitch: b.midi, spelling: b.spelling, vel: params.velocity }, ...(half < c.beats ? [{ at: c.at + half, beats: c.beats - half, pitch: f.midi, spelling: f.spelling, vel: params.velocity - 8 }] : [])];
        }) },
    walking: { name: '行走低音', roles: ['bass'], params: { velocity: { ...velocity, default: 78 }, approach: pick('导入音', { below: '下方半音', above: '上方半音', mixed: '随机' }, 'mixed') },
        generate: ({ chords, params, rng }) => {
            const events = [];
            chords.forEach((c, index) => {
                const b = bassNote(c), next = chords[index + 1] && chords[index + 1].at === c.at + c.beats ? bassNote(chords[index + 1]) : null;
                const tones = [b, thirdAbove(c, b), fifthAbove(c, b)];
                for (let p = 0, i = 0; p < c.beats; p += 1, i++) {
                    let tone = tones[i % tones.length];
                    if (next && p === Math.ceil(c.beats) - 1 && p > 0) {
                        const up = params.approach === 'above' || (params.approach === 'mixed' && rng() < 0.5);
                        const midi = next.midi + (up ? 1 : -1);
                        tone = { midi, spelling: null };
                    }
                    events.push({ at: c.at + p, beats: Math.min(1, c.beats - p), pitch: tone.midi, spelling: tone.spelling, vel: params.velocity - (i % 2 ? 6 : 0) });
                }
            });
            return events;
        } },
    octave: { name: '八度跳动', roles: ['bass'], params: { velocity: { ...velocity, default: 76 } },
        generate: ({ chords, params }) => chords.flatMap(c => { const b = bassNote(c); return Array.from({ length: Math.ceil(c.beats / 0.5) }, (_, i) => ({ at: c.at + i * 0.5, beats: Math.min(0.5, c.beats - i * 0.5), pitch: b.midi + (i % 2 ? 12 : 0), spelling: b.spelling.replace(/-?\d+$/, m => String(+m + (i % 2))), vel: params.velocity - (i % 2 ? 10 : 0) })); }) },
    rock: { name: '流行摇滚鼓', roles: ['drums'], params: { velocity: { ...velocity, default: 90 }, fill: flag('段尾加花', false) },
        generate: ({ sectionBeats, bpb, params }) => drumBars(sectionBeats, bpb, params, () => ({ kick: bpb % 2 ? [0] : [0, bpb / 2], snare: bpb >= 4 ? [1, 3] : [1], hat: halfBeats(bpb) })) },
    'boom-bap': { name: 'Boom-bap 鼓', roles: ['drums'], params: { velocity: { ...velocity, default: 86 }, density: num('密度', 0.1, 1, 0.5), fill: flag('段尾加花', false) },
        generate: ({ sectionBeats, bpb, params, rng }) => drumBars(sectionBeats, bpb, params, () => ({ kick: [0, ...(bpb >= 4 ? [2.5] : []), ...(rng() < params.density ? [1.75] : [])], snare: bpb >= 4 ? [1, 3] : [1], hat: halfBeats(bpb).filter(p => p % 1 === 0 || rng() < params.density + 0.3) })) },
    'bossa-perc': { name: 'Bossa 打击乐', roles: ['drums'], params: { velocity: { ...velocity, default: 70 }, fill: flag('段尾加花', false) },
        generate: ({ sectionBeats, bpb, params }) => drumBars(sectionBeats, bpb, params, bar => ({ kick: [0, 1.5, 2, 3.5].filter(p => p < bpb), snare: (bar % 2 ? [0.5, 2, 3.5] : [0, 1.5, 3]).filter(p => p < bpb), hat: halfBeats(bpb) })) },
    waltz: { name: '圆舞曲鼓', roles: ['drums'], params: { velocity: { ...velocity, default: 72 }, fill: flag('段尾加花', false) },
        generate: ({ sectionBeats, bpb, params }) => drumBars(sectionBeats, bpb, params, () => ({ kick: [0], snare: Array.from({ length: Math.max(0, Math.floor(bpb) - 1) }, (_, i) => i + 1), hat: [] })) }
};
const halfBeats = bpb => Array.from({ length: bpb * 2 }, (_, i) => i / 2);
const DRUM_PITCH = { kick: 36, snare: 38, hat: 42 };
function drumBars(sectionBeats, bpb, params, pattern) {
    const events = [], bars = Math.round(sectionBeats / bpb);
    for (let bar = 0; bar < bars; bar++) {
        const lastBar = bar === bars - 1 && params.fill, parts = pattern(bar);
        for (const drum of ['kick', 'snare', 'hat']) for (const p of parts[drum] || []) {
            if (p >= bpb || (lastBar && p >= bpb - 1)) continue;
            events.push({ at: bar * bpb + p, beats: 0.25, drum, pitch: DRUM_PITCH[drum], vel: params.velocity - (drum === 'hat' ? 25 : 0) });
        }
        if (lastBar) for (let p = bpb - 1; p < bpb; p += 0.25) events.push({ at: bar * bpb + p, beats: 0.25, drum: 'snare', pitch: DRUM_PITCH.snare, vel: params.velocity - 20 + (p - bpb + 1) * 40 });
    }
    return events;
}

export const stylesForRole = role => Object.entries(STYLES).filter(([, s]) => s.roles.includes(role)).map(([id, s]) => ({ id, name: s.name }));

/** Validates and completes style parameters; unknown keys are rejected so AI proposals stay honest. */
export function normalizeParams(styleId, raw = {}, role) {
    const style = STYLES[styleId];
    if (!style) throw new Error(`未知的伴奏型：${styleId}`);
    if (role && !style.roles.includes(role)) throw new Error(`“${style.name}”不适用于该声部。`);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('伴奏参数格式不正确。');
    for (const key of Object.keys(raw)) if (!style.params[key]) throw new Error(`“${style.name}”没有参数 ${key}。`);
    const out = {};
    for (const [key, spec] of Object.entries(style.params)) {
        const value = raw[key] ?? spec.default;
        if (spec.type === 'number') { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`参数 ${spec.label} 必须是数字。`); out[key] = Math.min(spec.max, Math.max(spec.min, value)); }
        else if (spec.type === 'enum') { if (!(value in spec.values)) throw new Error(`参数 ${spec.label} 的取值无效。`); out[key] = value; }
        else { if (typeof value !== 'boolean') throw new Error(`参数 ${spec.label} 必须是开或关。`); out[key] = value; }
    }
    return out;
}

/** Runs a style for one track section. Chords carry `at` relative to the section start. */
export function generateStyle({ style, params, seed, role, chords, sectionBeats, bpb, key }) {
    const normalized = normalizeParams(style, params, role);
    const rng = seededRandom(`${style}|${seed}|${key}`);
    return STYLES[style].generate({ chords, params: normalized, rng, sectionBeats, bpb, role })
        .filter(e => e.at >= 0 && e.at < sectionBeats && e.beats > 0)
        .map(e => ({ ...e, at: quantize(e.at), beats: Math.max(0.25, quantize(Math.min(e.beats, sectionBeats - e.at))), vel: Math.round(Math.min(127, Math.max(1, e.vel))) }));
}
export const quantize = x => Math.round(x * 4) / 4;
