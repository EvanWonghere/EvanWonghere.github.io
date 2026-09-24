// Pure planning for the administrator's cloud copy of saved works and arrangements. It compares the
// local items, the per-device ledger (which cloud revision and content each local item was last in
// step with) and the cloud rows, and returns what to upload, download and delete. Nothing is ever
// dropped silently: when both sides changed, the cloud copy keeps the id and the local one is kept as
// a copy. Network, storage and UI live in sync.mjs; this file has no browser APIs.

export const SYNC_KEY = 'hive-music-sync-v1';
export const KINDS = ['score', 'live', 'arrangement'];
export const CLOUD_LIMIT = 50;
export const COPY_SUFFIX = '（本机副本）';
const ID = /^[A-Za-z0-9_-]{1,100}$/;
export const itemKey = (kind, id) => `${kind}:${id}`;
export const capacityGroup = kind => kind === 'arrangement' ? 'arrangement' : 'works';

/** Stable JSON: object keys sorted, so the same content always hashes the same. */
export function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
    return JSON.stringify(value);
}
export async function contentHash({ title, body }) {
    const bytes = new TextEncoder().encode(canonical({ title, body }));
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Local works and arrangements as sync items: { kind, id, title, body }. */
export const workItem = w => ({ kind: w.kind, id: w.id, title: w.title || '未命名', body: { source: w.source } });
export const arrangementItem = doc => ({ kind: 'arrangement', id: doc.id, title: doc.title || '未命名编曲', body: doc });

export function freshLedger(userId) { return { version: 1, userId, items: {}, lastSync: 0, paused: false }; }
/** A ledger that cannot be read is treated as empty, which makes the next sync a first sync (a union). */
export function readLedger(raw) {
    try {
        const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!v || v.version !== 1 || typeof v.userId !== 'string' || !v.items || typeof v.items !== 'object') return null;
        const items = {};
        for (const [key, e] of Object.entries(v.items)) if (e && Number.isInteger(e.rev) && e.rev >= 1 && /^[0-9a-f]{64}$/.test(e.hash)) items[key] = { rev: e.rev, hash: e.hash };
        return { version: 1, userId: v.userId, items, lastSync: Number(v.lastSync) || 0, paused: v.paused === true };
    } catch { return null; }
}

/**
 * local: [{ kind, id, title, hash }], remote: cloud rows without bodies
 * ({ kind, id, title, content_hash, revision, deleted, updated_at }), room: free local slots per
 * capacity group. Returns the actions; `conflicts` mean "download the cloud copy into this id and keep
 * the local version as a new copy" and need one free slot each.
 */
export function planSync({ local, ledger, remote, room = { works: Infinity, arrangement: Infinity } }) {
    const L = new Map(local.map(i => [itemKey(i.kind, i.id), i]));
    const R = new Map(remote.filter(r => KINDS.includes(r.kind) && ID.test(r.id)).map(r => [itemKey(r.kind, r.id), r]));
    const E = ledger.items;
    const free = { ...room };
    const plan = { inserts: [], updates: [], remoteDeletes: [], downloads: [], localDeletes: [], conflicts: [], links: [], forget: [], cloudOnly: [], blocked: [] };
    const take = kind => { const g = capacityGroup(kind); if (free[g] > 0) { free[g]--; return true; } return false; };
    const link = r => plan.links.push({ kind: r.kind, id: r.id, rev: r.revision, hash: r.content_hash });
    const conflict = (l, r) => { if (take(l.kind)) plan.conflicts.push({ kind: l.kind, id: l.id, rev: r.revision }); else plan.blocked.push({ kind: l.kind, id: l.id, title: l.title, reason: 'conflict-full' }); };
    const newDownloads = [];
    for (const key of new Set([...L.keys(), ...R.keys(), ...Object.keys(E)])) {
        const l = L.get(key), r = R.get(key), e = E[key];
        if (l) {
            if (!r) { plan.inserts.push({ kind: l.kind, id: l.id }); continue; }
            if (!e) {
                // First time this item meets the cloud on this device.
                if (!r.deleted && r.content_hash === l.hash) link(r);
                else if (r.deleted) plan.updates.push({ kind: l.kind, id: l.id, base: r.revision });
                else conflict(l, r);
                continue;
            }
            const localChanged = l.hash !== e.hash, remoteChanged = r.revision !== e.rev;
            if (!localChanged && !remoteChanged) continue;
            if (localChanged && !remoteChanged) { plan.updates.push({ kind: l.kind, id: l.id, base: e.rev }); continue; }
            if (!localChanged) { if (r.deleted) plan.localDeletes.push({ kind: l.kind, id: l.id, rev: r.revision }); else if (r.content_hash === l.hash) link(r); else plan.downloads.push({ kind: l.kind, id: l.id }); continue; }
            // Both sides changed: an edit beats a deletion; two edits keep both.
            if (r.deleted) plan.updates.push({ kind: l.kind, id: l.id, base: r.revision });
            else if (r.content_hash === l.hash) link(r);
            else conflict(l, r);
            continue;
        }
        if (!r) { if (e) plan.forget.push(key); continue; }
        if (e) {
            if (r.deleted) plan.forget.push(key);
            else if (r.revision === e.rev) plan.remoteDeletes.push({ kind: r.kind, id: r.id, base: e.rev });
            else newDownloads.push(r); // edited elsewhere after this device deleted it: keep the edit
            continue;
        }
        if (!r.deleted) newDownloads.push(r);
    }
    // New cloud items fill the free local slots newest first; the rest stay listed as cloud-only.
    newDownloads.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    for (const r of newDownloads) {
        if (take(r.kind)) plan.downloads.push({ kind: r.kind, id: r.id });
        else plan.cloudOnly.push({ kind: r.kind, id: r.id, title: r.title, updated_at: r.updated_at });
    }
    return plan;
}

/** Whether a first sync on this account needs the user's confirmation before local items go up. */
export function needsAccountConfirmation(ledger, userId, localCount) {
    return Boolean(ledger && ledger.userId && ledger.userId !== userId && localCount > 0);
}

export const copyTitle = title => (String(title).slice(0, 100 - COPY_SUFFIX.length) + COPY_SUFFIX);

/** Validates a downloaded row before it may replace local data. Returns the local shape or throws. */
export function toLocal(row, { validateDocument, maxSource }) {
    if (!row || !KINDS.includes(row.kind) || !ID.test(row.id) || row.deleted || !row.body || typeof row.body !== 'object') throw new Error('云端作品格式不正确');
    if (row.kind === 'arrangement') {
        const doc = validateDocument(row.body);
        if (doc.id !== row.id) throw new Error('云端编曲的 ID 不一致');
        return doc;
    }
    if (!/^[a-zA-Z0-9-]{1,70}$/.test(row.id) || typeof row.body.source !== 'string' || row.body.source.length > maxSource) throw new Error('云端作品格式不正确');
    return { id: row.id, kind: row.kind, title: String(row.title).slice(0, 100), source: row.body.source, at: Date.parse(row.updated_at) || Date.now() };
}
