// Turns the segments of one reading into a report. Pure: the page passes in what it measured and what the service returned.
import { spokenWords, wordsCorrectPerMinute } from './align.mjs';
import { tipFor, weakPhonemes, phonemeKey, PHONEME_TIPS } from './phoneme-tips.mjs';

const HARD_BELOW = 70;
const mean = (pairs, pick) => {
    let total = 0, weight = 0;
    for (const [value, w] of pairs.map(p => [pick(p), p.weight])) if (typeof value === 'number') { total += value * w; weight += w; }
    return weight ? Math.round(total / weight) : null;
};
// items: [{ id, text, seconds, locale, local: { marks, hits, total } | null, azure: parsed result | null }]
// The sound tips are written for American English, so items scored against another accent get none.
export function buildReport(items) {
    const seconds = items.reduce((n, i) => n + (i.seconds || 0), 0);
    const heard = items.filter(i => i.local && i.local.total > 0);
    const hits = heard.reduce((n, i) => n + i.local.hits, 0), total = heard.reduce((n, i) => n + i.local.total, 0);
    const heardSeconds = heard.reduce((n, i) => n + (i.seconds || 0), 0);
    const scored = items.filter(i => i.azure).map(i => ({ ...i.azure, weight: i.azure.words.length, id: i.id, tips: (i.locale ?? 'en-US') === 'en-US' }));
    const lowest = (word, tips) => {
        if (!tips) return null;
        const worst = (word.phonemes ?? []).filter(p => typeof p.accuracy === 'number' && Object.hasOwn(PHONEME_TIPS, phonemeKey(p.text))).sort((a, b) => a.accuracy - b.accuracy)[0];
        return worst && worst.accuracy < HARD_BELOW ? { key: phonemeKey(worst.text), accuracy: worst.accuracy, ipa: tipFor(worst.text).ipa, tip: tipFor(worst.text).zh } : null;
    };
    const seen = new Map();
    for (const result of scored) for (const w of result.words) {
        if (w.error === 'Omission' || w.error === 'Insertion') continue;
        const hard = w.error === 'Mispronunciation' || (typeof w.accuracy === 'number' && w.accuracy < HARD_BELOW);
        const key = w.text.toLowerCase().replace(/[^a-z']/g, '');
        if (!hard || !key) continue;
        const entry = { text: w.text.replace(/[^A-Za-z'’-]/g, ''), accuracy: w.accuracy, error: w.error, weakest: lowest(w, result.tips), segment: result.id };
        const old = seen.get(key);
        if (!old || (entry.accuracy ?? 0) < (old.accuracy ?? 0)) seen.set(key, entry);
    }
    return {
        segments: items.length, seconds,
        local: total ? { hitRate: hits / total, wcpm: wordsCorrectPerMinute(hits, heardSeconds), segmentsHeard: heard.length } : null,
        // Words the recognizer never heard. Dictation is noisy, so the page calls these "check these", not mistakes.
        notHeard: heard.flatMap(i => { const ref = spokenWords(i.text); return i.local.marks.flatMap((m, k) => m === 'hit' ? [] : [ref[k]]); }),
        azure: scored.length ? {
            segments: scored.length,
            pronunciation: mean(scored, r => r.scores.pronunciation), accuracy: mean(scored, r => r.scores.accuracy), fluency: mean(scored, r => r.scores.fluency),
            completeness: mean(scored, r => r.scores.completeness), prosody: mean(scored, r => r.scores.prosody),
            monotone: scored.filter(r => r.monotone).length,
            unexpectedBreaks: scored.reduce((n, r) => n + r.words.filter(w => w.breakBefore === 'unexpected').length, 0),
        } : null,
        hardWords: [...seen.values()].sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0)).slice(0, 8),
        weakPhonemes: weakPhonemes(scored.filter(r => r.tips).flatMap(r => r.words)),
    };
}
