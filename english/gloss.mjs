// Chinese reading aids: a machine translation of every unit (a sentence, or a clause or line of a poem), the part of it that
// Azure Translator aligned to each English word, and a dictionary of Chinese senses. All of it is generated once by
// tools/render-english-gloss.mjs and read from static/english/gloss/; this page never calls a translation service.
// Pure functions plus one loader; no storage.
import { workTextHash, tokenize } from './library.mjs';
import { unitsOf } from './voice.mjs';

// 'Lincoln’s' → "lincoln's": the key a word has in the dictionary and in the learner's word list.
export const glossKey = text => text.toLowerCase().replaceAll('’', "'").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');

const wordCount = unit => tokenize(unit.replace(/\s*\n\s*/g, ' ').trim()).filter(t => t.word).length;

// Returns the gloss when it fits this work as it is now, otherwise null (then no Chinese is shown).
export function checkGloss(gloss, work) {
    if (!gloss || gloss.version !== 1 || gloss.id !== work.id || gloss.textHash !== workTextHash(work) || !Array.isArray(gloss.segments) || gloss.segments.length !== work.segments.length) return null;
    for (const [s, segment] of work.segments.entries()) {
        const units = unitsOf(segment, work.kind), list = gloss.segments[s];
        if (!Array.isArray(list) || list.length !== units.length) return null;
        for (const [k, unit] of units.entries()) {
            const item = list[k];
            if (!item || typeof item.zh !== 'string' || !item.zh || !Array.isArray(item.w) || item.w.length !== wordCount(unit) || !item.w.every(w => typeof w === 'string')) return null;
        }
    }
    return gloss;
}
// The translation of one unit, or ''.
export const unitZh = (gloss, segment, unit) => gloss?.segments[segment]?.[unit]?.zh ?? '';
// The translation of a whole segment: its units one after the other.
export const segmentZh = (gloss, segment) => (gloss?.segments[segment] ?? []).map(item => item.zh).join('');
// What the page can say about the n-th word of a unit: the Chinese aligned to it in this sentence, and the dictionary's senses.
export function wordHelp(gloss, dictionary, segment, unit, n, text) {
    const here = gloss?.segments[segment]?.[unit]?.w[n] ?? '';
    const key = glossKey(text), senses = dictionary && Object.hasOwn(dictionary.words, key) ? dictionary.words[key] : null;
    return { here, senses };
}
// [['v.', '出现', '起身'], ['n.', '…']] → 'v. 出现、起身；n. …'
export const sensesLine = senses => (senses ?? []).map(([pos, ...list]) => `${pos ? pos + ' ' : ''}${list.join('、')}`).join('；');

// Loads a work's gloss and the dictionary. base: import.meta.url of the caller. Resolves to null when there is none or it does not fit.
let indexRequest, dictionaryRequest;
const fetchJSON = async url => { const response = await fetch(url, { cache: 'no-cache' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); };
export async function loadGloss(work, base) {
    indexRequest ??= fetchJSON(new URL('gloss/index.json', base)).catch(() => null);
    const index = await indexRequest, entry = index?.works?.[work.id];
    if (!entry) return null;
    try { return checkGloss(await fetchJSON(new URL(`gloss/${work.id}.json?v=${entry.rev}`, base)), work); } catch { return null; }
}
export async function loadDictionary(base) {
    dictionaryRequest ??= (async () => {
        const index = await (indexRequest ??= fetchJSON(new URL('gloss/index.json', base)).catch(() => null));
        if (!index?.dictionary) return null;
        try { const dictionary = await fetchJSON(new URL(`gloss/dictionary.json?v=${index.dictionary.rev}`, base)); return dictionary?.version === 1 && dictionary.words ? dictionary : null; } catch { return null; }
    })();
    return dictionaryRequest;
}
