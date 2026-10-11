// Pronunciation clips for single words, made once with an Azure HD voice by tools/render-english-words.mjs and listed in
// words/index.json. The page plays a clip when a word is tapped and falls back to the device voice when a word has none.
// Pure functions plus one loader; no storage.
let indexRequest;
const fetchJSON = async url => { const response = await fetch(url, { cache: 'no-cache' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); };

// base: import.meta.url of the caller. Resolves to { rev, sets: { accent: Set of words } }, or null when there is no (usable) list.
export async function loadWordIndex(base) {
    indexRequest ??= fetchJSON(new URL('words/index.json', base)).catch(() => null);
    const raw = await indexRequest;
    if (!raw || raw.version !== 1 || !raw.words || typeof raw.words !== 'object' || !raw.rev) return null;
    return { rev: raw.rev, sets: Object.fromEntries(Object.entries(raw.words).filter(([, list]) => Array.isArray(list)).map(([accent, list]) => [accent, new Set(list)])) };
}
// The address of a word's clip in an accent, or null when there is none. key: the word as the learner's word list writes it ("don't").
export const wordClip = (index, accent, key, base) => index?.sets[accent]?.has(key) ? new URL(`words/${accent}/${encodeURIComponent(key)}.mp3?v=${index.rev}`, base).href : null;
