// Pre-rendered model voice: one mp3 per work and accent, plus a timeline saying where each segment and each unit
// (a sentence, or a clause or line of a poem) starts and ends. Pure functions; the tool writes the files and the reader plays them.
// The timeline is exact for units because the tool synthesizes them one by one; nothing inside a unit is guessed.
import { splitUnits, workTextHash } from './library.mjs';

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
    if (!t || t.version !== 1 || t.id !== work.id || t.textHash !== workTextHash(work) || !Array.isArray(t.segments) || t.segments.length !== work.segments.length) return null;
    let last = 0;
    for (const [i, s] of t.segments.entries()) {
        const units = unitsOf(work.segments[i], work.kind);
        if (s.id !== work.segments[i].id || !Array.isArray(s.units) || s.units.length !== units.length || !(s.start >= last) || !(s.end > s.start)) return null;
        let at = s.start;
        for (const u of s.units) { if (!(u.start >= at) || !(u.end > u.start)) return null; at = u.end; }
        if (at > s.end + 1) return null;
        last = s.end;
    }
    return t;
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
