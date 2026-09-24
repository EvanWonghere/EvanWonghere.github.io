// Deterministic rule checks for an arrangement. These are notation and playability checks,
// separate from any AI opinion, and they never change the document.
import { positionLabel } from './arrangement.mjs';

export const RANGES = { melody: [55, 88], comp: [43, 86], bass: [28, 60], pad: [48, 91] };
const ROLE_NAMES = { melody: '旋律', comp: '伴奏', bass: '低音', pad: '铺底' };

export function checkArrangement(real, doc) {
    const issues = [], { bpb } = real, trackName = Object.fromEntries(doc.tracks.map(t => [t.id, t.name]));
    const add = (level, code, message, extra = {}) => issues.push({ level, code, message, ...extra });
    const pos = beat => positionLabel(beat, bpb);

    for (const s of real.sections) {
        const chords = real.chords.filter(c => c.section === s.id);
        if (!chords.length) { add('info', 'no-chords', `“${s.name}”还没有和弦；伴奏型只在有和弦的位置发声。`, { sectionId: s.id }); continue; }
        let covered = 0; for (const c of chords) covered += c.beats;
        if (covered < s.beats - 1e-6) add('info', 'chord-gaps', `“${s.name}”有 ${+(s.beats - covered).toFixed(2)} 拍没有和弦。`, { sectionId: s.id });
    }
    const byTrack = new Map();
    for (const e of real.events) if (!e.drum) (byTrack.get(e.trackId) || byTrack.set(e.trackId, []).get(e.trackId)).push(e);
    for (const [tid, events] of byTrack) {
        const role = doc.tracks.find(t => t.id === tid).role, [lo, hi] = RANGES[role] || [21, 108];
        const out = events.filter(e => e.pitch < lo || e.pitch > hi);
        if (out.length) add('warning', 'range', `${trackName[tid]}有 ${out.length} 个音超出常用${ROLE_NAMES[role] || ''}音域（${out.map(e => e.spelling).slice(0, 3).join('、')}…，首次在 ${pos(out[0].start)}）。`, { trackId: tid, at: out[0].start, eventIds: out.map(e => e.id) });
        if (role === 'comp') {
            const starts = [...new Set(events.map(e => e.start))];
            const wide = starts.find(st => { const now = events.filter(e => Math.abs(e.start - st) < 1e-6).map(e => e.pitch); return Math.max(...now) - Math.min(...now) > 14; });
            if (wide !== undefined) add('info', 'span', `${trackName[tid]}在 ${pos(wide)} 同时发声的音跨度超过九度，单手可能够不到。`, { trackId: tid, at: wide });
        }
    }
    const melody = doc.tracks.find(t => t.role === 'melody'), bass = doc.tracks.find(t => t.role === 'bass');
    const sounding = (events, beat) => events.filter(e => e.start <= beat + 1e-6 && e.start + e.beats > beat + 1e-6);
    if (melody && byTrack.get(melody.id)) {
        const mel = byTrack.get(melody.id);
        for (const [tid, events] of byTrack) {
            if (tid === melody.id || doc.tracks.find(t => t.id === tid).role !== 'comp') continue;
            const crossing = mel.find(m => sounding(events, m.start).some(e => e.pitch > m.pitch));
            if (crossing) add('info', 'crossing', `${trackName[tid]}在 ${pos(crossing.start)} 高过旋律，旋律可能被盖住。`, { trackId: tid, at: crossing.start, eventIds: [crossing.id] });
        }
        // Parallel perfect intervals between the outer voices, only when the arrangement asks for classical rules.
        if (doc.meta.classical && bass && byTrack.get(bass.id)) {
            const low = byTrack.get(bass.id), attacks = [...new Set([...mel, ...low].map(e => e.start))].sort((a, b) => a - b);
            let previous = null;
            for (const beat of attacks) {
                const top = sounding(mel, beat).at(-1), bottom = sounding(low, beat)[0];
                if (!top || !bottom) { previous = null; continue; }
                const now = { top: top.pitch, bottom: bottom.pitch, interval: (top.pitch - bottom.pitch) % 12 };
                if (previous && [0, 7].includes(now.interval) && now.interval === previous.interval && now.top !== previous.top && now.bottom !== previous.bottom && Math.sign(now.top - previous.top) === Math.sign(now.bottom - previous.bottom))
                    add('warning', 'parallels', `旋律与低音在 ${pos(beat)} 形成平行${now.interval ? '五' : '八'}度。`, { at: beat, eventIds: [top.id, bottom.id] });
                previous = now;
            }
        }
    }
    return issues;
}
