import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from '../static/english/report.mjs';
import { PHONEME_TIPS, tipFor, phonemeKey, weakPhonemes, heardAs } from '../static/english/phoneme-tips.mjs';

const word = (text, accuracy, error = 'None', phonemes = []) => ({ text, accuracy, error, phonemes });
const result = (words, scores = {}) => ({ recognized: '', scores: { pronunciation: 80, accuracy: 80, fluency: 80, completeness: 100, prosody: null, ...scores }, words, monotone: false });

test('every American English SAPI sound has a tip with an IPA label, and unknown sounds have none', () => {
    const sapi = 'aa ae ah ao aw ax ay b ch d dh eh er ey f g h ih iy jh k l m n ng ow oy p r s sh t th uh uw v w y z zh'.split(' ');
    for (const s of sapi) { assert.ok(tipFor(s), s); assert.ok(PHONEME_TIPS[s].ipa && PHONEME_TIPS[s].zh.length > 8, s); }
    assert.equal(tipFor('qq'), null); assert.equal(phonemeKey('TH '), 'th'); assert.equal(tipFor('hh').ipa, 'h');
});

test('weak sounds are averaged over the words and listed worst first', () => {
    const words = [word('this', 70, 'None', [{ text: 'dh', accuracy: 40 }, { text: 'ih', accuracy: 90 }]), word('that', 70, 'None', [{ text: 'dh', accuracy: 60 }, { text: 'ae', accuracy: 65 }]), word('x', 90, 'None', [{ text: 'zz', accuracy: 1 }])];
    assert.deepEqual(weakPhonemes(words).map(p => [p.key, p.average, p.count]), [['dh', 50, 2], ['ae', 65, 1]]);
    assert.deepEqual(weakPhonemes(words, { below: 55 }).map(p => p.key), ['dh']);
});

test('a report combines local and scored segments without inventing numbers', () => {
    const items = [
        { id: 's1', text: 'I will arise and go', seconds: 6, local: { marks: ['hit', 'hit', 'hit', 'miss', 'hit'], hits: 4, total: 5 }, azure: result([word('I', 95), word('arise', 55, 'Mispronunciation', [{ text: 'th', accuracy: 30 }, { text: 'ax', accuracy: 90 }]), word('go', 88)], { pronunciation: 70 }) },
        { id: 's2', text: 'to Innisfree', seconds: 4, local: { marks: ['hit', 'hit'], hits: 2, total: 2 }, azure: null },
    ];
    const r = buildReport(items);
    assert.equal(r.segments, 2); assert.equal(r.seconds, 10);
    assert.equal(r.local.hitRate, 6 / 7); assert.equal(r.local.wcpm, 36); assert.deepEqual(r.notHeard, ['and']);
    assert.equal(r.azure.segments, 1); assert.equal(r.azure.pronunciation, 70); assert.equal(r.azure.prosody, null);
    assert.deepEqual(r.hardWords.map(w => w.text), ['arise']);
    assert.equal(r.hardWords[0].weakest.key, 'th'); assert.equal(r.hardWords[0].weakest.ipa, 'θ');
    assert.deepEqual(r.weakPhonemes.map(p => p.key), ['th']);
});

test('a report with nothing measured has no local or scored section', () => {
    const r = buildReport([{ id: 's1', text: 'Hello there', seconds: 3, local: null, azure: null }]);
    assert.equal(r.local, null); assert.equal(r.azure, null); assert.deepEqual(r.hardWords, []); assert.deepEqual(r.notHeard, []);
});

test('omitted and inserted words are not called hard words, and the worst repeat of a word wins', () => {
    const a = result([word('river', 60, 'Mispronunciation'), word('and', 0, 'Omission'), word('uh', 0, 'Insertion')]);
    const b = result([word('River,', 30, 'Mispronunciation')]);
    const r = buildReport([{ id: 's1', text: 'x', seconds: 2, local: null, azure: a }, { id: 's2', text: 'y', seconds: 2, local: null, azure: b }]);
    assert.deepEqual(r.hardWords.map(w => [w.text, w.accuracy]), [['River', 30]]);
});

test('sounds are described for American English only', () => {
    const words = [word('river', 40, 'Mispronunciation', [{ text: 'r', accuracy: 20 }])];
    const gb = buildReport([{ id: 's1', text: 'river', seconds: 3, locale: 'en-GB', local: null, azure: result(words) }]);
    assert.equal(gb.hardWords[0].text, 'river'); assert.equal(gb.hardWords[0].weakest, null); assert.deepEqual(gb.weakPhonemes, []);
    const us = buildReport([{ id: 's1', text: 'river', seconds: 3, locale: 'en-US', local: null, azure: result(words) }]);
    assert.equal(us.hardWords[0].weakest.key, 'r'); assert.deepEqual(us.weakPhonemes.map(p => p.key), ['r']);
});

test('sound names that are also Object properties are not sounds', () => {
    const words = [{ text: 'x', accuracy: 40, error: 'Mispronunciation', phonemes: [{ text: 'constructor', accuracy: 10 }, { text: 'toString', accuracy: 10 }] }];
    assert.deepEqual(weakPhonemes(words), []);
    const r = buildReport([{ id: 's1', text: 'x', seconds: 3, locale: 'en-US', local: null, azure: result(words) }]);
    assert.equal(r.hardWords[0].weakest, null);
});

test('IPA symbols from the detailed path map to the same sounds as the SAPI names', () => {
    for (const [ipa, key] of [['θ', 'th'], ['ð', 'dh'], ['ɹ', 'r'], ['r', 'r'], ['ɪ', 'ih'], ['iː', 'iy'], ['æ', 'ae'], ['ʃ', 'sh'], ['tʃ', 'ch'], ['dʒ', 'jh'], ['ŋ', 'ng'], ['ə', 'ax'], ['oʊ', 'ow'], ['ʌ', 'ah'], ['ɚ', 'er'], ['ɛ', 'eh'], ['v', 'v'], ['ɡ', 'g']]) assert.equal(phonemeKey(ipa), key, ipa);
    assert.equal(phonemeKey('TH'), 'th'); assert.equal(phonemeKey('th'), 'th'); assert.equal(tipFor('θ').zh, tipFor('th').zh);
    assert.equal(tipFor('ʔ'), null);
});

test('what was heard instead is described by what kind of sound it was', () => {
    assert.equal(heardAs('ə', 'd'), '这里的元音几乎没读出来，听起来像 /d/。');      // a vowel heard as a consonant: swallowed
    assert.equal(heardAs('t', 'ɪ'), '这个辅音没读清楚，听起来带上了元音 /ɪ/。');     // a consonant heard as a vowel
    assert.equal(heardAs('w', 'v'), '你读成了 /v/。'); assert.equal(heardAs('ɪ', 'iː'), '你读成了 /iː/。');
    assert.equal(heardAs('v', 'ʋ'), '你读成了 /ʋ/。');                                 // an unknown symbol is shown as it came
    assert.equal(heardAs('ɹ', 'r'), ''); assert.equal(heardAs('', 'v'), '');          // the same sound, or nothing: nothing to say
});
