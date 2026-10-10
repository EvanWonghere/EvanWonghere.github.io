// Plays stretches of a pre-rendered voice file. Browser side of voice.mjs.
import { checkTimeline } from './voice.mjs';

let indexRequest;
async function fetchJSON(url) {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}
// base: the URL the voice folder sits next to (import.meta.url of the caller). Resolves to null when nothing was rendered.
// The track has `slow` too when a slow reading was rendered for this work and fits its text: { src, timeline } or null.
export async function loadTrack(work, accent, base) {
    indexRequest ??= fetchJSON(new URL('voice/index.json', base)).catch(() => null);
    const entry = (await indexRequest)?.works?.[work.id]?.[accent];
    if (!entry) return null;
    const open = async (name, version) => {
        const timeline = checkTimeline(await fetchJSON(new URL(`voice/${accent}/${name}.json?v=${version}`, base)), work);
        return timeline ? { src: new URL(`voice/${accent}/${name}.mp3?v=${version}`, base).href, timeline } : null;
    };
    try {
        const main = await open(work.id, entry.rev ?? entry.bytes);
        if (!main) return null;
        // A slow track that is missing or broken only loses the slow reading, never the normal one.
        const slow = entry.slow ? await open(`${work.id}.slow`, entry.slow.rev ?? entry.slow.bytes).catch(() => null) : null;
        return { ...main, slow };
    } catch { return null; }
}

// Plays [startMs, endMs) of a track. onTime(ms) fires while playing; onEnd({stopped, error}) fires once. Returns stop().
// play() runs at once, inside the caller's click, because phones only allow sound that starts that way.
export function playRange(audio, track, startMs, endMs, { rate = 1, onTime, onEnd } = {}) {
    let over = false, timer = 0;
    const finish = info => {
        if (over) return; over = true; clearTimeout(timer);
        audio.removeEventListener('ended', ended); audio.removeEventListener('error', failed); audio.removeEventListener('loadedmetadata', begin); audio.removeEventListener('timeupdate', check);
        audio.removeEventListener('emptied', dropped); audio.removeEventListener('abort', dropped);
        audio.pause(); onEnd?.(info);
    };
    // The file ending well before the stretch should means it was cut short, which must not pass for a normal end.
    const ended = () => finish(audio.currentTime * 1000 < endMs - 500 ? { error: 'short' } : {});
    // Someone changed the source under us (another accent, another work): this stretch is over.
    const dropped = () => finish({ stopped: true });
    const failed = () => finish({ error: 'audio' });
    // A timer and the media's own timeupdate event: requestAnimationFrame stops in a hidden tab, and the stretch must still end there.
    const check = () => {
        if (over) return;
        const ms = audio.currentTime * 1000;
        onTime?.(ms);
        if (ms >= endMs - 15) finish({});
    };
    const tick = () => { check(); if (!over) timer = setTimeout(tick, 40); };
    function begin() {
        audio.removeEventListener('loadedmetadata', begin);
        try { audio.currentTime = startMs / 1000; } catch { /* some browsers refuse until they know the length */ }
        audio.playbackRate = rate;
        audio.play().then(() => { audio.addEventListener('timeupdate', check); audio.addEventListener('emptied', dropped); audio.addEventListener('abort', dropped); tick(); }, error => finish({ error: error?.name ?? 'audio' }));
    }
    audio.addEventListener('ended', ended); audio.addEventListener('error', failed);
    if (audio.src !== track.src) audio.src = track.src;
    if (audio.readyState >= 1) begin(); else { audio.addEventListener('loadedmetadata', begin); audio.load?.(); }
    return () => finish({ stopped: true });
}
