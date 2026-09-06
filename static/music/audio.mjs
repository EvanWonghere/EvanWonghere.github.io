import { frequency, clamp } from './core.mjs';
export const INSTRUMENTS = { grand: { name:'原声三角钢琴', path:'' }, electric:{ name:'电钢琴', path:'electric/' }, harpsichord:{ name:'羽管键琴', path:'harpsichord/' }, organ:{ name:'爵士风琴', path:'organ/' } };

export class PianoAudio {
    constructor(onStatus = () => {}) {
        this.instrument = 'grand'; this.context = null; this.buffers = new Map(); this.loading = new Map(); this.voices = new Map();
        this.pedal = false; this.volume = .65; this.serial = 0; this.onStatus = onStatus; this.failed = new Set();
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
        // Release the previous bank; do not retain four decoded banks on mobile devices.
        this.buffers = new Map(); this.loading = new Map(); this.failed = new Set();
        this.onStatus(`${INSTRUMENTS[id].name} · 准备加载`);
    }
    async load(note) {
        if (this.buffers.has(note)) return this.buffers.get(note);
        if (this.loading.has(note)) return this.loading.get(note);
        const instrument = this.instrument, buffers = this.buffers, loading = this.loading, failed = this.failed;
        const promise = (async () => {
            try {
                const response = await fetch(`/music/samples/${INSTRUMENTS[instrument].path}${note}.mp3`, { signal: AbortSignal.timeout(12000) });
                if (!response.ok) throw new Error('sample unavailable');
                const data = await this.context.decodeAudioData(await response.arrayBuffer());
                buffers.set(note, data); failed.delete(note);
                if (instrument === this.instrument) this.onStatus(`${INSTRUMENTS[instrument].name} · ${buffers.size} / 88 个采样已就绪${failed.size ? ' · 部分音使用合成音' : ''}`);
                return data;
            } catch {
                failed.add(note); if (instrument === this.instrument) this.onStatus('部分音色采样未加载，暂用合成音；可点击重新加载音色。'); return null;
            } finally { loading.delete(note); }
        })();
        this.loading.set(note, promise); return promise;
    }
    async warm() {
        const instrument = this.instrument; await this.init();
        if (instrument !== this.instrument) return;
        const notes = Array.from({ length: 88 }, (_, i) => i + 21).sort((a, b) => Math.abs(a - 64) - Math.abs(b - 64));
        // Keep requests bounded; all pitches are sampled, no global-script or CDN dependency.
        for (let i = 0; i < notes.length; i += 8) { if (instrument !== this.instrument) return; await Promise.all(notes.slice(i, i + 8).map(n => this.load(n))); }
    }
    noteOn(note, velocity = 85, when = this.context?.currentTime || 0, id = `voice-${++this.serial}`) {
        if (!this.context || this.context.state !== 'running' || note < 21 || note > 108) return null;
        when = Math.max(when, this.context.currentTime);
        if (this.voices.has(id)) this.release(id, when, true);
        // Bound polyphony, including pedal tails, to prevent unbounded resources.
        if (this.voices.size >= 96) this.release(this.voices.keys().next().value, this.context.currentTime, true);
        const gain = this.context.createGain(); gain.connect(this.master);
        const level = (clamp(velocity, 1, 127) / 127) ** 1.6;
        gain.gain.setValueAtTime(0, when); gain.gain.linearRampToValueAtTime(level, when + .005);
        const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1400 + level * 10000; filter.connect(gain);
        const buffer = this.buffers.get(note); const sources = [];
        if (buffer) {
            const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(filter); source.start(when); sources.push(source);
        } else {
            // Additive fallback: a fast attack, decaying harmonics and a longer fundamental.
            for (let harmonic = 1; harmonic <= 5; harmonic++) {
                const source = this.context.createOscillator(); source.type = 'sine'; source.frequency.value = frequency(note) * harmonic;
                const harmonicGain = this.context.createGain(); harmonicGain.gain.setValueAtTime(.45 / harmonic ** 2, when);
                harmonicGain.gain.exponentialRampToValueAtTime(.0001, when + (harmonic === 1 ? 3.5 : 1.5) * (60 / Math.max(note, 30)));
                source.connect(harmonicGain); harmonicGain.connect(filter); source.start(when); source.stop(when + 8); sources.push(source);
                source.addEventListener('ended', () => harmonicGain.disconnect(), { once: true });
            }
            if (!this.failed.has(note)) void this.load(note);
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
