// One-way export of a realized arrangement to Strudel code: one cycle per bar, sixteenth-note
// steps, `@n` elongation for held notes. The code runs only in Strudel's own editor, never here.
const DRUM_SOUND = { kick: 'bd', snare: 'sd', hat: 'hh' };
// Sounds that exist both on strudel.cc and offline in the site's sandbox (piano samples + built-in synths).
// Instruments without a match fall back to piano; sustained families map to the closest built-in synth.
export const SOUND = { organ: 'square', clarinet: 'square', flute: 'sine', strings: 'triangle', violin: 'triangle', cello: 'triangle', choir: 'triangle', pad: 'triangle',
    trumpet: 'sawtooth', trombone: 'sawtooth', horn: 'sawtooth', brass: 'sawtooth', sax: 'sawtooth', oboe: 'sawtooth', lead: 'sawtooth', synthbass: 'sawtooth' };
const SHARP = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
const comment = s => String(s).replace(/[\r\n*/]/g, ' ').trim();

/** Strudel note name: keeps single sharps/flats as spelled, otherwise names the key sounding. */
export function strudelNote(pitch, spelling) {
    const m = spelling && /^([A-G])(♭|♯)?(-?\d)$/u.exec(spelling);
    if (m) return m[1].toLowerCase() + (m[2] === '♭' ? 'b' : m[2] === '♯' ? '#' : '') + m[3];
    return SHARP[pitch % 12] + (Math.floor(pitch / 12) - 1);
}

// Greedy lanes: events that overlap in time go to different lanes; equal start and length share a chord.
function lanes(events) {
    const out = [];
    for (const e of events) {
        let lane = out.find(l => { const last = l.at(-1); return (last.start === e.start && last.beats === e.beats) || last.start + last.beats <= e.start + 1e-6; });
        if (!lane) { lane = []; out.push(lane); }
        lane.push(e);
    }
    return out;
}
function barPattern(events, barStart, steps, name) {
    const slots = new Map();
    for (const e of events) {
        const step = Math.round((e.start - barStart) * 4);
        if (step < 0 || step >= steps) continue;
        const slot = slots.get(step) || { names: new Set(), length: 1 };
        slot.names.add(name(e)); slot.length = Math.max(slot.length, Math.min(steps - step, Math.max(1, Math.round(e.beats * 4))));
        slots.set(step, slot);
    }
    if (!slots.size) return '~';
    const tokens = []; let step = 0;
    const push = (text, length) => tokens.push(length > 1 ? `${text}@${length}` : text);
    for (const s of [...slots.keys()].sort((a, b) => a - b)) {
        if (s < step) continue;
        if (s > step) push('~', s - step);
        const slot = slots.get(s), names = [...slot.names], length = Math.min(slot.length, steps - s);
        push(names.length > 1 ? `[${names.join(',')}]` : names[0], length);
        step = s + length;
    }
    if (step < steps) push('~', steps - step);
    return `[${tokens.join(' ')}]`;
}

// A note held across a barline is split at the barline: each cycle is its own bar, so the tail is
// struck again at the start of the next bar rather than lost.
function splitAtBars(e, bpb) {
    const out = []; let start = e.start, left = e.beats;
    while (left > 1e-9) {
        const barEnd = (Math.floor(start / bpb + 1e-9) + 1) * bpb, beats = Math.min(left, barEnd - start);
        out.push({ ...e, start, beats }); start += beats; left -= beats;
    }
    return out;
}
export function compileStrudel(real, doc) {
    const { bpb, totalBeats } = real, bars = Math.round(totalBeats / bpb), steps = Math.round(bpb * 4);
    const soloing = doc.tracks.some(t => t.solo), lines = [];
    for (const track of doc.tracks) {
        if (track.mute || (soloing && !track.solo)) continue;
        const events = real.events.filter(e => e.trackId === track.id).flatMap(e => splitAtBars(e, bpb));
        if (!events.length) continue;
        const layers = track.role === 'drums' ? [events] : lanes(events);
        layers.forEach((lane, i) => {
            const name = track.role === 'drums' ? e => DRUM_SOUND[e.drum] : e => strudelNote(e.pitch, e.spelling);
            const cycle = Array.from({ length: bars }, (_, b) => barPattern(lane, b * bpb, steps, name));
            const body = cycle.every(c => c === '~') ? null : `"<${cycle.join(' ')}>"`;
            if (!body) return;
            const label = `  // ${comment(track.name)}${layers.length > 1 ? ` · 第 ${i + 1} 层` : ''}`;
            const sound = track.role === 'drums' ? `s(${body})` : `note(${body}).s("${track.role === 'pad' ? 'triangle' : SOUND[track.instrument] || 'piano'}")`;
            lines.push(`${label}\n  ${sound}.gain(${(+track.volume.toFixed(2)) || 0})`);
        });
    }
    const head = [
        `// ${comment(doc.title)} · ${doc.meta.key}${doc.meta.mode === 'minor' ? ' 小调' : ' 大调'} · ${doc.meta.meter} · ${doc.meta.tempo} BPM`,
        '// 由蜂窝音乐练习室的编曲工作台生成：每个循环是一小节，按段落顺序循环整首。',
        ...(doc.meta.swing > 0.5 ? ['// 本站播放带摇摆；这段代码按直拍书写。'] : []),
        `setcpm(${+(doc.meta.tempo / bpb).toFixed(3)})`
    ].join('\n');
    return lines.length ? `${head}\nstack(\n${lines.join(',\n')}\n)\n` : `${head}\n// 还没有可以演奏的声部。\nsilence\n`;
}
