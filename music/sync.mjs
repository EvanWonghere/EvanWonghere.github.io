// Cloud copy of the administrator's saved works and arrangements (music_works, owner/admin RLS).
// Loaded only after the AI assistant, i.e. only when [params.musicAI] is on and someone signed in.
// Local storage stays the working copy: this module compares it with the cloud, applies validated
// cloud copies through creative/arrange, and uploads with "based on revision n" writes so a stale
// device can never overwrite a newer copy. Practice progress is not synced.
import { KINDS, SYNC_KEY, arrangementItem, capacityGroup, contentHash, copyTitle, freshLedger, itemKey, needsAccountConfirmation, planSync, readLedger, toLocal, workItem } from './sync-core.mjs';
import { validateDocument, LIMITS } from './arrangement-schema.mjs';
import { newDocId } from './arrangement.mjs';
import { MAX_SOURCE, MAX_WORKS } from './composition.mjs';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const META = 'kind,id,title,content_hash,revision,deleted,updated_at';
const KIND_NAMES = { score: '乐谱', live: '即兴手稿', arrangement: '编曲' };
const DELAY = 3000;

export function describeError(error) {
    const text = String(error?.message || error?.code || error || '');
    if (/music_works_limit/.test(text)) return '云端每类最多 50 首，超出的部分没有上传。';
    if (/music_works_quota/.test(text)) return '云端空间已满（8 MB），请删除一些不需要的作品。';
    if (/JWT|401|403|row-level|permission/i.test(text)) return '登录已失效或不再是管理员，同步已暂停。';
    if (/Failed to fetch|NetworkError|network/i.test(text)) return '网络不可用，作品已保存在本机，恢复后会自动同步。';
    return `同步失败：${text.slice(0, 120) || '未知错误'}`;
}

export function mountSync({ api, creative, arrange, storage, notify, progressBlocked }) {
    const card = $('#sync-card');
    let running = null, again = false, timer = 0, lastPlan = null, lastError = '', confirmFor = null, lastFocusRun = 0;
    const readL = () => { try { return readLedger(storage.getItem(SYNC_KEY)); } catch { return null; } };
    const writeL = ledger => { try { storage.setItem(SYNC_KEY, JSON.stringify(ledger)); return true; } catch { return false; } };
    const client = () => api.cloud();

    // ---------- local side ----------
    async function localItems() {
        const works = progressBlocked() ? null : creative.cloudWorks(), docs = arrange.cloudArrangements();
        const items = [...(works || []).map(workItem), ...(docs || []).map(arrangementItem)];
        for (const item of items) item.hash = await contentHash(item);
        return { items, works, docs, kinds: KINDS.filter(k => (k === 'arrangement' ? docs : works) !== null) };
    }

    // ---------- one pass ----------
    async function pass(forced = {}) {
        const userId = api.userId(); if (!userId || !api.isAdmin()) return { state: 'signed-out' };
        let ledger = readL();
        const local = await localItems();
        if (needsAccountConfirmation(ledger, userId, local.items.length) && confirmFor !== userId) return { state: 'confirm', count: local.items.length };
        if (!ledger || ledger.userId !== userId) ledger = freshLedger(userId);
        if (ledger.paused) { writeL(ledger); return { state: 'paused' }; }
        const { data: rows, error } = await client().from('music_works').select(META);
        if (error) throw error;
        // A group whose local archive is unreadable is left out entirely, so nothing is deleted for it.
        const remote = rows.filter(r => local.kinds.includes(r.kind));
        const localForPlan = local.items.filter(i => local.kinds.includes(i.kind));
        const room = { works: local.works ? MAX_WORKS - local.works.length : 0, arrangement: local.docs ? LIMITS.docs - local.docs.length : 0 };
        const plan = planSync({ local: localForPlan, ledger, remote, room });
        let full = false;
        for (const f of forced.downloads || []) {
            if (room[capacityGroup(f.kind)] > plan.downloads.filter(d => capacityGroup(d.kind) === capacityGroup(f.kind)).length) { plan.downloads.push(f); plan.cloudOnly = plan.cloudOnly.filter(c => !(c.kind === f.kind && c.id === f.id)); }
            else full = true;
        }
        const byKey = new Map(local.items.map(i => [itemKey(i.kind, i.id), i]));
        const localWork = id => local.works.find(w => w.id === id), localDoc = id => local.docs.find(d => d.id === id);

        // Downloads (and the cloud side of conflicts) with their bodies, validated before use.
        const wanted = [...plan.downloads, ...plan.conflicts];
        const bodies = new Map();
        for (const kind of KINDS) {
            const ids = wanted.filter(w => w.kind === kind).map(w => w.id);
            if (!ids.length) continue;
            const { data, error: e } = await client().from('music_works').select(`${META},body`).eq('kind', kind).in('id', ids);
            if (e) throw e;
            for (const row of data) bodies.set(itemKey(row.kind, row.id), row);
        }
        const puts = { works: [], arrangement: [] }, deletes = { works: [], arrangement: [] }, copies = [], invalid = [];
        const ledgerAfterApply = [];
        for (const w of wanted) {
            const row = bodies.get(itemKey(w.kind, w.id));
            let value; try { value = toLocal(row, { validateDocument, maxSource: MAX_SOURCE }); } catch { invalid.push(w); continue; }
            puts[capacityGroup(w.kind)].push(value);
            ledgerAfterApply.push({ kind: w.kind, id: w.id, rev: row.revision, value });
            if (plan.conflicts.includes(w)) {
                // The cloud copy keeps the id; the local version becomes a new item and is uploaded.
                const original = w.kind === 'arrangement' ? localDoc(w.id) : localWork(w.id);
                const copy = w.kind === 'arrangement' ? validateDocument({ ...original, id: newDocId(), title: copyTitle(original.title) }) : { ...original, id: crypto.randomUUID(), title: copyTitle(original.title), at: Date.now() };
                puts[capacityGroup(w.kind)].push(copy); copies.push({ kind: w.kind, value: copy });
            }
        }
        for (const d of plan.localDeletes) deletes[capacityGroup(d.kind)].push(d);
        let deferred = false;
        if (puts.works.length || deletes.works.length) creative.applyCloudWorks({ puts: puts.works, deletes: deletes.works });
        if (puts.arrangement.length || deletes.arrangement.length) deferred = arrange.applyCloudArrangements({ puts: puts.arrangement, deletes: deletes.arrangement }) === false;
        // The ledger records what is stored locally after applying, so normalisation by the local
        // validators does not look like a local edit on the next pass.
        for (const a of ledgerAfterApply) {
            if (deferred && a.kind === 'arrangement') continue;
            const item = a.kind === 'arrangement' ? arrangementItem(a.value) : workItem(a.value);
            ledger.items[itemKey(a.kind, a.id)] = { rev: a.rev, hash: await contentHash(item) };
        }
        for (const d of plan.localDeletes) if (!(deferred && d.kind === 'arrangement')) delete ledger.items[itemKey(d.kind, d.id)];
        for (const l of plan.links) ledger.items[itemKey(l.kind, l.id)] = { rev: l.rev, hash: byKey.get(itemKey(l.kind, l.id))?.hash || l.hash };
        for (const k of plan.forget) delete ledger.items[k];
        writeL(ledger);

        // Uploads: new items insert; changed items update only if the cloud is still at the base revision.
        let stale = false; const failures = [];
        const bodyOf = (kind, id) => { const item = byKey.get(itemKey(kind, id)); return item && { title: item.title, body: item.body, content_hash: item.hash }; };
        const inserts = [...plan.inserts.map(i => ({ kind: i.kind, id: i.id, ...bodyOf(i.kind, i.id) }))];
        for (const c of copies) { if (deferred && c.kind === 'arrangement') continue; const item = c.kind === 'arrangement' ? arrangementItem(c.value) : workItem(c.value); inserts.push({ kind: c.kind, id: c.value.id, title: item.title, body: item.body, content_hash: await contentHash(item) }); }
        for (const row of inserts) {
            const { data, error: e } = await client().from('music_works').insert(row).select('revision');
            if (e) { if (/duplicate|23505/.test(`${e.code} ${e.message}`)) stale = true; else failures.push(e); continue; }
            ledger.items[itemKey(row.kind, row.id)] = { rev: data[0].revision, hash: row.content_hash };
        }
        for (const u of plan.updates) {
            const row = bodyOf(u.kind, u.id);
            const { data, error: e } = await client().from('music_works').update({ ...row, deleted: false }).eq('kind', u.kind).eq('id', u.id).eq('revision', u.base).select('revision');
            if (e) { failures.push(e); continue; }
            if (!data.length) { stale = true; continue; }
            ledger.items[itemKey(u.kind, u.id)] = { rev: data[0].revision, hash: row.content_hash };
        }
        for (const d of plan.remoteDeletes) {
            const { data, error: e } = await client().from('music_works').update({ deleted: true, body: null }).eq('kind', d.kind).eq('id', d.id).eq('revision', d.base).select('revision');
            if (e) { failures.push(e); continue; }
            if (!data.length) { stale = true; continue; }
            delete ledger.items[itemKey(d.kind, d.id)];
        }
        ledger.lastSync = Date.now(); writeL(ledger);
        return { state: 'done', full, plan, copies: copies.filter(c => !(deferred && c.kind === 'arrangement')), invalid, deferred, stale, failures };
    }

    async function run(forced) {
        if (running) { again = true; return running; }
        clearTimeout(timer);
        running = (async () => {
            render('正在同步…');
            try {
                let result = await pass(forced);
                // Another device wrote in between: plan again once with the new revisions.
                if (result.stale) result = await pass();
                lastError = result.failures?.length ? describeError(result.failures[0]) : '';
                if (result.state === 'done') {
                    lastPlan = result.plan;
                    if (result.copies.length) notify(`${result.copies.length} 首作品在两台设备上都改过，已保留两份；本机版本名为“…（本机副本）”。`);
                    if (result.invalid.length) lastError = `${result.invalid.length} 首云端作品格式不正确，已跳过，本机未改动。`;
                    if (result.deferred) lastError = '正在预览 AI 编曲提案，编曲的同步稍后进行。';
                    if (result.full) lastError = '本机作品库或编曲已满（各 20），先删除一首再取回。';
                }
                render(null, result);
            } catch (error) { lastError = describeError(error); render(); }
            finally { running = null; if (again) { again = false; schedule(500); } }
        })();
        return running;
    }
    function schedule(ms = DELAY) { clearTimeout(timer); timer = setTimeout(() => void run(), ms); }

    // ---------- card ----------
    function render(busyText, result) {
        if (!card) return;
        const ledger = readL(), signedIn = Boolean(api.userId() && api.isAdmin());
        $('#sync-login').hidden = signedIn; $('#sync-ready').hidden = !signedIn;
        if (!signedIn) return;
        const paused = ledger?.paused === true;
        $('#sync-pause').textContent = paused ? '恢复本设备同步' : '暂停本设备同步';
        $('#sync-now').disabled = Boolean(busyText) || paused;
        $('#sync-confirm').hidden = result?.state !== 'confirm';
        if (result?.state === 'confirm') $('#sync-confirm-text').textContent = `此设备上次同步的是另一个账号。要把本机 ${result.count} 首作品与编曲上传到当前账号吗？`;
        const when = ledger?.lastSync ? new Date(ledger.lastSync).toLocaleString('zh-CN', { hour12: false }) : '尚未同步';
        const text = busyText || (paused ? '本设备已暂停同步；作品仍保存在本机。' : lastError || (result?.state === 'confirm' ? '等待确认。' : `已同步 · 上次 ${when}`));
        $('#sync-status').textContent = text; $('#sync-status').classList.toggle('bad', Boolean(lastError) && !busyText);
        const cloudOnly = lastPlan?.cloudOnly || [], blocked = lastPlan?.blocked || [];
        const list = $('#sync-cloud-only');
        list.innerHTML = [
            ...cloudOnly.map(c => `<li><span>${esc(KIND_NAMES[c.kind])} · ${esc(c.title)}</span><button data-fetch="${esc(c.kind)}:${esc(c.id)}">取回</button></li>`),
            ...blocked.map(b => `<li class="bad"><span>${esc(b.title)}：两台设备都改过，本机已满，腾出一个位置后会保留两份</span></li>`)
        ].join('');
        list.hidden = !list.innerHTML;
        $('#sync-cloud-note').hidden = !cloudOnly.length;
        for (const b of list.querySelectorAll('[data-fetch]')) b.onclick = () => { const [kind, ...rest] = b.dataset.fetch.split(':'); void run({ downloads: [{ kind, id: rest.join(':') }] }); };
    }
    if (card) {
        $('#sync-now').onclick = () => void run();
        $('#sync-pause').onclick = () => {
            const userId = api.userId(); if (!userId) return;
            const ledger = readL(); const next = ledger && ledger.userId === userId ? ledger : freshLedger(userId);
            next.paused = !next.paused; writeL(next); render();
            if (!next.paused) void run();
        };
        $('#sync-confirm-yes').onclick = () => { confirmFor = api.userId(); void run(); };
        $('#sync-confirm-no').onclick = () => { const userId = api.userId(); const next = freshLedger(userId); next.paused = true; writeL(next); render(); };
    }

    api.onAdminChange(admin => { render(); if (admin) void run(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastFocusRun > 30000) { lastFocusRun = Date.now(); void run(); } });
    addEventListener('online', () => void run());
    return {
        changed: () => { if (api.userId() && api.isAdmin()) schedule(); },
        /** After a backup restore or a reset the whole list was replaced; the next pass is a union, never a deletion. */
        rebase() {
            const ledger = readL(); if (!ledger) return;
            ledger.items = {}; writeL(ledger); if (api.userId() && api.isAdmin()) schedule(500);
        },
        run
    };
}
