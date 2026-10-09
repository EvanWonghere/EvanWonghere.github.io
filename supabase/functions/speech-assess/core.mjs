const ORIGINS = new Set(['https://yufenghuang.tech', 'http://localhost:1313', 'http://127.0.0.1:1313']);
const MAX_BODY = 1120000;
async function readBody(req) {
    const reader = req.body?.getReader();
    if (!reader) throw new Error('empty');
    const chunks = []; let total = 0;
    try {
        while (true) {
            const { value, done } = await reader.read(); if (done) break;
            total += value.byteLength;
            if (total > MAX_BODY) { await reader.cancel(); throw new RangeError('large'); }
            chunks.push(value);
        }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
}
export function decodeInput(data) {
    if (!data || typeof data.reference !== 'string' || !/[a-z]/i.test(data.reference) || data.reference.length > 600 || data.reference.trim().split(/\s+/).length > 60 || !['en-US', 'en-GB'].includes(data.locale)) throw new Error('reference');
    if (typeof data.audio !== 'string' || data.audio.length > 1110000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.audio)) throw new Error('audio');
    const bytes = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0));
    if (bytes.length < 9644 || bytes.length > 832044 || bytes.length % 2) throw new Error('duration');
    const view = new DataView(bytes.buffer);
    const text = at => String.fromCharCode(...bytes.slice(at, at + 4));
    if (text(0) !== 'RIFF' || text(8) !== 'WAVE' || text(12) !== 'fmt ' || text(36) !== 'data' || view.getUint32(4, true) !== bytes.length - 8 || view.getUint32(16, true) !== 16 || view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 || view.getUint32(24, true) !== 16000 || view.getUint32(28, true) !== 32000 || view.getUint16(32, true) !== 2 || view.getUint16(34, true) !== 16 || view.getUint32(40, true) !== bytes.length - 44) throw new Error('wav');
    return { bytes, reference: data.reference.trim(), locale: data.locale, detail: data.detail === true };
}
export function normalizeAssessment(raw) {
    // REST returns flat scores; the SDK returns PronunciationAssessment objects.
    return { ...raw, NBest: raw.NBest?.map(best => ({ ...best, PronunciationAssessment: best.PronunciationAssessment ?? best, Words: best.Words?.map(word => ({ ...word, PronunciationAssessment: word.PronunciationAssessment ?? word, Phonemes: word.Phonemes?.map(phoneme => ({ ...phoneme, PronunciationAssessment: phoneme.PronunciationAssessment ?? phoneme })) })) })) };
}
// assessDetail (optional): the Speech SDK over WebSocket, which alone returns IPA sounds and the sounds a speaker may have said instead.
// It runs here, on the server, because the browser cannot rely on a WebSocket to Azure. Any failure falls back to the REST path below.
export function createHandler({ env, authenticate, fetcher = fetch, assessDetail }) {
    return async req => {
        const origin = req.headers.get('Origin');
        const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
        if (ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
        const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
        if (!ORIGINS.has(origin)) return json({ error: '不允许的请求来源。' }, 403);
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
        if (req.method !== 'POST') return json({ error: '仅支持 POST。' }, 405);
        const token = /^Bearer ([^\s]+)$/i.exec(req.headers.get('Authorization') || '')?.[1];
        if (!token || token.length > 8192) return json({ error: '请先登录管理员账户。' }, 401);
        try {
            const permission = await authenticate(token);
            if (!permission.user) return json({ error: '登录已失效，请重新登录。' }, 401);
            if (!permission.admin) return json({ error: '评分目前仅向网站管理员开放。' }, 403);
            const key = env('AZURE_SPEECH_KEY'), region = env('AZURE_SPEECH_REGION') || 'southeastasia';
            if (!key || region !== 'southeastasia') return json({ error: '评分服务配置不完整。' }, 503);
            let input;
            try { input = decodeInput(await readBody(req)); }
            catch (error) { return json({ error: '请发送不超过 25 秒的单声道 16kHz PCM16 录音及英语短句。' }, error instanceof RangeError ? 413 : 400); }
            let detailNote;   // 'sdk' when the detailed path answered, 'unavailable' when it was asked for and failed
            if (input.detail && input.locale === 'en-US' && assessDetail) {
                try {
                    const raw = await assessDetail({ bytes: input.bytes, reference: input.reference, locale: input.locale, key, region, signal: AbortSignal.any([req.signal, AbortSignal.timeout(40000)]) });
                    if (raw?.RecognitionStatus === 'NoMatch') return json({ error: '没有识别到清晰的英语语音，请回听并重录。' }, 422);
                    if (Array.isArray(raw?.NBest) && raw.NBest.length) return json({ ...normalizeAssessment(raw), HiveDetail: 'sdk' });
                    detailNote = 'unavailable';
                } catch { detailNote = 'unavailable'; }
            }
            const params = { ReferenceText: input.reference, GradingSystem: 'HundredMark', Granularity: 'Phoneme', Dimension: 'Comprehensive', EnableMiscue: true, EnableProsodyAssessment: input.locale === 'en-US' ? 'True' : false };   // prosody is only available for en-US
            const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(params))));
            const response = await fetcher(`https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${input.locale}&format=detailed`, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000', Accept: 'application/json', 'Pronunciation-Assessment': encoded }, body: input.bytes, signal: AbortSignal.any([req.signal, AbortSignal.timeout(45000)]) });
            if (!response.ok) return json({ error: `Azure 评分请求失败（HTTP ${response.status}）。${response.status === 429 ? '请求过多或额度不足，请稍后重试。' : '请检查资源状态、区域和额度。'}` }, 502);
            const raw = await response.json();
            if (raw.RecognitionStatus !== 'Success') return json({ error: '没有识别到清晰的英语语音，请回听并重录。' }, 422);
            return json({ ...normalizeAssessment(raw), ...(detailNote ? { HiveDetail: detailNote } : {}) });
        } catch { return json({ error: '评分服务连接超时或暂不可用；录音仍在本页，请稍后重试。' }, 503); }
    };
}
