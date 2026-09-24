// Page-side controller for the Strudel sandbox. One hidden <iframe sandbox="allow-scripts"> per page:
// its document has an opaque origin, so Strudel code (the visitor's, generated or AI-written) cannot
// read this site's storage, progress or login session. Only postMessage crosses the boundary.
import { PIANO_SAMPLE_NOTES, STRUDEL_BUNDLE, STRUDEL_RUNTIME, encodeWav, midiName, readSandboxMessage, sandboxDocument } from './strudel-bridge.mjs';
import { INSTRUMENTS } from './audio.mjs';

let sources = null;
const loadSources = () => sources ||= Promise.all([STRUDEL_BUNDLE, STRUDEL_RUNTIME].map(async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Strudel 运行文件未能加载，请检查网络后重试。');
    return response.text();
})).catch(error => { sources = null; throw error; });

// The site's drums, rendered once to WAV so the sandbox has bd / sd / hh without any download.
async function renderDrums() {
    const rate = 44100, out = {};
    for (const kind of ['bd', 'sd', 'hh']) {
        const length = kind === 'bd' ? 0.4 : kind === 'sd' ? 0.25 : 0.08;
        const ctx = new OfflineAudioContext(1, Math.ceil(rate * length), rate), gain = ctx.createGain();
        gain.connect(ctx.destination); gain.gain.setValueAtTime(kind === 'hh' ? 0.35 : 0.9, 0); gain.gain.exponentialRampToValueAtTime(0.001, length);
        if (kind === 'bd') { const osc = ctx.createOscillator(); osc.frequency.setValueAtTime(140, 0); osc.frequency.exponentialRampToValueAtTime(45, 0.12); osc.connect(gain); osc.start(0); }
        else {
            const noise = ctx.createBuffer(1, ctx.length, rate), data = noise.getChannelData(0);
            let seed = 7; for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = seed / 1073741823 - 1; }
            const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
            src.buffer = noise; filter.type = 'highpass'; filter.frequency.value = kind === 'hh' ? 7000 : 1200;
            src.connect(filter); filter.connect(gain); src.start(0);
        }
        out[kind] = encodeWav((await ctx.startRendering()).getChannelData(0), rate);
    }
    return out;
}

export class StrudelSandbox {
    constructor() { this.frame = null; this.online = false; this.listeners = new Set(); this.waiters = []; this.starting = null; this.playing = null; }
    /** listener(message) receives validated messages: hap, playing, stopped, log, error, status. */
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    emit(message) { for (const l of this.listeners) l(message); }
    wait(type, ms) {
        return new Promise((resolve, reject) => {
            const waiter = { type, resolve, reject, timer: setTimeout(() => { this.waiters = this.waiters.filter(w => w !== waiter); reject(new Error('Strudel 沙箱没有响应，请重试。')); }, ms) };
            this.waiters.push(waiter);
        });
    }
    receive = event => {
        if (!this.frame || event.source !== this.frame.contentWindow) return;
        const message = readSandboxMessage(event.data);
        if (!message) return;
        for (const w of [...this.waiters]) if (w.type === message.type || message.type === 'error') {
            clearTimeout(w.timer); this.waiters = this.waiters.filter(x => x !== w);
            if (message.type === 'error' && w.type !== 'error') w.reject(new Error(message.message)); else w.resolve(message);
        }
        this.emit(message);
    };
    /** Creates (or re-creates, when the online setting changes) the sandbox and loads its sounds. */
    start({ online = false, instrument = 'grand' } = {}) {
        if (this.frame && this.online === online && this.starting) return this.starting;
        this.destroy(); this.online = online;
        this.starting = (async () => {
            const [bundle, runtime] = await loadSources();
            addEventListener('message', this.receive);
            const frame = document.createElement('iframe');
            frame.setAttribute('sandbox', 'allow-scripts'); frame.allow = 'autoplay'; frame.title = 'Strudel 沙箱'; frame.hidden = true;
            this.frame = frame;
            const ready = this.wait('ready', 20000);
            frame.srcdoc = sandboxDocument({ bundle, runtime, online });
            document.body.append(frame);
            await ready;
            this.emit({ type: 'status', message: '正在准备本站钢琴采样与鼓组…' });
            const path = INSTRUMENTS[instrument]?.path ?? '', piano = {};
            await Promise.all(PIANO_SAMPLE_NOTES.map(async n => { const r = await fetch(`/music/samples/${path}${n}.mp3`); if (r.ok) piano[midiName(n)] = await r.arrayBuffer(); }));
            const drums = await renderDrums();
            const sounds = this.wait('sounds-ready', 20000);
            frame.contentWindow.postMessage({ type: 'sounds', piano, drums }, '*', [...Object.values(piano), ...Object.values(drums)]);
            await sounds;
            if (online) {
                this.emit({ type: 'status', message: '正在从 GitHub 加载 Strudel 在线采样…' });
                const done = this.wait('online-ready', 30000);
                frame.contentWindow.postMessage({ type: 'online' }, '*');
                try { await done; } catch { this.emit({ type: 'log', message: '在线采样未能加载；继续使用本站声音。' }); }
            }
            return this;
        })().catch(error => { this.destroy(); throw error; });
        return this.starting;
    }
    async play(code, id, options) {
        await this.start(options);
        const playing = this.wait('playing', 15000);
        this.playing = id;
        this.frame.contentWindow.postMessage({ type: 'play', code, id }, '*');
        return playing;
    }
    stop() { if (this.frame && this.playing) this.frame.contentWindow.postMessage({ type: 'stop' }, '*'); this.playing = null; }
    destroy() {
        removeEventListener('message', this.receive);
        for (const w of this.waiters) { clearTimeout(w.timer); w.reject(new Error('Strudel 沙箱已关闭。')); }
        this.waiters = []; this.frame?.remove(); this.frame = null; this.starting = null; this.playing = null;
    }
}

let shared = null;
/** One sandbox per page, shared by the arrangement desk and the live-coding panel. */
export const sharedSandbox = () => shared ||= new StrudelSandbox();
