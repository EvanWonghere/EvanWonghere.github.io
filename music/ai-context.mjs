// Pure helpers for the administrator AI assistant: configuration, request context,
// pending-request recovery and the GitHub login callback. No DOM, no network, and no
// access to progress writers; the assistant reads a copy of progress and never saves it.
import { checkABC } from './composition.mjs';

export const AI_PENDING_KEY = 'hive-music-ai-pending';
export const AI_RETURN_KEY = 'hive-music:return-after-auth';
export const COMPOSITION_VERSION = 'score-v1';
export const AI_KINDS = ['lesson', 'homework', 'composition'];
// Polls after an unsettled reply; the server marks a request failed after 150 seconds.
export const POLL_DELAYS = [3000, 6000, 12000, 24000, 48000, 60000];
const SUBJECT = /^[A-Za-z0-9_-]{1,100}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABS = ['route', 'theory', 'ear', 'sight', 'piano', 'rhythm', 'harmony', 'compose', 'live', 'arrange', 'progress', 'resources'];

/** Reads the Hugo-rendered meta data. Returns null unless both public values look valid. */
export function parseConfig(data) {
    const url = String(data?.url || '').trim().replace(/\/+$/, ''), key = String(data?.key || '').trim();
    if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(url) && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(url)) return null;
    if (!/^[A-Za-z0-9._-]{20,400}$/.test(key)) return null;
    return { url, key, functionUrl: `${url}/functions/v1/ai-tutor` };
}

export function hasStoredSession(storage) {
    try {
        for (let i = 0; i < storage.length; i++) if (/^sb-.+-auth-token$/.test(storage.key(i) || '')) return true;
    } catch { /* blocked storage: treat as signed out */ }
    return false;
}

/** Parses the OAuth return URL; cleanUrl drops only the auth parameters. */
export function authCallback(href) {
    const url = new URL(href);
    const hasCode = url.searchParams.has('code');
    const error = url.searchParams.get('error_description') || url.searchParams.get('error') || '';
    for (const name of ['code', 'state', 'error', 'error_code', 'error_description']) url.searchParams.delete(name);
    return { hasCode, error, isCallback: hasCode || Boolean(error), cleanUrl: url.pathname + url.search + url.hash };
}

/** Anonymous visitors without a session never load the assistant or supabase-js. */
export function shouldLoadAI({ config, href, storage }) {
    if (!config) return false;
    return authCallback(href).isCallback || hasStoredSession(storage);
}

export function returnTarget(raw) {
    try {
        const value = JSON.parse(raw);
        return { tab: TABS.includes(value?.tab) ? value.tab : 'route', open: value?.open === true };
    } catch { return null; }
}

export function lessonStats(progress, lesson) {
    const ids = (lesson?.questions || []).map(q => q.id);
    const cards = ids.map(id => progress?.cards?.[id]).filter(Boolean);
    return {
        quizDone: cards.filter(c => c.lastCorrect).length, quizTotal: ids.length,
        attempts: cards.reduce((n, c) => n + (c.attempts || 0), 0), correct: cards.reduce((n, c) => n + (c.correct || 0), 0),
        lessonMarkedDone: progress?.lessons?.[lesson?.id] === true
    };
}

/** Builds the per-kind context from read-only inputs; never mutates them. */
export function buildContext(kind, { progress, lesson, composition } = {}) {
    if (kind === 'lesson') return { stats: lessonStats(progress, lesson) };
    if (kind === 'homework') return {
        stats: lessonStats(progress, lesson),
        tasks: (progress?.lessonTasks?.[lesson?.id] || []).slice(0, 12).map(v => v === true),
        journal: (progress?.journal || []).slice(-3).map(e => ({ text: String(e.text || '').slice(0, 1200), bpm: e.bpm }))
    };
    if (kind === 'composition') {
        const abc = String(composition?.abc || '');
        if (!abc.trim()) throw new Error('先写下或载入乐谱，再请求点评。');
        if (abc.length > 12000) throw new Error('乐谱超过 12000 字符，请选取一段后再请求点评。');
        let check = '格式检查通过';
        try { checkABC(abc); } catch (e) { check = `格式检查未通过：${e.message}`; }
        return { title: String(composition?.title || '').slice(0, 100), abc, check };
    }
    throw new Error('未知的助手用途。');
}

export function subjectFor(kind, { lesson, composition, versions }) {
    if (kind === 'composition') {
        const workId = SUBJECT.test(composition?.workId || '') ? composition.workId : 'draft';
        return { subjectId: workId, subjectVersion: COMPOSITION_VERSION, label: `作曲：${composition?.title || '未命名乐谱'}` };
    }
    const version = versions?.[lesson?.id];
    if (!version) throw new Error('这一课还没有 AI 讲解目录，请等待更新。');
    return { subjectId: lesson.id, subjectVersion: version, label: lesson.title };
}

export function buildRequest({ kind, message, requestId, progress, lesson, composition, versions }) {
    if (!AI_KINDS.includes(kind)) throw new Error('未知的助手用途。');
    const text = String(message || '').trim();
    if (!text) throw new Error('先写下想问的问题。');
    if (text.length > 4000) throw new Error('问题最多 4000 字。');
    if (!UUID.test(requestId || '')) throw new Error('无效请求 ID。');
    const subject = subjectFor(kind, { lesson, composition, versions });
    const context = buildContext(kind, { progress, lesson, composition });
    if (JSON.stringify(context).length > 16000) throw new Error('上下文过大，请缩短日志或乐谱后再试。');
    return { payload: { action: 'music-chat', requestId, kind, subjectId: subject.subjectId, subjectVersion: subject.subjectVersion, message: text, context }, label: subject.label };
}

// The pending request lives in sessionStorage so a reload can resend the same request ID
// and payload; the practice progress key is never touched.
export function savePending(storage, pending) {
    try { storage.setItem(AI_PENDING_KEY, JSON.stringify({ ...pending, savedAt: pending.savedAt ?? Date.now() })); return true; } catch { return false; }
}
export function loadPending(storage) {
    try {
        const value = JSON.parse(storage.getItem(AI_PENDING_KEY) || 'null');
        const p = value?.payload;
        if (!p || p.action !== 'music-chat' || !UUID.test(p.requestId) || !AI_KINDS.includes(p.kind) || !SUBJECT.test(p.subjectId)) return null;
        return value;
    } catch { return null; }
}
export function clearPending(storage) { try { storage.removeItem(AI_PENDING_KEY); } catch { /* nothing to clear */ } }

/** done: show the reply; wait: keep the pending request and check history; failed: clear it. */
export function classifyResponse(status, body) {
    if (status === 200 && typeof body?.body === 'string') return 'done';
    if (body?.settled === false) return 'wait';
    return 'failed';
}

/** Groups history rows into request turns, oldest first. */
export function historyTurns(rows) {
    const turns = new Map();
    for (const row of rows || []) {
        const turn = turns.get(row.request_id) || { requestId: row.request_id, at: row.created_at };
        turn[row.role] = row; turns.set(row.request_id, turn);
    }
    return [...turns.values()].filter(t => t.user).sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

export function pendingOutcome(rows, requestId) {
    const assistant = (rows || []).find(r => r.request_id === requestId && r.role === 'assistant');
    if (!assistant) return 'missing';
    return assistant.status === 'complete' ? 'done' : assistant.status === 'running' ? 'wait' : 'failed';
}

// ---------- arrangement proposals ----------
// A proposal request carries the whole arrangement (the server re-validates it with the same schema).
export const ARRANGE_PENDING_KEY = 'hive-music-ai-arrange-pending';
export const ARRANGE_LIMITS = { doc: 24000, message: 2000, checks: 12 };
export function buildArrangeRequest({ doc, scope = {}, message, checks = [], requestId }) {
    const text = String(message || '').trim();
    if (!text) throw new Error('先描述想要的感觉或改动。');
    if (text.length > ARRANGE_LIMITS.message) throw new Error(`描述最多 ${ARRANGE_LIMITS.message} 字。`);
    if (!UUID.test(requestId || '')) throw new Error('无效请求 ID。');
    if (JSON.stringify(doc).length > ARRANGE_LIMITS.doc) throw new Error('编曲过大，AI 一次最多读取约 24 KB；请减少手写音符或拆分编曲。');
    const cleanScope = {};
    if (scope.section) { if (!doc.sections.some(s => s.id === scope.section)) throw new Error('所选段落不存在。'); cleanScope.section = scope.section; }
    if (scope.track) { if (!doc.tracks.some(t => t.id === scope.track)) throw new Error('所选声部不存在。'); cleanScope.track = scope.track; }
    return { action: 'music-arrange', requestId, arrangementId: doc.id, doc, scope: cleanScope, message: text, checks: checks.slice(0, ARRANGE_LIMITS.checks).map(c => String(c).slice(0, 300)) };
}
export function saveArrangePending(storage, payload) { try { storage.setItem(ARRANGE_PENDING_KEY, JSON.stringify({ payload, savedAt: Date.now() })); return true; } catch { return false; } }
export function loadArrangePending(storage) {
    try {
        const value = JSON.parse(storage.getItem(ARRANGE_PENDING_KEY) || 'null'), p = value?.payload;
        return p && p.action === 'music-arrange' && UUID.test(p.requestId) && p.doc && typeof p.message === 'string' ? value : null;
    } catch { return null; }
}
export function clearArrangePending(storage) { try { storage.removeItem(ARRANGE_PENDING_KEY); } catch { /* nothing to clear */ } }
/** done: a proposal came back; wait: still running on the server; failed: settled without one. */
export function classifyProposal(status, body) {
    if (status === 200 && Array.isArray(body?.ops) && typeof body?.summary === 'string') return 'done';
    if (body?.settled === false) return 'wait';
    return 'failed';
}
/** Rebuilds a proposal from history rows after a reload, or null if it is not finished. */
export function proposalFromHistory(rows, requestId) {
    const row = (rows || []).find(r => r.request_id === requestId && r.role === 'assistant');
    if (!row || row.status !== 'complete' || !Array.isArray(row.payload?.ops)) return null;
    return { summary: row.body, ops: row.payload.ops, baseHash: row.subject_version, recovered: true };
}

// ---------- Strudel snippets (live-coding page) ----------
// The request carries the current draft; the reply is code that only runs in the sandbox.
export const STRUDEL_PENDING_KEY = 'hive-music-ai-strudel-pending';
export const STRUDEL_LIMITS = { draft: 12000, message: 2000, code: 6000 };
export function buildStrudelRequest({ draft = '', workId = 'draft', message, requestId }) {
    const text = String(message || '').trim();
    if (!text) throw new Error('先描述想要的声音或节奏。');
    if (text.length > STRUDEL_LIMITS.message) throw new Error(`描述最多 ${STRUDEL_LIMITS.message} 字。`);
    if (!UUID.test(requestId || '')) throw new Error('无效请求 ID。');
    if (!SUBJECT.test(workId)) throw new Error('无效的手稿。');
    if (String(draft).length > STRUDEL_LIMITS.draft) throw new Error(`手稿超过 ${STRUDEL_LIMITS.draft} 字符；AI 只读取较短的手稿，请先删去无关部分。`);
    return { action: 'music-strudel', requestId, workId, draft: String(draft), message: text };
}
export function saveStrudelPending(storage, payload) { try { storage.setItem(STRUDEL_PENDING_KEY, JSON.stringify({ payload, savedAt: Date.now() })); return true; } catch { return false; } }
export function loadStrudelPending(storage) {
    try {
        const value = JSON.parse(storage.getItem(STRUDEL_PENDING_KEY) || 'null'), p = value?.payload;
        return p && p.action === 'music-strudel' && UUID.test(p.requestId) && SUBJECT.test(p.workId) && typeof p.draft === 'string' && typeof p.message === 'string' ? value : null;
    } catch { return null; }
}
export function clearStrudelPending(storage) { try { storage.removeItem(STRUDEL_PENDING_KEY); } catch { /* nothing to clear */ } }
/** done: a snippet came back; wait: still running on the server; failed: settled without one. */
export function classifySnippet(status, body) {
    if (status === 200 && typeof body?.code === 'string' && body.code.length <= STRUDEL_LIMITS.code + 1 && typeof body?.summary === 'string') return 'done';
    if (body?.settled === false) return 'wait';
    return 'failed';
}
export function snippetFromHistory(rows, requestId) {
    const row = (rows || []).find(r => r.request_id === requestId && r.role === 'assistant');
    if (!row || row.status !== 'complete' || typeof row.payload?.code !== 'string') return null;
    return { summary: row.body, code: row.payload.code, recovered: true };
}
