// Word times for a volunteer's recording: what a recognizer heard (with a start and an end for each word) is lined up with the
// words of the work's text, in order. A recording is not the same text as the page (it has an introduction and an ending, and a
// recognizer mishears words), so only words that were heard where the text expects them get a time; the others get null and are not lit.
// Pure functions, no browser APIs. The recognizer call and the files are in tools/render-english-human.mjs.
import { tokenize, workTextHash } from './library.mjs';
import { normalize } from './align.mjs';

export const MIN_COVERAGE = 0.9;   // a recording where fewer of the text's words were found gets no highlighting at all

// The words of each segment, normalized: [[ 'hope', 'is', ... ], ...]
export const segmentKeys = work => work.segments.map(segment => tokenize(segment.text).filter(t => t.word).map(t => normalize(t.text)));

// heard: [{ text, startMs, endMs }]. "bee loud" heard for the text's "bee-loud" becomes one word that spans both.
function mergeHeard(heard, known) {
    const out = [];
    for (let i = 0; i < heard.length; i++) {
        const a = heard[i], b = heard[i + 1];
        if (b && known.has(a.key + b.key) && !(known.has(a.key) && known.has(b.key))) { out.push({ key: a.key + b.key, startMs: a.startMs, endMs: b.endMs }); i += 1; }
        else out.push(a);
    }
    return out;
}

// Returns { segments: [[[start, end] | null, ...], ...], found, total }.
export function alignRecording(work, heard) {
    const keys = segmentKeys(work), flat = keys.flat(), known = new Set(flat);
    const words = mergeHeard(heard.map(h => ({ key: normalize(String(h.text).replace(/[^A-Za-z0-9'’-]/g, '')), startMs: h.startMs, endMs: h.endMs })).filter(h => h.key), known);
    const n = flat.length, m = words.length;
    const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i][j] = flat[i] === words[j].key ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    const at = new Array(n).fill(null);
    // Walk the table from the start. A heard word that costs nothing to skip is skipped first, so that a title read out before the text
    // (the same words as its first line) is not taken for the text itself.
    for (let i = 0, j = 0; i < n && j < m;) {
        if (table[i][j + 1] === table[i][j]) j += 1;
        else if (table[i + 1][j] === table[i][j]) i += 1;
        else { at[i] = [words[j].startMs, Math.max(words[j].endMs, words[j].startMs)]; i += 1; j += 1; }
    }
    let k = 0;
    const segments = keys.map(list => list.map(() => at[k++]));
    const found = at.filter(Boolean).length;
    return { segments, found, total: n };
}

// The file for one recording, or null when too few of the text's words were found.
export function buildTimeline(work, heard, seconds) {
    const { segments, found, total } = alignRecording(work, heard);
    if (!total || found / total < MIN_COVERAGE) return null;
    return { version: 1, id: work.id, textHash: workTextHash(work), source: 'Azure fast transcription', seconds, found, total, segments };
}

// The timeline when it fits the text it was made from (same text, same number of words in every segment, times in order), otherwise null.
export function checkHumanTimeline(timeline, work) {
    const t = timeline;
    if (!t || t.version !== 1 || t.id !== work.id || t.textHash !== workTextHash(work) || !Array.isArray(t.segments) || t.segments.length !== work.segments.length) return null;
    const keys = segmentKeys(work);
    let last = -1, found = 0;
    for (const [s, list] of keys.entries()) {
        const times = t.segments[s];
        if (!Array.isArray(times) || times.length !== list.length) return null;
        for (const w of times) {
            if (w === null) continue;
            if (!Array.isArray(w) || w.length !== 2 || !(w[0] >= last) || !(w[1] >= w[0])) return null;
            last = w[0]; found += 1;
        }
    }
    return found / keys.flat().length >= MIN_COVERAGE ? t : null;
}

// The word being said at a moment: [segment, word], or null before the first word and after the last. A pause keeps the last word lit.
export function humanWordAt(timeline, ms) {
    let found = null;
    for (const [s, list] of timeline.segments.entries()) for (const [n, w] of list.entries()) { if (!w) continue; if (ms >= w[0]) found = [s, n]; else return found; }
    return found && ms <= lastEnd(timeline) + 400 ? found : null;
}
const lastEnd = timeline => { let end = 0; for (const list of timeline.segments) for (const w of list) if (w) end = Math.max(end, w[1]); return end; };

// Loads a recording's word times. base: import.meta.url of the caller. Resolves to null when there are none or they do not fit the text.
let indexRequest;
const fetchJSON = async url => { const response = await fetch(url, { cache: 'no-cache' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); };
export async function loadHumanTimeline(work, base) {
    indexRequest ??= fetchJSON(new URL('human/index.json', base)).catch(() => null);
    const entry = (await indexRequest)?.works?.[work.id];
    if (!entry) return null;
    try { return checkHumanTimeline(await fetchJSON(new URL(`human/${work.id}.json?v=${entry.rev}`, base)), work); } catch { return null; }
}
