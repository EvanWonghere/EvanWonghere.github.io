import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { freshProgress, recordAnswer, STORAGE_KEY } from '../static/music/core.mjs';
import { LESSONS } from '../static/music/curriculum.mjs';
import { MUSIC_CATALOG_VERSIONS } from '../static/music/catalog-versions.mjs';
import { ARRANGEMENT_MODULES, arrangementCopy, buildCatalog, catalogVersions, versionsModule } from '../tools/music-catalog.mjs';
import { createFromTemplate } from '../static/music/arrangement.mjs';
import { canUseMusic, parseAccess, quotaText, ARRANGE_PENDING_KEY, buildArrangeRequest, classifyProposal, clearArrangePending, loadArrangePending, proposalFromHistory, saveArrangePending, AI_PENDING_KEY, COMPOSITION_VERSION, POLL_DELAYS, authCallback, buildContext, buildRequest, classifyResponse, clearPending, hasStoredSession, historyTurns, lessonStats, loadPending, parseConfig, pendingOutcome, returnTarget, savePending, shouldLoadAI } from '../static/music/ai-context.mjs';

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
    // Cloud sync is its own module, loaded after the assistant; it writes only the works library and arrangements.
    const sync = await readFile(new URL('../static/music/sync.mjs', import.meta.url), 'utf8');
    for (const forbidden of ['saveProgress', 'recordAnswer', 'recordSkill', "'hive-music-v1'", 'lessons', 'cards']) assert.ok(!sync.includes(forbidden), `sync.mjs must not reference ${forbidden}`);
    assert.ok(app.indexOf("import('./sync.mjs')") > app.indexOf("aiMeta?.dataset.sync !== '1'"), 'sync loads only when switched on');
});

test('layout renders the assistant only when enabled, and an enabled config carries only public values', async () => {
    const layout = await readFile(new URL('../layouts/music/single.html', import.meta.url), 'utf8');
    for (const id of ['ai-toggle', 'ai-panel', 'hive-music-ai', 'music/ai.css']) {
        const at = layout.indexOf(id); assert.ok(at > 0, id);
        assert.ok(layout.lastIndexOf('{{ if $ai', at) > layout.lastIndexOf('{{ end', at) || layout.lastIndexOf('{{- if $ai', at) > layout.lastIndexOf('{{- end', at), `${id} must be inside the $ai condition`);
    }
    const config = await readFile(new URL('../hugo.toml', import.meta.url), 'utf8');
    const section = config.match(/\[params\.musicAI\]\nenabled = (true|false)\nsupabaseUrl = "([^"]*)"\npublishableKey = "([^"]*)"\n/);
    assert.ok(section, '[params.musicAI] must keep its enabled / supabaseUrl / publishableKey layout');
    if (section[1] === 'true') {
        assert.match(section[2], /^https:\/\/[a-z0-9]+\.supabase\.co$/);
        assert.match(section[3], /^sb_publishable_[A-Za-z0-9_-]+$/, 'only the public publishable key may be configured');
    }
    assert.ok(!/service_role|SERVICE_ROLE|sb_secret_/.test(config));
});

test('arrangement proposal requests: scope, size and message limits', () => {
    const doc = createFromTemplate('pop', 'arr-1');
    const payload = buildArrangeRequest({ doc, scope: { section: 'verse', track: 'comp' }, message: ' 更慵懒 ', checks: ['a'.repeat(400)], requestId });
    assert.deepEqual([payload.action, payload.arrangementId, payload.message, payload.scope, payload.checks[0].length], ['music-arrange', 'arr-1', '更慵懒', { section: 'verse', track: 'comp' }, 300]);
    assert.throws(() => buildArrangeRequest({ doc, message: '', requestId }), /描述/);
    assert.throws(() => buildArrangeRequest({ doc, message: 'x', requestId, scope: { section: 'nope' } }), /段落/);
    assert.throws(() => buildArrangeRequest({ doc, message: 'x', requestId: 'bad' }), /请求 ID/);
    assert.throws(() => buildArrangeRequest({ doc: { ...doc, title: 'x'.repeat(30000) }, message: 'x', requestId }), /24 KB/);
});

test('arrangement proposal recovery: pending storage, classification, history', () => {
    const storage = memory(), doc = createFromTemplate('pop', 'arr-1');
    const payload = buildArrangeRequest({ doc, message: 'x', requestId });
    assert.ok(saveArrangePending(storage, payload));
    assert.deepEqual(loadArrangePending(storage).payload, payload);
    assert.equal(storage.getItem(STORAGE_KEY), null, 'progress storage untouched');
    storage.setItem(ARRANGE_PENDING_KEY, '{"payload":{"action":"music-chat"}}'); assert.equal(loadArrangePending(storage), null);
    clearArrangePending(storage); assert.equal(storage.getItem(ARRANGE_PENDING_KEY), null);
    assert.equal(classifyProposal(200, { summary: 's', ops: [] }), 'done');
    assert.equal(classifyProposal(409, { settled: false }), 'wait');
    assert.equal(classifyProposal(422, { settled: true }), 'failed');
    const rows = [{ request_id: requestId, role: 'assistant', status: 'complete', body: '说明', payload: { ops: [{ type: 'setMeta', tempo: 90 }] }, subject_version: 'h' }];
    assert.deepEqual(proposalFromHistory(rows, requestId), { summary: '说明', ops: [{ type: 'setMeta', tempo: 90 }], baseHash: 'h', recovered: true });
    assert.equal(proposalFromHistory([{ ...rows[0], status: 'running' }], requestId), null);
});

test('the quiz function gets marked copies of exactly the arrangement modules it needs', async () => {
    assert.deepEqual(ARRANGEMENT_MODULES, ['harmony.mjs', 'arrange-styles.mjs', 'arrangement-schema.mjs', 'arrangement.mjs']);
    for (const file of ARRANGEMENT_MODULES) {
        const source = await readFile(new URL(`../static/music/${file}`, import.meta.url), 'utf8');
        const imports = [...source.matchAll(/from '\.\/([^']+)'/g)].map(m => m[1]);
        for (const dep of imports) assert.ok(ARRANGEMENT_MODULES.includes(dep), `${file} imports ${dep}, which is not copied`);
        assert.match(arrangementCopy(file, source), /^\/\/ Generated copy of static\/music\//);
        assert.ok(!/\b(?:document|window)\.[A-Za-z]|localStorage/.test(source), `${file} must stay free of browser APIs`);
    }
});

test('AI access: administrators and music members may use the assistant; only administrators get cloud sync', async () => {
    const member = parseAccess({ data: { admin: false, scopes: ['music'], dailyLimit: 30, usedToday: 12, expiresAt: null }, error: null });
    assert.deepEqual(member, { admin: false, scopes: ['music'], dailyLimit: 30, usedToday: 12 });
    assert.equal(canUseMusic(member), true); assert.equal(quotaText(member), '今天还可以用 18 / 30 次（北京时间零点恢复）');
    assert.match(quotaText({ ...member, usedToday: 40 }), /还可以用 0 \/ 30/);
    const admin = parseAccess({ data: { admin: true, scopes: ['quiz', 'labs', 'music'] }, error: null });
    assert.equal(canUseMusic(admin), true); assert.equal(quotaText(admin), null, 'administrators have no daily limit');
    for (const denied of [{ data: { admin: false, scopes: [] } }, { data: { admin: false, scopes: ['labs'] } }, { data: { admin: 'true', scopes: 'music' } }]) assert.equal(canUseMusic(parseAccess(denied)), false);
    for (const unusable of [{ data: null, error: { message: 'function ai_access() does not exist' } }, { data: true }, { data: ['music'] }, null]) assert.equal(parseAccess(unusable), null, 'falls back to is_app_admin');
    assert.equal(canUseMusic(null), false);
    const read = path => readFile(new URL(`../static/music/${path}`, import.meta.url), 'utf8');
    const [ai, arrange, live, sync, app] = await Promise.all(['ai.mjs', 'arrange.mjs', 'live-sandbox.mjs', 'sync.mjs', 'app.mjs'].map(read));
    assert.ok(ai.includes("client.rpc('ai_access')") && ai.includes('isAdmin: () => owner') && ai.includes('canUse: () => admin'));
    for (const [name, source] of [['arrange', arrange], ['live', live]]) { assert.ok(source.includes('onAccessChange(') && source.includes('canUse()'), name); assert.ok(!source.includes('isAdmin()') && !source.includes('onAdminChange('), name); }
    assert.ok(sync.includes('api.isAdmin()') && !sync.includes('canUse'), 'the cloud library stays administrator-only');
    assert.ok(app.includes('api.onAdminChange(admin =>'), 'cloud sync loads for administrators only');
});
