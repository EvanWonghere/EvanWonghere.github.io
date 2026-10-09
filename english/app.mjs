import { STORAGE_KEY, MAX_SECONDS, MAX_RECORDS, wordCount, validateReference, validateStore, mergeStores, encodeWav, wordClass, errorLabel } from './core.mjs';
import { requestAssessment } from './service.mjs';
import { initReader } from './reader.mjs';
import { createLive, recognitionSupported, describeRecognitionError } from './live.mjs';
import { align, liveStates, wordsCorrectPerMinute } from './align.mjs';
import { tokenize } from './library.mjs';
import { createSpanPlayer, renderWordDetail } from './feedback.mjs';
const $ = id => document.getElementById(id);
let client, admin = false, phase = 'idle', clip = null, recorder = null, stream = null, playbackURL = '', recordingStart = 0, tick, autoStop, canceledRecording = false, aborter;
let store = { version: 1, records: [] }, storeWritable = true;
let pageActive = true;
const hooks = {};
const player = createSpanPlayer();
let live = null, liveHeard = null;
const status = (message, bad = false) => { $('status').textContent = message; $('status').classList.toggle('bad', bad); };
const warn = message => { $('storage-warning').hidden = false; $('storage-warning').textContent = message; };
const formatScore = score => score === null ? '—' : String(score);
function controls() {
    const busy = phase !== 'idle';
    $('record').disabled = busy;
    $('stop').disabled = phase !== 'recording';
    $('discard').disabled = busy || !clip;
    $('assess').disabled = busy || !clip || !admin;
    $('cancel').hidden = phase !== 'assessing' && phase !== 'checking';
    $('check-service').disabled = busy || !admin;
    for (const id of ['reference', 'locale', 'accent']) $(id).disabled = busy;
    if (recognitionSupported()) $('live-toggle').disabled = busy;
    $('detail-toggle').disabled = busy;
}
function updateCount() { $('word-count').textContent = `${wordCount($('reference').value)} / 60 词`; showWords(); }
// The reference as words that can light up. states[k] is 'hit', 'miss', 'swap', 'now' or 'pending' for the k-th word.
function showWords(reference = $('reference').value, states = null) {
    const box = $('live-words');
    box.hidden = !$('live-toggle').checked || !reference.trim();
    if (box.hidden) return;
    box.replaceChildren();
    let k = 0;
    for (const token of tokenize(reference)) {
        if (!token.word) { box.append(token.text); continue; }
        const span = document.createElement('span'); span.textContent = token.text;
        if (states?.[k]) span.className = `lw ${states[k]}`;
        box.append(span); k += 1;
    }
}
const PREFS = 'hive-english-prefs-v1';
const ACCENTS = ['en-US', 'en-GB'];
const loadPrefs = () => { try { const p = JSON.parse(localStorage.getItem(PREFS)); return p?.version === 1 ? p : {}; } catch { return {}; } };
const savePrefs = patch => { try { localStorage.setItem(PREFS, JSON.stringify({ ...loadPrefs(), version: 1, ...patch })); } catch { /* the choice just is not remembered */ } };
// One target accent for model voices, dictation and scoring. Both selects (top bar and practice panel) show it.
function setAccent(value, remember = true) {
    if (!ACCENTS.includes(value)) return;
    $('locale').value = value; $('accent').value = value;
    if (remember) savePrefs({ locale: value });
}
$('locale').onchange = () => setAccent($('locale').value);
$('accent').onchange = () => setAccent($('accent').value);
setAccent(loadPrefs().locale ?? 'en-US', false);
function setupLive() {
    const toggle = $('live-toggle');
    if (!recognitionSupported()) { toggle.disabled = true; $('live-hint').textContent = '这个浏览器没有提供实时听写，无法使用实时亮词。'; return; }
    toggle.checked = loadPrefs().live === true;
    toggle.onchange = () => { savePrefs({ live: toggle.checked }); $('local-note').textContent = ''; showWords(); };
}
// Everything heard against the reference: how many words, and how fast. Dictation errs, so this is a hint.
function measureLocal(reference, heard, seconds) {
    if (heard === null) return null;
    if (!heard.trim()) { $('local-note').textContent = '听写没有返回文字（可能是网络或麦克风问题），这次没有本地比对。'; return null; }
    const result = align(reference, heard);
    showWords(reference, result.marks);
    const rate = wordsCorrectPerMinute(result.hits, seconds);
    $('local-note').textContent = `听写比对：读对 ${result.hits} / ${result.total} 个词${rate ? `，约 ${rate} 词/分钟` : ''}。听写会有误差，只作参考。`;
    return result;
}
function startLive(reference, locale) {
    $('local-note').textContent = '';
    if (!$('live-toggle').checked) return;
    live = createLive({ locale, onText: text => showWords(reference, liveStates(reference, text).states), onError: code => { $('local-note').textContent = describeRecognitionError(code); } });
    live?.start();
}
const stopLive = () => { live?.abort(); live = null; liveHeard = null; };
updateCount();
$('reference').oninput = updateCount;
function readStore() {
    try { const raw = localStorage.getItem(STORAGE_KEY); store = raw === null ? { version: 1, records: [] } : validateStore(JSON.parse(raw)); storeWritable = true; }
    catch { storeWritable = false; warn('浏览器存储不可用，或记录损坏/版本较新；原数据已保留，新成绩暂不写入。请先导出备份。'); }
}
readStore();
function saveRecord(record) {
    hooks.onScored?.(record);   // the archive wants every scored recording, even when the history cannot be written
    if (!storeWritable) return;
    try {
        // Re-read first: another open tab may have added records since this page loaded.
        const raw = localStorage.getItem(STORAGE_KEY);
        const current = raw === null ? { version: 1, records: [] } : validateStore(JSON.parse(raw));
        store = mergeStores(current, { version: 1, records: [record] });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch { storeWritable = false; warn('无法保存本次成绩；原记录已保留。请导出记录，检查浏览器存储空间。'); }
    renderHistory();
}
function renderResult(record) {
    $('result-empty').hidden = true; $('result').hidden = false;
    $('result-reference').textContent = record.reference;
    $('scores').replaceChildren();
    for (const [key, label] of [['pronunciation', '综合发音'], ['accuracy', '准确度'], ['fluency', '流利度'], ['completeness', '完整度'], ['prosody', '韵律']]) {
        if (key === 'prosody' && record.result.scores.prosody == null) continue;   // only the American accent is scored for it
        const item = document.createElement('div'); item.className = 'score';
        const number = document.createElement('strong'); number.textContent = formatScore(record.result.scores[key]);
        const caption = document.createElement('span'); caption.textContent = label; item.append(number, caption); $('scores').append(item);
    }
    $('words').replaceChildren(); $('word-detail').textContent = '绿色：≥80；橙色：60–79；红色：低分或漏读、多读。';
    for (const word of record.result.words) {
        const button = document.createElement('button'); button.className = wordClass(word); button.type = 'button';
        const text = document.createElement('span'); text.textContent = word.text;
        const score = document.createElement('small'); score.textContent = word.error === 'Omission' ? '漏读' : `${formatScore(word.accuracy)}${errorLabel(word.error) ? ' · ' + errorLabel(word.error) : ''}`;
        button.append(text, score); button.onclick = () => renderWordDetail($('word-detail'), word, { player, canReplay: Boolean(clip && clip.assessedId === record.id), locale: record.locale });
        $('words').append(button);
    }
    $('result-note').textContent = `${record.locale === 'en-US' ? '美式' : '英式'}英语 · ${new Date(record.date).toLocaleString()} · ${record.seconds.toFixed(1)} 秒。录音如有长停顿，服务可能只评估首个语段；请结合完整度和漏读反馈核对。${record.result.monotone ? '语调偏平。' : ''}${record.locale === 'en-US' ? '' : '英式口音只有基本评分，没有韵律分和音素提示。'}`;
}
function renderHistory() {
    $('history-empty').hidden = store.records.length > 0; $('history').replaceChildren();
    for (const record of store.records) {
        const li = document.createElement('li'), content = document.createElement('div'), meta = document.createElement('small'), text = document.createElement('p'), actions = document.createElement('div');
        meta.textContent = `${new Date(record.date).toLocaleString()} · 发音 ${formatScore(record.result.scores.pronunciation)} · ${record.locale}`;
        text.className = 'entry-text'; text.lang = 'en'; text.textContent = record.reference;
        content.append(meta, text); actions.className = 'entry-actions';
        const view = document.createElement('button'); view.textContent = '查看反馈'; view.onclick = () => { renderResult(record); if ($('workspace').hidden) location.hash = '#free'; setTimeout(() => $('feedback-title').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };
        const retry = document.createElement('button'); retry.textContent = '再读一次'; retry.onclick = () => { if (phase !== 'idle') return; discard(); $('reference').value = record.reference; setAccent(record.locale, false); updateCount(); location.hash = '#free'; status('文本已填好，可以重新录音。'); };
        actions.append(view, retry); li.append(content, actions); $('history').append(li);
    }
}
renderHistory();
function discard() {
    clip = null;
    $('playback').pause(); $('playback').removeAttribute('src'); $('playback').load(); $('playback').hidden = true;
    if (playbackURL) URL.revokeObjectURL(playbackURL); playbackURL = ''; player.release(); controls();
}
function releaseMic() { stream?.getTracks().forEach(track => track.stop()); stream = null; clearInterval(tick); clearTimeout(autoStop); }
function stopRecording() {
    if (phase !== 'recording') return;
    phase = 'converting'; controls(); status('正在整理录音…');
    liveHeard = live ? live.stop() : null; live = null;   // resolves with every word the browser heard
    if (recorder?.state !== 'inactive') recorder.stop(); releaseMic();
}
async function convert(blob) {
    const Context = window.AudioContext || window.webkitAudioContext;
    const context = new Context();
    try {
        const decoded = await context.decodeAudioData(await blob.arrayBuffer());
        if (decoded.duration < 0.3 || decoded.duration > MAX_SECONDS + 1) throw new Error('录音太短或超过 25 秒，请重录。');
        const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const offline = new Offline(1, Math.ceil(decoded.duration * 16000), 16000);
        const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
        const rendered = await offline.startRendering();
        return { file: new File([encodeWav(rendered.getChannelData(0))], 'practice.wav', { type: 'audio/wav' }), seconds: rendered.duration };
    } finally { await context.close(); }
}
$('record').onclick = async () => {
    if (phase !== 'idle') return;
    try {
        const reference = validateReference($('reference').value), locale = $('locale').value;
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('当前浏览器不支持录音。请使用 HTTPS 下的 Chrome、Edge 或 Safari。');
        hooks.beforeRecord?.();
        discard();   // a new take replaces the old one from the moment record is pressed, even if the microphone is then refused
        phase = 'requesting'; controls(); status('请允许麦克风；录音暂不上传。');
        $('playback').pause();
        stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
        if (!pageActive) { releaseMic(); phase = 'idle'; controls(); return; }
        if (document.hidden) { releaseMic(); throw new Error('请回到本页面再开始录音。'); }
        discard(); canceledRecording = false;
        const chunks = [];
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => { canceledRecording = true; recorder.onstop = null; stopLive(); releaseMic(); phase = 'idle'; controls(); status('录音中断，请重试。', true); };
        recorder.onstop = async () => {
            releaseMic();
            if (live) { liveHeard = live.stop(); live = null; }   // the recorder ended on its own (for example the microphone was unplugged)
            if (canceledRecording) { phase = 'idle'; controls(); return; }
            try {
                const blob = new Blob(chunks, { type: recorder.mimeType });
                const converted = await convert(blob);
                const heard = liveHeard ? await liveHeard : null; liveHeard = null;
                if (!pageActive) return;
                clip = { ...converted, reference, locale, local: measureLocal(reference, heard, converted.seconds) };
                playbackURL = URL.createObjectURL(blob); $('playback').src = playbackURL; $('playback').hidden = false;
                status('录音完成。先回听，再点击“发送录音并评分”。'); hooks.onClip?.(clip);
            } catch (error) { status(error.message || '录音处理失败，请重录。', true); }
            finally { phase = 'idle'; controls(); }
        };
        recorder.start(); startLive(reference, locale); recordingStart = performance.now(); phase = 'recording'; controls(); status('正在录音…读完后点击“结束录音”。');
        const updateTimer = () => { const seconds = Math.min(MAX_SECONDS, Math.floor((performance.now() - recordingStart) / 1000)); $('timer').textContent = `00:${String(seconds).padStart(2, '0')} / 00:25`; };
        updateTimer(); tick = setInterval(updateTimer, 250); autoStop = setTimeout(stopRecording, MAX_SECONDS * 1000);
    } catch (error) { stopLive(); releaseMic(); phase = 'idle'; controls(); status(error.name === 'NotAllowedError' ? '麦克风权限未开启。请在地址栏的网站权限中允许麦克风后重试。' : error.message || '无法打开麦克风。', true); }
};
$('stop').onclick = stopRecording;
$('discard').onclick = () => { discard(); hooks.onDiscard?.(); status('录音已丢弃。'); $('timer').textContent = '00:00 / 00:25'; };
async function refreshAuth() {
    if (!client) return;
    try {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        admin = false;
        if (data.session) { const check = await client.rpc('is_app_admin'); admin = !check.error && check.data === true; }
        $('account-state').textContent = admin ? '管理员已登录 · 可以评分' : data.session ? '已登录 · 此账号没有评分权限' : `尚未登录 · 可以先录音回听（登录状态按网址保存，当前是 ${location.host}，请在同一网址的题库登录）`;
    } catch { admin = false; $('account-state').textContent = '暂时无法核对登录，请检查网络。'; }
    controls();
}
$('refresh-login').onclick = refreshAuth;
$('check-service').onclick = async () => {
    if (phase !== 'idle' || !admin) return;
    phase = 'checking'; aborter = new AbortController(); const signal = aborter.signal;
    const timeout = setTimeout(() => aborter?.abort(), 60000); controls(); status('正在用微软公开的 2 秒示例音频测试完整评分；不会发送你的录音。');
    try {
        const response = await fetch(new URL('./diagnostic.wav', import.meta.url), { signal });
        if (!response.ok) throw new Error('测试音频加载失败，请刷新后重试。');
        const { file } = await convert(await response.blob());
        const result = await requestAssessment(client, config, { file, reference: "What's the weather like?", locale: 'en-US', signal });
        status(`完整评分测试通过（示例发音 ${result.scores.pronunciation ?? '—'} 分）。现在可以发送自己的录音评分。`);
    } catch (error) { status(error.name === 'AbortError' ? '连接检查超时，请检查网络后重试。' : error.message || '评分服务暂不可用。', true); }
    finally { clearTimeout(timeout); aborter = null; phase = 'idle'; controls(); }
};
// One recording to one scored record. Shared by the single-sentence button and the whole-text report.
async function scoreClip(c, signal) {
    const result = await requestAssessment(client, config, { file: c.file, reference: c.reference, locale: c.locale, signal, detail: $('detail-toggle').checked && c.locale === 'en-US' });
    return { id: crypto.randomUUID(), date: new Date().toISOString(), reference: c.reference, locale: c.locale, seconds: c.seconds, result };
}
$('assess').onclick = async () => {
    if (phase !== 'idle' || !clip || !admin) return;
    const current = clip;
    // A recording always uses the reference and accent shown when it was made.
    if (current.reference !== $('reference').value.trim() || current.locale !== $('locale').value) { status('录音之后文本或口音已改变，请重新录音，保证评分对应本次朗读。', true); return; }
    phase = 'assessing'; aborter = new AbortController(); const signal = aborter.signal; controls(); status('正在发送录音并评分…');
    let timeout;
    try {
        timeout = setTimeout(() => aborter?.abort(), 60000);
        const record = await scoreClip(current, signal);
        current.assessedId = record.id; player.load(current.file);
        renderResult(record); saveRecord(record);
        const asked = $('detail-toggle').checked && current.locale === 'en-US';
        status(`评分完成。点击红色或橙色的词，查看需要练习的音素。${!asked ? '' : record.result.detail === 'sdk' ? '已用详细评分：音素显示 IPA，并标出可能读成的音。' : '详细评分这次没有用上，已改用普通评分（服务端的 WebSocket 通道不可用，或服务还是旧版本）。'}`);
    } catch (error) { status(error.name === 'AbortError' ? '评分已取消或超时；录音仍在本页。已发送的音频可能已计入 Azure 用量。' : error.message || '网络错误，请稍后重试。', true); }
    finally { clearTimeout(timeout); aborter = null; phase = 'idle'; controls(); }
};
$('cancel').onclick = () => aborter?.abort();
function download(data, name) {
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' })), link = document.createElement('a');
    link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('export').onclick = () => {
    try { const raw = localStorage.getItem(STORAGE_KEY); download(raw ?? JSON.stringify(store, null, 2), `hive-english-${new Date().toISOString().slice(0, 10)}.json`); }
    catch { download(JSON.stringify(store, null, 2), 'hive-english-backup.json'); }
};
$('import').onchange = async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return;
    try {
        if (file.size > 2 * 1024 * 1024) throw new Error('记录文件超过 2 MB。');
        if (!storeWritable) throw new Error('原记录不可写；请先导出备份并检查存储问题。');
        const imported = validateStore(JSON.parse(await file.text()));
        const raw = localStorage.getItem(STORAGE_KEY), current = raw === null ? { version: 1, records: [] } : validateStore(JSON.parse(raw));
        const merged = mergeStores(current, imported);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); store = merged; renderHistory(); status(`已合并记录，保留最近 ${MAX_RECORDS} 次；共 ${store.records.length} 条。`);
    } catch (error) { status(error.message || '导入失败，原记录已保留。', true); }
};
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) { readStore(); renderHistory(); } });
window.addEventListener('pagehide', () => { pageActive = false; canceledRecording = true; stopLive(); if (recorder?.state === 'recording') recorder.stop(); releaseMic(); aborter?.abort(); if (playbackURL) URL.revokeObjectURL(playbackURL); playbackURL = ''; clip = null; });
window.addEventListener('pageshow', () => { pageActive = true; if (phase !== 'converting' && phase !== 'assessing') { phase = 'idle'; discard(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && phase === 'recording') stopRecording(); });
// The library, reader and probe live in reader.mjs; they only reach the practice panel through these hooks.
initReader({
    hooks,
    isBusy: () => phase !== 'idle',
    // Follow-reading fixes the reference to the chosen sentence; free practice leaves it editable.
    setReference(text, locked) {
        if (phase !== 'idle') return false;
        if (text !== null && $('reference').value.trim() !== text) { discard(); $('reference').value = text; updateCount(); }
        $('reference').readOnly = locked; $('timer').textContent = '00:00 / 00:25';
        return true;
    },
    showPractice(show) { $('workspace').hidden = !show; },
    isAdmin: () => admin,
    locale: () => $('locale').value,
    pref: key => loadPrefs()[key],
    setPref: (key, value) => savePrefs({ [key]: value }),
    // Recitation hides the text, and the practice panel would show it: conceal it while that mode is open.
    conceal: on => $('practice').classList.toggle('concealed', on),
    liveOn: () => recognitionSupported() && $('live-toggle').checked,
    setLive(on) { if (!recognitionSupported()) return false; $('live-toggle').checked = on; $('live-toggle').dispatchEvent(new Event('change')); return true; },
    // Score several recordings in a row. The page is busy meanwhile, so nothing else can start; "取消评分" aborts.
    async withScoring(task) {
        if (phase !== 'idle' || !admin) return null;
        phase = 'assessing'; aborter = new AbortController(); controls();
        try { return await task(aborter.signal, c => scoreClip(c, aborter.signal).then(record => { saveRecord(record); return record; })); }
        finally { aborter = null; phase = 'idle'; controls(); }
    },
});
setupLive(); showWords();
$('detail-toggle').checked = loadPrefs().detail === true;
$('detail-toggle').onchange = () => savePrefs({ detail: $('detail-toggle').checked });
const meta = document.querySelector('meta[name="hive-english"]');
const config = { url: meta?.dataset.url, key: meta?.dataset.key };
controls(); status('选一段英语短句，点击“开始录音”。');
if (config.url && config.key) {
    try {
        const { createClient } = await import('../music/vendor/supabase-js-2.112.4.mjs');
        client = createClient(config.url, config.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
        client.auth.onAuthStateChange(() => setTimeout(refreshAuth, 0));
        await refreshAuth();
    } catch { $('account-state').textContent = '登录组件加载失败；仍可录音回听。'; }
} else $('account-state').textContent = '云端评分尚未配置；可以先录音回听。';
