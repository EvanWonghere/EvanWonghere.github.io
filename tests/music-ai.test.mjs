import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { freshProgress, recordAnswer, STORAGE_KEY } from '../static/music/core.mjs';
import { LESSONS } from '../static/music/curriculum.mjs';
import { MUSIC_CATALOG_VERSIONS } from '../static/music/catalog-versions.mjs';
import { buildCatalog, catalogVersions, versionsModule } from '../tools/music-catalog.mjs';
import { AI_PENDING_KEY, COMPOSITION_VERSION, POLL_DELAYS, authCallback, buildContext, buildRequest, classifyResponse, clearPending, hasStoredSession, historyTurns, lessonStats, loadPending, parseConfig, pendingOutcome, returnTarget, savePending, shouldLoadAI } from '../static/music/ai-context.mjs';

const memory = (entries = {}) => {
    const data = new Map(Object.entries(entries));
    return { get length() { return data.size; }, key: i => [...data.keys()][i] ?? null, getItem: k => data.has(k) ? data.get(k) : null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k), data };
};
const lesson = LESSONS[0];
const requestId = '20000000-0000-4000-8000-000000000001';
const config = parseConfig({ url: 'https://example.supabase.co/', key: 'sb_publishable_example_key_000000' });

test('catalog versions match the current lessons; run tools/export-music-catalog.mjs after lesson edits', async () => {
    const catalog = buildCatalog();
    assert.deepEqual(MUSIC_CATALOG_VERSIONS, catalogVersions(catalog));
    assert.equal(await readFile(new URL('../static/music/catalog-versions.mjs', import.meta.url), 'utf8'), versionsModule(catalog));
    assert.equal(catalog.lessons.length, LESSONS.length);
});

test('catalog carries lesson teaching content but never quiz questions or answers', () => {
    const text = JSON.stringify(buildCatalog());
    for (const l of LESSONS) for (const q of l.questions) assert.ok(!text.includes(q.prompt), `question leaked: ${q.id}`);
    for (const entry of buildCatalog().lessons) { assert.ok(!('questions' in entry)); assert.ok(entry.sections.length && entry.practice.length); }
});

test('catalog versions change only for the edited lesson', () => {
    const before = catalogVersions(buildCatalog());
    const original = lesson.title;
    try { lesson.title = original + '（修订）'; const after = catalogVersions(buildCatalog()); assert.notEqual(after[lesson.id], before[lesson.id]); assert.equal(after[LESSONS[1].id], before[LESSONS[1].id]); }
    finally { lesson.title = original; }
});

test('config accepts only an https project URL and a public key', () => {
    assert.equal(config.functionUrl, 'https://example.supabase.co/functions/v1/ai-tutor');
    assert.equal(parseConfig({ url: 'http://example.supabase.co', key: 'sb_publishable_example_key_000000' }), null);
    assert.equal(parseConfig({ url: 'https://example.supabase.co', key: '' }), null);
    assert.equal(parseConfig({ url: 'https://example.supabase.co', key: 'has spaces in it and more text' }), null);
    assert.equal(parseConfig(undefined), null);
    assert.ok(parseConfig({ url: 'http://127.0.0.1:54321', key: 'sb_publishable_example_key_000000' }));
});

test('anonymous visitors without a session never load the assistant', () => {
    const href = 'https://yufenghuang.tech/study/music/#route';
    assert.equal(shouldLoadAI({ config, href, storage: memory() }), false);
    assert.equal(shouldLoadAI({ config, href, storage: memory({ [STORAGE_KEY]: '{}' }) }), false);
    assert.equal(shouldLoadAI({ config: null, href: href + '?code=x', storage: memory() }), false);
    assert.equal(shouldLoadAI({ config, href: 'https://yufenghuang.tech/study/music/?code=abc', storage: memory() }), true);
    assert.equal(shouldLoadAI({ config, href, storage: memory({ 'sb-project-auth-token': '{}' }) }), true);
    assert.equal(hasStoredSession({ get length() { throw new Error('blocked'); } }), false);
});

test('auth callback: only auth parameters are removed; errors are reported', () => {
    const ok = authCallback('https://yufenghuang.tech/study/music/?code=abc&state=s&keep=1#compose');
    assert.deepEqual([ok.hasCode, ok.error, ok.cleanUrl], [true, '', '/study/music/?keep=1#compose']);
    const denied = authCallback('https://yufenghuang.tech/study/music/?error=access_denied&error_description=User+denied');
    assert.equal(denied.error, 'User denied'); assert.equal(denied.cleanUrl, '/study/music/'); assert.ok(denied.isCallback);
    assert.equal(authCallback('https://yufenghuang.tech/study/music/#route').isCallback, false);
    assert.deepEqual(returnTarget('{"tab":"compose","open":true}'), { tab: 'compose', open: true });
    assert.equal(returnTarget('{"tab":"javascript:alert(1)"}').tab, 'route');
    assert.equal(returnTarget('not json'), null);
});

test('context is built from a snapshot and does not modify progress', () => {
    const progress = freshProgress();
    recordAnswer(progress, lesson.questions[0].id, true, 0); recordAnswer(progress, lesson.questions[1].id, false, 0);
    progress.lessonTasks[lesson.id] = [true, false, true];
    progress.journal = [1, 2, 3, 4].map(i => ({ text: `日志 ${i}`.padEnd(i === 4 ? 2000 : 4, '。'), at: i, bpm: 72 }));
    const before = JSON.stringify(progress);
    assert.deepEqual(lessonStats(progress, lesson), { quizDone: 1, quizTotal: lesson.questions.length, attempts: 2, correct: 1, lessonMarkedDone: false });
    const homework = buildContext('homework', { progress, lesson });
    assert.deepEqual(homework.tasks, [true, false, true]);
    assert.equal(homework.journal.length, 3); assert.equal(homework.journal[2].text.length, 1200);
    assert.equal(JSON.stringify(progress), before, 'progress must be unchanged');
    assert.deepEqual(Object.keys(buildContext('lesson', { progress, lesson })), ['stats']);
});

test('composition context carries the score and the deterministic format check', () => {
    const ok = buildContext('composition', { composition: { abc: 'X:1\nT:夜曲\nK:C\nCDEF|', title: '夜曲' } });
    assert.equal(ok.check, '格式检查通过');
    const bad = buildContext('composition', { composition: { abc: 'CDEF', title: 'x' } });
    assert.match(bad.check, /^格式检查未通过/);
    assert.throws(() => buildContext('composition', { composition: { abc: '   ' } }), /乐谱/);
    assert.throws(() => buildContext('composition', { composition: { abc: 'K:C\n' + 'C'.repeat(12001) } }), /12000/);
});

test('requests carry the catalog version for lessons and a fixed format version for scores', () => {
    const progress = freshProgress();
    const { payload } = buildRequest({ kind: 'lesson', message: ' 为什么？ ', requestId, progress, lesson, versions: MUSIC_CATALOG_VERSIONS });
    assert.deepEqual([payload.action, payload.kind, payload.subjectId, payload.subjectVersion, payload.message], ['music-chat', 'lesson', lesson.id, MUSIC_CATALOG_VERSIONS[lesson.id], '为什么？']);
    const score = buildRequest({ kind: 'composition', message: '点评', requestId, composition: { abc: 'X:1\nK:C\nC|', workId: 'not a valid id!', title: 't' }, versions: MUSIC_CATALOG_VERSIONS }).payload;
    assert.equal(score.subjectId, 'draft'); assert.equal(score.subjectVersion, COMPOSITION_VERSION);
    assert.throws(() => buildRequest({ kind: 'lesson', message: 'x', requestId, progress, lesson, versions: {} }), /目录/);
    assert.throws(() => buildRequest({ kind: 'lesson', message: '', requestId, progress, lesson, versions: MUSIC_CATALOG_VERSIONS }), /问题/);
    assert.throws(() => buildRequest({ kind: 'lesson', message: 'x', requestId: 'bad', progress, lesson, versions: MUSIC_CATALOG_VERSIONS }), /请求 ID/);
    assert.throws(() => buildRequest({ kind: 'arrangement', message: 'x', requestId, progress, lesson, versions: MUSIC_CATALOG_VERSIONS }), /用途/);
});

test('pending request survives a reload with the same ID and payload, and never touches progress storage', () => {
    const storage = memory({ [STORAGE_KEY]: 'progress' });
    const { payload } = buildRequest({ kind: 'lesson', message: '问题', requestId, progress: freshProgress(), lesson, versions: MUSIC_CATALOG_VERSIONS });
    assert.ok(savePending(storage, { payload, label: lesson.title }));
    const restored = loadPending(storage);
    assert.deepEqual(restored.payload, payload);
    assert.equal(storage.getItem(STORAGE_KEY), 'progress');
    storage.setItem(AI_PENDING_KEY, JSON.stringify({ payload: { ...payload, requestId: 'x' } }));
    assert.equal(loadPending(storage), null, 'malformed pending is ignored');
    clearPending(storage); assert.equal(storage.getItem(AI_PENDING_KEY), null);
    assert.equal(savePending({ setItem() { throw new Error('blocked'); } }, { payload }), false);
});

test('response classification and history outcome drive recovery', () => {
    assert.equal(classifyResponse(200, { body: '回答' }), 'done');
    assert.equal(classifyResponse(200, { body: '回答', recovered: true }), 'done');
    assert.equal(classifyResponse(409, { settled: false }), 'wait');
    assert.equal(classifyResponse(409, { settled: true }), 'failed');
    assert.equal(classifyResponse(500, {}), 'failed');
    const rows = [{ request_id: 'a', role: 'user', status: 'complete', created_at: '2' }, { request_id: 'a', role: 'assistant', status: 'running', created_at: '2' }, { request_id: 'b', role: 'assistant', status: 'complete', created_at: '1' }, { request_id: 'b', role: 'user', status: 'complete', created_at: '1' }];
    assert.equal(pendingOutcome(rows, 'a'), 'wait'); assert.equal(pendingOutcome(rows, 'b'), 'done'); assert.equal(pendingOutcome(rows, 'c'), 'missing');
    assert.deepEqual(historyTurns(rows).map(t => t.requestId), ['b', 'a']);
    assert.ok(POLL_DELAYS.reduce((a, b) => a + b, 0) >= 150000, 'polling outlasts the server timeout');
});

test('assistant modules have no path to progress, grades or mastery', async () => {
    for (const file of ['ai.mjs', 'ai-context.mjs']) {
        const source = await readFile(new URL(`../static/music/${file}`, import.meta.url), 'utf8');
        assert.ok(!/\bpersist\b(?!Session)/.test(source), `${file} must not reference persist`);
        for (const forbidden of ['saveProgress', 'recordAnswer', 'recordSkill', 'hive-music-v1', 'localStorage', 'innerHTML', 'eval(', 'new Function'])
            assert.ok(!source.includes(forbidden), `${file} must not reference ${forbidden}`);
    }
    const app = await readFile(new URL('../static/music/app.mjs', import.meta.url), 'utf8');
    assert.ok(!/^import[^\n]*\.\/ai(?:-context)?\.mjs/m.test(app), 'app.mjs must not statically import AI modules');
    assert.ok(app.indexOf("import('./ai-context.mjs')") > app.indexOf("meta[name=\"hive-music-ai\"]"), 'AI helpers load only after the enabled check');
    const mount = app.slice(app.indexOf('m.mountAI('), app.indexOf('.catch(', app.indexOf('m.mountAI(')));
    assert.ok(mount.includes('structuredClone(progress)'));
    for (const forbidden of ['persist', 'saveSkill', 'recordAnswer', 'storage,', 'storage }']) assert.ok(!mount.includes(forbidden), `mountAI must not receive ${forbidden}`);
});

test('layout renders the assistant only when enabled, and the default config keeps it off', async () => {
    const layout = await readFile(new URL('../layouts/music/single.html', import.meta.url), 'utf8');
    for (const id of ['ai-toggle', 'ai-panel', 'hive-music-ai', 'music/ai.css']) {
        const at = layout.indexOf(id); assert.ok(at > 0, id);
        assert.ok(layout.lastIndexOf('{{ if $ai', at) > layout.lastIndexOf('{{ end', at) || layout.lastIndexOf('{{- if $ai', at) > layout.lastIndexOf('{{- end', at), `${id} must be inside the $ai condition`);
    }
    const config = await readFile(new URL('../hugo.toml', import.meta.url), 'utf8');
    assert.match(config, /\[params\.musicAI\]\nenabled = false/);
    assert.ok(!/service_role|SERVICE_ROLE/.test(config));
});
