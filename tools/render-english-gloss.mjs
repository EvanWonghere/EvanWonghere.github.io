#!/usr/bin/env node
// Writes the Chinese reading aids of the library into static/english/gloss/, once, with Azure Translator:
//   node tools/render-english-gloss.mjs --check       one short request to prove the key works
//   node tools/render-english-gloss.mjs --dry-run     count what would be sent
//   node tools/render-english-gloss.mjs               translate what is missing or out of date
//   options: --only id,id  --force
// For every unit (a sentence, or a clause or line of a poem) it keeps the machine translation and, for each English word in it,
// the dictionary sense that the translation uses for that word ("in this sentence"): a sense counts only when it appears in the
// translation next to where Translator aligned the word. A dictionary file lists the Chinese senses of every distinct word.
// The page never calls Translator: it only reads these files.
// The key is read from the same private file as the voice tool (AZURE_TRANSLATOR_KEY, AZURE_TRANSLATOR_REGION, AZURE_TRANSLATOR_ENDPOINT)
// or from the environment, and is never printed. Corrections to machine output go in tools/english-library/gloss-overrides.json.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { workTextHash, tokenize } from '../static/english/library.mjs';
import { unitsOf } from '../static/english/voice.mjs';
import { KEY_FILE, parseEnvFile } from './render-english-voices.mjs';
import { glossKey, checkGloss } from '../static/english/gloss.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flat = text => text.replace(/\s*\n\s*/g, ' ').trim();
const POS = { NOUN: 'n.', VERB: 'v.', ADJ: 'adj.', ADV: 'adv.', PREP: 'prep.', CONJ: 'conj.', PRON: 'pron.', DET: 'det.', MODAL: 'modal', OTHER: '' };
const PAD = 1;   // alignment is a little loose, so a sense may sit this many characters outside the aligned stretch

// "0:0-0:0 2:5-1:2" → [{ s: [0, 0], t: [0, 0] }, ...]; the ends are inclusive, as Translator writes them.
export function parseAlignment(proj) {
    return String(proj ?? '').split(/\s+/).filter(Boolean).map(pair => {
        const m = /^(\d+):(\d+)-(\d+):(\d+)$/.exec(pair);
        return m ? { s: [Number(m[1]), Number(m[2])], t: [Number(m[3]), Number(m[4])] } : null;
    }).filter(Boolean);
}
// For each word of `text` (as tokenize() sees it), the stretches of the translation that Translator aligned to it: [[from, to], ...], ends inclusive.
export function alignedRanges(text, alignment) {
    const pairs = parseAlignment(alignment);
    return tokenize(text).filter(t => t.word).map(token => {
        const from = token.start, to = token.start + token.text.length - 1, spans = [];
        for (const p of pairs) if (p.s[0] <= to && p.s[1] >= from) spans.push([...p.t]);
        spans.sort((a, b) => a[0] - b[0]);
        const runs = [];
        for (const span of spans) { const last = runs.at(-1); if (last && span[0] <= last[1] + 1) last[1] = Math.max(last[1], span[1]); else runs.push([...span]); }
        return runs;
    });
}
// The dictionary sense of a word that the translation uses: the longest sense that appears in `zh` within (a little more than) the aligned
// stretches. '' when none does; then the page shows only the dictionary.
// `minLength`: shortest sense that counts (a corrected sentence has no alignment, so there a sense counts only if it is at least two characters
// long and appears anywhere in it).
export function contextSense(zh, ranges, senseList, minLength = 1) {
    let best = '';
    for (const [, ...list] of senseList ?? []) for (const sense of list) {
        if (sense.length <= best.length || sense.length < minLength) continue;
        for (let at = zh.indexOf(sense); at >= 0; at = zh.indexOf(sense, at + 1)) {
            if (ranges.some(([a, b]) => at <= b + PAD && at + sense.length - 1 >= a - PAD)) { best = sense; break; }
        }
    }
    return best;
}
// The Chinese senses of a word, from a /dictionary/lookup answer: up to three parts of speech with up to three senses each.
export function senses(answer) {
    const groups = new Map();
    for (const t of answer?.translations ?? []) {
        const tag = Object.hasOwn(POS, t.posTag) ? POS[t.posTag] : '';
        const list = groups.get(tag) ?? []; if (!list.includes(t.normalizedTarget) && list.length < 3) list.push(t.normalizedTarget); groups.set(tag, list);
    }
    return [...groups].slice(0, 3).map(([pos, list]) => [pos, ...list]);
}

async function call({ base, key, region, route, body, attempts = 6, backoff = 2000, fetcher = fetch }) {
    const headers = { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/json' };
    if (region) headers['Ocp-Apim-Subscription-Region'] = region;
    for (let attempt = 1; ; attempt++) {
        let response;
        try { response = await fetcher(`${base}${route}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) }); }
        catch (error) { if (attempt === attempts) throw new Error(`network error: ${error.cause?.code ?? error.message}`); }
        if (response?.ok) return response.json();
        if (response && ![429, 500, 502, 503].includes(response.status)) throw new Error(`Translator answered HTTP ${response.status}`);   // a bad key or request will not get better
        if (attempt === attempts) throw new Error(`Translator kept answering HTTP ${response?.status ?? 'nothing'}`);
        await new Promise(r => setTimeout(r, Math.min(30000, backoff * 2 ** (attempt - 1))));
    }
}

// One work: its gloss object. `translate(texts)` → [{ text, alignment }]; `dictionary` is { words: { word: [[pos, sense...]] } }. Overrides: { words, units }.
export async function buildGloss({ work, translate, dictionary = { words: {} }, overrides = {} }) {
    const segments = [];
    for (const [s, segment] of work.segments.entries()) {
        const texts = unitsOf(segment, work.kind).map(flat);
        const done = await translate(texts);
        if (done.length !== texts.length) throw new Error(`${work.id}: ${texts.length} units but ${done.length} translations`);
        segments.push(texts.map((text, k) => {
            const corrected = Object.hasOwn(overrides.units ?? {}, `${work.id}/${s}/${k}`);
            const zh = corrected ? overrides.units[`${work.id}/${s}/${k}`] : done[k].text;
            const tokens = tokenize(text).filter(t => t.word), ranges = corrected ? tokens.map(() => [[0, zh.length]]) : alignedRanges(text, done[k].alignment);   // a corrected sentence no longer matches the alignment, so anywhere in it will do
            const words = tokens.map((token, i) => {
                const key = glossKey(token.text);
                if (Object.hasOwn(overrides.words ?? {}, key)) return overrides.words[key];
                return contextSense(zh, ranges[i], Object.hasOwn(dictionary.words, key) ? dictionary.words[key] : null, corrected ? 2 : 1);
            });
            return { zh, w: words };
        }));
    }
    return { version: 1, id: work.id, textHash: workTextHash(work), engine: 'Azure Translator', segments };
}
export const distinctWords = works => {
    const out = new Set();
    for (const work of works) for (const segment of work.segments) for (const unit of unitsOf(segment, work.kind)) for (const t of tokenize(flat(unit))) if (t.word) { const key = glossKey(t.text); if (/^[a-z][a-z'-]*$/.test(key)) out.add(key); }
    return [...out].sort();
};

const exists = file => access(file).then(() => true, () => false);
async function credentials() {
    const fromFile = (await exists(KEY_FILE)) ? parseEnvFile(await readFile(KEY_FILE, 'utf8')) : {};
    const get = name => process.env[name] || fromFile[name] || '';
    return { key: get('AZURE_TRANSLATOR_KEY'), region: get('AZURE_TRANSLATOR_REGION'), base: (get('AZURE_TRANSLATOR_ENDPOINT') || 'https://api.cognitive.microsofttranslator.com').replace(/\/+$/, '') };
}

async function main(argv) {
    const flag = name => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
    const dry = argv.includes('--dry-run'), force = argv.includes('--force'), only = flag('--only')?.split(',');
    const { key, region, base } = await credentials();
    if (!key && !dry) throw new Error(`No key yet. Put AZURE_TRANSLATOR_KEY (and AZURE_TRANSLATOR_REGION) in ${KEY_FILE}, or in your shell.`);
    const hide = message => key ? message.split(key).join('***') : message;
    const request = (route, body) => call({ base, key, region, route, body }).catch(error => { throw new Error(hide(error.message)); });
    if (argv.includes('--check')) {
        const [answer] = await request('/translate?api-version=3.0&from=en&to=zh-Hans', [{ Text: 'Hello.' }]);
        console.log(`The key works: Translator answered "${answer.translations[0].text}".`);
        return;
    }
    const library = path.join(root, 'static/english/library'), out = path.join(root, 'static/english/gloss');
    const index = JSON.parse(await readFile(path.join(library, 'index.json'), 'utf8'));
    const works = [];
    for (const entry of index.works) if (!only || only.includes(entry.id)) works.push(JSON.parse(await readFile(path.join(library, `${entry.id}.json`), 'utf8')));
    const overridesFile = path.join(root, 'tools/english-library/gloss-overrides.json');
    const overrides = (await exists(overridesFile)) ? JSON.parse(await readFile(overridesFile, 'utf8')) : {};
    const words = distinctWords(works);
    let units = 0, chars = 0;
    for (const work of works) for (const segment of work.segments) for (const unit of unitsOf(segment, work.kind)) { units += 1; chars += flat(unit).length; }
    console.log(`${works.length} works, ${units} units, ${chars} characters to translate, ${words.length} distinct words (${words.join('').length} characters) to look up.`);
    if (dry) return;
    await mkdir(out, { recursive: true });
    const summaryFile = path.join(out, 'index.json');
    const summary = (await exists(summaryFile)) ? JSON.parse(await readFile(summaryFile, 'utf8')) : { version: 1, works: {} };
    const translate = async texts => {
        const result = [];
        for (let i = 0; i < texts.length; i += 25) {
            const answer = await request('/translate?api-version=3.0&from=en&to=zh-Hans&includeAlignment=true', texts.slice(i, i + 25).map(Text => ({ Text })));
            for (const item of answer) result.push({ text: item.translations[0].text, alignment: item.translations[0].alignment?.proj });
        }
        return result;
    };
    // The dictionary: every distinct word, ten a request.
    const dictFile = path.join(out, 'dictionary.json');
    const dictionary = (await exists(dictFile)) && !force ? JSON.parse(await readFile(dictFile, 'utf8')) : { version: 1, engine: 'Azure Translator dictionary', words: {} };
    const missing = words.filter(w => !Object.hasOwn(dictionary.words, w) && !Object.hasOwn(dictionary.none ?? {}, w));
    dictionary.none ??= {};
    for (let i = 0; i < missing.length; i += 10) {
        const batch = missing.slice(i, i + 10);
        const answer = await request('/dictionary/lookup?api-version=3.0&from=en&to=zh-Hans', batch.map(Text => ({ Text })));
        batch.forEach((w, k) => { const list = senses(answer[k]); if (list.length) dictionary.words[w] = list; else dictionary.none[w] = 1; });
    }
    for (const [w, text] of Object.entries(overrides.words ?? {})) dictionary.words[w] = [['', text]];
    dictionary.words = Object.fromEntries(Object.entries(dictionary.words).sort(([a], [b]) => a < b ? -1 : 1));
    await writeFile(dictFile, JSON.stringify(dictionary) + '\n');
    summary.dictionary = { rev: Date.now().toString(36), words: Object.keys(dictionary.words).length };
    await writeFile(summaryFile, JSON.stringify(summary, null, 1) + '\n');
    console.log(`dictionary: ${Object.keys(dictionary.words).length} words, ${Object.keys(dictionary.none).length} without an entry`);
    for (const work of works) {
        const file = path.join(out, `${work.id}.json`);
        if (!force && await exists(file)) {
            const old = JSON.parse(await readFile(file, 'utf8'));
            if (checkGloss(old, work) && Object.hasOwn(summary.works, work.id)) { console.log(`skip ${work.id} (already translated)`); continue; }
        }
        const gloss = await buildGloss({ work, translate, dictionary, overrides });
        if (!checkGloss(gloss, work)) throw new Error(`${work.id}: the gloss does not fit the text it was made from`);
        await writeFile(file, JSON.stringify(gloss) + '\n');
        summary.works[work.id] = { rev: Date.now().toString(36) };
        await writeFile(summaryFile, JSON.stringify(summary, null, 1) + '\n');
        console.log(`done ${work.id}`);
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exit(1); });
