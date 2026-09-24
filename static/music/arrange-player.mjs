// Playback for the arrangement desk: one Web Audio clock drives notes, drums and the views.
// Pitched tracks use the room's current piano samples; drums are short synthesized hits.

/** Notes to play for a region, with mute/solo, track volume and swing applied. Beats are region-relative. */
export function playbackNotes(real, doc, { from = 0, to = real.totalBeats } = {}) {
    const soloing = doc.tracks.some(t => t.solo);
    const audible = new Map(doc.tracks.filter(t => !t.mute && (!soloing || t.solo)).map(t => [t.id, t.volume]));
    const swing = doc.meta.swing ?? 0.5;
    return real.events
        .filter(e => audible.has(e.trackId) && e.start >= from - 1e-6 && e.start < to - 1e-6)
        .map(e => {
            // Swing moves off-beat eighths later; the notated (straight) position is kept for highlighting.
            const frac = e.start - Math.floor(e.start + 1e-9);
            const start = Math.abs(frac - 0.5) < 1e-6 ? Math.floor(e.start + 1e-9) + swing : e.start;
            return { id: e.id, trackId: e.trackId, start: start - from, beats: Math.min(e.beats, to - e.start), pitch: e.pitch, drum: e.drum, vel: Math.max(1, Math.round(e.vel * audible.get(e.trackId))) };
        })
        .sort((a, b) => a.start - b.start);
}

export class ArrangePlayer {
    constructor(audio) { this.audio = audio; this.generation = 0; this.ids = new Set(); this.timer = null; this.running = false; this.noise = null; }
    stop() {
        this.generation++; clearInterval(this.timer); this.timer = null; this.running = false;
        for (const id of this.ids) this.audio.release(id, this.audio.context?.currentTime, true);
        this.ids.clear();
    }
    /** notes from playbackNotes; length in beats; loop repeats the region until stopped. */
    async play(notes, { tempo, length, loop = false, onTime = () => {}, onEnd = () => {} }) {
        this.stop(); const generation = this.generation; await this.audio.init();
        const pitches = [...new Set(notes.filter(n => !n.drum).map(n => n.pitch))];
        for (let i = 0; i < pitches.length; i += 8) { if (generation !== this.generation) return; await Promise.all(pitches.slice(i, i + 8).map(n => this.audio.load(n))); }
        if (generation !== this.generation) return;
        Object.assign(this, { notes, length, loop, onTime, onEnd, spb: 60 / tempo, origin: this.audio.context.currentTime + 0.12, index: 0, iteration: 0, scheduled: -1, running: true });
        this.timer = setInterval(() => this.tick(generation), 25); this.tick(generation);
    }
    /** Swaps in edited notes without restarting; the playhead keeps its position. */
    update(notes, { tempo, length, loop = this.loop }) {
        if (!this.running) return;
        const now = this.audio.context.currentTime, beat = Math.max(0, (now - this.origin) / this.spb);
        this.spb = 60 / tempo; this.origin = now - beat * this.spb; this.notes = notes; this.length = length; this.loop = loop;
        this.iteration = Math.floor(Math.max(this.scheduled, beat) / length); this.index = notes.findIndex(n => this.iteration * length + n.start > this.scheduled + 1e-6);
        if (this.index < 0) { this.index = 0; this.iteration++; }
    }
    tick(generation) {
        if (generation !== this.generation || !this.running) return;
        const ctx = this.audio.context, now = ctx.currentTime, horizon = now + 0.15;
        for (const id of this.ids) if (!this.audio.voices.has(id)) this.ids.delete(id);
        let guard = 0;
        while (guard++ < 2000) {
            if (this.index >= this.notes.length) { if (!this.loop || !this.notes.length) break; this.index = 0; this.iteration++; }
            const n = this.notes[this.index], absolute = this.iteration * this.length + n.start, when = this.origin + absolute * this.spb;
            if (when > horizon) break;
            if (when >= now - 0.05) this.sound(n, when);
            this.scheduled = absolute; this.index++;
        }
        const beat = (now - this.origin) / this.spb;
        if (beat >= 0) this.onTime(this.loop ? beat % this.length : Math.min(beat, this.length));
        if (!this.loop && beat >= this.length + 0.05) { this.stop(); this.onEnd(); }
    }
    sound(n, when) {
        const duration = Math.max(0.05, n.beats * this.spb * 0.95);
        if (n.drum) return this.drum(n.drum, when, n.vel / 127);
        const id = this.audio.noteOn(n.pitch, n.vel, when);
        if (id) { this.ids.add(id); this.audio.release(id, when + duration, true); }
    }
    drum(kind, when, level) {
        const ctx = this.audio.context, out = ctx.createGain(); out.connect(this.audio.master);
        const end = when + (kind === 'kick' ? 0.35 : kind === 'snare' ? 0.2 : 0.06);
        out.gain.setValueAtTime(level * (kind === 'hat' ? 0.25 : 0.8), when); out.gain.exponentialRampToValueAtTime(0.001, end);
        if (kind === 'kick') {
            const osc = ctx.createOscillator(); osc.frequency.setValueAtTime(140, when); osc.frequency.exponentialRampToValueAtTime(45, when + 0.12);
            osc.connect(out); osc.start(when); osc.stop(end); osc.onended = () => { osc.disconnect(); out.disconnect(); };
            return;
        }
        if (!this.noise) { const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate), data = buffer.getChannelData(0); let seed = 7; for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = seed / 1073741823 - 1; } this.noise = buffer; }
        const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter();
        source.buffer = this.noise; filter.type = 'highpass'; filter.frequency.value = kind === 'hat' ? 7000 : 1200;
        source.connect(filter); filter.connect(out); source.start(when); source.stop(end);
        source.onended = () => { source.disconnect(); filter.disconnect(); out.disconnect(); };
    }
}
