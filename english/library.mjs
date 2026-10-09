// Pure library helpers: no browser APIs, so tools/ and tests/ import them directly.
import { wordCount } from './core.mjs';
export const KINDS = { poem: '诗歌', prose: '散文', speech: '演讲', fiction: '小说', letter: '书信', lesson: '情景课' };
export const LEVELS = ['A2', 'B1', 'B2', 'C1'];
// Sunday … Saturday. Poems come three times a week because they are short.
export const ROTATION = ['speech', 'poem', 'prose', 'fiction', 'poem', 'letter', 'poem'];
// A recording is at most 25 s and Azure scoring takes 30 s: 40 words is 20-24 s at the pace of careful reading (100-120 words a minute).
export const MAX_SEGMENT_WORDS = 40;
const WORDS_PER_MINUTE = 120;
export const estimateSeconds = words => Math.max(1, Math.round(words / WORDS_PER_MINUTE * 60));
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const text = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.length <= max;

export function validateWork(work) {
    const fail = reason => { throw new Error(`作品 ${work?.id ?? '?'} 无效：${reason}`); };
    if (!work || work.version !== 1) fail('版本');
    if (typeof work.id !== 'string' || work.id.length > 60 || !ID.test(work.id)) fail('id');
    if (!Object.hasOwn(KINDS, work.kind)) fail('kind');
    if (!text(work.title, 1, 120) || !text(work.author, 1, 80)) fail('标题或作者');
    if (!Number.isInteger(work.year) || work.year < 1500 || work.year > 2100) fail('年份');
    if (!LEVELS.includes(work.level)) fail('难度');
    if (!text(work.rights, 10, 300) || !text(work.source?.name, 1, 120)) fail('出处或版权依据');
    if (!text(work.intro, 30, 400)) fail('导读需 30–400 字');
    if (!Array.isArray(work.tips) || work.tips.length > 3 || !work.tips.every(t => text(t, 1, 120))) fail('朗读提示');
    if (!work.glossary || typeof work.glossary !== 'object' || Array.isArray(work.glossary) || !Object.entries(work.glossary).every(([k, v]) => /^[a-z'-]+$/.test(k) && text(v, 1, 80))) fail('生词表');
    if (!Array.isArray(work.segments) || !work.segments.length || work.segments.length > 60) fail('分段数量');
    // A dialogue lesson has two roles, and every segment says who speaks it. Nothing else has speakers.
    if (work.roles !== undefined && (work.kind !== 'lesson' || !Array.isArray(work.roles) || work.roles.length !== 2 || !work.roles.every(r => text(r, 1, 24)) || work.roles[0] === work.roles[1])) fail('角色');
    if (work.human !== undefined) {
        const h = work.human;
        if (!h || !/^human\/[a-z0-9-]+\.mp3$/.test(h.src) || !text(h.credit, 1, 200) || !/^https:\/\/archive\.org\/details\/[A-Za-z0-9_.-]{1,100}$/.test(h.url) || !Number.isInteger(h.seconds) || h.seconds < 5 || h.seconds > 900) fail('真人朗读');
    }
    const ids = new Set(); let words = 0;
    for (const s of work.segments) {
        if (work.roles ? !work.roles.includes(s?.speaker) : s?.speaker !== undefined) fail(`分段 ${s?.id} 的说话人`);
        if (!s || typeof s.id !== 'string' || !/^s\d{1,3}$/.test(s.id) || ids.has(s.id)) fail('分段 id');
        ids.add(s.id);
        if (typeof s.text !== 'string' || !/[a-z]/i.test(s.text) || s.text !== s.text.trim() || s.text.length > 600) fail(`分段 ${s.id} 文本`);
        const n = wordCount(s.text);
        if (n > MAX_SEGMENT_WORDS) fail(`分段 ${s.id} 超过 ${MAX_SEGMENT_WORDS} 词`);
        words += n;
    }
    if (work.words !== words || work.seconds !== estimateSeconds(words)) fail('词数或时长与分段不符');
    const spoken = new Set(tokenize(work.segments.map(s => s.text).join(' ').toLowerCase().replaceAll('’', "'")).filter(t => t.word).map(t => t.text));
    for (const word of Object.keys(work.glossary)) if (!spoken.has(word)) fail(`生词 ${word} 不在原文中`);
    return work;
}
// FNV-1a: stable across engines, so the same text always gets the same fingerprint and the same sort order.
const hash = value => { let h = 2166136261; for (const c of value) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
// `rev` changes whenever the work file changes, so the page can fetch it with a fresh cache key.
export function indexEntry(work) {
    return { id: work.id, kind: work.kind, title: work.title, author: work.author, year: work.year, level: work.level, words: work.words, seconds: work.seconds, segments: work.segments.length, rev: hash(JSON.stringify(work)).toString(36) };
}
export function validateIndex(index) {
    if (!index || index.version !== 1 || !Array.isArray(index.works)) throw new Error('文库索引无效。');
    const ids = new Set();
    for (const w of index.works) {
        if (!w || typeof w.id !== 'string' || !ID.test(w.id) || ids.has(w.id) || !Object.hasOwn(KINDS, w.kind) || !LEVELS.includes(w.level) || !text(w.title, 1, 120) || !/^[a-z0-9]{1,10}$/.test(w.rev)) throw new Error('文库索引条目无效。');
        ids.add(w.id);
    }
    return index;
}

// A fingerprint of the words of a work, so audio rendered from an older text is never played against a newer one.
export const workTextHash = work => hash(work.segments.map(s => s.text).join('\n')).toString(36);
export function todaysPick(works, day, skip = 0) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    if (!match) throw new Error('日期格式应为 YYYY-MM-DD。');
    const [y, m, d] = match.slice(1).map(Number);
    const weekday = new Date(y, m - 1, d).getDay();
    const kind = ROTATION[weekday];
    const pool = works.filter(w => w.kind === kind).sort((a, b) => hash(a.id) - hash(b.id) || (a.id < b.id ? -1 : 1));
    if (!pool.length) return null;
    // Count how many days of this kind have passed, so the pool is used up before any work repeats.
    const perWeek = ROTATION.filter(k => k === kind).length;
    const earlier = ROTATION.slice(0, weekday).filter(k => k === kind).length;
    const week = Math.floor(Date.UTC(y, m - 1, d) / 86400000 / 7);
    return pool[(week * perWeek + earlier + skip) % pool.length];
}

const TOKEN = /[A-Za-z0-9]+(?:['’][A-Za-z]+)*(?:-[A-Za-z0-9]+)*|[^A-Za-z0-9]+/g;
// Words and the gaps between them, with character offsets so speech boundary events can find a word.
export function tokenize(source) {
    const out = [];
    for (const m of source.matchAll(TOKEN)) out.push({ text: m[0], word: /[A-Za-z0-9]/.test(m[0]), start: m.index });
    return out;
}
const ABBREVIATION = /\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|Mt|vs|etc|No)\.$/;
function splitLong(sentence) {
    if (wordCount(sentence) <= MAX_SEGMENT_WORDS) return [sentence];
    // Pieces end at a comma, semicolon, colon or dash, with any spaces that follow; joined again they give back the sentence.
    const out = []; let current = '';
    for (const piece of sentence.match(/[^,;:—]+(?:[,;:—]+\s*)?/g)) {
        if (current && wordCount(current + piece) > MAX_SEGMENT_WORDS) { out.push(current.trim()); current = ''; }
        current += piece;
    }
    if (current.trim()) out.push(current.trim());
    return out;
}
export function sentences(source) {
    const flat = source.replace(/\s+/g, ' ').trim();
    const out = []; let start = 0;
    for (const m of flat.matchAll(/[.!?]["')\]]*(?=\s+["'(\[]?[A-Z])/g)) {
        const end = m.index + m[0].length;
        if (ABBREVIATION.test(flat.slice(start, end))) continue;
        out.push(flat.slice(start, end).trim()); start = end;
    }
    if (flat.slice(start).trim()) out.push(flat.slice(start).trim());
    return out.flatMap(splitLong);
}
// Scoring and speech take a unit as one line of text; the line breaks only matter on screen.
export const flatten = unit => unit.replace(/\s*\n\s*/g, ' ');
const CLAUSE_END = /[.;:!?]["')\]]*$/;
// Poem lines are grouped into whole sentences or clauses, because a sentence often runs over the end of a line.
// A group also ends after four lines at a comma, and before it would pass the word limit.
function poemUnits(lines) {
    const out = []; let part = [];
    const flush = () => { if (part.length) out.push(part.join('\n')); part = []; };
    for (const line of lines) {
        if (part.length && wordCount([...part, line].join(' ')) > MAX_SEGMENT_WORDS) flush();
        part.push(line);
        if (CLAUSE_END.test(line) || (part.length >= 4 && /,["')\]]*$/.test(line))) flush();
    }
    flush();
    return out;
}
// The units a learner follows one by one: a sentence of prose, a sentence or clause of a poem (or one line if byLine), a whole lesson segment.
export function splitUnits(segmentText, kind, { byLine = false } = {}) {
    if (kind === 'lesson') return [segmentText];
    if (kind === 'poem') { const lines = segmentText.split('\n').map(l => l.trim()).filter(l => /[A-Za-z]/.test(l)); return byLine ? lines : poemUnits(lines); }
    return sentences(segmentText);
}
// Build-time grouping of a whole text into segments of at most MAX_SEGMENT_WORDS words.
export function splitSegments(source, kind) {
    const out = []; let current = []; let words = 0;
    const flush = () => { if (current.length) out.push(current.join(kind === 'poem' ? '\n\n' : ' ')); current = []; words = 0; };
    const add = (piece, glue) => {
        const n = wordCount(piece);
        if (words && words + n > MAX_SEGMENT_WORDS) flush();
        current.push(piece); words += n;
        if (glue) flush();
    };
    for (const block of source.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)) {
        if (kind === 'poem') {
            const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
            if (wordCount(block) <= MAX_SEGMENT_WORDS) { add(lines.join('\n')); continue; }
            // A stanza that is too long is cut after the last line that ends a sentence or clause, so a segment rarely stops mid-sentence.
            let part = [];
            for (const line of lines) {
                if (part.length && wordCount([...part, line].join(' ')) > MAX_SEGMENT_WORDS) {
                    const cut = part.findLastIndex(l => /[.;:!?]["']?$/.test(l)) + 1 || part.length;
                    add(part.slice(0, cut).join('\n')); flush(); part = part.slice(cut);
                }
                part.push(line);
            }
            if (part.length) add(part.join('\n'));
        } else {
            for (const s of sentences(block)) add(s);
            if (words >= 25) flush();
        }
    }
    flush();
    return out;
}
