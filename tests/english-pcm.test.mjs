import test from 'node:test';
import assert from 'node:assert/strict';
import { resampleMono, startPcmCapture } from '../static/english/pcm.mjs';
import { encodeWav } from '../static/english/core.mjs';

const sine = (hz, rate, seconds, amplitude = 0.5) => Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) => amplitude * Math.sin(2 * Math.PI * hz * i / rate));
// The strongest frequency of a signal (a plain DFT over a few candidates is enough here).
const dominant = (samples, rate, candidates) => candidates.map(hz => {
    let re = 0, im = 0;
    for (let i = 0; i < samples.length; i++) { const angle = 2 * Math.PI * hz * i / rate; re += samples[i] * Math.cos(angle); im += samples[i] * Math.sin(angle); }
    return { hz, power: Math.hypot(re, im) / samples.length };
}).sort((a, b) => b.power - a.power)[0].hz;

test('48 kHz and 44.1 kHz recordings become 16 kHz of the right length and keep their pitch', () => {
    for (const rate of [48000, 44100, 32000, 22050, 16000, 8000]) {
        const out = resampleMono(sine(440, rate, 1), rate, 16000);
        assert.ok(Math.abs(out.length - 16000) <= 1, `${rate}: ${out.length} samples`);
        assert.equal(dominant(out.subarray(0, 4000), 16000, [220, 440, 880]), 440, String(rate));
        const peak = Math.max(...out.subarray(100, 8000).map(Math.abs));
        assert.ok(peak > 0.35 && peak <= 0.52, `${rate}: peak ${peak}`);   // the level is kept
    }
});

test('a tone above the new limit is mostly removed rather than folded back', () => {
    // 12 kHz at 48 kHz would fold to 4 kHz at 16 kHz if nothing filtered it
    const out = resampleMono(sine(12000, 48000, 0.5), 48000, 16000);
    const peak = Math.max(...out.subarray(50).map(Math.abs));
    assert.ok(peak < 0.25, `peak ${peak}`);
});

test('resampling edge cases: same rate copies, empty stays empty, bad rates are refused, the input is not changed', () => {
    const input = Float32Array.from([0.1, -0.2, 0.3]);
    const same = resampleMono(input, 16000, 16000); assert.deepEqual([...same], [...input]); assert.notEqual(same, input);
    assert.equal(resampleMono(new Float32Array(), 48000, 16000).length, 0);
    assert.equal(resampleMono(Float32Array.from([1, 1, 1]), 48000, 16000).length, 1);
    assert.deepEqual([...input], [0.1, -0.2, 0.3].map(Math.fround));
    assert.throws(() => resampleMono(input, 0, 16000)); assert.throws(() => resampleMono(input, 48000, -1));
});

test('the resampled sound is a valid WAV for scoring', () => {
    const wav = encodeWav(resampleMono(sine(300, 44100, 2), 44100, 16000));
    const view = new DataView(wav);
    assert.equal(String.fromCharCode(...new Uint8Array(wav, 0, 4)), 'RIFF'); assert.equal(view.getUint32(24, true), 16000);
    assert.ok(Math.abs(view.getUint32(40, true) / 2 - 32000) <= 2);
});

// A stand-in for the Web Audio graph: the processor is told to deliver blocks, and shares its buffer between blocks like a browser does.
function fakeContext({ rate = 48000, withProcessor = true } = {}) {
    const log = [];
    const node = { onaudioprocess: null, connect: target => log.push(['node.connect', target]), disconnect: () => log.push(['node.disconnect']) };
    const source = { connect: target => log.push(['source.connect', target === node ? 'node' : 'other']), disconnect: () => log.push(['source.disconnect']) };
    const context = { sampleRate: rate, destination: { name: 'out' }, createMediaStreamSource: stream => { log.push(['source', stream]); return source; } };
    if (withProcessor) context.createScriptProcessor = (size, inputs, outputs) => { log.push(['processor', size, inputs, outputs]); return node; };
    return { context, node, log };
}

test('samples are collected block by block, copied, and handed over with the rate when the capture stops', () => {
    const { context, node, log } = fakeContext({ rate: 44100 });
    const capture = startPcmCapture({ id: 'stream' }, context);
    assert.deepEqual(log.find(entry => entry[0] === 'processor'), ['processor', 4096, 1, 1]);
    const shared = new Float32Array(4); const deliver = values => { shared.set(values); node.onaudioprocess({ inputBuffer: { getChannelData: () => shared } }); };
    deliver([1, 2, 3, 4]); deliver([5, 6, 7, 8]);
    const { samples, rate } = capture.stop();
    assert.deepEqual([...samples], [1, 2, 3, 4, 5, 6, 7, 8], 'the first block is not overwritten by the second'); assert.equal(rate, 44100);
    assert.equal(node.onaudioprocess, null);
    assert.ok(log.some(entry => entry[0] === 'node.connect' && entry[1].name === 'out'), 'the processor leads to the output');
    assert.ok(log.some(entry => entry[0] === 'source.disconnect') && log.some(entry => entry[0] === 'node.disconnect'));
    assert.deepEqual([...capture.stop().samples], [1, 2, 3, 4, 5, 6, 7, 8], 'stopping twice is harmless');
});

test('capture is not offered where the browser cannot do it', () => {
    assert.equal(startPcmCapture({}, null), null);
    assert.equal(startPcmCapture({}, fakeContext({ withProcessor: false }).context), null);
    const throwing = { sampleRate: 48000, destination: {}, createMediaStreamSource() { throw new Error('no'); }, createScriptProcessor() { return {}; } };
    assert.equal(startPcmCapture({}, throwing), null);
    // a stream that records nothing gives an empty result, not an error
    const { context } = fakeContext(); const empty = startPcmCapture({}, context).stop();
    assert.equal(empty.samples.length, 0);
});
