#!/usr/bin/env node
// Gives each volunteer recording of the reading library a word-time file, once, with Azure fast transcription:
//   node tools/render-english-human.mjs --dry-run     list the recordings and their size
//   node tools/render-english-human.mjs               transcribe what is missing or out of date
//   options: --only id,id  --force
// The recognizer returns a start and an end for every word it heard. humanalign.mjs lines those words up with the words of the text
// (a recording has an introduction and an ending, and the recognizer mishears words), and only the words found get a time.
// A recording where fewer than 90% of the text's words are found gets no file, so the page leaves it as a plain player.
// Results: static/english/human/<work>.json and static/english/human/index.json. The key is read like the voice tool reads it
// (private file in your home folder, or AZURE_SPEECH_KEY / AZURE_SPEECH_REGION) and is never printed.
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { KEY_FILE, parseEnvFile } from './render-english-voices.mjs';
import { alignRecording, buildTimeline, checkHumanTimeline } from '../static/english/humanalign.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exists = file => access(file).then(() => true, () => false);

// Plain words with their times, from a fast transcription answer.
export const heardWords = answer => (answer.phrases ?? []).flatMap(p => (p.words ?? []).map(w => ({ text: w.text, startMs: w.offsetMilliseconds, endMs: w.offsetMilliseconds + w.durationMilliseconds })));

export async function transcribe({ audio, key, region, attempts = 6, backoff = 2000, fetcher = fetch }) {
    for (let attempt = 1; ; attempt++) {
        const form = new FormData();
        form.append('audio', new Blob([audio], { type: 'audio/mpeg' }), 'audio.mp3');
        form.append('definition', JSON.stringify({ locales: ['en-US'] }));
        let response;
        try {
            response = await fetcher(`https://${region}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15`, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key }, body: form, signal: AbortSignal.timeout(180000) });
        } catch (error) { if (attempt === attempts) throw new Error(`network error: ${error.cause?.code ?? error.message}`); }
        if (response?.ok) return response.json();
        if (response && ![429, 500, 502, 503, 504].includes(response.status)) throw new Error(`Azure answered HTTP ${response.status}`);   // a bad key or request will not get better
        if (attempt === attempts) throw new Error(`Azure kept answering HTTP ${response?.status ?? 'nothing'}`);
        await new Promise(r => setTimeout(r, Math.min(30000, backoff * 2 ** (attempt - 1))));
    }
}

async function main(argv) {
    const flag = name => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
    const dry = argv.includes('--dry-run'), force = argv.includes('--force'), only = flag('--only')?.split(',');
    const fromFile = (await exists(KEY_FILE)) ? parseEnvFile(await readFile(KEY_FILE, 'utf8')) : {};
    const key = process.env.AZURE_SPEECH_KEY || fromFile.AZURE_SPEECH_KEY || '', region = process.env.AZURE_SPEECH_REGION || fromFile.AZURE_SPEECH_REGION || 'southeastasia';
    const library = path.join(root, 'static/english/library'), out = path.join(root, 'static/english/human');
    const index = JSON.parse(await readFile(path.join(library, 'index.json'), 'utf8'));
    const works = [];
    for (const entry of index.works) {
        if (only && !only.includes(entry.id)) continue;
        const work = JSON.parse(await readFile(path.join(library, `${entry.id}.json`), 'utf8'));
        if (work.human) works.push(work);
    }
    console.log(`${works.length} recordings, ${works.reduce((n, w) => n + w.human.seconds, 0)} seconds in all.`);
    if (dry) return;
    if (!key) throw new Error(`No key. Put AZURE_SPEECH_KEY in ${KEY_FILE}, or in your shell.`);
    const hide = message => message.split(key).join('***');
    const summaryFile = path.join(out, 'index.json');
    const summary = (await exists(summaryFile)) ? JSON.parse(await readFile(summaryFile, 'utf8')) : { version: 1, works: {} };
    for (const work of works) {
        const file = path.join(out, `${work.id}.json`);
        if (!force && await exists(file) && checkHumanTimeline(JSON.parse(await readFile(file, 'utf8')), work) && Object.hasOwn(summary.works, work.id)) { console.log(`skip ${work.id} (already timed)`); continue; }
        const answer = await transcribe({ audio: await readFile(path.join(root, 'static/english', work.human.src)), key, region }).catch(error => { throw new Error(hide(error.message)); });
        const heard = heardWords(answer), timeline = buildTimeline(work, heard, Math.round(answer.durationMilliseconds / 100) / 10);
        if (!timeline) {
            const { found, total } = alignRecording(work, heard);
            console.log(`none ${work.id}: only ${found} of ${total} words found, so the recording stays a plain player`);
            delete summary.works[work.id];
        } else {
            await writeFile(file, JSON.stringify(timeline) + '\n');
            summary.works[work.id] = { rev: Date.now().toString(36), found: timeline.found, total: timeline.total };
            console.log(`done ${work.id}: ${timeline.found} of ${timeline.total} words`);
        }
        await writeFile(summaryFile, JSON.stringify(summary, null, 1) + '\n');
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exit(1); });
