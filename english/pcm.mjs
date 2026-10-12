// Recording straight into numbers. Decoding what MediaRecorder produced (decodeAudioData) fails on some Apple devices ("Decoding failed",
// typically from the second take on), so the page also takes the microphone's samples directly from the Web Audio graph and turns them
// into the 16 kHz mono sound that scoring needs without any decoding. The MediaRecorder file is only a fallback.

// The input as `toRate` samples a second, by averaging the input samples that fall into each output sample (a box filter, which also
// keeps frequencies above the new Nyquist limit from folding back). Returns a new Float32Array.
export function resampleMono(input, fromRate, toRate = 16000) {
    if (!(fromRate > 0) || !(toRate > 0)) throw new Error('sample rates must be positive');
    if (fromRate === toRate) return Float32Array.from(input);
    const ratio = fromRate / toRate;
    const length = Math.floor(input.length / ratio);
    const out = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        const start = i * ratio, end = Math.min(input.length, (i + 1) * ratio);
        let sum = 0, weight = 0;
        for (let j = Math.floor(start); j < Math.ceil(end); j++) {
            const w = Math.min(j + 1, end) - Math.max(j, start);
            sum += input[j] * w; weight += w;
        }
        out[i] = weight > 0 ? sum / weight : 0;
    }
    return out;
}

// Starts taking samples from `stream` through `context` (an AudioContext that is running). Returns null when the browser has no way to do
// it; otherwise { stop() } where stop() ends the capture and returns { samples: Float32Array, rate } (the context's sample rate).
export function startPcmCapture(stream, context) {
    if (!context || typeof context.createMediaStreamSource !== 'function' || typeof context.createScriptProcessor !== 'function') return null;
    let source, node;
    try {
        source = context.createMediaStreamSource(stream);
        node = context.createScriptProcessor(4096, 1, 1);
    } catch { return null; }
    const chunks = [];
    let total = 0;
    node.onaudioprocess = (event) => {
        const data = event.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(data)); total += data.length;      // copied: the browser reuses the buffer it hands over
    };
    source.connect(node);
    node.connect(context.destination);                                  // some browsers only run a processor that leads to the output; it writes silence
    let stopped = false;
    return {
        stop() {
            if (!stopped) { stopped = true; node.onaudioprocess = null; try { source.disconnect(); node.disconnect(); } catch { /* already disconnected */ } }
            const samples = new Float32Array(total);
            let at = 0;
            for (const chunk of chunks) { samples.set(chunk, at); at += chunk.length; }
            return { samples, rate: context.sampleRate };
        },
    };
}
