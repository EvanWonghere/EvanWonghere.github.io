import { SAMPLES, STORAGE_KEY, MAX_SECONDS, MAX_RECORDS, wordCount, validateReference, validateStore, mergeStores, encodeWav, wordClass, errorLabel } from './core.mjs';
import { loadSDK, assessFile, withAbort } from './speech.mjs?v=20261009-v1';
const $ = id => document.getElementById(id);
let client, admin = false, phase = 'idle', clip = null, recorder = null, stream = null, playbackURL = '', recordingStart = 0, tick, autoStop, canceledRecording = false, aborter;
let store = { version: 1, records: [] }, storeWritable = true;
let pageActive = true;
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
    for (const id of ['reference', 'locale', 'sample']) $(id).disabled = busy;
}
function updateCount() { $('word-count').textContent = `${wordCount($('reference').value)} / 60 词`; }
for (const sample of SAMPLES) { const option = document.createElement('option'); option.value = sample.id; option.textContent = sample.title; $('sample').append(option); }
$('reference').value = SAMPLES[0].text; updateCount();
$('sample').onchange = () => { $('reference').value = SAMPLES.find(s => s.id === $('sample').value).text; updateCount(); };
$('reference').oninput = updateCount;
function readStore() {
    try { const raw = localStorage.getItem(STORAGE_KEY); store = raw === null ? { version: 1, records: [] } : validateStore(JSON.parse(raw)); storeWritable = true; }
    catch { storeWritable = false; warn('浏览器存储不可用，或记录损坏/版本较新；原数据已保留，新成绩暂不写入。请先导出备份。'); }
}
readStore();
function saveRecord(record) {
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
    for (const [key, label] of [['pronunciation', '综合发音'], ['accuracy', '准确度'], ['fluency', '流利度'], ['completeness', '完整度']]) {
        const item = document.createElement('div'); item.className = 'score';
        const number = document.createElement('strong'); number.textContent = formatScore(record.result.scores[key]);
        const caption = document.createElement('span'); caption.textContent = label; item.append(number, caption); $('scores').append(item);
    }
    $('words').replaceChildren(); $('word-detail').textContent = '绿色：≥80；橙色：60–79；红色：低分或漏读、多读。';
    for (const word of record.result.words) {
        const button = document.createElement('button'); button.className = wordClass(word); button.type = 'button';
        const text = document.createElement('span'); text.textContent = word.text;
        const score = document.createElement('small'); score.textContent = word.error === 'Omission' ? '漏读' : `${formatScore(word.accuracy)}${errorLabel(word.error) ? ' · ' + errorLabel(word.error) : ''}`;
        button.append(text, score); button.onclick = () => {
            $('word-detail').textContent = `${word.text} · ${errorLabel(word.error) || '准确度 ' + formatScore(word.accuracy)}${word.phonemes.length ? '\n音素：' + word.phonemes.map(p => `${p.text} ${formatScore(p.accuracy)}`).join(' / ') : '\n该词没有音素分数。'}`;
        }; $('words').append(button);
    }
    $('result-note').textContent = `${record.locale === 'en-US' ? '美式' : '英式'}英语 · ${new Date(record.date).toLocaleString()} · ${record.seconds.toFixed(1)} 秒。录音如有长停顿，服务可能只评估首个语段；请结合完整度和漏读反馈核对。`;
}
function renderHistory() {
    $('history-empty').hidden = store.records.length > 0; $('history').replaceChildren();
    for (const record of store.records) {
        const li = document.createElement('li'), content = document.createElement('div'), meta = document.createElement('small'), text = document.createElement('p'), actions = document.createElement('div');
        meta.textContent = `${new Date(record.date).toLocaleString()} · 发音 ${formatScore(record.result.scores.pronunciation)} · ${record.locale}`;
        text.className = 'entry-text'; text.lang = 'en'; text.textContent = record.reference;
        content.append(meta, text); actions.className = 'entry-actions';
        const view = document.createElement('button'); view.textContent = '查看反馈'; view.onclick = () => { renderResult(record); $('feedback-title').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
        const retry = document.createElement('button'); retry.textContent = '再读一次'; retry.onclick = () => { if (phase !== 'idle') return; discard(); $('reference').value = record.reference; $('locale').value = record.locale; updateCount(); $('reference').focus(); status('文本已填好，可以重新录音。'); };
        actions.append(view, retry); li.append(content, actions); $('history').append(li);
    }
}
renderHistory();
function discard() {
    clip = null;
    $('playback').pause(); $('playback').removeAttribute('src'); $('playback').load(); $('playback').hidden = true;
    if (playbackURL) URL.revokeObjectURL(playbackURL); playbackURL = ''; controls();
}
function releaseMic() { stream?.getTracks().forEach(track => track.stop()); stream = null; clearInterval(tick); clearTimeout(autoStop); }
function stopRecording() {
    if (phase !== 'recording') return;
    phase = 'converting'; controls(); status('正在整理录音…');
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
        phase = 'requesting'; controls(); status('请允许麦克风；录音暂不上传。');
        $('playback').pause();
        stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
        if (!pageActive) { releaseMic(); phase = 'idle'; controls(); return; }
        if (document.hidden) { releaseMic(); throw new Error('请回到本页面再开始录音。'); }
        discard(); canceledRecording = false;
        const chunks = [];
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => { canceledRecording = true; recorder.onstop = null; releaseMic(); phase = 'idle'; controls(); status('录音中断，请重试。', true); };
        recorder.onstop = async () => {
            releaseMic();
            if (canceledRecording) { phase = 'idle'; controls(); return; }
            try {
                const blob = new Blob(chunks, { type: recorder.mimeType });
                const converted = await convert(blob);
                if (!pageActive) return;
                clip = { ...converted, reference, locale };
                playbackURL = URL.createObjectURL(blob); $('playback').src = playbackURL; $('playback').hidden = false;
                status('录音完成。先回听，再点击“发送录音并评分”。');
            } catch (error) { status(error.message || '录音处理失败，请重录。', true); }
            finally { phase = 'idle'; controls(); }
        };
        recorder.start(); recordingStart = performance.now(); phase = 'recording'; controls(); status('正在录音…读完后点击“结束录音”。');
        const updateTimer = () => { const seconds = Math.min(MAX_SECONDS, Math.floor((performance.now() - recordingStart) / 1000)); $('timer').textContent = `00:${String(seconds).padStart(2, '0')} / 00:25`; };
        updateTimer(); tick = setInterval(updateTimer, 250); autoStop = setTimeout(stopRecording, MAX_SECONDS * 1000);
    } catch (error) { releaseMic(); phase = 'idle'; controls(); status(error.name === 'NotAllowedError' ? '麦克风权限未开启。请在地址栏的网站权限中允许麦克风后重试。' : error.message || '无法打开麦克风。', true); }
};
$('stop').onclick = stopRecording;
$('discard').onclick = () => { discard(); status('录音已丢弃。'); $('timer').textContent = '00:00 / 00:25'; };
async function refreshAuth() {
    if (!client) return;
    try {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        admin = false;
        if (data.session) { const check = await client.rpc('is_app_admin'); admin = !check.error && check.data === true; }
        $('account-state').textContent = admin ? '管理员已登录 · 可以评分' : data.session ? '已登录 · 此账号没有评分权限' : '尚未登录 · 可以先录音回听';
    } catch { admin = false; $('account-state').textContent = '暂时无法核对登录，请检查网络。'; }
    controls();
}
$('refresh-login').onclick = refreshAuth;
async function speechAuthorization(signal) {
    const { data } = await client.auth.getSession();
    if (!data.session) throw new Error('登录已失效，请重新登录。');
    const response = await fetch(`${config.url}/functions/v1/speech-token`, { method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: config.key }, signal });
    const auth = await response.json();
    if (!response.ok) throw new Error(auth.error || '评分服务暂不可用。');
    if (typeof auth.token !== 'string' || !auth.token || auth.region !== 'southeastasia') throw new Error('评分服务配置不完整。');
    return auth;
}
$('check-service').onclick = async () => {
    if (phase !== 'idle' || !admin) return;
    phase = 'checking'; aborter = new AbortController(); const signal = aborter.signal;
    const timeout = setTimeout(() => aborter?.abort(), 60000); controls(); status('正在用微软公开的 2 秒示例音频测试完整评分；不会发送你的录音。');
    try {
        const auth = await speechAuthorization(signal);
        const sdk = await withAbort(loadSDK(), signal);
        const response = await fetch(new URL('./diagnostic.wav', import.meta.url), { signal });
        if (!response.ok) throw new Error('测试音频加载失败，请刷新后重试。');
        const { file } = await convert(await response.blob());
        const result = await assessFile(sdk, { token: auth.token, region: auth.region, file, reference: "What's the weather like?", locale: 'en-US', signal });
        status(`完整评分测试通过（示例发音 ${result.scores.pronunciation ?? '—'} 分）。现在可以发送自己的录音评分。`);
    } catch (error) { status(error.name === 'AbortError' ? '连接检查超时，请检查网络后重试。' : error.message || '评分服务暂不可用。', true); }
    finally { clearTimeout(timeout); aborter = null; phase = 'idle'; controls(); }
};
$('assess').onclick = async () => {
    if (phase !== 'idle' || !clip || !admin) return;
    const current = clip;
    // A recording always uses the reference and accent shown when it was made.
    if (current.reference !== $('reference').value.trim() || current.locale !== $('locale').value) { status('录音之后文本或口音已改变，请重新录音，保证评分对应本次朗读。', true); return; }
    phase = 'assessing'; aborter = new AbortController(); const signal = aborter.signal; controls(); status('正在发送录音并评分…');
    let timeout;
    try {
        timeout = setTimeout(() => aborter?.abort(), 60000);
        const auth = await speechAuthorization(signal);
        const sdk = await withAbort(loadSDK(), signal);
        const result = await assessFile(sdk, { token: auth.token, region: auth.region, file: current.file, reference: current.reference, locale: current.locale, signal });
        const record = { id: crypto.randomUUID(), date: new Date().toISOString(), reference: current.reference, locale: current.locale, seconds: current.seconds, result };
        renderResult(record); saveRecord(record); status('评分完成。点击红色或橙色的词，查看需要练习的音素。');
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
window.addEventListener('pagehide', () => { pageActive = false; canceledRecording = true; if (recorder?.state === 'recording') recorder.stop(); releaseMic(); aborter?.abort(); if (playbackURL) URL.revokeObjectURL(playbackURL); playbackURL = ''; clip = null; });
window.addEventListener('pageshow', () => { pageActive = true; if (phase !== 'converting' && phase !== 'assessing') { phase = 'idle'; discard(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && phase === 'recording') stopRecording(); });
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
