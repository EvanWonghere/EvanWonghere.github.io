#!/usr/bin/env node
// Builds static/english/library/*.json from tools/english-library/specs/*.json.
//   node tools/import-english-text.mjs fetch --cache <dir> [id…]   download source texts (needs network)
//   node tools/import-english-text.mjs build --cache <dir>        write the library and its index
// The text of every public-domain work is cut from the downloaded source, never typed in by hand.
// A spec holds the facts (author, dates, source, excerpt markers) and the editorial text (intro, tips, glossary).
import { readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitSegments, validateWork, validateIndex, indexEntry, estimateSeconds } from '../static/english/library.mjs';
import { wordCount } from '../static/english/core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const specDir = path.join(root, 'tools/english-library/specs');
const outDir = path.join(root, 'static/english/library');
const [command, ...rest] = process.argv.slice(2);
const flag = name => { const i = rest.indexOf(name); return i < 0 ? null : rest.splice(i, 2)[1]; };
const cache = flag('--cache');
const show = rest.includes('--show');
if (show) rest.splice(rest.indexOf('--show'), 1);
if (!['fetch', 'build'].includes(command) || !cache) { console.error('usage: import-english-text.mjs fetch|build --cache <dir> [--show] [id…]'); process.exit(2); }

const specs = [];
for (const file of (await readdir(specDir)).filter(f => f.endsWith('.json')).sort()) {
    const spec = JSON.parse(await readFile(path.join(specDir, file), 'utf8'));
    if (spec.id !== file.slice(0, -5)) throw new Error(`${file}: id must match the file name`);
    specs.push(spec);
}
const wanted = new Set(rest);
const selected = specs.filter(s => !wanted.size || wanted.has(s.id));

async function download(url) {
    for (let attempt = 1; attempt <= 6; attempt++) {
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'hive-english-library/1.0 (personal blog tool)' } });
            if (response.ok) return response;
            console.warn(`  ${response.status} for ${url}`);
        } catch (error) { console.warn(`  attempt ${attempt}: ${error.cause?.code ?? error.message}`); }
        await new Promise(r => setTimeout(r, 1500 * attempt));
    }
    throw new Error(`could not download ${url}`);
}
function sourceUrl(source) {
    if (source.type === 'gutenberg') return `https://www.gutenberg.org/cache/epub/${source.id}/pg${source.id}.txt`;
    if (source.type === 'wikisource') return `https://en.wikisource.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=${encodeURIComponent(source.title)}`;
    throw new Error(`unknown source type ${source.type}`);
}
// Transcluded Wikisource pages have no plain-text extract, so fall back to the rendered page.
function htmlToText(html) {
    const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…' };
    return html.replace(/<!--[\s\S]*?-->|<(style|script)[\s\S]*?<\/\1>|<sup[^>]*>[\s\S]*?<\/sup>|<span[^>]*pagenum[^>]*>[\s\S]*?<\/span>/g, '')
        .replace(/\n/g, ' ').replace(/<br\s*\/?>/g, '\n').replace(/<\/(p|div|li|tr|h\d|table)>/g, '\n\n').replace(/<[^>]+>/g, '')
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
        .replace(/&([a-z]+);/gi, (m, name) => entities[name.toLowerCase()] ?? m).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}
async function fetchOne(spec) {
    if (spec.source.type === 'original') return;
    const response = await download(sourceUrl(spec.source));
    let body = await response.text();
    if (spec.source.type === 'wikisource') {
        const page = Object.values(JSON.parse(body).query.pages)[0];
        body = page?.extract ?? '';
        if (body.trim().length < 200) {
            const rendered = await (await download(`https://en.wikisource.org/w/api.php?action=parse&format=json&formatversion=2&prop=text&redirects=1&page=${encodeURIComponent(spec.source.title)}`)).json();
            body = htmlToText(rendered.parse?.text ?? '');
        }
        if (!body.trim()) throw new Error(`${spec.id}: Wikisource page "${spec.source.title}" has no text`);
    }
    await writeFile(path.join(cache, `${spec.id}.txt`), body);
    console.log(`fetched ${spec.id} (${body.length} chars)`);
}

const normalize = (raw, poem) => {
    let out = raw.replace(/\r/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, ' ')
        .replace(/^=+.*=+$/gm, '').replace(/_([^_]{1,200})_/g, '$1').replace(/\[\d+\]/g, '').replace(/[ \t]+/g, ' ');
    out = poem ? out.split('\n').map(l => l.trim().replace(/(?<=[^\d\s])\s*\d{1,3}$/, '')).filter(l => !/^(?:\d{1,3}|[IVX]+)\.?$/.test(l)).join('\n') : out.split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).join('\n\n');
    return out.replace(/\n{3,}/g, '\n\n').trim();
};
function excerpt(text, from, to, id) {
    if (!from && !to) return text;
    const start = from ? text.indexOf(from) : 0;
    if (start < 0) throw new Error(`${id}: excerpt.from not found`);
    if (!to) return text.slice(start).trim();
    const stop = text.indexOf(to, start + (from?.length ?? 0));
    if (stop < 0) throw new Error(`${id}: excerpt.to not found after excerpt.from`);
    return text.slice(start, stop + to.length).trim();
}
// Both rules must hold: public domain in the US (published by 1930, or a US government work)
// and in China (author, and translator if any, dead for more than 50 years).
function rights(spec) {
    const us = spec.firstPublished <= 1930 || spec.usGovWork === true;
    const cn = spec.authorDied <= 1975;
    if (!us || !cn) throw new Error(`${spec.id}: not public domain in both the US and China (published ${spec.firstPublished}, died ${spec.authorDied})`);
    return `美国：${spec.firstPublished} 年出版${spec.usGovWork ? '（美国政府作品）' : ''}；中国：作者${spec.translated ? '及译者' : ''}${spec.authorDied} 年去世，保护期已满`;
}
// A volunteer recording from LibriVox (public domain), kept in static/english/human/<id>.mp3.
function human(spec) {
    const { item, itemTitle, track, seconds } = spec.human;
    if (!existsSync(path.join(root, 'static/english/human', `${spec.id}.mp3`))) throw new Error(`${spec.id}: static/english/human/${spec.id}.mp3 is missing`);
    return { src: `human/${spec.id}.mp3`, seconds, credit: `LibriVox 志愿者朗读 · ${itemTitle} · ${track}`, url: `https://archive.org/details/${item}` };
}
async function buildOne(spec) {
    const original = spec.source.type === 'original';
    let segments, license;
    if (original) {
        segments = spec.segments.map(s => typeof s === 'string' ? { text: s } : s);
        license = '原创内容，Hive 站点所有，可随站使用。';
    } else {
        const cached = path.join(cache, `${spec.id}.txt`);
        if (!existsSync(cached)) throw new Error(`${spec.id}: run fetch first`);
        const poem = spec.kind === 'poem';
        const text = excerpt(normalize(await readFile(cached, 'utf8'), poem), spec.source.from, spec.source.to, spec.id);
        segments = splitSegments(text, spec.kind).map(t => ({ text: t }));
        license = rights(spec);
    }
    const words = segments.reduce((n, s) => n + wordCount(s.text), 0);
    const sourceName = { gutenberg: `Project Gutenberg #${spec.source.id}`, wikisource: 'Wikisource', original: 'Hive 原创' }[spec.source.type];
    const work = {
        version: 1, id: spec.id, kind: spec.kind, title: spec.title, author: spec.author, year: spec.year, level: spec.level,
        source: { name: sourceName, url: original ? '' : sourceUrl(spec.source).startsWith('https://en.wikisource') ? `https://en.wikisource.org/wiki/${encodeURIComponent(spec.source.title.replaceAll(' ', '_'))}` : `https://www.gutenberg.org/ebooks/${spec.source.id}` },
        rights: license, words, seconds: estimateSeconds(words), intro: spec.intro, tips: spec.tips ?? [], glossary: spec.glossary ?? {},
        ...(spec.roles ? { roles: spec.roles } : {}),
        ...(spec.human ? { human: human(spec) } : {}),
        segments: segments.map((s, i) => ({ id: `s${i + 1}`, text: s.text, ...(s.speaker ? { speaker: s.speaker } : {}) })),
    };
    return validateWork(work);
}

if (command === 'fetch') {
    await mkdir(cache, { recursive: true });
    const failed = [];
    for (const spec of selected) { try { await fetchOne(spec); } catch (error) { failed.push(error.message); } }
    if (failed.length) { console.error(`\n${failed.length} failed:\n${failed.join('\n')}`); process.exit(1); }
} else {
    const works = [];
    const problems = [];
    for (const spec of selected) { try { works.push(await buildOne(spec)); } catch (error) { problems.push(error.message); } }
    if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
    if (wanted.size) {
        console.log('built (not written, partial selection):');
        for (const w of works) { console.log(`  ${w.id} · ${w.words} words · ${w.segments.length} segments · ${w.seconds} s`); if (show) for (const s of w.segments) console.log(`    [${s.id}] ${s.text.replaceAll('\n', ' / ')}`); }
        process.exit(0);
    }
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });
    for (const work of works) await writeFile(path.join(outDir, `${work.id}.json`), JSON.stringify(work, null, 1) + '\n');
    const index = validateIndex({ version: 1, works: works.map(indexEntry).sort((a, b) => a.id < b.id ? -1 : 1) });
    await writeFile(path.join(outDir, 'index.json'), JSON.stringify(index, null, 1) + '\n');
    console.log(`wrote ${works.length} works, ${works.reduce((n, w) => n + w.words, 0)} words`);
}
