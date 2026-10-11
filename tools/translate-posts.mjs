#!/usr/bin/env node
// Writes English drafts of the Chinese blog posts with Azure Translator, one index.en.md next to each index.md:
//   node tools/translate-posts.mjs --list                 list the posts and how much of each would be translated
//   node tools/translate-posts.mjs --only <part of path>  translate the posts whose path contains this text
//   node tools/translate-posts.mjs                        translate every published post that has no English draft yet
//   options: --force (overwrite)  --drafts (also posts that are drafts)  --dry-run
// Only prose is translated, line by line: code blocks, inline code, formulas, images, link addresses, HTML and tables stay as they are,
// and so do lines with no Chinese in them. Every English file is written with `draft: true`, so the production build leaves it out
// until it has been read and the flag removed. A post is written only when its structure (lines, code blocks, images, links, headings,
// formulas) is the same as the original, otherwise it is reported and skipped. The key is read like the voice tool reads it
// (AZURE_TRANSLATOR_KEY, AZURE_TRANSLATOR_REGION, AZURE_TRANSLATOR_ENDPOINT) and is never printed.
import { readFile, writeFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { KEY_FILE, parseEnvFile } from './render-english-voices.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const hasCJK = text => /[㐀-鿿豈-﫿]/.test(text);
const exists = file => access(file).then(() => true, () => false);

// ---- Inline markdown ⇄ the HTML that Translator keeps intact ----
const NO = (n) => `<span class="notranslate">⟦${n}⟧</span>`;
const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const decodeHtml = text => text.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
// What must not be translated, and what has to survive as markup. The first group that matches wins, scanning left to right.
const INLINE = new RegExp([
    '(?<code>(`+)(?:[^`]|[^`][\\s\\S]*?[^`])\\2(?!`))',
    '(?<math>\\$\\$[\\s\\S]+?\\$\\$|\\\\\\([\\s\\S]+?\\\\\\)|\\\\\\[[\\s\\S]+?\\\\\\])',
    '(?<image>!\\[(?<alt>[^\\]]*)\\]\\((?<imageurl>[^)]*)\\))',
    '(?<link>\\[(?<linktext>[^\\]]+)\\]\\((?<linkurl>[^)]*)\\))',
    '(?<url>https?:\\/\\/[^\\s)）]+)',
    '(?<tag><\\/?[a-zA-Z][^>]*>)',
    '(?<bold>\\*\\*(?<boldtext>[\\s\\S]+?)\\*\\*)',
    '(?<italic>\\*(?<italictext>[^\\s*][^*]*?)\\*)',
].join('|'), 'g');

// Returns { html, tokens }: the line as HTML with every protected piece replaced by a numbered placeholder.
export function protectInline(content) {
    const tokens = [];
    const hold = raw => NO(tokens.push(raw) - 1);
    const render = text => {
        let out = '', last = 0;
        for (const m of text.matchAll(INLINE)) {
            out += escapeHtml(text.slice(last, m.index)); last = m.index + m[0].length;
            const g = m.groups;
            if (g.image) out += `${hold('![')}${render(g.alt)}${hold(`](${g.imageurl})`)}`;   // the alternative text is translated, the address is not
            else if (g.code || g.math || g.url || g.tag) out += hold(m[0]);
            else if (g.link) out += `<a href="⟦${tokens.push(g.linkurl) - 1}⟧">${render(g.linktext)}</a>`;
            else if (g.bold) out += `<b>${render(g.boldtext)}</b>`;
            else out += `<i>${render(g.italictext)}</i>`;
        }
        return out + escapeHtml(text.slice(last));
    };
    return { html: render(content), tokens };
}
// The markdown back from a translated line, or null when the translation lost or invented a placeholder or kept a tag it should not.
export function restoreInline(html, tokens) {
    const used = [];
    // An inline code span or formula that touched Chinese text had no spaces around it; English needs them.
    let s = html.replace(/<span class="notranslate">\s*⟦(\d+)⟧\s*<\/span>/g, (match, n, offset, whole) => {
        used.push(Number(n));
        const raw = tokens[n] ?? '⟦?⟧';
        if (!/^(`|\$\$|\\\(|\\\[)/.test(raw)) return raw;
        const before = /[A-Za-z0-9]$/.test(whole.slice(0, offset)) ? ' ' : '', after = /^[A-Za-z0-9]/.test(whole.slice(offset + match.length)) ? ' ' : '';
        return `${before}${raw}${after}`;
    });
    s = s.replace(/<a\s+href="⟦(\d+)⟧"\s*>([\s\S]*?)<\/a>/g, (_, n, text) => { used.push(Number(n)); return `[${text}](${tokens[n] ?? '⟦?⟧'})`; });
    s = s.replace(/<\/?(?:b|strong)>/g, '**').replace(/<\/?(?:i|em)>/g, '*');
    if (/<[^>]+>/.test(s.replace(/\\</g, '')) && /<\/?[a-zA-Z][^>]*>/.test(s)) {
        // a tag that was in the original text is a placeholder that was already restored; one left over is the translator's
        const original = tokens.join('');
        for (const m of s.matchAll(/<\/?[a-zA-Z][^>]*>/g)) if (!original.includes(m[0])) return null;
    }
    s = decodeHtml(s);
    if (s.includes('⟦')) return null;
    const expected = tokens.map((_, i) => i).sort((a, b) => a - b), got = [...used].sort((a, b) => a - b);
    if (expected.length !== got.length || expected.some((n, i) => n !== got[i])) return null;
    return s.replace(/\s*\n\s*/g, ' ').trim();
}

// ---- Lines ----
// Invisible characters (a zero-width space is not white space to JavaScript) belong to the prefix, so they are not sent and not lost.
const PREFIX = /^([\s\u200b\u200c\u200d\ufeff]*(?:>[\s\u200b]*)*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)?)([\s\S]*?)([\s\u200b]*)$/;
// Which lines are prose: returns for every line of a markdown body { text, translate } where translate is null or { prefix, content, tail }.
export function classifyLines(body) {
    const lines = body.split('\n');
    let fence = null, math = false;
    return lines.map(line => {
        const keep = { line, translate: null };
        const fenceMatch = /^\s*(?:>\s*)*(`{3,}|~{3,})/.exec(line);
        if (fence) { if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length && /^\s*(?:>\s*)*[`~]+\s*$/.test(line)) fence = null; return keep; }
        if (fenceMatch) { fence = fenceMatch[1]; return keep; }
        if (math) { if (/\$\$\s*$/.test(line)) math = false; return keep; }
        if ((line.match(/\$\$/g) ?? []).length === 1) { math = true; return keep; }   // a $$ that opens a display formula
        if (/^\s*\|/.test(line) || /^\s*<\/?[a-zA-Z!]/.test(line) || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line) || /^\s*\[[^\]]+\]:\s/.test(line) || !hasCJK(line)) return keep;
        const m = PREFIX.exec(line);
        return m && hasCJK(m[2]) ? { line, translate: { prefix: m[1], content: m[2], tail: m[3] } } : keep;
    });
}

// ---- Front matter ----
export function splitFrontMatter(text) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    return m ? { front: m[1], body: text.slice(m[0].length), has: true } : { front: '', body: text, has: false };
}
const quote = value => JSON.stringify(value);
const FRONT_STRINGS = ['title', 'description'], FRONT_LISTS = ['tags', 'categories', 'series'];
// The strings of the front matter that need translating: { strings: [...], rewrite(map) → new front matter }.
export function frontMatterPlan(front) {
    const lines = front.split('\n'), strings = [];
    const parsed = lines.map(line => {
        const m = /^(\w+):\s*(.*?)\s*$/.exec(line);
        if (!m) return { line };
        const [, key, value] = m;
        if (FRONT_STRINGS.includes(key) && value && hasCJK(value)) { const text = value.replace(/^["']|["']$/g, ''); strings.push(text); return { key, line, text }; }
        if (FRONT_LISTS.includes(key) && /^\[.*\]$/.test(value)) {
            let list; try { list = JSON.parse(value); } catch { return { line }; }
            for (const item of list) if (typeof item === 'string' && hasCJK(item)) strings.push(item);
            return { key, line, list };
        }
        return { line, key };
    });
    return {
        strings: [...new Set(strings)],
        rewrite: map => {
            let drafted = false;
            const out = parsed.map(p => {
                if (p.text !== undefined) return `${p.key}: ${quote(map.get(p.text) ?? p.text)}`;
                if (p.list) return `${p.key}: ${JSON.stringify(p.list.map(item => map.get(item) ?? item))}`;
                if (p.key === 'draft') { drafted = true; return 'draft: true'; }
                return p.line;
            });
            if (!drafted) out.push('draft: true');
            return out.join('\n');
        },
    };
}

// ---- Structure check ----
export function structure(text) {
    const lines = text.split('\n');
    return {
        lines: lines.length,
        fences: lines.filter(l => /^\s*(`{3,}|~{3,})/.test(l)).length,
        images: (text.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length,
        links: (text.match(/\]\([^)]*\)/g) ?? []).length,
        headings: lines.filter(l => /^#{1,6}\s/.test(l)).map(l => l.match(/^#+/)[0].length).join(','),
        math: (text.match(/\$\$/g) ?? []).length + (text.match(/\\\(|\\\[/g) ?? []).length,
        codeSpans: (text.match(/`/g) ?? []).length,
        quotes: lines.filter(l => /^\s*>/.test(l)).length,
        listItems: lines.filter(l => /^\s*([-*+]|\d+[.)])\s/.test(l)).length,
    };
}
export const sameStructure = (a, b) => JSON.stringify(structure(a)) === JSON.stringify(structure(b));

// ---- A post ----
// translate(htmlStrings) → Promise<string[]>. termMap: Map of front matter strings to English (shared by all posts).
export async function translatePost(text, { translate, terms = new Map() }) {
    const { front, body, has } = splitFrontMatter(text);
    const plan = frontMatterPlan(front);
    const classified = classifyLines(body);
    const jobs = [];   // { index, tokens } for the lines that are sent
    const sent = [];
    classified.forEach((c, index) => { if (c.translate) { const { html, tokens } = protectInline(c.translate.content); jobs.push({ index, tokens }); sent.push(html); } });
    const need = plan.strings.filter(s => !terms.has(s));
    const answers = await translate([...sent, ...need]);
    if (answers.length !== sent.length + need.length) throw new Error('the translator returned a different number of answers');
    need.forEach((s, i) => terms.set(s, decodeHtml(answers[sent.length + i]).replace(/\s*\n\s*/g, ' ').trim()));
    const kept = [];   // lines whose translation was unusable stay in Chinese
    const out = classified.map(c => c.line);
    jobs.forEach((job, i) => {
        const restored = restoreInline(answers[i], job.tokens);
        const { prefix, tail } = classified[job.index].translate;
        if (restored === null) { kept.push(job.index + 1 + (has ? front.split('\n').length + 2 : 0)); return; }
        out[job.index] = `${prefix}${restored}${tail}`;
    });
    const translatedBody = out.join('\n');
    const ok = sameStructure(body, translatedBody);
    return { text: has ? `---\n${plan.rewrite(terms)}\n---\n${translatedBody}` : translatedBody, ok, kept, sent: sent.length, chars: sent.join('').length + need.join('').length, remainingCJK: classified.filter(c => !c.translate && hasCJK(c.line)).length };
}

// ---- Translator ----
async function call({ base, key, region, route, body, attempts = 6, backoff = 2000, fetcher = fetch }) {
    const headers = { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/json' };
    if (region) headers['Ocp-Apim-Subscription-Region'] = region;
    for (let attempt = 1; ; attempt++) {
        let response;
        try { response = await fetcher(`${base}${route}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) }); }
        catch (error) { if (attempt === attempts) throw new Error(`network error: ${error.cause?.code ?? error.message}`); }
        if (response?.ok) return response.json();
        if (response && ![429, 500, 502, 503].includes(response.status)) throw new Error(`Translator answered HTTP ${response.status}`);
        if (attempt === attempts) throw new Error(`Translator kept answering HTTP ${response?.status ?? 'nothing'}`);
        await new Promise(r => setTimeout(r, Math.min(30000, backoff * 2 ** (attempt - 1))));
    }
}
// Sends HTML strings in requests of at most 40 strings and 30,000 characters; the same string is sent once.
export function makeTranslator(request) {
    const cache = new Map();
    return async texts => {
        const todo = [...new Set(texts.filter(t => !cache.has(t)))];
        for (let i = 0; i < todo.length;) {
            let size = 0; const batch = [];
            while (i < todo.length && batch.length < 40 && (size + todo[i].length <= 30000 || !batch.length)) { batch.push(todo[i]); size += todo[i].length; i += 1; }
            const answer = await request('/translate?api-version=3.0&from=zh-Hans&to=en&textType=html', batch.map(Text => ({ Text })));
            batch.forEach((t, k) => cache.set(t, answer[k].translations[0].text));
        }
        return texts.map(t => cache.get(t));
    };
}

async function findPosts(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...await findPosts(full));
        else if (/\.md$/.test(entry.name) && !/\.(en|zh-cn)\.md$/.test(entry.name) && entry.name !== '_index.md') out.push(full);
    }
    return out.sort();
}
const englishPath = file => file.replace(/\.md$/, '.en.md');

async function main(argv) {
    const flag = name => { const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1]; };
    const force = argv.includes('--force'), drafts = argv.includes('--drafts'), dry = argv.includes('--dry-run') || argv.includes('--list'), only = flag('--only');
    const EXCLUDE = ['PEP8和PEP257中文翻译版'];   // already a translation of an English document
    const posts = [];
    for (const file of await findPosts(path.join(root, 'content/post'))) {
        const rel = path.relative(root, file);
        if (only && !rel.includes(only)) continue;
        if (EXCLUDE.some(x => rel.includes(x))) continue;
        const text = await readFile(file, 'utf8'), { front } = splitFrontMatter(text);
        const isDraft = /^draft:\s*true\s*$/m.test(front);
        if (isDraft && !drafts) continue;
        posts.push({ file, rel, text, have: await exists(englishPath(file)) });
    }
    let chars = 0;
    for (const p of posts) { const c = classifyLines(splitFrontMatter(p.text).body).filter(x => x.translate); p.sentChars = c.reduce((n, x) => n + x.translate.content.length, 0); p.lines = c.length; chars += p.sentChars; console.log(`${p.have ? 'has ' : 'new '} ${String(p.sentChars).padStart(6)} chars ${String(p.lines).padStart(4)} lines  ${p.rel}`); }
    console.log(`${posts.length} posts, about ${chars} characters of prose to translate.`);
    if (dry) return;
    const fromFile = (await exists(KEY_FILE)) ? parseEnvFile(await readFile(KEY_FILE, 'utf8')) : {};
    const get = name => process.env[name] || fromFile[name] || '';
    const key = get('AZURE_TRANSLATOR_KEY'), region = get('AZURE_TRANSLATOR_REGION'), base = (get('AZURE_TRANSLATOR_ENDPOINT') || 'https://api.cognitive.microsofttranslator.com').replace(/\/+$/, '');
    if (!key) throw new Error(`No key. Put AZURE_TRANSLATOR_KEY in ${KEY_FILE}, or in your shell.`);
    const translate = makeTranslator((route, body) => call({ base, key, region, route, body }).catch(error => { throw new Error(error.message.split(key).join('***')); }));
    const terms = new Map();
    let written = 0;
    for (const post of posts) {
        if (post.have && !force) { console.log(`skip ${post.rel} (has an English draft)`); continue; }
        const result = await translatePost(post.text, { translate, terms });
        if (!result.ok) { console.log(`FAILED ${post.rel}: the structure differs from the original, nothing written`); continue; }
        await writeFile(englishPath(post.file), result.text);
        written += 1;
        console.log(`done ${post.rel}: ${result.sent} lines${result.kept.length ? `, ${result.kept.length} left in Chinese (lines ${result.kept.join(', ')})` : ''}${result.remainingCJK ? `, ${result.remainingCJK} Chinese lines in code, tables or HTML left as they are` : ''}`);
    }
    console.log(`${written} English drafts written.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exit(1); });
