import test from 'node:test';
import assert from 'node:assert/strict';
import { VOICES, FORMATS, durationMs, voiceFor, checkTimeline, unitAt, unitsOf } from '../static/english/voice.mjs';
import { workTextHash } from '../static/english/library.mjs';

const work = { id: 'demo', kind: 'speech', roles: undefined, segments: [{ id: 's1', text: 'One two three. Four five six.' }, { id: 's2', text: 'Seven eight nine.' }] };
const timeline = (over = {}) => ({ version: 1, id: 'demo', accent: 'en-US', textHash: workTextHash(work), segments: [
    { id: 's1', start: 0, end: 4000, units: [{ start: 0, end: 2000 }, { start: 2000, end: 4000 }] },
    { id: 's2', start: 4000, end: 6000, units: [{ start: 4000, end: 6000 }] }], ...over });

test('a byte count is a length for constant bit rate mp3', () => {
    assert.equal(durationMs(48000, 'audio-24khz-48kbitrate-mono-mp3'), 8000);
    assert.equal(durationMs(32000, 'audio-16khz-32kbitrate-mono-mp3'), 8000);
    assert.ok(Object.keys(FORMATS).length >= 2);
});

test('each accent has two voices, and the second role of a dialogue gets the second one', () => {
    for (const accent of ['en-US', 'en-GB']) assert.equal(new Set(VOICES[accent]).size, 2);
    const dialogue = { roles: ['Host', 'Guest'] };
    assert.equal(voiceFor(dialogue, { speaker: 'Host' }, 'en-GB'), VOICES['en-GB'][0]); assert.equal(voiceFor(dialogue, { speaker: 'Guest' }, 'en-GB'), VOICES['en-GB'][1]);
    assert.equal(voiceFor({}, { text: 'x' }, 'en-US'), VOICES['en-US'][0]);
});

test('a timeline is used only when it still fits the text it was rendered from', () => {
    assert.ok(checkTimeline(timeline(), work));
    assert.equal(unitsOf(work.segments[0], work.kind).length, 2);
    const changed = { ...work, segments: [{ id: 's1', text: 'One two three. Four five six!' }, work.segments[1]] };
    assert.equal(checkTimeline(timeline(), changed), null, 'the words changed');
    for (const bad of [{ version: 2 }, { id: 'other' }, { segments: [] }, { segments: timeline().segments.slice(0, 1) },
        { segments: [{ id: 's1', start: 0, end: 4000, units: [{ start: 0, end: 4000 }] }, timeline().segments[1]] },                      // one unit instead of two
        { segments: [timeline().segments[0], { id: 's2', start: 3000, end: 6000, units: [{ start: 3000, end: 6000 }] }] },                // overlaps the segment before
        { segments: [{ id: 's1', start: 0, end: 4000, units: [{ start: 0, end: 2500 }, { start: 2000, end: 4000 }] }, timeline().segments[1]] }]) {
        assert.equal(checkTimeline(timeline(bad), work), null, JSON.stringify(bad).slice(0, 70));
    }
    assert.equal(checkTimeline(null, work), null);
});

test('the unit playing at a moment', () => {
    const t = timeline();
    assert.deepEqual(unitAt(t, 0), [0, 0]); assert.deepEqual(unitAt(t, 1999), [0, 0]); assert.deepEqual(unitAt(t, 2000), [0, 1]); assert.deepEqual(unitAt(t, 5000), [1, 0]);
    assert.equal(unitAt(t, 6000), null); assert.equal(unitAt(t, -1), null);
});

import { buildSsml, renderWork } from '../tools/render-english-voices.mjs';

const FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const demo = { id: 'demo', kind: 'speech', roles: undefined, segments: [{ id: 's1', text: 'One two three. Four & five <six>.' }, { id: 's2', text: 'Seven eight nine.' }] };
const fakeAzure = (log, behave = () => 200) => async (url, options) => {
    log.push({ url, options });
    const status = behave(log.length);
    if (status !== 200) return new Response('no', { status });
    const text = /<prosody[^>]*>([^<]*)<\/prosody>/.exec(options.body)[1];
    return new Response(Buffer.alloc(text.length * 100));   // a stand-in for audio: 100 bytes a letter
};

test('SSML escapes the text, flattens poem lines and names the voice and accent', () => {
    const ssml = buildSsml({ text: 'Tom & "Jerry" <run>\nfast', voice: 'en-GB-SoniaNeural', accent: 'en-GB' });
    assert.match(ssml, /xml:lang="en-GB"/); assert.match(ssml, /<voice name="en-GB-SoniaNeural">/); assert.match(ssml, /Tom &amp; &quot;Jerry&quot; &lt;run&gt; fast/);
    assert.doesNotMatch(ssml, /<run>|\n/);
    assert.match(ssml, /<break time="350ms"\/>/);
});

test('a work is rendered unit by unit and the timeline fits the text and the audio', async () => {
    const log = [];
    const { mp3, timeline, requests, chars } = await renderWork({ work: demo, accent: 'en-US', key: 'secret', region: 'southeastasia', format: FORMAT, fetcher: fakeAzure(log) });
    assert.equal(requests, 3); assert.equal(log.length, 3); assert.equal(chars, 'One two three.'.length + 'Four & five <six>.'.length + 'Seven eight nine.'.length);
    assert.equal(log[0].url, 'https://southeastasia.tts.speech.microsoft.com/cognitiveservices/v1');
    assert.equal(log[0].options.headers['Ocp-Apim-Subscription-Key'], 'secret'); assert.equal(log[0].options.headers['X-Microsoft-OutputFormat'], FORMAT);
    assert.ok(checkTimeline(timeline, demo));
    const lastEnd = timeline.segments.at(-1).end;
    assert.equal(lastEnd, Math.round(mp3.length / 6000 * 1000), 'the timeline ends where the audio ends');
    assert.equal(timeline.segments[0].units[1].start, timeline.segments[0].units[0].end, 'units are back to back');
    assert.equal(timeline.textHash, workTextHash(demo));
    assert.doesNotMatch(JSON.stringify(timeline), /secret/);
});

test('rendering retries a busy service, but gives up at once on a refused key', async () => {
    const busyLog = [];
    const { requests } = await renderWork({ work: { ...demo, segments: [demo.segments[1]] }, accent: 'en-US', key: 'k', region: 'r', format: FORMAT, backoff: 1, fetcher: fakeAzure(busyLog, n => n < 3 ? 429 : 200) });
    assert.equal(requests, 1); assert.equal(busyLog.length, 3);
    const badLog = [];
    await assert.rejects(renderWork({ work: demo, accent: 'en-US', key: 'wrong', region: 'r', format: FORMAT, backoff: 1, fetcher: fakeAzure(badLog, () => 401) }), /HTTP 401/);
    assert.equal(badLog.length, 1);
});

test('dialogue roles get different voices', async () => {
    const log = [];
    const dialogue = { id: 'talk', kind: 'lesson', roles: ['Host', 'Guest'], segments: [{ id: 's1', speaker: 'Host', text: 'Welcome to the show.' }, { id: 's2', speaker: 'Guest', text: 'Thank you for having me.' }] };
    await renderWork({ work: dialogue, accent: 'en-GB', key: 'k', region: 'r', format: FORMAT, fetcher: fakeAzure(log) });
    assert.deepEqual(log.map(l => /voice name="([^"]+)"/.exec(l.options.body)[1]), VOICES['en-GB']);
});

import { playRange } from '../static/english/voiceplayer.mjs';

// A stand-in for an <audio> element that plays in real time at a chosen speed.
function fakeAudio({ length = 10, ready = 1 } = {}) {
    const listeners = {}; let started = null, at = 0, playing = false;
    const audio = {
        src: '', readyState: ready, playbackRate: 1, paused: true, pauses: 0,
        get currentTime() { return playing ? at + (Date.now() - started) / 1000 * audio.playbackRate : at; },
        set currentTime(v) { at = v; started = Date.now(); },
        addEventListener(name, fn) { (listeners[name] ??= new Set()).add(fn); }, removeEventListener(name, fn) { listeners[name]?.delete(fn); },
        play() { playing = true; started = Date.now(); audio.paused = false; return Promise.resolve(); },
        pause() { if (playing) { at = audio.currentTime; playing = false; } audio.paused = true; audio.pauses++; },
        load() { setTimeout(() => { audio.readyState = 1; [...(listeners.loadedmetadata ?? [])].forEach(f => f()); }, 5); },
        emit(name) { [...(listeners[name] ?? [])].forEach(f => f()); },
    };
    return audio;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

test('a stretch of the voice plays from its start, reports the time, and stops at its end', async () => {
    const audio = fakeAudio(), times = [];
    const info = await new Promise(resolve => playRange(audio, { src: 'https://x.test/voice/en-US/demo.mp3' }, 2000, 2300, { rate: 1, onTime: ms => times.push(Math.round(ms)), onEnd: resolve }));
    assert.deepEqual(info, {}); assert.ok(times.length >= 1 && times[0] >= 2000); assert.ok(audio.paused); assert.equal(audio.src, 'https://x.test/voice/en-US/demo.mp3');
});

test('stopping ends it once, the speed is applied, and a file that is not loaded yet is waited for', async () => {
    const audio = fakeAudio({ ready: 0 });
    const ends = [];
    const stop = playRange(audio, { src: 'https://x.test/a.mp3' }, 0, 5000, { rate: 1.1, onEnd: info => ends.push(info) });
    assert.equal(audio.paused, true, 'not started until the length is known');
    await wait(60); assert.equal(audio.paused, false); assert.equal(audio.playbackRate, 1.1);
    stop(); stop(); assert.deepEqual(ends, [{ stopped: true }]); assert.ok(audio.paused);
});

test('an audio error ends the play with an error, and a refused play does too', async () => {
    const a = fakeAudio(), got = [];
    playRange(a, { src: 'https://x.test/a.mp3' }, 0, 5000, { onEnd: info => got.push(info) }); await wait(20); a.emit('error');
    assert.deepEqual(got, [{ error: 'audio' }]);
    const b = fakeAudio(); b.play = () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    const info = await new Promise(resolve => playRange(b, { src: 'https://x.test/b.mp3' }, 0, 5000, { onEnd: resolve }));
    assert.deepEqual(info, { error: 'NotAllowedError' });
});

test('a file that ends early is an error, a normal end is not, and changing the source ends the stretch', async () => {
    const short = fakeAudio(); const got = [];
    playRange(short, { src: 'https://x.test/a.mp3' }, 0, 10000, { onEnd: info => got.push(info) }); await wait(30);
    short.emit('ended');   // only a fraction of a second has played of the ten seconds asked for
    assert.deepEqual(got, [{ error: 'short' }]);
    const whole = fakeAudio(), done = [];
    playRange(whole, { src: 'https://x.test/b.mp3' }, 0, 100, { onEnd: info => done.push(info) }); await wait(250);
    assert.deepEqual(done, [{}]);
    const switched = fakeAudio(), ended = [];
    playRange(switched, { src: 'https://x.test/c.mp3' }, 0, 60000, { onEnd: info => ended.push(info) }); await wait(30);
    switched.emit('emptied');   // another accent was loaded into the same element
    assert.deepEqual(ended, [{ stopped: true }]); assert.ok(switched.paused);
});

test('the same file is recognised by its whole address, not its name', async () => {
    const audio = fakeAudio(); audio.src = 'https://x.test/voice/en-GB/demo.mp3?v=1';
    playRange(audio, { src: 'https://x.test/voice/en-US/demo.mp3?v=1' }, 0, 100, {});
    assert.equal(audio.src, 'https://x.test/voice/en-US/demo.mp3?v=1');
});

import { parseEnvFile } from '../tools/render-english-voices.mjs';

test('the key file is plain KEY=value lines, with comments, blanks and quotes handled', () => {
    const parsed = parseEnvFile('# comment\n\nAZURE_SPEECH_KEY = "abc123"\nAZURE_SPEECH_REGION=southeastasia\n  # AZURE_SPEECH_KEY=old\nBAD LINE\nOTHER=\'x y\'\r\n');
    assert.deepEqual(parsed, { AZURE_SPEECH_KEY: 'abc123', AZURE_SPEECH_REGION: 'southeastasia', OTHER: 'x y' });
    assert.deepEqual(parseEnvFile('AZURE_SPEECH_KEY=\n'), { AZURE_SPEECH_KEY: '' });
    assert.deepEqual(parseEnvFile(''), {});
});

import { readFile as readText, readdir as listDir } from 'node:fs/promises';

// Whatever has been rendered must still fit the library: audio for words that have since changed is found here, not by a listener.
test('every pre-rendered voice in the repository fits the text it was made from', async () => {
    const dir = new URL('../static/english/voice/', import.meta.url);
    let index;
    try { index = JSON.parse(await readText(new URL('index.json', dir), 'utf8')); } catch { return; }   // nothing rendered
    assert.equal(index.version, 1); assert.ok(FORMATS[index.format]);
    let checked = 0;
    for (const [id, accents] of Object.entries(index.works)) {
        const work = JSON.parse(await readText(new URL(`../static/english/library/${id}.json`, import.meta.url), 'utf8'));
        for (const [accent, entry] of Object.entries(accents)) {
            const timeline = JSON.parse(await readText(new URL(`${accent}/${id}.json`, dir), 'utf8'));
            const mp3 = await readText(new URL(`${accent}/${id}.mp3`, dir));
            assert.ok(checkTimeline(timeline, work), `${accent}/${id}: the text changed since it was rendered; render it again`);
            assert.equal(timeline.accent, accent); assert.equal(entry.bytes, mp3.length); assert.ok(entry.rev);
            assert.equal(timeline.segments.at(-1).end, durationMs(mp3.length, index.format), `${accent}/${id}: the timeline does not end where the audio ends`);
            assert.ok(mp3.subarray(0, 3).toString('latin1') === 'ID3' || mp3[0] === 0xff, `${accent}/${id}: not an mp3`);
            checked += 1;
        }
    }
    const files = (await listDir(new URL('en-US/', dir))).filter(n => n.endsWith('.mp3')).length;
    assert.ok(checked >= 1 && files >= 1);
});
