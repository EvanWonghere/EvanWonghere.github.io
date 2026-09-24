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
const TABS = ['route', 'theory', 'ear', 'sight', 'piano', 'rhythm', 'harmony', 'compose', 'live', 'progress', 'resources'];

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
