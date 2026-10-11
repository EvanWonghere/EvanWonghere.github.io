#!/usr/bin/env node
// Reads the short quotes of data/quotes.yaml aloud, once, with an Azure HD voice, into static/quotes/audio/<hash>.mp3:
//   node tools/render-quote-audio.mjs --list          which quotes would get audio
//   node tools/render-quote-audio.mjs                 render what is missing
//   options: --max-chars 300 (quotes longer than this are left without audio)  --force  --sdk <folder>
// The file name is the first ten characters of the SHA-1 of the quote's text with white space collapsed, which the quotes page
// computes too (layouts/page/quotes.html); a quote whose text changes simply loses its audio until it is rendered again.
// Long passages are skipped by default: they are other people's writing, read aloud in full. Same key file and SDK folder as the
// voice tool; the key is never printed.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sdkSynthesizer, KEY_FILE, parseEnvFile } from './render-english-voices.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
export const VOICE = 'zh-CN-Xiaochen:DragonHDLatestNeural';
const exists = file => access(file).then(() => true, () => false);

// The text that is read, and the name of its file. Must match layouts/page/quotes.html.
// White space is ASCII only, because Hugo's regular expressions (RE2) read \s that way.
export const spoken = content => content.replace(/[ \t\r\n\f]+/g, ' ').replace(/^ | $/g, '');
export const clipName = content => createHash('sha1').update(spoken(content)).digest('hex').slice(0, 10);

// The two lists of quotes in data/quotes.yaml, with the keys they have: { prose_quotes: [{content, author, ...}], poetry_and_passages: [...] }.
// Only the shapes that file uses: `- key: value` items, double-quoted or plain values, and `|` blocks.
export function parseQuotes(text) {
    const lists = {};
    let list = null, item = null, block = null;
    const value = raw => { const v = raw.trim(); if (v.startsWith('"')) return JSON.parse(v); if (v === 'true') return true; if (v === 'false') return false; return v; };
    for (const line of text.split('\n')) {
        if (block) {
            if (/^\s{6,}\S/.test(line) || /^\s*$/.test(line)) { block.lines.push(line.slice(6)); continue; }
            item[block.key] = block.lines.join('\n').replace(/\n+$/, '') + '\n'; block = null;
        }
        if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue;
        let m;
        if ((m = /^(\w+):\s*$/.exec(line))) { list = lists[m[1]] = []; item = null; continue; }
        if (!list) continue;
        if ((m = /^  - (\w+):\s*(.*)$/.exec(line))) { item = {}; list.push(item); }
        else if (!(m = /^    (\w+):\s*(.*)$/.exec(line))) continue;
        const [, key, rest] = m;
        if (rest.trim() === '|') block = { key, lines: [] }; else item[key] = value(rest);
    }
    if (block) item[block.key] = block.lines.join('\n').replace(/\n+$/, '') + '\n';
    return lists;
}
export const shortQuotes = (lists, maxChars) => ['prose_quotes', 'poetry_and_passages'].flatMap(group => (lists[group] ?? []).map((q, i) => ({ group, i, ...q }))).filter(q => typeof q.content === 'string' && spoken(q.content).length <= maxChars);

async function main(argv) {
    const flag = name => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
    const maxChars = Number(flag('--max-chars') ?? 300), force = argv.includes('--force');
    if (!(maxChars > 0)) throw new Error('usage: see the top of this file');
    const lists = parseQuotes(await readFile(path.join(root, 'data/quotes.yaml'), 'utf8'));
    const all = ['prose_quotes', 'poetry_and_passages'].flatMap(g => lists[g] ?? []).length, chosen = shortQuotes(lists, maxChars);
    for (const q of chosen) console.log(`${clipName(q.content)}  ${q.group}[${q.i}]  ${spoken(q.content).length} chars  ${q.author ?? ''} 《${q.source ?? ''}》`);
    console.log(`${chosen.length} of ${all} quotes are ${maxChars} characters or shorter.`);
    if (argv.includes('--list')) return;
    const fromFile = (await exists(KEY_FILE)) ? parseEnvFile(await readFile(KEY_FILE, 'utf8')) : {};
    const key = process.env.AZURE_SPEECH_KEY || fromFile.AZURE_SPEECH_KEY || '', region = process.env.AZURE_SPEECH_REGION || fromFile.AZURE_SPEECH_REGION || 'southeastasia';
    if (!key) throw new Error(`No key. Put AZURE_SPEECH_KEY in ${KEY_FILE}, or in your shell.`);
    const synth = sdkSynthesizer({ key, region, format: FORMAT, folder: flag('--sdk') ?? undefined });
    const out = path.join(root, 'static/quotes/audio');
    await mkdir(out, { recursive: true });
    const wanted = new Set(chosen.map(q => clipName(q.content)));
    for (const q of chosen) {
        const name = clipName(q.content), file = path.join(out, `${name}.mp3`);
        if (!force && await exists(file)) { console.log(`skip ${name}`); continue; }
        const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN"><voice name="${VOICE}">${spoken(q.content).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</voice></speak>`;
        const { audio } = await synth({ ssml });
        if (audio.length < 1000) throw new Error(`${name}: empty audio`);
        await writeFile(file, audio);
        console.log(`done ${name}: ${Math.round(audio.length / 1024)} KB`);
    }
    await writeFile(path.join(out, 'index.json'), JSON.stringify({ version: 1, voice: VOICE, format: FORMAT, files: [...wanted].sort() }) + '\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exit(1); });
