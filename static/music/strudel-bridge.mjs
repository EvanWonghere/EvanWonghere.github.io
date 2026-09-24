// Pure helpers for the Strudel sandbox: the sandbox document and its Content Security Policy,
// validation of messages coming out of the sandbox, WAV encoding and cycle-to-beat mapping.

export const STRUDEL_BUNDLE = '/music/vendor/strudel-web-1.3.0.js';
export const STRUDEL_RUNTIME = '/music/strudel-runtime.js';
export const ONLINE_HOSTS = ['https://raw.githubusercontent.com'];
// Every third semitone from A0 to C8; Strudel pitch-shifts from the nearest sample.
export const PIANO_SAMPLE_NOTES = Array.from({ length: 30 }, (_, i) => 21 + i * 3).filter(n => n <= 108);
const SHARP = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
export const midiName = midi => SHARP[midi % 12] + (Math.floor(midi / 12) - 1);

/** Offline: no network at all. Online: sample downloads from GitHub only. */
export function sandboxPolicy({ online = false } = {}) {
    const net = online ? ` ${ONLINE_HOSTS.join(' ')}` : '';
    return `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'unsafe-inline'; media-src data: blob:${net}; connect-src data: blob:${net}; worker-src data: blob:; img-src data:`;
}
const inline = source => String(source).replace(/<\/(script)/gi, '<\\/$1');
/** The srcdoc for <iframe sandbox="allow-scripts">: bundle and runtime inline, strict policy first. */
export function sandboxDocument({ bundle, runtime, online = false }) {
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${sandboxPolicy({ online })}"></head><body><script>${inline(bundle)}</script><script>${inline(runtime)}</script></body></html>`;
}

const TYPES = new Set(['ready', 'sounds-ready', 'online-ready', 'needs-gesture', 'playing', 'stopped', 'hap', 'log', 'error']);
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;
const str = (v, max) => typeof v === 'string' ? v.slice(0, max) : null;
/**
 * Messages from the sandbox come from code the page does not control, so every field is checked
 * and copied; anything unexpected is dropped (returns null).
 */
export function readSandboxMessage(data) {
    if (!data || typeof data !== 'object' || !TYPES.has(data.type)) return null;
    const out = { type: data.type };
    if ('id' in data) out.id = str(data.id, 80);
    if (data.type === 'hap') {
        out.cycle = num(data.cycle, 0, 1e7); out.length = num(data.length, 0, 1e4) ?? 0; out.delay = num(data.delay, -1, 10) ?? 0;
        out.note = typeof data.note === 'number' ? num(data.note, 0, 127) : str(data.note, 8);
        out.n = num(data.n, -1000, 1000); out.s = str(data.s, 40);
        if (out.cycle === null) return null;
    }
    if (data.type === 'log' || data.type === 'error') out.message = str(data.message, 500) ?? '';
    return out;
}

/** 16-bit mono PCM WAV. */
export function encodeWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
    const ascii = (offset, s) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
    ascii(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); ascii(8, 'WAVE'); ascii(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
    return buffer;
}

/** Arrangement exports use one cycle per bar and loop the whole piece. */
export function cycleToBeat(cycle, bars, bpb) {
    if (!bars) return 0;
    const bar = Math.floor(cycle + 1e-9), frac = cycle - bar;
    return (((bar % bars) + bars) % bars) * bpb + frac * bpb;
}
