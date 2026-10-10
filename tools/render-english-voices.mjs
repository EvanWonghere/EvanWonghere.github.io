#!/usr/bin/env node
// Renders the model voice of the reading library with Azure text to speech, into static/english/voice/.
//   AZURE_SPEECH_KEY=<key> node tools/render-english-voices.mjs --dry-run            count what would be sent and how big it gets
//   AZURE_SPEECH_KEY=<key> node tools/render-english-voices.mjs --accents en-US      render one accent
//   options: --accents en-US,en-GB  --only id,id  --format <azure mp3 format>  --delay <ms between requests>  --force  --rest  --sdk <folder>
// The key is read from the environment, or from a private file in your home folder (never inside the repository):
//   node tools/render-english-voices.mjs --init-key     creates ~/.config/hive-english/azure.env for you to fill in
//   node tools/render-english-voices.mjs --check        sends one short word to prove the key works
// It is never printed, logged or written anywhere else.
// Every sentence (or poem clause) is synthesized on its own and joined, so the timeline is exact. The free tier allows
// about 20 requests a minute, hence the default delay; it renders in the background of your own time and can be stopped and resumed.
// Word times: the Speech SDK reports where each word starts while it synthesizes, so the timeline (version 2) lists every word
// of every unit. The SDK is a tool-only dependency kept outside the repository:
//   npm install --prefix ~/.cache/hive-english/sdk microsoft-cognitiveservices-speech-sdk@1.52.0   (a package.json must exist there)
// --sdk <folder> or HIVE_SPEECH_SDK points elsewhere. --rest uses plain HTTPS instead and writes unit times only (version 1).
import { readFile, writeFile, mkdir, access, stat, chmod } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { workTextHash, tokenize } from '../static/english/library.mjs';
import { VOICES, FORMATS, PAUSE_MS, unitsOf, voiceFor } from '../static/english/voice.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
// Quote marks need no escaping in element text, and Azure reports the position of a word after &quot; wrongly (-1), so they stay as they are.
const escapeXml = text => text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const flat = text => text.replace(/\s*\n\s*/g, ' ').trim();

export function buildSsml({ text, voice, accent }) {
    // A little slower than the default, and a short silence after the unit so listeners can follow along.
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${accent}"><voice name="${voice}"><prosody rate="-8%">${escapeXml(flat(text))}</prosody><break time="${PAUSE_MS}ms"/></voice></speak>`;
}

async function synthesize({ ssml, key, region, format, fetcher, attempts = 6, backoff = 2000 }) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
        let response;
        try {
            response = await fetcher(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
                method: 'POST', body: ssml, signal: AbortSignal.timeout(60000),
                headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': format, 'User-Agent': 'hive-english-voices/1.0' },
            });
        } catch (error) { if (attempt === attempts) throw new Error(`network error: ${error.cause?.code ?? error.message}`); }
        if (response?.ok) return Buffer.from(await response.arrayBuffer());
        if (response && ![429, 500, 502, 503, 504].includes(response.status)) throw new Error(`Azure answered HTTP ${response.status}`);   // a bad key or bad request will not get better
        if (attempt === attempts) throw new Error(`Azure kept answering HTTP ${response?.status ?? 'nothing'}`);
        await new Promise(r => setTimeout(r, Math.min(30000, backoff * 2 ** (attempt - 1))));
    }
}

// Where each word of `text` starts and ends, in ms from the start of the audio, from the SDK's boundary events.
// `boundaries`: [{kind: 'word' | 'other', startMs, durationMs, textOffset, length}], where textOffset points into the SSML.
// Azure sometimes reports two words as one event ("in 1864", "” bit"); that event's time is shared by the words in it,
// by letters. A word with no event at all is an error: the timeline must never carry a guess for a missing word.
// One known fault is repaired: the British voices report the last word of a unit with no length and a start that can lie
// before the word ahead of it. Such a last word is placed from the end of the word before it to `endMs`, where the speech
// stops (the unit's audio less the silence after it). Anywhere else a zero-length word is an error.
export function wordTimes({ text, ssml, boundaries, endMs }) {
    const flatText = flat(text), escaped = escapeXml(flatText), base = ssml.indexOf(escaped);
    if (base < 0) throw new Error('the SSML does not contain the unit text');
    const original = [];   // original[i]: which character of the plain text the i-th character of the escaped text came from
    for (let i = 0; i < flatText.length; i++) for (let k = escapeXml(flatText[i]).length; k > 0; k--) original.push(i);
    const heard = boundaries.filter(b => b.kind === 'word').map(b => ({ ...b }));
    heard.forEach((b, i) => {
        if (!(b.durationMs <= 0 || (i > 0 && b.startMs < heard[i - 1].startMs))) return;
        if (i !== heard.length - 1 || i === 0 || !(endMs > heard[i - 1].startMs + heard[i - 1].durationMs)) throw new Error(`Azure gave a bad time for the word at ${b.textOffset}`);
        b.startMs = heard[i - 1].startMs + heard[i - 1].durationMs; b.durationMs = endMs - b.startMs;
    });
    const spans = heard.map(b => {
        const from = b.textOffset - base, to = from + b.length;
        if (!(from >= 0 && to <= original.length && b.length > 0)) return null;
        return { a: original[from], b: original[to - 1] + 1, start: b.startMs, end: b.startMs + b.durationMs };
    }).filter(Boolean);
    return tokenize(flatText).filter(t => t.word).map(token => {
        const from = token.start, to = token.start + token.text.length, parts = [];
        for (const span of spans) {
            const a = Math.max(from, span.a), b = Math.min(to, span.b);
            if (a >= b) continue;
            const length = span.b - span.a;
            parts.push([span.start + (span.end - span.start) * (a - span.a) / length, span.start + (span.end - span.start) * (b - span.a) / length]);
        }
        if (!parts.length) throw new Error(`Azure gave no time for the word "${token.text}"`);
        return [Math.min(...parts.map(p => p[0])), Math.max(...parts.map(p => p[1]))];
    });
}

const SDK_FOLDER = process.env.HIVE_SPEECH_SDK || path.join(os.homedir(), '.cache', 'hive-english', 'sdk');
const SDK_FORMATS = { 'audio-24khz-48kbitrate-mono-mp3': 'Audio24Khz48KBitRateMonoMp3', 'audio-16khz-32kbitrate-mono-mp3': 'Audio16Khz32KBitRateMonoMp3' };
// Synthesizes with the Speech SDK: audio and word boundaries together. Errors carry only the SDK's error name, never its details (they can hold the key).
export function sdkSynthesizer({ key, region, format, folder = SDK_FOLDER, attempts = 6, backoff = 2000 }) {
    let sdk;
    try { sdk = createRequire(path.join(folder, '/'))('microsoft-cognitiveservices-speech-sdk'); }
    catch { throw new Error(`The Speech SDK is not installed in ${folder}. Run: npm install --prefix "${folder}" microsoft-cognitiveservices-speech-sdk@1.52.0 (create a package.json there first), or use --rest for unit times only.`); }
    const final = new Set(['AuthenticationFailure', 'BadRequestParameters', 'Forbidden']);   // a bad key or request will not get better
    const once = ssml => new Promise((resolve, reject) => {
        const config = sdk.SpeechConfig.fromSubscription(key, region);
        config.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat[SDK_FORMATS[format]];
        const synthesizer = new sdk.SpeechSynthesizer(config, null);
        const boundaries = [];
        synthesizer.wordBoundary = (_sender, e) => boundaries.push({ kind: e.boundaryType === 'WordBoundary' || e.boundaryType === 0 ? 'word' : 'other', startMs: e.audioOffset / 10000, durationMs: e.duration / 10000, textOffset: e.textOffset, length: e.wordLength });
        const fail = name => { synthesizer.close(); reject(Object.assign(new Error(`Azure speech failed: ${name}`), { final: final.has(name) })); };
        synthesizer.speakSsmlAsync(ssml, result => {
            if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) { fail(sdk.CancellationErrorCode[sdk.CancellationDetails.fromResult(result).ErrorCode] ?? 'Unknown'); return; }
            const audio = Buffer.from(result.audioData);
            synthesizer.close(); resolve({ audio, boundaries });
        }, () => fail('Error'));
    });
    return async ({ ssml }) => {
        for (let attempt = 1; ; attempt++) {
            try { return await once(ssml); }
            catch (error) {
                if (error.final || attempt === attempts) throw error;
                await new Promise(r => setTimeout(r, Math.min(30000, backoff * 2 ** (attempt - 1))));
            }
        }
    };
}

// One work in one accent: the joined mp3 and its timeline. `pause(ms)` is awaited between requests.
export async function renderWork({ work, accent, key, region, format = DEFAULT_FORMAT, fetcher = fetch, synth, pause = async () => {}, onProgress = () => {}, backoff }) {
    const bytesPerSecond = FORMATS[format];
    const parts = [], segments = [];
    let total = 0, chars = 0, requests = 0;
    const at = bytes => Math.round(bytes / bytesPerSecond * 1000);
    // synth({ssml}) gives {audio, boundaries}; without it plain HTTPS gives audio only, so no word times.
    const speak = synth ?? (async ({ ssml }) => ({ audio: await synthesize({ ssml, key, region, format, fetcher, backoff }), boundaries: null }));
    let timed = true;
    for (const segment of work.segments) {
        const voice = voiceFor(work, segment, accent), start = total, units = [];
        for (const unit of unitsOf(segment, work.kind)) {
            await pause();
            const ssml = buildSsml({ text: unit, voice, accent });
            const { audio, boundaries } = await speak({ ssml });
            const from = at(total), to = at(total + audio.length), entry = { start: from, end: to };
            if (boundaries) entry.words = wordTimes({ text: unit, ssml, boundaries, endMs: at(audio.length) - PAUSE_MS }).map(([a, b]) => [from + Math.round(a), Math.min(to, from + Math.round(b))]);
            else timed = false;
            units.push(entry);
            parts.push(audio); total += audio.length; chars += flat(unit).length; requests += 1;
            onProgress(requests);
        }
        segments.push({ id: segment.id, start: at(start), end: at(total), units });
    }
    const timeline = { version: timed ? 2 : 1, id: work.id, accent, voices: VOICES[accent], format, textHash: workTextHash(work), seconds: Math.round(total / bytesPerSecond * 10) / 10, segments };
    return { mp3: Buffer.concat(parts), timeline, chars, requests };
}

const exists = file => access(file).then(() => true, () => false);

export const KEY_FILE = process.env.HIVE_AZURE_ENV || path.join(os.homedir(), '.config', 'hive-english', 'azure.env');
// KEY=value lines; blank lines and # comments are ignored; quotes around a value are removed.
export function parseEnvFile(text) {
    const out = {};
    for (const line of text.split(/\r?\n/)) {
        const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
        if (!match || line.trimStart().startsWith('#')) continue;
        out[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
    }
    return out;
}
async function credentials() {
    let fromFile = {};
    if (await exists(KEY_FILE)) {
        if (path.resolve(KEY_FILE).startsWith(root + path.sep)) throw new Error(`${KEY_FILE} is inside the repository, where it could be committed. Move it to your home folder.`);
        if (((await stat(KEY_FILE)).mode & 0o077) !== 0) throw new Error(`${KEY_FILE} can be read by other users. Run: chmod 600 "${KEY_FILE}"`);
        fromFile = parseEnvFile(await readFile(KEY_FILE, 'utf8'));
    }
    return { key: process.env.AZURE_SPEECH_KEY || fromFile.AZURE_SPEECH_KEY || '', region: process.env.AZURE_SPEECH_REGION || fromFile.AZURE_SPEECH_REGION || 'southeastasia' };
}
async function initKeyFile() {
    if (await exists(KEY_FILE)) { console.log(`${KEY_FILE} already exists; open it and fill in AZURE_SPEECH_KEY.`); return; }
    await mkdir(path.dirname(KEY_FILE), { recursive: true, mode: 0o700 });
    await writeFile(KEY_FILE, '# Azure Speech resource: Keys and Endpoint in the Azure portal. Stays on this computer; never commit it.\nAZURE_SPEECH_KEY=\nAZURE_SPEECH_REGION=southeastasia\n', { mode: 0o600 });
    await chmod(KEY_FILE, 0o600);
    console.log(`Created ${KEY_FILE}. Open it, paste Key 1 after AZURE_SPEECH_KEY=, and save.`);
}
// rev changes whenever a file is rendered again, so a browser never pairs an old mp3 with a new timeline.
function addEntry(summary, id, accent, entry) {
    if (!Object.hasOwn(summary.works, id)) summary.works[id] = {};
    summary.works[id][accent] = { ...entry, rev: Date.now().toString(36) };
}
async function main(argv) {
    const flag = name => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
    if (argv.includes('--init-key')) { await initKeyFile(); return; }
    const dry = argv.includes('--dry-run'), force = argv.includes('--force'), rest = argv.includes('--rest');
    const accents = (flag('--accents') ?? 'en-US,en-GB').split(',');
    const only = flag('--only')?.split(',');
    const format = flag('--format') ?? DEFAULT_FORMAT;
    const delay = Number(flag('--delay') ?? 3200);
    const sdkFolder = flag('--sdk') ?? undefined;
    if (!accents.every(a => VOICES[a]) || !FORMATS[format] || !Number.isFinite(delay)) throw new Error(`usage: see the top of this file (accents: ${Object.keys(VOICES)}; formats: ${Object.keys(FORMATS)})`);
    const { key, region } = await credentials();
    if (argv.includes('--check')) {
        if (!key) throw new Error(`No key yet. Open ${KEY_FILE} and fill in AZURE_SPEECH_KEY (or set it in your shell).`);
        const audio = await synthesize({ ssml: buildSsml({ text: 'Hello.', voice: VOICES['en-US'][0], accent: 'en-US' }), key, region, format, fetcher: fetch, attempts: 2 });
        console.log(`The key works: Azure (${region}) returned ${audio.length} bytes of audio.`);
        return;
    }
    if (!dry && !key) throw new Error(`No key yet. Open ${KEY_FILE} and fill in AZURE_SPEECH_KEY (or set it in your shell).`);
    const library = path.join(root, 'static/english/library'), out = path.join(root, 'static/english/voice');
    const index = JSON.parse(await readFile(path.join(library, 'index.json'), 'utf8'));
    const works = [];
    for (const entry of index.works) if (!only || only.includes(entry.id)) works.push(JSON.parse(await readFile(path.join(library, `${entry.id}.json`), 'utf8')));
    const summary = (await exists(path.join(out, 'index.json'))) ? JSON.parse(await readFile(path.join(out, 'index.json'), 'utf8')) : { version: 1, format, works: {} };
    if (summary.format !== format && Object.keys(summary.works).length && !force) throw new Error(`The existing voice files use ${summary.format}. Use the same --format, or --force to render everything again.`);
    summary.format = format;
    let units = 0, chars = 0;
    for (const work of works) for (const segment of work.segments) for (const unit of unitsOf(segment, work.kind)) { units += 1; chars += flat(unit).length; }
    const seconds = works.reduce((n, w) => n + w.words, 0) / 140 * 60 + units * PAUSE_MS / 1000;
    const megabytes = accents.length * seconds * FORMATS[format] / 1e6;
    console.log(`${works.length} works, ${units} units, ${chars} characters a pass; ${accents.length} accent(s): ${units * accents.length} requests, about ${Math.round(megabytes)} MB of audio in all.`);
    if (dry) return;
    await mkdir(out, { recursive: true });
    const synth = rest ? undefined : sdkSynthesizer({ key, region, format, folder: sdkFolder });
    for (const accent of accents) {
        await mkdir(path.join(out, accent), { recursive: true });
        for (const work of works) {
            const base = path.join(out, accent, work.id);
            if (!force && await exists(`${base}.json`) && await exists(`${base}.mp3`)) {
                const old = JSON.parse(await readFile(`${base}.json`, 'utf8'));
                if (old.textHash === workTextHash(work) && old.format === format && (rest || old.version === 2)) {
                    // Files are there; make sure the index knows them (a stop between the files and the index would leave it without).
                    const known = Object.hasOwn(summary.works, work.id) && Object.hasOwn(summary.works[work.id], accent);
                    if (!known) { addEntry(summary, work.id, accent, { seconds: old.seconds, bytes: (await stat(`${base}.mp3`)).size }); await writeFile(path.join(out, 'index.json'), JSON.stringify(summary, null, 1) + '\n'); }
                    console.log(`skip ${accent} ${work.id} (already rendered${known ? '' : '; added to the index'})`); continue;
                }
            }
            const started = Date.now();
            const { mp3, timeline, chars: used } = await renderWork({ work, accent, key, region, format, synth, pause: () => new Promise(r => setTimeout(r, delay)) });
            await writeFile(`${base}.mp3`, mp3); await writeFile(`${base}.json`, JSON.stringify(timeline) + '\n');
            addEntry(summary, work.id, accent, { seconds: timeline.seconds, bytes: mp3.length });
            await writeFile(path.join(out, 'index.json'), JSON.stringify(summary, null, 1) + '\n');   // saved after each work, so a stop loses nothing
            console.log(`done ${accent} ${work.id}: ${timeline.seconds}s, ${Math.round(mp3.length / 1024)} KB, ${used} characters, ${Math.round((Date.now() - started) / 1000)} s`);
        }
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exit(1); });
