// Administrator AI assistant. Loaded on demand; anonymous practice never imports this file.
// It receives read-only getters from app.mjs and has no way to save progress or grades.
import { MUSIC_CATALOG_VERSIONS } from './catalog-versions.mjs';
import { AI_RETURN_KEY, POLL_DELAYS, authCallback, canUseMusic, parseAccess, quotaText, buildArrangeRequest, buildRequest, classifyProposal, classifyResponse, clearArrangePending, clearPending, historyTurns, loadArrangePending, loadPending, pendingOutcome, proposalFromHistory, returnTarget, saveArrangePending, savePending, buildStrudelRequest, classifySnippet, clearStrudelPending, loadStrudelPending, saveStrudelPending, snippetFromHistory } from './ai-context.mjs';

const $ = selector => document.querySelector(selector);
const KIND_NAMES = { lesson: '讲解本课', homework: '作业反馈', composition: '作曲点评' };
const PLACEHOLDERS = { lesson: '例如：为什么 E 和 F 之间没有黑键？换一种方式讲一遍。', homework: '例如：看看我的作业自查和日志，下一步该练什么？', composition: '例如：第二句的和声进行自然吗？怎样让结尾更有终止感？' };
const session = (() => { try { return window.sessionStorage; } catch { return { getItem: () => null, setItem() { throw new Error('blocked'); }, removeItem() {} }; } })();

export async function mountAI({ config, getSnapshot, getLesson, getComposition, getTab, setTab, notify }) {
    const { createClient } = await import('./vendor/supabase-js-2.112.4.mjs');
    const callback = authCallback(location.href);
    const client = createClient(config.url, config.key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const panel = $('#ai-panel'), toggle = $('#ai-toggle');
    // `admin` here means "may use the music AI": an administrator, or a member with the music scope.
    // `owner` is an administrator; only owners get the cloud library of saved works.
    let kind = 'lesson', target = null, busy = false, admin = false, owner = false, user = null, pollTimer = null, generation = 0, clearConfirm = '', clearTimer = null;
    const adminListeners = new Set(), accessListeners = new Set();

    const status = (text, bad = false) => { $('#ai-status').textContent = text; $('#ai-status').classList.toggle('bad', bad); };
    const show = state => { for (const id of ['ai-signed-out', 'ai-not-admin', 'ai-ready']) $('#' + id).hidden = id !== state; };
    const setBusy = value => { busy = value; $('#ai-send').disabled = value || !admin; $('#ai-clear').disabled = value; $('#ai-message').disabled = value; };

    function currentTarget() {
        const lesson = getLesson(), composition = kind === 'composition' ? getComposition() : null;
        try { return { ...buildRequest({ kind, message: '-', requestId: '00000000-0000-4000-8000-000000000000', progress: getSnapshot(), lesson, composition, versions: MUSIC_CATALOG_VERSIONS }).payload, error: '' }; }
        catch (e) { return { kind, subjectId: kind === 'composition' ? (composition?.workId || 'draft') : lesson?.id, error: e.message }; }
    }
    function describe() {
        const lesson = getLesson(), composition = kind === 'composition' ? getComposition() : null;
        return kind === 'composition' ? `作曲草稿：${composition?.title || '未命名乐谱'}` : `第 ${lesson?.index ?? '?'} 课 · ${lesson?.title || ''}`;
    }
    async function call(body) {
        const { data } = await client.auth.getSession();
        if (!data.session) throw Object.assign(new Error('登录已失效，请重新登录。'), { settled: true });
        const response = await fetch(config.functionUrl, { method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: config.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        let json = {};
        try { json = await response.json(); } catch { json = { error: '服务返回了无法识别的内容' }; }
        return { status: response.status, body: json };
    }
    function renderHistory(rows) {
        const list = $('#ai-history');
        const turns = historyTurns(rows);
        list.replaceChildren(...turns.map(turn => {
            const item = document.createElement('article'); item.className = 'ai-turn';
            const q = document.createElement('p'); q.className = 'ai-question'; q.textContent = turn.user.body;
            const a = document.createElement('div'); a.className = 'ai-answer';
            const state = turn.assistant?.status;
            a.textContent = state === 'complete' ? turn.assistant.body : state === 'running' ? '正在生成…' : turn.assistant?.body || '未完成';
            a.classList.toggle('bad', state === 'failed');
            item.append(q, a);
            if (state === 'complete' && turn.assistant.model) { const m = document.createElement('span'); m.className = 'ai-model'; m.textContent = turn.assistant.model; item.append(m); }
            return item;
        }));
        $('#ai-empty').hidden = turns.length > 0;
        list.scrollTop = list.scrollHeight;
    }
    function resetClear() { clearTimeout(clearTimer); clearConfirm = ''; $('#ai-clear').textContent = '清空此处记录'; }
    async function loadHistory() {
        target = currentTarget(); resetClear();
        $('#ai-subject').textContent = describe();
        $('#ai-message').placeholder = PLACEHOLDERS[kind];
        if (target.error && kind !== 'composition') { renderHistory([]); status(target.error, true); return null; }
        if (!target.subjectId) { renderHistory([]); return null; }
        const mine = ++generation;
        try {
            const result = await call({ action: 'music-history', kind, subjectId: target.subjectId });
            if (mine !== generation) return null;
            if (result.status !== 200) { status(result.body.error || '历史读取失败', true); return null; }
            renderHistory(result.body.messages); if (!busy) status(target.error || '');
            return result.body.messages;
        } catch { status('网络错误，历史暂未读取。', true); return null; }
    }
    function poll(pending, step = 0) {
        clearTimeout(pollTimer);
        if (step >= POLL_DELAYS.length) { setBusy(false); status('仍未确认结果；请求已保留，稍后刷新页面会自动核对。', true); void refreshQuota(); return; }
        pollTimer = setTimeout(async () => {
            try {
                const result = await call({ action: 'music-history', kind: pending.payload.kind, subjectId: pending.payload.subjectId });
                const outcome = result.status === 200 ? pendingOutcome(result.body.messages, pending.payload.requestId) : 'wait';
                if (outcome === 'wait' || outcome === 'missing') { poll(pending, step + 1); return; }
                clearPending(session); setBusy(false); void refreshQuota();
                status(outcome === 'done' ? '已取回回复。' : '上一次请求没有完成，可以重新提问。', outcome !== 'done');
                await loadHistory();
            } catch { poll(pending, step + 1); }
        }, POLL_DELAYS[step]);
    }
    async function send(pending) {
        setBusy(true); status('正在生成回复；刷新页面不会丢失这个请求。');
        let result;
        try { result = await call(pending.payload); }
        catch (e) {
            if (e.settled) { clearPending(session); setBusy(false); status(e.message, true); return; }
            setBusy(false); status('网络中断；请求已保留，可点“重试同一请求”，不会重复计费。', true); $('#ai-retry').hidden = false; return;
        }
        const outcome = classifyResponse(result.status, result.body);
        if (outcome === 'wait') { status(result.body.error || '请求仍在处理，稍后自动核对…'); poll(pending); return; }
        clearPending(session); setBusy(false); $('#ai-retry').hidden = true; void refreshQuota();
        if (outcome === 'done') { $('#ai-message').value = ''; status(result.body.recovered ? '已恢复此前完成的回复。' : 'AI 意见，不计入成绩与掌握状态。'); }
        else status(result.body.error || '请求未完成。', true);
        if (pending.payload.kind === kind) await loadHistory();
    }
    async function submit() {
        if (busy || !admin) return;
        let request;
        try { request = buildRequest({ kind, message: $('#ai-message').value, requestId: crypto.randomUUID(), progress: getSnapshot(), lesson: getLesson(), composition: kind === 'composition' ? getComposition() : null, versions: MUSIC_CATALOG_VERSIONS }); }
        catch (e) { status(e.message, true); return; }
        const pending = { payload: request.payload, label: request.label };
        if (!savePending(session, pending)) status('浏览器不允许暂存请求；刷新页面时这次请求无法自动恢复。', true);
        await send(pending);
    }
    /** ai_access(), or is_app_admin on a backend that predates members. */
    async function readAccess() {
        const access = parseAccess(await client.rpc('ai_access'));
        if (access) return access;
        const check = await client.rpc('is_app_admin');
        return { admin: !check.error && check.data === true, scopes: [], dailyLimit: null, usedToday: null };
    }
    function showQuota(access) {
        const quota = $('#ai-quota'), text = quotaText(access); if (!quota) return;
        quota.hidden = !text; quota.textContent = text || '';
    }
    /** Members see the remaining daily requests go down after each answer. */
    async function refreshQuota() { if (admin && !owner) showQuota(await readAccess()); }
    async function refreshUser() {
        const { data } = await client.auth.getSession();
        user = data.session?.user || null;
        if (!user) { admin = owner = false; for (const listener of accessListeners) listener(false); for (const listener of adminListeners) listener(false); show('ai-signed-out'); toggle.textContent = 'AI 助手'; setBusy(false); return; }
        const access = await readAccess();
        owner = access.admin; admin = canUseMusic(access);
        for (const listener of accessListeners) listener(admin);
        for (const listener of adminListeners) listener(owner);
        showQuota(access);
        show(admin ? 'ai-ready' : 'ai-not-admin');
        $('#ai-account').textContent = user.user_metadata?.user_name || user.email || '已登录';
        setBusy(busy);
        if (admin) {
            const pending = loadPending(session);
            if (pending && !busy) { kind = pending.payload.kind; syncKind(); status('正在核对刷新前的请求…'); await send(pending); }
            else await loadHistory();
        }
    }
    function syncKind() { for (const input of document.querySelectorAll('input[name="ai-kind"]')) input.checked = input.value === kind; }
    function open() { panel.hidden = false; toggle.setAttribute('aria-expanded', 'true'); if (admin) void loadHistory(); $('#ai-close').focus(); }
    function close() { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); }

    $('#ai-close').onclick = close;
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    $('#ai-signin').onclick = async () => {
        try { session.setItem(AI_RETURN_KEY, JSON.stringify({ tab: getTab(), open: true })); } catch { /* returns to the default tab */ }
        const { error } = await client.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: location.origin + location.pathname } });
        if (error) status('无法开始登录：' + error.message, true);
    };
    for (const id of ['ai-signout', 'ai-signout-other']) $('#' + id).onclick = async () => { clearTimeout(pollTimer); await client.auth.signOut({ scope: 'local' }); await refreshUser(); notify('已退出；题库与概念实验室使用同一登录，也已退出。'); };
    for (const input of document.querySelectorAll('input[name="ai-kind"]')) input.onchange = () => { if (busy) { syncKind(); return; } kind = input.value; void loadHistory(); };
    $('#ai-send').onclick = () => void submit();
    $('#ai-message').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); } });
    $('#ai-retry').onclick = () => { const pending = loadPending(session); $('#ai-retry').hidden = true; if (pending) void send(pending); };
    // The confirmation is bound to one conversation; switching kind, lesson or score resets it.
    $('#ai-clear').onclick = async () => {
        if (!target?.subjectId || busy) return;
        const key = `${kind}:${target.subjectId}`;
        if (clearConfirm !== key) { resetClear(); clearConfirm = key; $('#ai-clear').textContent = '再点一次确认清空'; clearTimer = setTimeout(resetClear, 4000); return; }
        resetClear();
        const result = await call({ action: 'music-clear', kind, subjectId: target.subjectId }).catch(() => ({ status: 0, body: { error: '网络错误' } }));
        status(result.status === 200 ? `已清空 ${result.body.removed} 条记录。` : result.body.error || '清空失败', result.status !== 200);
        await loadHistory();
    };
    client.auth.onAuthStateChange(event => { if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setTimeout(() => void refreshUser(), 0); });

    // detectSessionInUrl exchanges ?code= during initialization; wait for it, then tidy the URL.
    const initial = await client.auth.getSession();
    // A code that did not become a session (expired verifier, failed request) is a failed login, not a silent sign-out.
    const loginError = callback.error || (callback.hasCode && !initial.data?.session ? '未能换取登录会话，可能已超时或网络中断，请重新登录。' : '');
    if (callback.isCallback) {
        history.replaceState(null, '', callback.cleanUrl);
        let back = null; try { back = returnTarget(session.getItem(AI_RETURN_KEY)); session.removeItem(AI_RETURN_KEY); } catch { /* keep current tab */ }
        if (back) setTab(back.tab);
        if (loginError) notify('GitHub 登录未完成：' + loginError);
        if (back?.open || loginError) open();
    }
    await refreshUser();
    if (loginError) status('GitHub 登录未完成：' + loginError, true);
    syncKind();
    // ---------- arrangement proposals (used by the arrangement desk) ----------
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function arrangeOnce(payload) {
        const result = await call(payload);
        const outcome = classifyProposal(result.status, result.body);
        if (outcome === 'done') { clearArrangePending(session); return { status: 'done', proposal: { summary: result.body.summary, ops: result.body.ops, baseHash: result.body.baseHash, recovered: result.body.recovered === true } }; }
        if (outcome === 'failed') { clearArrangePending(session); return { status: 'failed', error: result.body.error || '请求未完成。' }; }
        for (const delay of POLL_DELAYS) {
            await sleep(delay);
            const history = await call({ action: 'music-history', kind: 'arrangement', subjectId: payload.arrangementId }).catch(() => null);
            if (history?.status !== 200) continue;
            const proposal = proposalFromHistory(history.body.messages, payload.requestId);
            if (proposal) { clearArrangePending(session); return { status: 'done', proposal }; }
            if (pendingOutcome(history.body.messages, payload.requestId) === 'failed') { clearArrangePending(session); return { status: 'failed', error: '上一次提案请求没有完成，可以重新请求。' }; }
        }
        return { status: 'pending', error: '仍未确认结果；请求已保留，刷新页面后会自动核对。' };
    }
    // ---------- Strudel snippets (used by the live-coding page) ----------
    async function strudelOnce(payload) {
        const result = await call(payload);
        const outcome = classifySnippet(result.status, result.body);
        if (outcome === 'done') { clearStrudelPending(session); return { status: 'done', snippet: { summary: result.body.summary, code: result.body.code, recovered: result.body.recovered === true } }; }
        if (outcome === 'failed') { clearStrudelPending(session); return { status: 'failed', error: result.body.error || '请求未完成。' }; }
        for (const delay of POLL_DELAYS) {
            await sleep(delay);
            const history = await call({ action: 'music-history', kind: 'strudel', subjectId: payload.workId }).catch(() => null);
            if (history?.status !== 200) continue;
            const snippet = snippetFromHistory(history.body.messages, payload.requestId);
            if (snippet) { clearStrudelPending(session); return { status: 'done', snippet }; }
            if (pendingOutcome(history.body.messages, payload.requestId) === 'failed') { clearStrudelPending(session); return { status: 'failed', error: '上一次片段请求没有完成，可以重新请求。' }; }
        }
        return { status: 'pending', error: '仍未确认结果；请求已保留，刷新页面后会自动核对。' };
    }
    async function runStrudel(payload) {
        try { return await strudelOnce(payload); }
        catch (e) {
            if (e.settled) { clearStrudelPending(session); return { status: 'failed', error: e.message }; }
            return { status: 'pending', error: '网络中断；请求已保留，可重试同一请求，不会重复计费。' };
        }
    }
    async function runArrangement(payload) {
        try { return await arrangeOnce(payload); }
        catch (e) {
            if (e.settled) { clearArrangePending(session); return { status: 'failed', error: e.message }; }
            return { status: 'pending', error: '网络中断；请求已保留，可重试同一请求，不会重复计费。' };
        }
    }
    return {
        open, close, toggle() { if (panel.hidden) open(); else close(); }, refresh() { if (admin && !busy && !panel.hidden) void loadHistory(); },
        /** An administrator (the cloud library of saved works is theirs only). */
        isAdmin: () => owner,
        /** May use the music AI: an administrator or a member with the music scope. */
        canUse: () => admin,
        onAccessChange(listener) { accessListeners.add(listener); listener(admin); },
        // Shared with the cloud sync of saved works: same client and login session.
        cloud: () => client, userId: () => user?.id ?? null,
        onAdminChange(listener) { adminListeners.add(listener); listener(owner); },
        /** Sends a proposal request; the page applies nothing until the administrator accepts it. */
        requestArrangement(input) {
            if (!admin) return Promise.resolve({ status: 'failed', error: '当前账号没有音乐 AI 的使用权限。' });
            const payload = buildArrangeRequest({ ...input, requestId: crypto.randomUUID() });
            saveArrangePending(session, payload);
            return runArrangement(payload).finally(() => void refreshQuota());
        },
        pendingArrangement: () => loadArrangePending(session)?.payload || null,
        retryArrangement() { const pending = loadArrangePending(session); return pending ? runArrangement(pending.payload) : Promise.resolve(null); },
        discardArrangement() { clearArrangePending(session); },
        /** Asks for a Strudel snippet; the page only plays it in the sandbox or inserts it on request. */
        requestStrudel(input) {
            if (!admin) return Promise.resolve({ status: 'failed', error: '当前账号没有音乐 AI 的使用权限。' });
            const payload = buildStrudelRequest({ ...input, requestId: crypto.randomUUID() });
            saveStrudelPending(session, payload);
            return runStrudel(payload).finally(() => void refreshQuota());
        },
        pendingStrudel: () => loadStrudelPending(session)?.payload || null,
        retryStrudel() { const pending = loadStrudelPending(session); return pending ? runStrudel(pending.payload) : Promise.resolve(null); },
        discardStrudel() { clearStrudelPending(session); }
    };
}
