// Pre-rendered model voice: one mp3 per work and accent, plus a timeline saying where each segment and each unit
// (a sentence, or a clause or line of a poem) starts and ends. Pure functions; the tool writes the files and the reader plays them.
// The timeline is exact for units because the tool synthesizes them one by one. Version 2 also carries the start and end of every
// word, as reported by Azure while it synthesized (version 1 has units only); a word is never placed by guessing.
import { splitUnits, workTextHash, tokenize } from './library.mjs';

export const VOICES = {
    'en-US': ['en-US-JennyNeural', 'en-US-GuyNeural'],
    'en-GB': ['en-GB-SoniaNeural', 'en-GB-RyanNeural'],
};
// Azure mp3 formats are constant bit rate, so a byte count is a length.
export const FORMATS = {
    'audio-24khz-48kbitrate-mono-mp3': 6000,
    'audio-16khz-32kbitrate-mono-mp3': 4000,
};
export const PAUSE_MS = 350;   // silence after each unit; it is part of the unit's range
export const unitsOf = (segment, kind) => splitUnits(segment.text, kind);
export const durationMs = (bytes, format) => Math.round(bytes / FORMATS[format] * 1000);

// Which voice reads this segment: dialogues give the second role the second voice.
export const voiceFor = (work, segment, accent) => VOICES[accent][work.roles && segment.speaker === work.roles[1] ? 1 : 0];

// Returns the timeline if it fits this work as it is now, otherwise null (then the device voice is used).
export function checkTimeline(timeline, work) {
    const t = timeline;
    if (!t || (t.version !== 1 && t.version !== 2) || t.id !== work.id || t.textHash !== workTextHash(work) || !Array.isArray(t.segments) || t.segments.length !== work.segments.length) return null;
    let last = 0;
    for (const [i, s] of t.segments.entries()) {
        const units = unitsOf(work.segments[i], work.kind);
        if (s.id !== work.segments[i].id || !Array.isArray(s.units) || s.units.length !== units.length || !(s.start >= last) || !(s.end > s.start)) return null;
        let at = s.start;
        for (const [k, u] of s.units.entries()) {
            if (!(u.start >= at) || !(u.end > u.start)) return null;
            if (t.version === 2 && !wordsFit(u, tokenize(units[k]).filter(token => token.word).length)) return null;
            at = u.end;
        }
        if (at > s.end + 1) return null;
        last = s.end;
    }
    return t;
}
// Every word of the unit has a start and an end inside it, in order.
function wordsFit(unit, count) {
    if (!Array.isArray(unit.words) || unit.words.length !== count) return false;
    let at = unit.start;
    for (const w of unit.words) { if (!Array.isArray(w) || !(w[0] >= at) || !(w[1] >= w[0]) || !(w[1] <= unit.end)) return false; at = w[0]; }
    return true;
}
// The word being said at a moment, as its number in the unit; -1 before the first word, and null when the timeline has no word times.
export function wordAt(unit, ms) {
    if (!unit.words) return null;
    let found = -1;
    for (const [i, w] of unit.words.entries()) { if (ms >= w[0]) found = i; else break; }
    return found;
}
// The unit playing at a moment, as [segment, unit], or null between or after.
export function unitAt(timeline, ms) {
    for (const [i, s] of timeline.segments.entries()) {
        if (ms < s.start || ms >= s.end) continue;
        const k = s.units.findIndex(u => ms >= u.start && ms < u.end);
        return k < 0 ? null : [i, k];
    }
    return null;
}
