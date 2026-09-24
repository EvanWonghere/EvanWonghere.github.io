// Runs only inside the Strudel sandbox iframe (opaque origin, see strudel-sandbox.mjs). It is
// injected as text after the unmodified @strudel/web bundle and is never loaded by the page itself.
// Messages in: sounds, online, play, stop. Messages out: ready, sounds-ready, online-ready,
// playing, stopped, hap, log, error.
(() => {
    const post = message => parent.postMessage(message, '*');
    const text = value => String(value && value.message || value).slice(0, 500);
    let playId = null;
    document.addEventListener('strudel.log', event => {
        const message = String(event.detail && event.detail.message || '');
        if (/error|not found|failed|warn/i.test(message)) post({ type: 'log', message: message.slice(0, 300) });
    });
    const ready = strudel.initStrudel({
        onEvalError: error => post({ type: 'error', id: playId, message: text(error) }),
        // Every scheduled event is reported with its cycle position and how far ahead it will sound.
        defaultOutput: (hap, deadline, duration, cps, t) => {
            const value = hap.value || {};
            post({
                type: 'hap', id: playId,
                cycle: hap.whole ? hap.whole.begin.valueOf() : null,
                length: hap.whole ? hap.whole.end.valueOf() - hap.whole.begin.valueOf() : 0,
                note: typeof value.note === 'string' || typeof value.note === 'number' ? value.note : null,
                n: typeof value.n === 'number' ? value.n : null,
                s: typeof value.s === 'string' ? value.s : null,
                delay: t - strudel.getAudioContext().currentTime
            });
            return strudel.webaudioOutput(hap, deadline, duration, cps, t);
        }
    });
    const blobUrl = (buffer, type) => URL.createObjectURL(new Blob([buffer], { type }));
    async function registerSounds({ piano = {}, drums = {} }) {
        const pianoMap = {};
        for (const [name, buffer] of Object.entries(piano)) pianoMap[name] = blobUrl(buffer, 'audio/mpeg');
        const bank = {};
        for (const [name, buffer] of Object.entries(drums)) {
            const url = blobUrl(buffer, 'audio/wav');
            // Plain names and the TR-909 bank names used by the examples both map to the site's drums.
            bank[name] = [url]; bank[`RolandTR909_${name}`] = [url];
        }
        await strudel.samples({ piano: pianoMap, ...bank });
    }
    addEventListener('message', async event => {
        if (event.source !== parent) return;
        const message = event.data || {};
        try {
            if (message.type === 'sounds') { await ready; await registerSounds(message); post({ type: 'sounds-ready' }); }
            if (message.type === 'online') {
                await ready;
                await strudel.samples('github:tidalcycles/dirt-samples');
                await strudel.samples('https://raw.githubusercontent.com/felixroos/dough-samples/main/tidal-drum-machines.json', 'github:ritchse/tidal-drum-machines/main/machines/');
                post({ type: 'online-ready' });
            }
            if (message.type === 'play') {
                await ready; await strudel.getAudioContext().resume();
                playId = message.id;
                await strudel.evaluate(String(message.code));
                post({ type: 'playing', id: message.id });
            }
            if (message.type === 'stop') { strudel.hush(); playId = null; post({ type: 'stopped' }); }
        } catch (error) { post({ type: 'error', id: message.id ?? null, message: text(error) }); }
    });
    ready.then(() => post({ type: 'ready' }), error => post({ type: 'error', id: null, message: text(error) }));
})();
