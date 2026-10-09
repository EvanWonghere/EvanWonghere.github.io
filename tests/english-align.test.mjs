import test from 'node:test';
import assert from 'node:assert/strict';
import { align, liveStates, spokenWords, normalize, wordsCorrectPerMinute } from '../static/english/align.mjs';

const REF = "I will arise and go now, and go to Innisfree";

test('words compare without case, punctuation, apostrophes or hyphens', () => {
    assert.equal(normalize("Don't"), 'dont'); assert.equal(normalize('bee-loud'), 'beeloud');
    assert.deepEqual(spokenWords('Hello, World! It’s fine.'), ['hello', 'world', 'its', 'fine']);
});

test('a perfect reading hits every word', () => {
    const r = align(REF, 'i will arise and go now and go to innisfree');
    assert.deepEqual(r.marks, new Array(10).fill('hit'));
    assert.equal(r.hitRate, 1); assert.equal(r.extra, 0);
});

test('a skipped word is a miss and a replaced word is a swap', () => {
    assert.deepEqual(align(REF, 'i will arise go now and go to innisfree').marks, ['hit', 'hit', 'hit', 'miss', 'hit', 'hit', 'hit', 'hit', 'hit', 'hit']);
    const swapped = align(REF, 'i will rise and go now and go to innisfree');
    assert.equal(swapped.marks[2], 'swap'); assert.equal(swapped.extra, 0);
    const extra = align(REF, 'i will arise and and go now and go to innisfree');
    assert.equal(extra.extra, 1); assert.equal(extra.hits, 10);
});

test('two heard words that make one hyphenated reference word still count', () => {
    const r = align('the bee-loud glade', 'the bee loud glade');
    assert.deepEqual(r.marks, ['hit', 'hit', 'hit']);
});

test('nothing heard, or an empty reference, never divides by zero', () => {
    assert.deepEqual(align('one two', '').marks, ['miss', 'miss']);
    assert.equal(align('', 'anything').hitRate, 0);
});

test('live states keep the unread words pending and only flag a miss after a later hit', () => {
    assert.deepEqual(liveStates(REF, '').states.slice(0, 2), ['now', 'pending']);
    const partial = liveStates(REF, 'i will arise go');
    assert.deepEqual(partial.states.slice(0, 6), ['hit', 'hit', 'hit', 'miss', 'hit', 'now']);
    assert.equal(partial.cursor, 5);
    // "arise" has not been heard yet: it is the word being read, not a mistake
    assert.deepEqual(liveStates(REF, 'i will').states.slice(0, 4), ['hit', 'hit', 'now', 'pending']);
    assert.equal(liveStates(REF, 'i will arise and go now and go to innisfree').states.includes('now'), false);
});

test('words correct per minute', () => {
    assert.equal(wordsCorrectPerMinute(56, 30), 112);
    assert.equal(wordsCorrectPerMinute(10, 0), null); assert.equal(wordsCorrectPerMinute(10, 2.9), null); assert.equal(wordsCorrectPerMinute(6, 3), 120);
});

import { maskUnits, reciteScore, lineWordCounts } from '../static/english/align.mjs';

test('masking leaves less and less of each line, but keeps its shape', () => {
    const lines = ["I will arise and go now,", 'And a small cabin build there'];
    assert.deepEqual(maskUnits(lines, 1), ['I will arise ___ __ ___,', 'And a small _____ _____ _____']);
    assert.deepEqual(maskUnits(lines, 2), ['I w___ a____ a__ g_ n__,', 'A__ a s____ c____ b____ t____']);
    assert.deepEqual(maskUnits(lines, 3), ['I ____ _____ ___ __ ___,', 'A__ _ _____ _____ _____ _____']);
    assert.deepEqual(maskUnits(["don't bee-loud"], 2), ["d__'_ b__-l___"]);
    for (const level of [1, 2, 3]) for (const [i, masked] of maskUnits(lines, level).entries()) assert.equal(masked.length, lines[i].length);
});

test('recital accuracy: one point per wrong word, three for a whole line left out, never below zero', () => {
    const lines = [5, 4, 6];
    const all = n => new Array(n).fill('hit');
    assert.deepEqual(reciteScore(all(15), lines), { score: 8, wrong: 0, skippedLines: 0 });
    const oneWrong = all(15); oneWrong[2] = 'swap'; oneWrong[7] = 'miss';
    assert.deepEqual(reciteScore(oneWrong, lines), { score: 6, wrong: 2, skippedLines: 0 });
    const skipped = all(15); for (let i = 5; i < 9; i++) skipped[i] = 'miss';
    assert.deepEqual(reciteScore(skipped, lines), { score: 5, wrong: 4, skippedLines: 1 });
    assert.equal(reciteScore(new Array(15).fill('miss'), lines).score, 0);
    assert.deepEqual(lineWordCounts(['I will arise', "don't go"]), [3, 2]);
});
