// Page-side controller for the Strudel sandbox. One hidden <iframe sandbox="allow-scripts"> per page:
// its document has an opaque origin, so Strudel code (the visitor's, generated or AI-written) cannot
// read this site's storage, progress or login session. Only postMessage crosses the boundary.
import { PIANO_SAMPLE_NOTES, STRUDEL_BUNDLE, STRUDEL_RUNTIME, encodeWav, loopedSamples, midiName, readSandboxMessage, sandboxDocument } from './strudel-bridge.mjs';
import { INSTRUMENTS, SUSTAINED } from './audio.mjs';

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

// Decodes the MP3 samples and bakes the loop in; on any failure the plain samples are used instead.
async function loopSamples(piano) {
    try {
        const ctx = new OfflineAudioContext(1, 1, 44100), decoded = {};
        for (const [name, bytes] of Object.entries(piano)) {
            const buffer = await ctx.decodeAudioData(bytes.slice(0));
            decoded[name] = { sampleRate: buffer.sampleRate, channels: Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c)) };
        }
        return loopedSamples(decoded, midiName(60));
    } catch { return null; }
}

export class StrudelSandbox {
    constructor() { this.frame = null; this.online = false; this.instrument = null; this.generation = 0; this.request = null; this.listeners = new Set(); this.waiters = []; this.starting = null; this.playing = null; }
    /** listener(message) receives validated messages: hap, playing, stopped, log, error, status. */
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    emit(message) { for (const l of this.listeners) l(message); }
    wait(types, ms) {
        const type = [].concat(types);
        return new Promise((resolve, reject) => {
            const waiter = { type, resolve, reject, timer: setTimeout(() => { this.waiters = this.waiters.filter(w => w !== waiter); reject(new Error('Strudel 沙箱没有响应，请重试。')); }, ms) };
            this.waiters.push(waiter);
        });
    }
    receive = event => {
        if (!this.frame || event.source !== this.frame.contentWindow) return;
        const message = readSandboxMessage(event.data);
        if (!message) return;
        for (const w of [...this.waiters]) if (w.type.includes(message.type) || message.type === 'error') {
            clearTimeout(w.timer); this.waiters = this.waiters.filter(x => x !== w);
            if (message.type === 'error' && !w.type.includes('error')) w.reject(new Error(message.message)); else w.resolve(message);
        }
        this.emit(message);
    };
    /** Creates (or re-creates, when the online setting changes) the sandbox and loads its sounds. */
    start({ online = false, instrument = 'grand' } = {}) {
        // The piano samples are loaded per instrument, so a different instrument needs a fresh sandbox.
        if (this.starting && this.online === online && this.instrument === instrument) return this.starting;
        this.destroy(); this.online = online; this.instrument = instrument;
        const gen = this.generation, current = () => { if (gen !== this.generation) throw new Error('Strudel 沙箱已关闭。'); };
        this.starting = (async () => {
            const [bundle, runtime] = await loadSources();
            current();
            addEventListener('message', this.receive);
            const frame = document.createElement('iframe');
            frame.setAttribute('sandbox', 'allow-scripts'); frame.allow = 'autoplay'; frame.title = 'Strudel 沙箱'; frame.hidden = true;
            this.frame = frame;
            // CSP cannot stop the frame from navigating itself; a second load means it tried, so the
            // sandbox is closed and the attempt reported.
            let loads = 0;
            frame.addEventListener('load', () => { if (++loads > 1 && this.frame === frame) { this.destroy(); this.emit({ type: 'error', id: null, message: 'Strudel 代码试图让沙箱离开本页，已关闭沙箱。' }); } });
            const ready = this.wait('ready', 20000);
            frame.srcdoc = sandboxDocument({ bundle, runtime, online });
            document.body.append(frame);
            await ready;
            this.emit({ type: 'status', message: '正在准备本站钢琴采样与鼓组…' });
            const path = INSTRUMENTS[instrument]?.path ?? '', piano = {};
            await Promise.all(PIANO_SAMPLE_NOTES.map(async n => { const r = await fetch(`/music/samples/${path}${n}.mp3`); if (r.ok) piano[midiName(n)] = await r.arrayBuffer(); }));
            const drums = await renderDrums();
            // Sustained instruments hold notes for their written length: the samples go in as looped WAV.
            const looped = SUSTAINED.has(instrument) ? await loopSamples(piano) : null;
            current();
            const sounds = this.wait('sounds-ready', 20000), sent = looped?.wavs ?? piano;
            frame.contentWindow.postMessage({ type: 'sounds', piano: sent, pianoType: looped ? 'audio/wav' : 'audio/mpeg', loop: looped?.loop ?? null, drums }, '*', [...Object.values(sent), ...Object.values(drums)]);
            await sounds;
            if (online) {
                this.emit({ type: 'status', message: '正在从 GitHub 加载 Strudel 在线采样…' });
                const done = this.wait('online-ready', 30000);
                frame.contentWindow.postMessage({ type: 'online' }, '*');
                try { await done; } catch { this.emit({ type: 'log', message: '在线采样未能加载；继续使用本站声音。' }); }
            }
            return this;
        })().catch(error => { if (gen === this.generation) this.destroy(); throw error; });
        return this.starting;
    }
    /** Resolves with null when stop() or another play() superseded this one during startup. */
    async play(code, id, options) {
        this.request = id;
        await this.start(options);
        if (this.request !== id || !this.frame) return null;
        this.playing = id;
        const first = this.wait(['playing', 'needs-gesture'], 15000);
        this.frame.contentWindow.postMessage({ type: 'play', code, id }, '*');
        const message = await first;
        if (message.type !== 'needs-gesture') return message;
        // Safari: the frame itself shows a "tap to start" button; show the frame until it is tapped.
        this.showUnlock(true);
        this.emit({ type: 'status', message: '请轻点下方出现的“轻点这里开始演奏”：Safari 需要在演奏区域里点一下才能出声。' });
        try { return await this.wait('playing', 120000); } finally { this.showUnlock(false); }
    }
    showUnlock(on) {
        if (!this.frame) return;
        this.frame.hidden = !on;
        this.frame.style.cssText = on ? 'position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom, 0px));transform:translateX(-50%);width:min(340px, calc(100vw - 32px));height:96px;border:0;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.28);z-index:2000;background:#303f37' : '';
    }
    stop() { this.request = null; this.showUnlock(false); if (this.frame && this.playing) this.frame.contentWindow.postMessage({ type: 'stop' }, '*'); this.playing = null; }
    destroy() {
        this.generation++;
        removeEventListener('message', this.receive);
        for (const w of this.waiters) { clearTimeout(w.timer); w.reject(new Error('Strudel 沙箱已关闭。')); }
        this.waiters = []; this.frame?.remove(); this.frame = null; this.starting = null; this.playing = null;
    }
}

let shared = null;
/** One sandbox per page, shared by the arrangement desk and the live-coding panel. */
export const sharedSandbox = () => shared ||= new StrudelSandbox();
