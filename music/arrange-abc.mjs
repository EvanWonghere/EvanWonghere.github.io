// Compiles a realized arrangement to ABC for abcjs, plus a map from event id to the source
// characters of the note that attacks it, used to highlight notes during playback.
import { abcDuration } from './composition.mjs';
import { signatureAccidentals } from './arrangement.mjs';

const EPS = 1e-6, PARTS = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.25];
const MIDI_PROGRAM = { grand: 0, electric: 4, harpsichord: 6, organ: 16 };
const ACC = { '𝄫': -2, '♭': -1, '♯': 1, '𝄪': 2 };
const MARK = { '-2': '__', '-1': '_', '0': '=', '1': '^', '2': '^^' };
const clean = s => String(s).replace(/["\r\n\\]/g, ' ').trim();

export const abcKey = (key, mode) => `${key.replace('♭', 'b').replace('♯', '#')}${mode === 'minor' ? 'm' : ''}`;
/** Splits a duration into note values that ABC can write, largest first. */
export function splitDuration(beats) {
    const out = []; let left = Math.round(beats * 4) / 4;
    while (left > EPS) { const part = PARTS.find(p => p <= left + EPS); out.push(part); left = Math.round((left - part) * 4) / 4; }
    return out;
}
/** ABC pitch letters for a spelling, with an accidental only where the bar state requires one. */
export function abcPitch(spelling, state, signature) {
    const m = /^([A-G])(𝄫|♭|♯|𝄪)?(-?\d)$/u.exec(spelling);
    const letter = m[1], acc = ACC[m[2]] || 0, octave = Number(m[3]), slot = letter + octave;
    const current = slot in state ? state[slot] : signature[letter];
    const mark = current === acc ? '' : MARK[acc];
    state[slot] = acc;
    return mark + (octave >= 5 ? letter.toLowerCase() + "'".repeat(octave - 5) : letter + ','.repeat(Math.max(0, 4 - octave)));
}

function voiceBars(voice, real, doc, carrier) {
    const { bpb, totalBeats } = real, signature = signatureAccidentals(doc.meta.key, doc.meta.mode);
    const bars = [], totalBars = Math.round(totalBeats / bpb);
    const chordAt = new Map(carrier ? real.chords.map(c => [Math.round(c.start * 4), c.symbol]) : []);
    const sectionAt = new Map(carrier ? real.sections.map(s => [Math.round(s.start * 4), s.name]) : []);
    const sectionEnds = new Set(real.sections.map(s => Math.round((s.start + s.beats) * 4)));
    for (let b = 0; b < totalBars; b++) {
        const start = b * bpb, end = start + bpb, state = {}, tokens = [];
        const points = new Set([start, end]);
        for (const e of voice.events) for (const p of [e.start, e.start + e.beats]) if (p > start + EPS && p < end - EPS) points.add(p);
        for (const key of [...chordAt.keys(), ...sectionAt.keys()]) { const p = key / 4; if (p > start + EPS && p < end - EPS) points.add(p); }
        const sorted = [...points].sort((x, y) => x - y);
        for (let i = 0; i < sorted.length - 1; i++) {
            const a = sorted[i], c = sorted[i + 1];
            const sounding = voice.events.filter(e => e.start <= a + EPS && e.start + e.beats > a + EPS);
            const byPitch = new Map();
            for (const e of sounding) {
                const entry = byPitch.get(e.pitch) || { spelling: e.spelling, tieOut: false, attacks: [] };
                if (e.start + e.beats > c + EPS) entry.tieOut = true;
                if (Math.abs(e.start - a) < EPS) entry.attacks.push(e.id);
                byPitch.set(e.pitch, entry);
            }
            const pitches = [...byPitch.entries()].sort((x, y) => x[0] - y[0]).map(([, v]) => v);
            const key = Math.round(a * 4);
            let prefix = '';
            if (sectionAt.has(key)) prefix += `"^${clean(sectionAt.get(key))}"`;
            if (chordAt.has(key)) prefix += `"${clean(chordAt.get(key))}"`;
            splitDuration(c - a).forEach((part, k, parts) => {
                const dur = abcDuration(part), last = k === parts.length - 1;
                let text;
                if (!pitches.length) text = `z${dur}`;
                else {
                    const notes = pitches.map(p => abcPitch(p.spelling, state, signature) + dur + (!last || p.tieOut ? '-' : ''));
                    text = notes.length > 1 ? `[${notes.join('')}]` : notes[0];
                }
                tokens.push({ text: (k === 0 ? prefix : '') + text, ids: k === 0 ? pitches.flatMap(p => p.attacks) : [] });
            });
        }
        const endKey = Math.round(end * 4);
        tokens.push({ text: b === totalBars - 1 ? '|]' : sectionEnds.has(endKey) ? '||' : '|', ids: [] });
        bars.push(tokens);
    }
    return bars;
}

/**
 * mode 'score': every pitched track on its own staff; 'lead': the melody with chord symbols.
 * Drums are not notated. Returns { abc, map: { eventId: [startChar, endChar] }, voices }.
 */
export function compileABC(real, doc, { mode = 'score', barsPerLine = 4 } = {}) {
    const drums = new Set(doc.tracks.filter(t => t.role === 'drums').map(t => t.id));
    const pitched = doc.tracks.filter(t => !drums.has(t.id));
    let chosen = pitched.filter(t => t.role === 'melody' || real.events.some(e => e.trackId === t.id));
    if (mode === 'lead') chosen = [pitched.find(t => t.role === 'melody') || chosen[0]].filter(Boolean);
    const voices = chosen.map((t, i) => {
        const events = real.events.filter(e => e.trackId === t.id && !e.drum);
        const sorted = events.map(e => e.pitch).sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)] ?? 67;
        return { id: `T${i + 1}`, track: t, events, clef: t.role === 'bass' || median < 58 ? 'bass' : 'treble' };
    });
    if (!voices.length) voices.push({ id: 'T1', track: { name: '和弦', instrument: 'grand' }, events: [], clef: 'treble' });
    const bars = voices.map((v, i) => voiceBars(v, real, doc, i === 0));
    const header = [
        'X:1', `T:${clean(doc.title) || '未命名编曲'}`, `M:${doc.meta.meter}`, 'L:1/4', `Q:1/4=${doc.meta.tempo}`,
        ...(voices.length > 1 ? [`%%score ${voices.map(v => v.id).join(' ')}`] : []),
        ...voices.map(v => `V:${v.id} clef=${v.clef} name="${clean(v.track.name)}"`),
        `K:${abcKey(doc.meta.key, doc.meta.mode)}`
    ].join('\n') + '\n';
    let abc = header; const map = {};
    const totalBars = bars[0].length;
    for (let first = 0; first < totalBars; first += barsPerLine) {
        voices.forEach((v, vi) => {
            abc += `V:${v.id}\n`;
            if (first === 0) abc += `%%MIDI program ${MIDI_PROGRAM[v.track.instrument] ?? 0}\n`;
            for (const tokens of bars[vi].slice(first, first + barsPerLine)) for (const token of tokens) {
                // abcjs reports a note's startChar at its first annotation, so the map does too.
                const at = abc.length;
                abc += token.text + ' ';
                for (const id of token.ids) map[id] = [at, abc.length - 1];
            }
            abc += '\n';
        });
    }
    return { abc, map, voices: voices.map(v => ({ id: v.id, trackId: v.track.id ?? null, clef: v.clef })) };
}
