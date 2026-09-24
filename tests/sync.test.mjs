import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLOUD_LIMIT, COPY_SUFFIX, SYNC_KEY, arrangementItem, canonical, contentHash, copyTitle, freshLedger, itemKey, needsAccountConfirmation, planSync, readLedger, toLocal, workItem } from '../static/music/sync-core.mjs';
import { validateDocument } from '../static/music/arrangement-schema.mjs';
import { createFromTemplate } from '../static/music/arrangement.mjs';
import { MAX_SOURCE } from '../static/music/composition.mjs';

const H = c => c.repeat(64);
const row = (kind, id, rev, hash, extra = {}) => ({ kind, id, title: id, content_hash: hash, revision: rev, deleted: false, updated_at: `2026-09-24T10:00:0${rev}Z`, ...extra });
const ledgerWith = entries => ({ ...freshLedger('u1'), items: Object.fromEntries(entries.map(([k, rev, hash]) => [k, { rev, hash }])) });
const empty = plan => Object.entries(plan).filter(([, v]) => v.length).map(([k]) => k);

test('hashes are stable, content-based and ignore key order', async () => {
    assert.equal(canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
    const a = await contentHash({ title: 't', body: { x: 1, y: 2 } }), b = await contentHash({ body: { y: 2, x: 1 }, title: 't' });
    assert.equal(a, b); assert.match(a, /^[0-9a-f]{64}$/);
    assert.notEqual(a, await contentHash({ title: 't2', body: { x: 1, y: 2 } }));
    assert.deepEqual(workItem({ id: 'w', kind: 'live', title: '', source: 's', at: 5 }), { kind: 'live', id: 'w', title: '未命名', body: { source: 's' } });
    const doc = createFromTemplate('pop', 'arr-x');
    assert.equal(arrangementItem(doc).body, doc);
    assert.equal(SYNC_KEY, 'hive-music-sync-v1'); assert.equal(CLOUD_LIMIT, 50);
});

test('unchanged on both sides: nothing to do', () => {
    const plan = planSync({ local: [{ kind: 'score', id: 'a', hash: H('1') }], ledger: ledgerWith([['score:a', 3, H('1')]]), remote: [row('score', 'a', 3, H('1'))] });
    assert.deepEqual(empty(plan), []);
});

test('one side changed: upload with the base revision, or download', () => {
    let plan = planSync({ local: [{ kind: 'score', id: 'a', hash: H('2') }], ledger: ledgerWith([['score:a', 3, H('1')]]), remote: [row('score', 'a', 3, H('1'))] });
    assert.deepEqual(plan.updates, [{ kind: 'score', id: 'a', base: 3 }]); assert.deepEqual(empty(plan), ['updates']);
    plan = planSync({ local: [{ kind: 'score', id: 'a', hash: H('1') }], ledger: ledgerWith([['score:a', 3, H('1')]]), remote: [row('score', 'a', 4, H('3'))] });
    assert.deepEqual(plan.downloads, [{ kind: 'score', id: 'a' }]); assert.deepEqual(empty(plan), ['downloads']);
});

test('both changed differently: keep both (cloud keeps the id, local becomes a copy)', () => {
    const plan = planSync({ local: [{ kind: 'live', id: 'a', title: '夜曲', hash: H('2') }], ledger: ledgerWith([['live:a', 3, H('1')]]), remote: [row('live', 'a', 5, H('3'))] });
    assert.deepEqual(plan.conflicts, [{ kind: 'live', id: 'a', rev: 5 }]); assert.deepEqual(empty(plan), ['conflicts']);
    assert.equal(copyTitle('夜曲'), '夜曲' + COPY_SUFFIX); assert.equal(copyTitle('x'.repeat(100)).length, 100);
    // Same new content on both sides: just link.
    const same = planSync({ local: [{ kind: 'live', id: 'a', hash: H('3') }], ledger: ledgerWith([['live:a', 3, H('1')]]), remote: [row('live', 'a', 5, H('3'))] });
    assert.deepEqual(same.links, [{ kind: 'live', id: 'a', rev: 5, hash: H('3') }]);
});

test('a conflict needs a free slot for the copy; otherwise it waits and is reported', () => {
    const plan = planSync({ local: [{ kind: 'score', id: 'a', title: 'A', hash: H('2') }], ledger: ledgerWith([['score:a', 1, H('1')]]), remote: [row('score', 'a', 2, H('3'))], room: { works: 0, arrangement: 5 } });
    assert.deepEqual(plan.conflicts, []); assert.deepEqual(plan.blocked, [{ kind: 'score', id: 'a', title: 'A', reason: 'conflict-full' }]);
});

test('deletions propagate, but an edit wins over a deletion', () => {
    // Deleted here, unchanged in the cloud: delete in the cloud (tombstone) with the base revision.
    let plan = planSync({ local: [], ledger: ledgerWith([['score:a', 2, H('1')]]), remote: [row('score', 'a', 2, H('1'))] });
    assert.deepEqual(plan.remoteDeletes, [{ kind: 'score', id: 'a', base: 2 }]);
    // Deleted in the cloud, unchanged here: delete locally.
    plan = planSync({ local: [{ kind: 'score', id: 'a', hash: H('1') }], ledger: ledgerWith([['score:a', 2, H('1')]]), remote: [row('score', 'a', 3, null, { deleted: true })] });
    assert.deepEqual(plan.localDeletes, [{ kind: 'score', id: 'a', rev: 3 }]);
    // Deleted in the cloud but edited here: the edit is uploaded again.
    plan = planSync({ local: [{ kind: 'score', id: 'a', hash: H('9') }], ledger: ledgerWith([['score:a', 2, H('1')]]), remote: [row('score', 'a', 3, null, { deleted: true })] });
    assert.deepEqual(plan.updates, [{ kind: 'score', id: 'a', base: 3 }]); assert.deepEqual(plan.localDeletes, []);
    // Deleted here but edited in the cloud meanwhile: the edit comes back.
    plan = planSync({ local: [], ledger: ledgerWith([['score:a', 2, H('1')]]), remote: [row('score', 'a', 4, H('5'))] });
    assert.deepEqual(plan.downloads, [{ kind: 'score', id: 'a' }]); assert.deepEqual(plan.remoteDeletes, []);
    // Both deleted: forget.
    plan = planSync({ local: [], ledger: ledgerWith([['score:a', 2, H('1')]]), remote: [row('score', 'a', 3, null, { deleted: true })] });
    assert.deepEqual(plan.forget, ['score:a']);
});

test('first sync on a device is a union: same content links, different content keeps both', () => {
    const plan = planSync({
        local: [{ kind: 'score', id: 'same', hash: H('1') }, { kind: 'score', id: 'diff', title: 'D', hash: H('2') }, { kind: 'live', id: 'mine', hash: H('4') }],
        ledger: freshLedger('u1'),
        remote: [row('score', 'same', 1, H('1')), row('score', 'diff', 2, H('3')), row('arrangement', 'theirs', 1, H('5')), row('live', 'gone', 2, null, { deleted: true })]
    });
    assert.deepEqual(plan.links, [{ kind: 'score', id: 'same', rev: 1, hash: H('1') }]);
    assert.deepEqual(plan.conflicts, [{ kind: 'score', id: 'diff', rev: 2 }]);
    assert.deepEqual(plan.inserts, [{ kind: 'live', id: 'mine' }]);
    assert.deepEqual(plan.downloads, [{ kind: 'arrangement', id: 'theirs' }]);
    assert.deepEqual(plan.forget, []);
});

test('new cloud items fill free local slots newest first; the rest stay cloud-only', () => {
    const remote = [1, 2, 3, 4].map(i => row('live', `r${i}`, 1, H(String(i)), { updated_at: `2026-09-2${i}T00:00:00Z` }));
    const plan = planSync({ local: [], ledger: freshLedger('u1'), remote, room: { works: 2, arrangement: 20 } });
    assert.deepEqual(plan.downloads.map(d => d.id), ['r4', 'r3']);
    assert.deepEqual(plan.cloudOnly.map(d => d.id), ['r2', 'r1']);
});

test('ledger and account checks', () => {
    assert.equal(readLedger('not json'), null); assert.equal(readLedger({ version: 2 }), null);
    const kept = readLedger(JSON.stringify({ version: 1, userId: 'u', items: { 'score:a': { rev: 2, hash: H('a') }, bad: { rev: 0, hash: 'x' } }, lastSync: 5 }));
    assert.deepEqual(kept.items, { 'score:a': { rev: 2, hash: H('a') } }); assert.equal(kept.lastSync, 5); assert.equal(kept.paused, false);
    assert.equal(needsAccountConfirmation(freshLedger('u1'), 'u2', 3), true);
    assert.equal(needsAccountConfirmation(freshLedger('u1'), 'u1', 3), false);
    assert.equal(needsAccountConfirmation(null, 'u2', 3), false);
    assert.equal(needsAccountConfirmation(freshLedger('u1'), 'u2', 0), false);
    assert.equal(itemKey('score', 'a'), 'score:a');
});

test('downloaded rows are validated before they may replace local data', () => {
    const doc = createFromTemplate('lofi', 'arr-cloud');
    assert.equal(toLocal({ kind: 'arrangement', id: 'arr-cloud', title: 't', body: doc }, { validateDocument, maxSource: MAX_SOURCE }).id, 'arr-cloud');
    assert.throws(() => toLocal({ kind: 'arrangement', id: 'other', title: 't', body: doc }, { validateDocument, maxSource: MAX_SOURCE }), /ID/);
    assert.throws(() => toLocal({ kind: 'arrangement', id: 'arr-cloud', title: 't', body: { ...doc, meta: { ...doc.meta, tempo: 999 } } }, { validateDocument, maxSource: MAX_SOURCE }));
    const w = toLocal({ kind: 'live', id: 'abc-1', title: 'x'.repeat(200), body: { source: 'note("c4")' }, updated_at: '2026-09-24T00:00:00Z' }, { validateDocument, maxSource: MAX_SOURCE });
    assert.equal(w.title.length, 100); assert.equal(w.source, 'note("c4")'); assert.equal(w.at, Date.parse('2026-09-24T00:00:00Z'));
    assert.throws(() => toLocal({ kind: 'live', id: 'abc_1', title: 't', body: { source: 's' } }, { validateDocument, maxSource: MAX_SOURCE }), /格式/);
    assert.throws(() => toLocal({ kind: 'live', id: 'a', title: 't', body: { source: 'x'.repeat(MAX_SOURCE + 1) } }, { validateDocument, maxSource: MAX_SOURCE }), /格式/);
    assert.throws(() => toLocal({ kind: 'lesson', id: 'a', title: 't', body: {} }, { validateDocument, maxSource: MAX_SOURCE }));
    assert.throws(() => toLocal({ kind: 'live', id: 'a', title: 't', deleted: true, body: null }, { validateDocument, maxSource: MAX_SOURCE }));
});

test('sync-core stays free of browser storage and network APIs', () => {
    const source = readFileSync(new URL('../static/music/sync-core.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /localStorage|sessionStorage|fetch\(|\b(?:document|window)\.[A-Za-z]/);
});
