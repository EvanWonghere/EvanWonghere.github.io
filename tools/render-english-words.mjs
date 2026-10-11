#!/usr/bin/env node
// Renders one short pronunciation clip for every distinct word of the reading library, once, with an Azure HD voice:
//   node tools/render-english-words.mjs --dry-run         count the words
//   node tools/render-english-words.mjs                   render what is missing (both accents)
//   options: --accents en-US,en-GB  --concurrency 4  --delay 300  --force  --sdk <folder>
// Clips go to static/english/words/<accent>/<word>.mp3 and the list of what exists to static/english/words/index.json.
// The page plays a clip when a word is tapped and falls back to the device voice when there is none. Same key file and SDK folder as
// tools/render-english-voices.mjs; the key is never printed. Words with an unusual length are listed at the end for a listen.
import { readFile, writeFile, mkdir, access, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sdkSynthesizer, buildSsml, KEY_FILE, parseEnvFile } from './render-english-voices.mjs';
import { distinctWords } from './render-english-gloss.mjs';
import { VOICES, FORMATS } from '../static/english/voice.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const VOICE = { 'en-US': VOICES['en-US'][0], 'en-GB': VOICES['en-GB'][0] };   // one voice for words: the first (female) voice of each accent
const exists = file => access(file).then(() => true, () => false);

// Runs `work(item)` for every item, `limit` at a time.
export async function pool(items, limit, work) {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const item = items[next++]; await work(item); } }));
}

async function main(argv) {
    const flag = name => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
    const dry = argv.includes('--dry-run'), force = argv.includes('--force');
    const accents = (flag('--accents') ?? 'en-US,en-GB').split(','), concurrency = Number(flag('--concurrency') ?? 4), delay = Number(flag('--delay') ?? 300);
    if (!accents.every(a => VOICE[a]) || !(concurrency >= 1) || !Number.isFinite(delay)) throw new Error('usage: see the top of this file');
    const library = path.join(root, 'static/english/library'), out = path.join(root, 'static/english/words');
    const index = JSON.parse(await readFile(path.join(library, 'index.json'), 'utf8'));
    const works = [];
    for (const entry of index.works) works.push(JSON.parse(await readFile(path.join(library, `${entry.id}.json`), 'utf8')));
    const words = distinctWords(works);
    console.log(`${words.length} distinct words, ${accents.length} accent(s): ${words.length * accents.length} clips.`);
    if (dry) return;
    const fromFile = (await exists(KEY_FILE)) ? parseEnvFile(await readFile(KEY_FILE, 'utf8')) : {};
    const key = process.env.AZURE_SPEECH_KEY || fromFile.AZURE_SPEECH_KEY || '', region = process.env.AZURE_SPEECH_REGION || fromFile.AZURE_SPEECH_REGION || 'southeastasia';
    if (!key) throw new Error(`No key. Put AZURE_SPEECH_KEY in ${KEY_FILE}, or in your shell.`);
    const synth = sdkSynthesizer({ key, region, format: FORMAT, folder: flag('--sdk') ?? undefined });
    const failed = [];
    for (const accent of accents) {
        await mkdir(path.join(out, accent), { recursive: true });
        let done = 0;
        await pool(words, concurrency, async word => {
            const file = path.join(out, accent, `${word}.mp3`);
            if (!force && await exists(file) && (await stat(file)).size > 500) return;
            try {
                await new Promise(r => setTimeout(r, delay));
                const { audio } = await synth({ ssml: buildSsml({ text: word, voice: VOICE[accent], accent }) });
                if (audio.length < 500) throw new Error('empty audio');
                await writeFile(file, audio);
                if (++done % 100 === 0) console.log(`${accent}: ${done} clips`);
            } catch (error) { failed.push(`${accent}/${word}: ${error.message}`); }
        });
        console.log(`${accent}: ${done} new clips`);
    }
    await writeIndex(out, words, accents);
    if (failed.length) { console.log(`${failed.length} clips failed:\n${failed.join('\n')}`); process.exitCode = 1; }
    await report(out, accents);
}

// words/index.json lists, per accent, the words that have a clip. rev changes whenever the list is written.
export async function writeIndex(out, words, accents) {
    const have = {};
    for (const accent of accents) {
        const files = new Set((await readdir(path.join(out, accent))).filter(n => n.endsWith('.mp3')).map(n => n.slice(0, -4)));
        have[accent] = words.filter(w => files.has(w));
    }
    await writeFile(path.join(out, 'index.json'), JSON.stringify({ version: 1, format: FORMAT, voices: VOICE, rev: Date.now().toString(36), words: have }) + '\n');
}
async function report(out, accents) {
    for (const accent of accents) {
        const odd = [];
        for (const name of await readdir(path.join(out, accent))) {
            if (!name.endsWith('.mp3')) continue;
            const seconds = (await stat(path.join(out, accent, name))).size / FORMATS[FORMAT];
            if (seconds < 0.25 || seconds > 2.2) odd.push(`${name.slice(0, -4)} ${seconds.toFixed(2)}s`);
        }
        console.log(`${accent}: ${odd.length} clips with an unusual length${odd.length ? ': ' + odd.join(', ') : ''}`);
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exit(1); });
