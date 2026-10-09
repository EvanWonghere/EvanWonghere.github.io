import test from 'node:test';
import assert from 'node:assert/strict';
import { PROGRESS_KEY, GAPS, fresh, dayOf, addDays, validateProgress, loadProgress, saveProgress, recordClip, recordFinished, recordBest, recordRecited, addWord, removeWord, hasWord, dueWords, reviewWord, applyScores, recordPhonemes, weakSounds, streakDays, weekView, mergeProgress, wordKey } from '../static/english/progress.mjs';

const memory = (initial = null) => { let value = initial; return { getItem: () => value, setItem: (_, v) => { value = v; }, get value() { return value; } }; };

test('days add up across month and year ends', () => {
    assert.equal(addDays('2026-10-31', 1), '2026-11-01'); assert.equal(addDays('2026-01-01', -1), '2025-12-31'); assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(dayOf(new Date(2026, 9, 9)), '2026-10-09');
});

test('a fresh archive is valid; newer or damaged data is refused instead of being overwritten', () => {
    assert.deepEqual(validateProgress(fresh()), fresh());
    for (const bad of [null, { ...fresh(), version: 2 }, { ...fresh(), days: [] }, { ...fresh(), days: { 'x': { seconds: 1, texts: [] } } },
        { ...fresh(), texts: { 'Bad Id': { reads: 0, best: null, recited: 0, last: null } } }, JSON.parse('{"version":1,"days":{},"texts":{},"phonemes":{},"words":{"__proto__":{"due":"2026-10-10","added":"2026-10-09","step":0,"source":""}}}'),
        { ...fresh(), words: { ok: { due: '2026-10-10', added: '2026-10-09', step: 9, source: '' } } }, { ...fresh(), phonemes: { qq: { recent: [50] } } }, { ...fresh(), phonemes: { th: { recent: [50, 60, 70, 80] } } }]) assert.throws(() => validateProgress(bad));
    const store = memory('{"version":2}');
    const loaded = loadProgress(store); assert.equal(loaded.writable, false); assert.deepEqual(loaded.progress, fresh());
    assert.equal(store.value, '{"version":2}');
    assert.equal(loadProgress(memory(null)).writable, true); assert.equal(loadProgress(memory('not json')).writable, false);
    assert.throws(() => saveProgress(store, { version: 1 }), 'saving validates first');
    const ok = memory(); saveProgress(ok, fresh()); assert.equal(loadProgress(ok).writable, true);
    assert.equal(PROGRESS_KEY, 'hive-english-progress-v1');
});

test('practice adds up per day and keeps the list of texts without repeats', () => {
    const p = fresh();
    recordClip(p, { day: '2026-10-09', seconds: 12.34, workId: 'yeats-innisfree' }); recordClip(p, { day: '2026-10-09', seconds: 10, workId: 'yeats-innisfree' }); recordClip(p, { day: '2026-10-09', seconds: 5 });
    assert.deepEqual(p.days['2026-10-09'], { seconds: 27.3, texts: ['yeats-innisfree'] });
    recordFinished(p, 'yeats-innisfree', '2026-10-09'); recordFinished(p, 'yeats-innisfree', '2026-10-10');
    recordBest(p, 'yeats-innisfree', 71.6); recordBest(p, 'yeats-innisfree', 60); recordRecited(p, 'yeats-innisfree', 2); recordRecited(p, 'yeats-innisfree', 1);
    assert.deepEqual(p.texts['yeats-innisfree'], { reads: 2, best: 72, recited: 2, last: '2026-10-10' });
    assert.deepEqual(validateProgress(p), p);
});

test('streak counts back from today, or from yesterday when today is not practised yet', () => {
    const p = fresh();
    for (const day of ['2026-10-05', '2026-10-07', '2026-10-08']) recordClip(p, { day, seconds: 30 });
    assert.equal(streakDays(p, '2026-10-08'), 2); assert.equal(streakDays(p, '2026-10-09'), 2); assert.equal(streakDays(p, '2026-10-10'), 0);
    recordClip(p, { day: '2026-10-09', seconds: 30 }); assert.equal(streakDays(p, '2026-10-09'), 3);
    assert.deepEqual(weekView(p, '2026-10-09').map(d => d.seconds > 0), [false, false, true, false, true, true, true]);
    assert.equal(weekView(p, '2026-10-09')[0].day, '2026-10-03');
});

test('a new word is due tomorrow; good reviews move it out step by step and a miss brings it back', () => {
    const p = fresh();
    assert.equal(addWord(p, 'Wattles,', 'yeats-innisfree', '2026-10-09'), true); assert.equal(addWord(p, 'wattles', '', '2026-10-09'), false); assert.equal(addWord(p, '123', '', '2026-10-09'), false);
    assert.ok(hasWord(p, 'WATTLES')); assert.equal(wordKey('Don’t!'), "don't");
    assert.deepEqual(dueWords(p, '2026-10-09'), []); assert.equal(dueWords(p, '2026-10-10')[0].key, 'wattles');
    let day = '2026-10-10';
    for (const step of [1, 2, 3, 4, 4]) { reviewWord(p, 'wattles', true, day); assert.equal(p.words.wattles.step, step); assert.equal(p.words.wattles.due, addDays(day, GAPS[step])); day = p.words.wattles.due; }
    reviewWord(p, 'wattles', false, day); assert.equal(p.words.wattles.step, 0); assert.equal(p.words.wattles.due, addDays(day, 1));
    reviewWord(p, 'nothere', true, day);   // unknown words are ignored
    removeWord(p, 'Wattles'); assert.equal(hasWord(p, 'wattles'), false);
    assert.equal(addWord(p, 'constructor', '', '2026-10-09'), true);   // a word that is also an Object property
    assert.equal(hasWord(p, 'toString'), false);
});

test('scored words move the queue only when due, and only when clearly good or clearly bad', () => {
    const p = fresh(); addWord(p, 'river', '', '2026-10-01'); addWord(p, 'glade', '', '2026-10-01'); addWord(p, 'later', '', '2026-10-09');
    const changed = applyScores(p, [{ text: 'River,', accuracy: 92 }, { text: 'glade', accuracy: 50 }, { text: 'later', accuracy: 99 }, { text: 'other', accuracy: 10 }, { text: 'river', accuracy: null }], '2026-10-09');
    assert.equal(changed, 2); assert.equal(p.words.river.step, 1); assert.equal(p.words.glade.step, 0); assert.equal(p.words.later.step, 0, 'not due yet');
    assert.equal(applyScores(p, [{ text: 'glade', accuracy: 78 }], '2026-10-10'), 0, 'in between changes nothing');
});

test('sounds keep their last three scores and the weak ones are listed worst first', () => {
    const p = fresh();
    for (const accuracy of [40, 50, 60, 70]) recordPhonemes(p, [{ phonemes: [{ text: 'th', accuracy }, { text: 'zz', accuracy: 1 }, { text: 'v', accuracy: 95 }] }]);
    assert.deepEqual(p.phonemes.th.recent, [50, 60, 70]); assert.equal('zz' in p.phonemes, false);
    recordPhonemes(p, [{ phonemes: [{ text: 'r', accuracy: 30 }] }]);
    assert.deepEqual(weakSounds(p).map(s => [s.key, s.average]), [['r', 30], ['th', 60]]);
    assert.deepEqual(weakSounds(p, 40).map(s => s.key), ['r']);
});

test('importing a backup keeps both sides and the larger numbers', () => {
    const a = fresh(), b = fresh();
    recordClip(a, { day: '2026-10-08', seconds: 30, workId: 'a-one' }); recordClip(b, { day: '2026-10-08', seconds: 90, workId: 'b-two' }); recordClip(b, { day: '2026-10-09', seconds: 10 });
    recordFinished(a, 'a-one', '2026-10-08'); recordBest(a, 'a-one', 80); recordFinished(b, 'a-one', '2026-10-09'); recordFinished(b, 'a-one', '2026-10-09'); recordBest(b, 'a-one', 70); recordRecited(b, 'a-one', 3);
    addWord(a, 'river', '', '2026-10-01'); addWord(b, 'river', '', '2026-10-05'); addWord(b, 'glade', '', '2026-10-05');
    recordPhonemes(a, [{ phonemes: [{ text: 'th', accuracy: 40 }] }]); recordPhonemes(b, [{ phonemes: [{ text: 'th', accuracy: 60 }] }]);
    const m = mergeProgress(a, b);
    assert.deepEqual(m.days['2026-10-08'], { seconds: 90, texts: ['a-one', 'b-two'] });
    assert.deepEqual(m.texts['a-one'], { reads: 2, best: 80, recited: 3, last: '2026-10-09' });
    assert.equal(m.words.river.added, '2026-10-01', 'what is already here wins'); assert.ok(m.words.glade);
    assert.deepEqual(m.phonemes.th.recent, [40, 60]);
    assert.throws(() => mergeProgress(a, { version: 2 }));
});

import { createLearner } from '../static/english/learner.mjs';
import { findContext, summaryLine } from '../static/english/archive.mjs';

test('the learner store re-reads before writing and leaves unreadable data alone', () => {
    const store = memory();
    const first = createLearner(store), second = createLearner(store);
    assert.equal(first.update(p => recordClip(p, { day: '2026-10-09', seconds: 30, workId: 'a-one' })), true);
    assert.equal(second.update(p => addWord(p, 'river', '', '2026-10-09')), true);   // another tab: must not erase the first change
    const now = createLearner(store).read();
    assert.equal(now.days['2026-10-09'].seconds, 30); assert.ok(now.words.river);
    const broken = memory('{"version":7}'); const learner = createLearner(broken);
    assert.equal(learner.writable(), false); assert.equal(learner.update(p => addWord(p, 'river', '', '2026-10-09')), false); assert.equal(broken.value, '{"version":7}');
    const failing = { getItem: () => null, setItem: () => { throw new Error('full'); } };
    assert.equal(createLearner(failing).update(p => addWord(p, 'river', '', '2026-10-09')), false);
});

test('a word is shown in the line it came from, and the summary line reads naturally', () => {
    const work = { kind: 'poem', segments: [{ id: 's1', text: 'I will arise and go now,\nAnd a small cabin build there, of clay and wattles made:' }, { id: 's2', text: 'Nine bean-rows will I have there' }] };
    assert.equal(findContext(work, 'wattles'), 'And a small cabin build there, of clay and wattles made:');
    assert.equal(findContext(work, 'bean-rows'), 'Nine bean-rows will I have there');
    assert.equal(findContext(work, 'missing'), null);
    assert.equal(findContext({ kind: 'speech', segments: [{ id: 's1', text: 'We hold these truths. Rivers run to the sea.' }] }, 'rivers'), 'Rivers run to the sea.');
    assert.equal(summaryLine({ streak: 3, seconds: 400, due: 5 }), '连续 3 天 · 今天练了 7 分钟 · 5 个词等你复习');
    assert.equal(summaryLine({ streak: 0, seconds: 0, due: 0 }), '今天开始第一天 · 今天还没练');
    assert.equal(summaryLine({ streak: 1, seconds: 20, due: 0 }), '连续 1 天 · 今天练了 1 分钟');
});

import { noStorage } from '../static/english/learner.mjs';
import { tipFor } from '../static/english/phoneme-tips.mjs';

test('a backup of unreadable data is the data itself, and blocked storage is reported as not writable', () => {
    const newer = memory('{"version":9,"days":{"2026-10-09":{"seconds":5}}}');
    const learner = createLearner(newer);
    assert.equal(learner.writable(), false); assert.equal(learner.raw(), '{"version":9,"days":{"2026-10-09":{"seconds":5}}}');
    assert.equal(createLearner(memory()).raw(), null);
    assert.equal(createLearner(noStorage).writable(), false); assert.equal(createLearner(noStorage).update(() => {}), false); assert.equal(createLearner(noStorage).raw(), null);
    assert.deepEqual(createLearner(noStorage).read(), fresh());
});

test('ids that are also Object properties are handled as ordinary names', () => {
    const a = fresh(), b = fresh();
    recordFinished(b, 'constructor', '2026-10-09'); recordBest(b, 'constructor', 70);
    const merged = mergeProgress(a, b);
    assert.deepEqual(merged.texts.constructor, { reads: 1, best: 70, recited: 0, last: '2026-10-09' });
    assert.deepEqual(mergeProgress(merged, b).texts.constructor.reads, 1);
    assert.equal(tipFor('constructor'), null); assert.equal(tipFor('toString'), null); assert.ok(tipFor('th'));
});
