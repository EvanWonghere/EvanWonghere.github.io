// Compare what a recognizer heard with the reference text, word by word. Pure functions, no browser APIs.
// Dictation is noisy, so everything here is a hint about words, never a pronunciation score.
import { tokenize } from './library.mjs';

// Lower case, no apostrophes or hyphens: "Don't" and "dont", "bee-loud" and "beeloud" compare equal.
export const normalize = word => word.toLowerCase().replace(/['’-]/g, '');
export const spokenWords = text => tokenize(text).filter(t => t.word).map(t => normalize(t.text));

// "bee loud" heard for the reference word "bee-loud": join two heard words when together they make one reference word.
function mergeHeard(heard, reference) {
    const known = new Set(reference);
    const out = [];
    for (let i = 0; i < heard.length; i++) {
        const joined = heard[i + 1] !== undefined ? heard[i] + heard[i + 1] : null;
        if (joined && known.has(joined) && !(known.has(heard[i]) && known.has(heard[i + 1]))) { out.push(joined); i += 1; }
        else out.push(heard[i]);
    }
    return out;
}

// marks[i] is 'hit' (heard in order), 'swap' (another word stands where it should be) or 'miss' (not heard).
// extra counts heard words that match nothing in the reference.
export function align(reference, heardText) {
    const ref = spokenWords(reference);
    const heard = mergeHeard(spokenWords(heardText), ref);
    const n = ref.length, m = heard.length;
    const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i][j] = ref[i] === heard[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    // Walk the table into a sequence: a word in both texts, a reference word nobody said, a heard word nobody asked for.
    const ops = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
        if (ref[i] === heard[j]) { ops.push('hit'); i++; j++; }
        else if (table[i + 1][j] >= table[i][j + 1]) { ops.push('ref'); i++; }
        else { ops.push('heard'); j++; }
    }
    while (i++ < n) ops.push('ref');
    while (j++ < m) ops.push('heard');
    // Between two hits, a missed reference word and an unused heard word are one word read as another.
    const marks = new Array(n);
    let at = 0, gapRefs = [], gapHeard = 0, extra = 0;
    const closeGap = () => {
        const pairs = Math.min(gapRefs.length, gapHeard);
        gapRefs.forEach((index, x) => { marks[index] = x < pairs ? 'swap' : 'miss'; });
        extra += gapHeard - pairs; gapRefs = []; gapHeard = 0;
    };
    for (const op of ops) {
        if (op === 'hit') { closeGap(); marks[at++] = 'hit'; }
        else if (op === 'ref') gapRefs.push(at++);
        else gapHeard++;
    }
    closeGap();
    const hits = marks.filter(x => x === 'hit').length;
    return { marks, extra, hits, total: n, hitRate: n ? hits / n : 0 };
}

// States for the words on screen while someone is still reading.
// A word is 'miss' or 'swap' only once a later word has been heard, so the word being read never turns red early.
// `cursor` is the index of the word to read next.
export function liveStates(reference, heardText) {
    const { marks } = align(reference, heardText);
    const lastHit = marks.lastIndexOf('hit');
    const states = marks.map((mark, k) => k > lastHit ? 'pending' : mark);
    const cursor = lastHit + 1;
    if (cursor < states.length) states[cursor] = 'now';
    return { states, cursor };
}

// Words read correctly per minute, the measure reading coaches use for fluency.
// A rate over a couple of seconds means nothing, so it is withheld below 3 s.
export const wordsCorrectPerMinute = (hits, seconds) => seconds >= 3 ? Math.round(hits / (seconds / 60)) : null;

// ---- Reciting from memory ----
const blank = word => word.replace(/[A-Za-z0-9]/g, '_');
// The first letter of each part of a hyphenated word stays: "bee-loud" becomes "b__-l___".
const keepFirst = word => word.split('-').map(part => part.replace(/[A-Za-z0-9]/g, (c, i, w) => i === w.search(/[A-Za-z0-9]/) ? c : '_')).join('-');
// How much of each unit (a poem line or a sentence) is left on screen: 1 the first half, 2 the first letter of every word,
// 3 only the start of the first word. Punctuation and word lengths stay, so the shape of the text is still there.
export function maskUnits(units, level) {
    return units.map(unit => {
        const tokens = tokenize(unit);
        const total = tokens.filter(t => t.word).length;
        let n = -1;
        return tokens.map(t => {
            if (!t.word) return t.text;
            n += 1;
            if (level === 1) return n < Math.ceil(total / 2) ? t.text : blank(t.text);
            if (level === 2) return keepFirst(t.text);
            return n === 0 ? keepFirst(t.text) : blank(t.text);
        }).join('');
    });
}
// Poetry Out Loud style accuracy, out of 8: each wrong word costs 1, a whole line left out costs 3.
// marks are the marks from align() over the whole segment; lineWords are the word counts of its lines in order.
export function reciteScore(marks, lineWords) {
    let penalty = 0, wrong = 0, skipped = 0, at = 0;
    for (const count of lineWords) {
        const line = marks.slice(at, at + count); at += count;
        const bad = line.filter(m => m !== 'hit').length;
        if (line.length && line.every(m => m === 'miss')) { penalty += 3; skipped += 1; wrong += bad; }
        else { penalty += bad; wrong += bad; }
    }
    return { score: Math.max(0, 8 - penalty), wrong, skippedLines: skipped };
}
export const lineWordCounts = units => units.map(unit => spokenWords(unit).length);
