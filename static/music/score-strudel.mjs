// Score (ABC, as played by abcjs) → Strudel code for the live-coding draft. The notes of each voice
// become one or more layers; the arrangement desk's exporter writes the code (one cycle per bar,
// sixteenth-note steps), so both routes into the live page read the same way.
import { compileStrudel } from './arrange-strudel.mjs';

const KEY = /^K:\s*([A-G])([b#]?)\s*(m(?:in(?:or)?)?\b)?/m;
/** Key and mode from the K: line, for the header comment only. */
export function scoreKey(abc) {
    const m = KEY.exec(String(abc || ''));
    if (!m) return { key: 'C', mode: 'major' };
    return { key: m[1] + (m[2] === 'b' ? '♭' : m[2] === '#' ? '♯' : ''), mode: m[3] ? 'minor' : 'major' };
}

/**
 * tracks: one array of { pitch, start, beats } per voice, in quarter-note beats.
 * Returns the code, how many notes had to be moved onto the sixteenth-note grid, and the bar count.
 */
export function scoreToStrudel({ tracks, tempo = 90, meter = { num: 4, den: 4 }, title = '五线谱作品', key = 'C', mode = 'major' }) {
    const num = Number(meter?.num) || 4, den = Number(meter?.den) || 4, bpb = num * 4 / den;
    const events = [], docTracks = [];
    let offGrid = 0, end = 0;
    tracks.filter(t => t.length).forEach((notes, i) => {
        const id = `v${i + 1}`, pitches = notes.map(n => n.pitch).sort((a, b) => a - b), median = pitches[Math.floor(pitches.length / 2)];
        docTracks.push({ id, name: tracks.length > 1 ? `声部 ${i + 1}` : '旋律', role: median < 55 ? 'bass' : 'comp', instrument: 'grand', volume: 0.8, mute: false, solo: false });
        for (const n of notes) {
            if (Math.abs(n.start * 4 - Math.round(n.start * 4)) > 1e-6 || Math.abs(n.beats * 4 - Math.round(n.beats * 4)) > 1e-6) offGrid++;
            events.push({ trackId: id, start: n.start, beats: n.beats, pitch: n.pitch, spelling: null, drum: null });
            end = Math.max(end, n.start + n.beats);
        }
    });
    const bars = Math.max(1, Math.ceil(end / bpb - 1e-9));
    const doc = { title: String(title).slice(0, 100), meta: { key, mode, meter: `${num}/${den}`, tempo: Math.max(20, Math.min(300, Math.round(tempo))), swing: 0.5 }, tracks: docTracks };
    const code = compileStrudel({ bpb, totalBeats: bars * bpb, events: events.sort((a, b) => a.start - b.start || a.pitch - b.pitch) }, doc);
    return { code, offGrid, bars };
}

/** The playable notes of each abcjs audio track, in quarter-note beats (percussion left out). */
export function tracksFromAudio(commands) {
    return (commands?.tracks || []).map(track => track
        .filter(e => e.cmd === 'note' && Number.isInteger(e.pitch) && e.pitch >= 21 && e.pitch <= 108 && e.instrument !== 128 && e.duration > 0)
        .map(e => ({ pitch: e.pitch, start: e.start * 4, beats: e.duration * 4 })))
        .filter(t => t.length);
}
