// What a learner has done: days practised, texts read and recited, words to review, sounds that score low.
// Pure functions over one plain object; the page owns the localStorage key.
// validateProgress keeps only the fields it knows, and refuses any other version, so a newer archive is never rewritten by this page.
import { PHONEME_TIPS, phonemeKey } from './phoneme-tips.mjs';

export const PROGRESS_KEY = 'hive-english-progress-v1';
// Days until a word comes back: after a good review it moves one step along.
export const GAPS = [1, 3, 7, 14, 30];
const LIMIT = { days: 800, texts: 500, words: 400, ids: 60 };
export const WORD_LIMIT = LIMIT.words;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WORD = /^[a-z][a-z'-]{0,40}$/;
const own = (object, key) => Object.hasOwn(object, key);
const score = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;

export const dayOf = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function addDays(day, n) { const [y, m, d] = day.split('-').map(Number); return dayOf(new Date(y, m - 1, d + n)); }
export const fresh = () => ({ version: 1, days: {}, texts: {}, words: {}, phonemes: {} });
export const wordKey = text => String(text).toLowerCase().replace(/’/g, "'").replace(/[^a-z'-]/g, '');

// Returns a clean copy or throws. A newer version or damaged data throws, so the caller can refuse to overwrite it.
export function validateProgress(raw) {
    const bad = () => { throw new Error('学习档案损坏或版本较新，原数据已保留。请先导出备份。'); };
    if (!raw || raw.version !== 1) bad();
    const out = fresh();
    for (const part of ['days', 'texts', 'words', 'phonemes']) if (!raw[part] || typeof raw[part] !== 'object' || Array.isArray(raw[part])) bad();
    if (Object.keys(raw.days).length > LIMIT.days || Object.keys(raw.texts).length > LIMIT.texts || Object.keys(raw.words).length > LIMIT.words || Object.keys(raw.phonemes).length > 60) bad();
    for (const [day, d] of Object.entries(raw.days)) {
        if (!DAY.test(day) || !d || typeof d.seconds !== 'number' || !(d.seconds >= 0 && d.seconds <= 86400) || !Array.isArray(d.texts) || d.texts.length > LIMIT.ids || !d.texts.every(t => typeof t === 'string' && ID.test(t) && t.length <= 60)) bad();
        out.days[day] = { seconds: d.seconds, texts: [...new Set(d.texts)] };
    }
    for (const [id, t] of Object.entries(raw.texts)) {
        if (!ID.test(id) || id.length > 60 || !t || !Number.isInteger(t.reads) || t.reads < 0 || t.reads > 1e6 || !(t.best === null || score(t.best)) || !Number.isInteger(t.recited) || t.recited < 0 || t.recited > 3 || !(t.last === null || DAY.test(t.last))) bad();
        out.texts[id] = { reads: t.reads, best: t.best, recited: t.recited, last: t.last };
    }
    for (const [word, w] of Object.entries(raw.words)) {
        if (!WORD.test(word) || !w || !DAY.test(w.due) || !DAY.test(w.added) || !Number.isInteger(w.step) || w.step < 0 || w.step >= GAPS.length || typeof w.source !== 'string' || w.source.length > 60 || (w.source && !ID.test(w.source))) bad();
        out.words[word] = { due: w.due, step: w.step, source: w.source, added: w.added };
    }
    for (const [key, p] of Object.entries(raw.phonemes)) {
        if (!own(PHONEME_TIPS, key) || !p || !Array.isArray(p.recent) || p.recent.length > 3 || !p.recent.every(score)) bad();
        out.phonemes[key] = { recent: [...p.recent] };
    }
    return out;
}
// writable is false when something is stored but cannot be read; the page must then not save over it.
export function loadProgress(storage) {
    let raw;
    try { raw = storage.getItem(PROGRESS_KEY); } catch { return { progress: fresh(), writable: false }; }
    if (raw === null) return { progress: fresh(), writable: true };
    try { return { progress: validateProgress(JSON.parse(raw)), writable: true }; } catch { return { progress: fresh(), writable: false }; }
}
export function saveProgress(storage, progress) { storage.setItem(PROGRESS_KEY, JSON.stringify(validateProgress(progress))); }

function entry(p, id) {
    if (!own(p.texts, id)) { if (Object.keys(p.texts).length >= LIMIT.texts) return null; p.texts[id] = { reads: 0, best: null, recited: 0, last: null }; }
    return p.texts[id];
}
// One finished recording: the day counts as practised, and the text counts as visited.
export function recordClip(p, { day, seconds, workId = null }) {
    if (!own(p.days, day)) {
        p.days[day] = { seconds: 0, texts: [] };
        const old = Object.keys(p.days).sort();
        while (old.length > LIMIT.days) delete p.days[old.shift()];
    }
    const d = p.days[day];
    d.seconds = Math.min(86400, Math.round((d.seconds + Math.max(0, seconds)) * 10) / 10);
    if (workId && !d.texts.includes(workId) && d.texts.length < LIMIT.ids) d.texts.push(workId);
    return p;
}
export function recordFinished(p, id, day) { const t = entry(p, id); if (t) { t.reads += 1; t.last = day; } return p; }
export function recordBest(p, id, value) { const t = entry(p, id); if (t && score(value)) t.best = Math.max(t.best ?? 0, Math.round(value)); return p; }
export function recordRecited(p, id, level) { const t = entry(p, id); if (t) t.recited = Math.max(t.recited, Math.min(3, level)); return p; }

export const hasWord = (p, text) => own(p.words, wordKey(text));
export function addWord(p, text, source, day) {
    const key = wordKey(text);
    if (!WORD.test(key) || own(p.words, key) || Object.keys(p.words).length >= LIMIT.words) return false;
    p.words[key] = { due: addDays(day, 1), step: 0, source: source ?? '', added: day };
    return true;
}
export function removeWord(p, text) { delete p.words[wordKey(text)]; return p; }
export function dueWords(p, day, limit = 10) {
    return Object.entries(p.words).filter(([, w]) => w.due <= day).sort(([a, x], [b, y]) => (x.due < y.due ? -1 : x.due > y.due ? 1 : a < b ? -1 : 1)).slice(0, limit).map(([key, w]) => ({ key, ...w }));
}
// A word you knew moves one step out; one you did not know comes back tomorrow.
export function reviewWord(p, key, good, day) {
    if (!own(p.words, key)) return p;
    const w = p.words[key];
    w.step = good ? Math.min(w.step + 1, GAPS.length - 1) : 0;
    w.due = addDays(day, GAPS[w.step]);
    return p;
}
// Scored words feed the queue: a word that is due and reads well moves on; one that reads badly comes back.
export function applyScores(p, words, day) {
    let changed = 0;
    for (const w of words) {
        const key = wordKey(w.text);
        if (!own(p.words, key) || p.words[key].due > day || typeof w.accuracy !== 'number') continue;
        if (w.accuracy >= 85) { reviewWord(p, key, true, day); changed++; }
        else if (w.accuracy < 70) { reviewWord(p, key, false, day); changed++; }
    }
    return changed;
}
// Keeps the last three scores per sound (American English sound names only).
export function recordPhonemes(p, words) {
    for (const w of words) for (const ph of w.phonemes ?? []) {
        const key = phonemeKey(ph.text);
        if (!own(PHONEME_TIPS, key) || !score(ph.accuracy)) continue;
        const entry = own(p.phonemes, key) ? p.phonemes[key] : (p.phonemes[key] = { recent: [] });
        entry.recent = [...entry.recent, ph.accuracy].slice(-3);
    }
    return p;
}
export function weakSounds(p, below = 70, limit = 5) {
    return Object.entries(p.phonemes).map(([key, v]) => ({ key, ipa: PHONEME_TIPS[key].ipa, average: Math.round(v.recent.reduce((a, b) => a + b, 0) / v.recent.length), count: v.recent.length }))
        .filter(s => s.count > 0 && s.average < below).sort((a, b) => a.average - b.average || a.key.localeCompare(b.key)).slice(0, limit);
}

export function streakDays(p, today) {
    const practised = day => own(p.days, day) && p.days[day].seconds > 0;
    let day = practised(today) ? today : addDays(today, -1), count = 0;
    while (practised(day) && count < LIMIT.days) { count++; day = addDays(day, -1); }
    return count;
}
export const weekView = (p, today) => Array.from({ length: 7 }, (_, i) => { const day = addDays(today, i - 6); return { day, seconds: own(p.days, day) ? p.days[day].seconds : 0 }; });

// Union of two archives, for importing a backup. Nothing is deleted; numbers keep the larger value.
export function mergeProgress(a, b) {
    const out = validateProgress(a), other = validateProgress(b);
    for (const [day, d] of Object.entries(other.days)) {
        const mine = out.days[day] ?? (out.days[day] = { seconds: 0, texts: [] });
        mine.seconds = Math.max(mine.seconds, d.seconds); mine.texts = [...new Set([...mine.texts, ...d.texts])].slice(0, LIMIT.ids);
    }
    for (const [id, t] of Object.entries(other.texts)) {
        const mine = own(out.texts, id) ? out.texts[id] : null;
        out.texts[id] = !mine ? t : { reads: Math.max(mine.reads, t.reads), best: mine.best === null ? t.best : t.best === null ? mine.best : Math.max(mine.best, t.best), recited: Math.max(mine.recited, t.recited), last: [mine.last, t.last].filter(Boolean).sort().at(-1) ?? null };
    }
    for (const [word, w] of Object.entries(other.words)) if (!own(out.words, word) && Object.keys(out.words).length < LIMIT.words) out.words[word] = w;
    for (const [key, p] of Object.entries(other.phonemes)) out.phonemes[key] = { recent: [...(out.phonemes[key]?.recent ?? []), ...p.recent].slice(-3) };
    return validateProgress(out);
}
