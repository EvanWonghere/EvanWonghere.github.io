// The live-coding page's own player and staff: the draft plays in the Strudel sandbox, and the
// notatable part of it is parsed (as text, never evaluated here) onto a staff that follows the
// sandbox's events. Nothing here writes progress; the draft itself is saved by creative.mjs.
import { appendLayer, parseStrudel, parsedScore } from './strudel-parse.mjs';
import { compileABC } from './arrange-abc.mjs';
import { loadABC, highlightStarts } from './abc-loader.mjs';
import { sharedSandbox } from './strudel-sandbox.mjs';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function mountLiveSandbox({ audio, notify, stopAll, creative }) {
    const sandbox = sharedSandbox();
    let parsed = null, score = null, compiled = null, visual = null, lastCode = null, lastMeter = null;
    let renderTimer = 0, generation = 0, run = null, resendTimer = 0, highlight = '';
    const code = () => $('#live-source').value;
    const status = text => { $('#live-sandbox-status').textContent = text; };
    const busy = on => { $('#live-sandbox-play').disabled = on; $('#live-sandbox-stop').disabled = !on; };

    function highlightAt(cycle) {
        if (!score || !parsed?.cycles) return;
        const local = (((cycle % parsed.cycles) + parsed.cycles) % parsed.cycles) * score.real.bpb;
        const ids = score.real.events.filter(e => e.start <= local + 1e-6 && e.start + e.beats > local + 1e-6).map(e => e.id);
        const starts = new Set(ids.map(id => compiled?.map[id]?.[0]).filter(v => v !== undefined)), key = [...starts].join(',');
        if (key === highlight) return; highlight = key;
        highlightStarts(visual, $('#live-sheet'), starts);
        $('#live-position').textContent = `第 ${Math.floor(local / score.real.bpb) + 1}/${parsed.cycles} 循环`;
    }
    function clearHighlight() { highlight = ''; highlightStarts(visual, $('#live-sheet'), new Set()); $('#live-position').textContent = ''; }

    function render() {
        clearTimeout(renderTimer);
        renderTimer = setTimeout(async () => {
            const source = code(), meter = $('#live-meter').value;
            if (source === lastCode && meter === lastMeter) return;
            lastCode = source; lastMeter = meter;
            const mine = ++generation;
            parsed = parseStrudel(source);
            score = parsedScore(parsed, { meter, title: $('#live-title').value.trim() || '即兴手稿' });
            const notes = [...parsed.warnings, ...score.notes];
            $('#live-parse-notes').innerHTML = notes.map(n => `<li>${esc(n)}</li>`).join('');
            $('#live-parse-notes').hidden = !notes.length;
            const count = score.real.events.length;
            if (!count) { visual = null; compiled = null; $('#live-sheet').replaceChildren(); $('#live-sheet-status').textContent = '这段代码里没有可以记谱的音高；可以在沙箱里直接听。'; return; }
            compiled = compileABC(score.real, score.doc, { mode: 'score' });
            try {
                await loadABC(); if (mine !== generation) return;
                const sheet = $('#live-sheet');
                visual = window.ABCJS.renderAbc('live-sheet', compiled.abc, { add_classes: true, responsive: 'resize', staffwidth: Math.max(320, sheet.clientWidth - 50), paddingleft: 20, paddingright: 20 })[0] || null;
                highlight = '';
                $('#live-sheet-status').textContent = `${parsed.cycles} 个循环 · 每循环一小节 ${meter} · ${count} 个音${parsed.cpm ? ` · ${+parsed.cpm.toFixed(2)} cpm` : ''}`;
            } catch (e) { $('#live-sheet-status').textContent = e.message; }
        }, 300);
    }

    sandbox.subscribe(message => {
        if (message.type === 'status' && run) status(message.message);
        if (!run || (message.id !== undefined && message.id !== null && message.id !== run.id)) return;
        if (message.type === 'hap' && !run.audition) {
            const mine = run, cycle = message.cycle;
            const timer = setTimeout(() => { mine.timers.delete(timer); if (run === mine) highlightAt(cycle); }, Math.max(0, message.delay * 1000));
            mine.timers.add(timer);
        }
        if (message.type === 'error') status(`Strudel 报错：${message.message}`);
        if (message.type === 'log') status(message.message);
    });
    const options = () => ({ online: $('#live-sandbox-online').checked, instrument: audio.instrument });
    async function play() {
        stopAll();
        const mine = { id: `live-${Date.now().toString(36)}`, timers: new Set() };
        run = mine; busy(true); status('正在启动 Strudel 沙箱…'); render();
        try {
            await sandbox.play(code(), mine.id, options());
            if (run === mine) status('正在沙箱里演奏；修改代码会在停顿片刻后自动更新。');
        } catch (e) { if (run === mine) { stop(); status(`未能演奏：${e.message}`); } }
    }
    function resend() {
        if (!run) return;
        clearTimeout(resendTimer);
        resendTimer = setTimeout(() => { if (run) sandbox.play(code(), run.id, options()).catch(e => status(e.message)); }, 600);
    }
    function stop() {
        clearTimeout(resendTimer);
        if (run) { for (const t of run.timers) clearTimeout(t); run = null; sandbox.stop(); status('沙箱演奏已停止。'); clearHighlight(); }
        busy(false);
    }

    $('#live-sandbox-play').onclick = () => void play();
    $('#live-sandbox-stop').onclick = stop;
    $('#live-sandbox-online').onchange = () => { if (run) { stop(); void play(); } };
    $('#live-meter').onchange = render;
    // Live draft → score draft (replaces it; the score editor keeps an undo step). Unreadable parts are named.
    $('#live-to-score').onclick = () => {
        const parsed = parseStrudel(code()), score = parsedScore(parsed, { meter: $('#live-meter').value, title: $('#live-title').value.trim() || '即兴手稿' });
        if (!score.real.events.length) { notify('这段代码里没有可以记谱的音高（鼓不记谱）。'); return; }
        const { abc } = compileABC(score.real, score.doc, { mode: 'score' });
        creative.importScore(abc);
        const notes = [...parsed.warnings, ...score.notes];
        if (notes.length) notify(`已转成五线谱；${notes.length} 处需要留意：${notes[0]}${notes.length > 1 ? ' 等' : ''}`);
    };

    // ---------- AI Strudel snippets (administrator; the card exists only when the AI is enabled) ----------
    const SNIPPET_KEY = 'hive-music-live-snippet';
    const tabStore = (() => { try { return window.sessionStorage; } catch { return null; } })();
    let assistant = null, openAssistant = null, resumed = false, snippet = null, before = null, inserted = null;
    try { const kept = JSON.parse(tabStore?.getItem(SNIPPET_KEY) || 'null'); if (kept && typeof kept.code === 'string' && typeof kept.summary === 'string') snippet = kept; } catch { /* nothing kept */ }
    const keep = () => { try { if (snippet) tabStore?.setItem(SNIPPET_KEY, JSON.stringify(snippet)); else tabStore?.removeItem(SNIPPET_KEY); } catch { /* stays in memory */ } };
    const aiStatus = (text, bad = false) => { const el = $('#live-ai-status'); if (el) { el.textContent = text; el.classList.toggle('bad', bad); } };
    function renderSnippet() {
        if (!$('#live-ai')) return;
        $('#live-ai-result').hidden = !snippet; $('#live-ai-undo').hidden = before === null;
        if (!snippet) return;
        $('#live-ai-summary').textContent = snippet.summary; $('#live-ai-code').textContent = snippet.code;
    }
    function insert(mode) {
        if (!snippet) return;
        const draft = creative.liveDraft().code;
        const next = mode === 'replace' ? snippet.code : appendLayer(draft, snippet.code);
        if (next === null) { aiStatus('手稿里有变量或多条语句，无法自动叠成新的一层；可以替换，或复制代码手动合并。', true); return; }
        if (next.length > 40000) { aiStatus('合并后超过 40000 字符，请先精简手稿。', true); return; }
        before = draft; inserted = next; creative.setLiveCode(next); renderSnippet();
        aiStatus(mode === 'replace' ? '已用 AI 片段替换手稿；可以撤回。' : '已把 AI 片段作为新的一层（$:）加入手稿；可以撤回。');
    }
    function handleResult(result) {
        if (!$('#live-ai')) return;
        $('#live-ai-go').disabled = false; $('#live-ai-retry').hidden = result?.status !== 'pending';
        if (!result) { aiStatus(''); return; }
        if (result.status !== 'done') { aiStatus(result.error, true); return; }
        snippet = { summary: result.snippet.summary, code: result.snippet.code }; before = null; keep(); renderSnippet();
        aiStatus(result.snippet.recovered ? '已取回之前生成的片段。' : '片段已生成：先在沙箱试听，再决定追加或替换。');
    }
    async function requestSnippet() {
        if (!assistant?.canUse()) { openAssistant?.(); return; }
        if (snippet && !confirm('生成新片段会替换当前未处理的片段，继续？')) return;
        const { code: draft, workId } = creative.liveDraft();
        $('#live-ai-go').disabled = true; $('#live-ai-retry').hidden = true;
        aiStatus('正在生成片段，通常需要十几秒；刷新页面不会丢失这个请求。');
        let result;
        try { result = await assistant.requestStrudel({ draft, workId, message: $('#live-ai-text').value }); }
        catch (error) { result = { status: 'failed', error: error.message }; }
        handleResult(result);
    }
    if ($('#live-ai')) {
        $('#live-ai-go').onclick = () => void requestSnippet();
        $('#live-ai-signin').onclick = () => openAssistant?.();
        $('#live-ai-retry').onclick = () => { if (!assistant?.pendingStrudel()) return; $('#live-ai-retry').hidden = true; $('#live-ai-go').disabled = true; aiStatus('正在重试同一请求…'); void assistant.retryStrudel().then(handleResult); };
        $('#live-ai-try').onclick = () => { if (snippet) void audition(snippet.code); };
        $('#live-ai-append').onclick = () => insert('append');
        $('#live-ai-replace').onclick = () => { if (confirm('用 AI 片段替换整个手稿？可以用“撤回”恢复。')) insert('replace'); };
        $('#live-ai-discard').onclick = () => { snippet = null; keep(); renderSnippet(); aiStatus('已放弃片段，手稿没有改动。'); };
        $('#live-ai-undo').onclick = () => { if (before === null) return; if (creative.liveDraft().code !== inserted && !confirm('插入之后手稿又改动过，撤回会一并丢弃这些改动。继续？')) return; creative.setLiveCode(before); before = null; renderSnippet(); aiStatus('已撤回，手稿恢复到插入之前。'); };
        renderSnippet();
    }
    async function audition(code) {
        stopAll();
        const mine = { id: `try-${Date.now().toString(36)}`, timers: new Set(), audition: true };
        run = mine; busy(true); status('正在沙箱里试听 AI 片段…');
        try { await sandbox.play(code, mine.id, options()); if (run === mine) status('正在试听 AI 片段；谱面仍是手稿本身。'); }
        catch (e) { if (run === mine) { stop(); status(`未能演奏：${e.message}`); } }
    }

    return {
        stop,
        attachAssistant(api) {
            assistant = api;
            api.onAccessChange(admin => {
                if (!$('#live-ai')) return;
                $('#live-ai-login').hidden = admin; $('#live-ai-form').hidden = !admin;
                if (admin && !resumed && api.pendingStrudel()) {
                    resumed = true; $('#live-ai-go').disabled = true; aiStatus('正在核对刷新前的片段请求…');
                    void api.retryStrudel().then(handleResult);
                }
            });
        },
        setAssistantOpener(fn) { openAssistant = fn; },
        /** Called whenever the draft changes programmatically (examples, imports, the library). */
        changed() { render(); resend(); },
        show(name) { if (name === 'live') { lastCode = null; render(); } }
    };
}
