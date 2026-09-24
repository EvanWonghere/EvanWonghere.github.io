import { frequency, clamp } from './core.mjs';
export const INSTRUMENTS = {
    grand: { name:'原声三角钢琴', path:'', group:'钢琴' }, bright: { name:'明亮钢琴', path:'bright/', group:'钢琴' }, honkytonk: { name:'酒吧钢琴', path:'honkytonk/', group:'钢琴' },
    electric: { name:'电钢琴', path:'electric/', group:'键盘' }, fm: { name:'FM 电钢琴', path:'fm/', group:'键盘' }, harpsichord: { name:'羽管键琴', path:'harpsichord/', group:'键盘' },
    organ: { name:'爵士风琴', path:'organ/', group:'键盘' },
    celesta: { name:'钢片琴', path:'celesta/', group:'色彩打击' }, vibraphone: { name:'颤音琴', path:'vibraphone/', group:'色彩打击' },
    marimba: { name:'马林巴', path:'marimba/', group:'色彩打击' }, glockenspiel: { name:'钟琴', path:'glockenspiel/', group:'色彩打击' },
    upright: { name:'原声贝斯', path:'upright/', group:'贝斯' }, bass: { name:'电贝斯', path:'bass/', group:'贝斯' }, synthbass: { name:'合成贝斯', path:'synthbass/', group:'贝斯' },
    nylon: { name:'尼龙弦吉他', path:'nylon/', group:'吉他' }, steel: { name:'钢弦吉他', path:'steel/', group:'吉他' },
    cleanguitar: { name:'清音电吉他', path:'cleanguitar/', group:'吉他' }, overdrive: { name:'失真电吉他', path:'overdrive/', group:'吉他' },
    strings: { name:'弦乐合奏', path:'strings/', group:'弦乐' }, pizzicato: { name:'弦乐拨奏', path:'pizzicato/', group:'弦乐' },
    violin: { name:'小提琴', path:'violin/', group:'弦乐' }, cello: { name:'大提琴', path:'cello/', group:'弦乐' }, harp: { name:'竖琴', path:'harp/', group:'弦乐' },
    trumpet: { name:'小号', path:'trumpet/', group:'铜管' }, trombone: { name:'长号', path:'trombone/', group:'铜管' },
    horn: { name:'圆号', path:'horn/', group:'铜管' }, brass: { name:'铜管组', path:'brass/', group:'铜管' },
    flute: { name:'长笛', path:'flute/', group:'木管' }, clarinet: { name:'单簧管', path:'clarinet/', group:'木管' },
    sax: { name:'中音萨克斯', path:'sax/', group:'木管' }, oboe: { name:'双簧管', path:'oboe/', group:'木管' },
    choir: { name:'合唱', path:'choir/', group:'人声与合成' }, pad: { name:'暖色铺底', path:'pad/', group:'人声与合成' }, lead: { name:'锯齿波主音', path:'lead/', group:'人声与合成' }
};

// Every sample is cut at about 3.2 s. Instruments that sustain rather than decay loop a steady
// stretch of their sample while the note is held; pianos, guitars, mallets and basses keep their natural decay.
export const SUSTAINED = new Set(['organ', 'strings', 'violin', 'cello', 'trumpet', 'trombone', 'horn', 'brass', 'flute', 'clarinet', 'sax', 'oboe', 'choir', 'pad', 'lead']);
export const LOOP_FADE = .2;

/** A stretch of 0.8–2 s, after the attack and before the cut, whose ends have the same loudness. Sample indices. */
export function loopRegion(x, sampleRate) {
    const hop = Math.round(sampleRate * .05), win = hop * 2, rms = [];
    for (let i = 0; i + win <= x.length; i += hop) { let s = 0; for (let j = i; j < i + win; j++) s += x[j] * x[j]; rms.push(Math.sqrt(s / win)); }
    if (!rms.length) return null;
    const level = t => rms[Math.min(rms.length - 1, Math.max(0, Math.round(t * sampleRate / hop)))];
    const last = Math.min(x.length / sampleRate - .15, 3), first = .5 + LOOP_FADE;
    let best = null;
    for (let end = last; end >= last - .4; end -= .05) for (let start = Math.max(first, end - 2); start <= end - .8; start += .05) {
        const a = level(start), b = level(end); if (b < 1e-4) continue;
        // Prefer matching loudness, then longer loops (fewer repeats are less audible).
        const score = Math.abs(a - b) / b - .02 * (end - start);
        if (!best || score < best.score) best = { start, end, score };
    }
    if (!best) return null;
    const end = Math.round(best.end * sampleRate), fade = Math.round(LOOP_FADE * sampleRate), span = Math.round(sampleRate * .01);
    // Within ±10 ms, start where the audio before it best matches the loop's last fade: the crossfade
    // then mixes two nearly in-phase signals instead of cancelling or doubling.
    let start = Math.round(best.start * sampleRate), bestCorr = -Infinity;
    for (let s = start - span; s <= start + span; s += 2) {
        if (s - fade < 0) continue;
        const c = correlation(x, end - fade, s - fade, fade, 4);
        if (c > bestCorr) { bestCorr = c; best.startIndex = s; }
    }
    return { start: best.startIndex ?? start, end };
}

/** Normalized correlation of x[a..a+n) and x[b..b+n), sampling every `step` samples. */
function correlation(x, a, b, n, step = 1) {
    let ab = 0, aa = 0, bb = 0;
    for (let i = 0; i < n; i += step) { const p = x[a + i], q = x[b + i]; ab += p * q; aa += p * p; bb += q * q; }
    return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
}

/**
 * Crossfades the end of the loop into the audio just before its start, so jumping from end to start is seamless.
 * The fade is equal-power for unrelated audio and is normalized by the two segments' correlation r,
 * whose mix has power 1 + r·sin(2θ): in-phase audio neither swells nor, out of phase, dips.
 */
export function crossfadeLoop(channels, start, end, fade) {
    for (const x of channels) {
        const r = Math.max(-.9, correlation(x, end - fade, start - fade, fade));
        for (let i = 0; i < fade; i++) {
            const theta = (i + .5) / fade * Math.PI / 2, norm = 1 / Math.sqrt(1 + r * Math.sin(2 * theta));
            x[end - fade + i] = (x[end - fade + i] * Math.cos(theta) + x[start - fade + i] * Math.sin(theta)) * norm;
        }
    }
}

/** <option> list grouped by family, for the instrument selects. */
export function instrumentOptions(selected, ids = Object.keys(INSTRUMENTS)) {
    const groups = new Map();
    for (const id of ids) { const { group, name } = INSTRUMENTS[id]; if (!groups.has(group)) groups.set(group, []); groups.get(group).push(`<option value="${id}"${id === selected ? ' selected' : ''}>${name}</option>`); }
    return [...groups].map(([group, options]) => `<optgroup label="${group}">${options.join('')}</optgroup>`).join('');
}

// The FluidR3 samples peak around 0.07–0.12 with an RMS of 0.015–0.045 over their first 0.3 s;
// at 0.45 the synthesized stand-in was about ten times louder, so 0.05 puts it at the same level.
export const FALLBACK_LEVEL = .05;

export class PianoAudio {
    constructor(onStatus = () => {}) {
        this.instrument = 'grand'; this.context = null; this.buffers = new Map(); this.loading = new Map(); this.voices = new Map();
        this.pedal = false; this.volume = .65; this.serial = 0; this.onStatus = onStatus; this.failed = new Set();
        // Banks other than the selected one, loaded note by note for arrangement tracks.
        this.others = new Map();
    }
    /** The sample maps of one instrument; the selected instrument keeps using buffers/loading/failed. */
    bank(instrument = this.instrument) {
        if (instrument === this.instrument) return { buffers: this.buffers, loading: this.loading, failed: this.failed };
        if (!this.others.has(instrument)) this.others.set(instrument, { buffers: new Map(), loading: new Map(), failed: new Set() });
        return this.others.get(instrument);
    }
    async init() {
        if (!this.context) {
            const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
            if (!Context) throw new Error('此浏览器不支持 Web Audio，请换用现代浏览器。');
            this.context = new Context({ latencyHint: 'interactive' });
            this.master = this.context.createGain(); this.master.gain.value = this.volume * .65;
            this.compressor = this.context.createDynamicsCompressor();
            this.compressor.threshold.value = -8; this.compressor.ratio.value = 8;
            this.master.connect(this.compressor); this.compressor.connect(this.context.destination);
        }
        if (this.context.state !== 'running') {
            let timer;
            try { await Promise.race([this.context.resume(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('声音未能启动，请点击“开启声音”重试。')), 5000); })]); }
            finally { clearTimeout(timer); }
        }
        if (this.context.state !== 'running') throw new Error('声音仍被浏览器暂停，请再次点击开启声音。');
        return this.context;
    }
    setVolume(value) {
        this.volume = clamp(value, 0, 1);
        if (this.master) this.master.gain.setTargetAtTime(this.volume * .65, this.context.currentTime, .02);
    }
    setInstrument(id) {
        if (!INSTRUMENTS[id] || id === this.instrument) return;
        this.stopAll(); this.instrument = id;
        // Release the previous banks, including arrangement ones; do not retain decoded banks on mobile devices.
        this.buffers = new Map(); this.loading = new Map(); this.failed = new Set(); this.others = new Map();
        this.onStatus(`${INSTRUMENTS[id].name} · 准备加载`);
    }
    async load(note, instrument = this.instrument) {
        if (!INSTRUMENTS[instrument]) instrument = this.instrument;
        const { buffers, loading, failed } = this.bank(instrument);
        if (buffers.has(note)) return buffers.get(note);
        if (loading.has(note)) return loading.get(note);
        const promise = (async () => {
            try {
                const response = await fetch(`/music/samples/${INSTRUMENTS[instrument].path}${note}.mp3`, { signal: AbortSignal.timeout(12000) });
                if (!response.ok) throw new Error('sample unavailable');
                const decoded = await this.context.decodeAudioData(await response.arrayBuffer());
                const data = SUSTAINED.has(instrument) ? this.loopable(decoded) : decoded;
                buffers.set(note, data); failed.delete(note);
                if (instrument === this.instrument) this.onStatus(`${INSTRUMENTS[instrument].name} · ${buffers.size} / 88 个采样已就绪${failed.size ? ' · 部分音使用合成音' : ''}`);
                return data;
            } catch {
                failed.add(note); if (instrument === this.instrument) this.onStatus('部分音色采样未加载，暂用合成音；可点击重新加载音色。'); return null;
            } finally { loading.delete(note); }
        })();
        loading.set(note, promise); return promise;
    }
    /** A copy of a decoded sample with a seamless loop baked in, marked with loop times in seconds. */
    loopable(buffer) {
        if (typeof buffer?.getChannelData !== 'function') return buffer;
        const region = loopRegion(buffer.getChannelData(0), buffer.sampleRate), fade = Math.round(LOOP_FADE * buffer.sampleRate);
        if (!region || region.start < fade) return buffer;
        const copy = this.context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
        for (let c = 0; c < buffer.numberOfChannels; c++) { const x = new Float32Array(buffer.getChannelData(c)); crossfadeLoop([x], region.start, region.end, fade); copy.copyToChannel(x, c); }
        copy.loop = { start: region.start / buffer.sampleRate, end: region.end / buffer.sampleRate };
        return copy;
    }
    async warm() {
        const instrument = this.instrument; await this.init();
        if (instrument !== this.instrument) return;
        const notes = Array.from({ length: 88 }, (_, i) => i + 21).sort((a, b) => Math.abs(a - 64) - Math.abs(b - 64));
        // Keep requests bounded; all pitches are sampled, no global-script or CDN dependency.
        for (let i = 0; i < notes.length; i += 8) { if (instrument !== this.instrument) return; await Promise.all(notes.slice(i, i + 8).map(n => this.load(n))); }
    }
    noteOn(note, velocity = 85, when = this.context?.currentTime || 0, id = `voice-${++this.serial}`, instrument = this.instrument) {
        if (!this.context || this.context.state !== 'running' || note < 21 || note > 108) return null;
        if (!INSTRUMENTS[instrument]) instrument = this.instrument;
        const bank = this.bank(instrument);
        when = Math.max(when, this.context.currentTime);
        if (this.voices.has(id)) this.release(id, when, true);
        // Bound polyphony, including pedal tails, to prevent unbounded resources.
        if (this.voices.size >= 96) this.release(this.voices.keys().next().value, this.context.currentTime, true);
        const gain = this.context.createGain(); gain.connect(this.master);
        const level = (clamp(velocity, 1, 127) / 127) ** 1.6;
        gain.gain.setValueAtTime(0, when); gain.gain.linearRampToValueAtTime(level, when + .005);
        const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1400 + level * 10000; filter.connect(gain);
        const buffer = bank.buffers.get(note); const sources = [];
        if (buffer) {
            const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(filter); source.start(when); sources.push(source);
            // Sustained instruments hold until released; the long stop is only a guard against a lost release.
            if (buffer.loop) { source.loop = true; source.loopStart = buffer.loop.start; source.loopEnd = buffer.loop.end; source.stop(when + 600); }
        } else {
            // Additive fallback while the sample loads: a fast attack, decaying harmonics and a longer
            // fundamental, scaled to the samples' level so the first presses are not louder.
            for (let harmonic = 1; harmonic <= 5; harmonic++) {
                const source = this.context.createOscillator(); source.type = 'sine'; source.frequency.value = frequency(note) * harmonic;
                const harmonicGain = this.context.createGain(); harmonicGain.gain.setValueAtTime(FALLBACK_LEVEL / harmonic ** 2, when);
                harmonicGain.gain.exponentialRampToValueAtTime(.0001, when + (harmonic === 1 ? 3.5 : 1.5) * (60 / Math.max(note, 30)));
                source.connect(harmonicGain); harmonicGain.connect(filter); source.start(when); source.stop(when + 8); sources.push(source);
                source.addEventListener('ended', () => harmonicGain.disconnect(), { once: true });
            }
            if (!bank.failed.has(note)) void this.load(note, instrument);
        }
        const voice = { sources, gain, filter, note, held: true, released: false };
        this.voices.set(id, voice);
        sources[0].addEventListener('ended', () => {
            if (this.voices.get(id) === voice) this.voices.delete(id);
            gain.disconnect(); filter.disconnect(); sources.forEach(s => s.disconnect());
        }, { once: true });
        return id;
    }
    release(id, when = this.context?.currentTime || 0, force = false) {
        const voice = this.voices.get(id); if (!voice || (voice.released && !force)) return;
        voice.held = false;
        if (this.pedal && !force) return;
        voice.released = true;
        const time = Math.max(when, this.context.currentTime), duration = force ? .025 : .22;
        voice.gain.gain.cancelAndHoldAtTime?.(time);
        if (!voice.gain.gain.cancelAndHoldAtTime) { voice.gain.gain.cancelScheduledValues(time); voice.gain.gain.setValueAtTime(voice.gain.gain.value, time); }
        voice.gain.gain.linearRampToValueAtTime(0, time + duration);
        for (const source of voice.sources) { try { source.stop(time + duration + .02); } catch { /* already ended */ } }
    }
    setPedal(on) {
        this.pedal = on;
        if (!on) for (const [id, voice] of this.voices) if (!voice.held) this.release(id);
    }
    stopAll() {
        this.pedal = false;
        for (const id of [...this.voices.keys()]) this.release(id, this.context?.currentTime, true);
    }
    click(when, accent = false) {
        if (!this.context) return;
        const source = this.context.createOscillator(), gain = this.context.createGain();
        source.frequency.value = accent ? 1300 : 850;
        gain.gain.setValueAtTime(.22, when); gain.gain.exponentialRampToValueAtTime(.001, when + .05);
        source.connect(gain); gain.connect(this.master); source.start(when); source.stop(when + .06);
        source.onended = () => { gain.disconnect(); source.disconnect(); };
        return source;
    }
}

export class Transport {
    constructor(audio) { this.audio = audio; this.timers = new Set(); this.sources = new Set(); this.ids = new Set(); this.generation = 0; }
    later(fn, ms) { const timer = setTimeout(() => { this.timers.delete(timer); fn(); }, Math.max(0, ms)); this.timers.add(timer); return timer; }
    stop() {
        this.generation++;
        for (const t of this.timers) clearTimeout(t); this.timers.clear();
        for (const source of this.sources) { try { source.stop(); } catch { /* already ended */ } } this.sources.clear();
        for (const id of this.ids) this.audio.release(id, this.audio.context?.currentTime, true); this.ids.clear();
    }
    async play(events, bpm, { onEvent = () => {}, onEnd = () => {}, countIn = 0, clicks = false } = {}) {
        this.stop(); const generation = this.generation;
        await this.audio.init();
        // Prepare the requested samples before the count-in starts.
        await Promise.all([...new Set(events.flatMap(e => e.notes))].map(n => this.audio.load(n)));
        if (generation !== this.generation) return;
        const beat = 60 / bpm, start = this.audio.context.currentTime + .12, offset = countIn * beat;
        if (countIn) for (let i = 0; i < countIn; i++) this.sources.add(this.audio.click(start + i * beat, i === 0));
        let position = 0;
        events.forEach((event, index) => {
            const when = start + offset + position * beat;
            for (const note of event.notes) {
                const id = this.audio.noteOn(note, 82, when); if (id) { this.ids.add(id); this.audio.release(id, when + (event.durations?.[note] ?? event.beats) * beat * .94, true); }
            }
            this.later(() => onEvent(index), (when - this.audio.context.currentTime) * 1000);
            position += event.beats;
        });
        if (clicks) for (let i = 0; i < position; i++) this.sources.add(this.audio.click(start + offset + i * beat, i % 4 === 0));
        this.later(() => { if (generation === this.generation) { this.stop(); onEnd(); } }, (start + offset + position * beat - this.audio.context.currentTime) * 1000 + 100);
    }
}
