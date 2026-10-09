import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, parseAssessment, validateReference, validateStore, mergeStores, wordClass } from '../static/english/core.mjs';
import { assessFile, withAbort } from '../static/english/speech.mjs';
import { createHandler } from '../supabase/functions/speech-token/core.mjs';
const raw = { RecognitionStatus: 'Success', NBest: [{ Display: 'Hello world.', PronunciationAssessment: { PronScore: 85, AccuracyScore: 82, FluencyScore: 90, CompletenessScore: 100 }, Words: [{ Word: 'hello', PronunciationAssessment: { AccuracyScore: 82, ErrorType: 'None' }, Phonemes: [{ Phoneme: 'h', PronunciationAssessment: { AccuracyScore: 79 } }] }, { Word: 'world', PronunciationAssessment: { AccuracyScore: 58, ErrorType: 'Mispronunciation' } }] }] };
const record = (id = 'first', date = '2026-10-09T12:00:00Z') => ({ id, date, reference: 'Hello world.', locale: 'en-US', seconds: 2, result: parseAssessment(raw) });
const empty = () => ({ version: 1, records: [] });
test('short reference limits prevent accidental long recordings', () => {
    assert.equal(validateReference(' Hello world. '), 'Hello world.');
    for (const text of ['', '中文', 'word '.repeat(61), 'a'.repeat(601)]) assert.throws(() => validateReference(text));
});
test('scores retain phonemes, distinguish mispronunciation and do not fabricate missing values', () => {
    const result = parseAssessment(JSON.stringify(raw));
    assert.equal(result.scores.pronunciation, 85); assert.equal(result.words[0].phonemes[0].accuracy, 79);
    assert.equal(wordClass(result.words[1]), 'weak'); assert.equal(wordClass({ error: 'Omission' }), 'missing');
    const missing = structuredClone(raw); delete missing.NBest[0].PronunciationAssessment.FluencyScore;
    assert.equal(parseAssessment(missing).scores.fluency, null);
    for (const value of [null, { RecognitionStatus: 'NoMatch' }, { ...raw, NBest: [] }]) assert.throws(() => parseAssessment(value));
});
test('newer/corrupt history cannot be accepted as an empty store', () => {
    assert.deepEqual(validateStore(empty()), empty());
    assert.throws(() => validateStore({ version: 2, records: [] }));
    const bad = record(); bad.result.scores.pronunciation = 101;
    assert.throws(() => validateStore({ version: 1, records: [bad] }));
    assert.throws(() => validateStore({ version: 1, records: [record(), record()] }));
    const incomplete = record(); delete incomplete.result.words[0].phonemes;
    assert.throws(() => validateStore({ version: 1, records: [incomplete] }));
});
test('import merges unique IDs, preserves existing conflicts and keeps latest 50', () => {
    const current = { version: 1, records: Array.from({ length: 50 }, (_, i) => record(String(i), new Date(Date.UTC(2026, 0, i + 1)).toISOString())) };
    const conflict = record('0'); conflict.reference = 'Different text.';
    const merged = mergeStores(current, { version: 1, records: [conflict, record('new', '2026-11-01T12:00:00Z')] });
    assert.equal(merged.records.length, 50); assert.equal(merged.records[0].id, 'new');
    assert.equal(mergeStores({ version: 1, records: [record('0')] }, { version: 1, records: [conflict] }).records[0].reference, 'Hello world.');
});
test('WAV has correct PCM16 mono layout, sample rate and clipping', () => {
    const view = new DataView(encodeWav(new Float32Array([-2, -.5, 0, .5, 2, NaN])));
    const text = offset => String.fromCharCode(...new Uint8Array(view.buffer, offset, 4));
    assert.equal(text(0), 'RIFF'); assert.equal(text(8), 'WAVE'); assert.equal(text(36), 'data');
    assert.equal(view.getUint32(4, true), view.byteLength - 8); assert.equal(view.getUint16(22, true), 1);
    assert.equal(view.getUint32(24, true), 16000); assert.equal(view.getUint16(34, true), 16); assert.equal(view.getUint32(40, true), 12);
    assert.equal(view.getInt16(44, true), -32768); assert.equal(view.getInt16(52, true), 32767); assert.equal(view.getInt16(54, true), 0);
    assert.throws(() => encodeWav(new Float32Array(16000 * 27))); assert.throws(() => encodeWav(new Float32Array()));
});
const request = (token = 'user', origin = 'https://yufenghuang.tech', method = 'POST') => new Request('https://example.com/speech-token', { method, headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
function fixture() {
    let calls = 0, allowed = true, currentTime = 0;
    const handler = createHandler({ env: name => name === 'AZURE_SPEECH_KEY' ? 'private-key' : '', now: () => currentTime, authenticate: async token => ({ user: token !== 'invalid', admin: token === 'admin' && allowed }), fetcher: async (url, options) => { assert.equal(url, 'https://southeastasia.api.cognitive.microsoft.com/sts/v1.0/issueToken'); assert.equal(options.headers['Ocp-Apim-Subscription-Key'], 'private-key'); calls++; return new Response('short-lived-token'); } });
    return { handler, calls: () => calls, revoke: () => { allowed = false; }, advance: () => { currentTime = 481000; } };
}
test('token endpoint rejects untrusted origins, bad methods and unauthorized callers before Azure', async () => {
    const f = fixture();
    assert.equal((await f.handler(request('admin', 'https://evil.example'))).status, 403);
    assert.equal((await f.handler(request('admin', undefined, 'GET'))).status, 405);
    assert.equal((await f.handler(request(null))).status, 401);
    assert.equal((await f.handler(request('invalid'))).status, 401);
    assert.equal((await f.handler(request('user'))).status, 403);
    const preflight = await f.handler(request(null, undefined, 'OPTIONS')); assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://yufenghuang.tech'); assert.equal(f.calls(), 0);
});
test('token caching never caches administrator permission; secrets stay server-side', async () => {
    const f = fixture();
    const response = await f.handler(request('admin')), data = await response.json();
    assert.equal(data.token, 'short-lived-token'); assert.equal(data.region, 'southeastasia');
    assert.equal(response.headers.get('Cache-Control'), 'no-store'); assert.equal(JSON.stringify(data).includes('private-key'), false);
    await f.handler(request('admin')); assert.equal(f.calls(), 1);
    f.advance(); await f.handler(request('admin')); assert.equal(f.calls(), 2);
    f.revoke(); assert.equal((await f.handler(request('admin'))).status, 403); assert.equal(f.calls(), 2);
});
test('missing configuration and upstream errors are safe, actionable responses', async () => {
    const handler = createHandler({ env: () => '', authenticate: async () => ({ user: true, admin: true }) });
    assert.equal((await handler(request('admin'))).status, 503);
    for (const fetcher of [async () => new Response('private upstream diagnostic', { status: 401 }), async () => { throw new Error('private-key'); }]) {
        const f = createHandler({ env: () => 'private-key', authenticate: async () => ({ user: true, admin: true }), fetcher });
        // Valid fixed region; invalid env cannot become an arbitrary URL.
        assert.equal((await f(request('admin'))).status, 503);
        const goodRegion = createHandler({ env: key => key === 'AZURE_SPEECH_KEY' ? 'private-key' : '', authenticate: async () => ({ user: true, admin: true }), fetcher });
        const response = await goodRegion(request('admin')); assert.ok([502, 503].includes(response.status));
        assert.equal((await response.text()).includes('private'), false);
    }
});
function fakeSDK({ fail = false, hang = false, cancel } = {}) {
    let closed = 0, audioClosed = 0, applied = null, endpointVersion;
    const sdk = {
        SpeechConfig: { fromAuthorizationToken: () => ({ setProperty: (key, value) => { assert.equal(key, 2); endpointVersion = value; } }) }, OutputFormat: { Detailed: 1 }, ResultReason: { RecognizedSpeech: 3 }, PropertyId: { SpeechServiceResponse_JsonResult: 1, SpeechServiceConnection_RecognitionEndpointVersion: 2 }, PronunciationAssessmentGradingSystem: { HundredMark: 1 }, PronunciationAssessmentGranularity: { Phoneme: 3 },
        CancellationReason: { Error: 1, EndOfStream: 2 }, CancellationErrorCode: { 5: 'ConnectionFailure', 6: 'AuthenticationFailure', 7: 'TooManyRequests' },
        AudioConfig: { fromWavFileInput: () => ({ close: () => { audioClosed++; } }) },
        PronunciationAssessmentConfig: class { constructor(...args) { applied = args; } applyTo() {} },
        SpeechRecognizer: class { close() { closed++; } recognizeOnceAsync(success, error) { if (!hang) queueMicrotask(() => { if (cancel) this.canceled(this, cancel); fail ? error('secret diagnostic') : success({ reason: 3, properties: { getProperty: () => JSON.stringify(raw) } }); }); } },
    };
    return { sdk, closed: () => closed, audioClosed: () => audioClosed, applied: () => applied, endpointVersion: () => endpointVersion };
}
test('Speech SDK adapter scores short WAV and closes audio/recognizer on success and error', async () => {
    for (const fail of [false, true]) {
        const f = fakeSDK({ fail }); const promise = assessFile(f.sdk, { token: 'token', region: 'southeastasia', file: {}, reference: 'Hello world.', locale: 'en-US' });
        if (fail) await assert.rejects(promise, /无法连接/); else assert.equal((await promise).scores.pronunciation, 85);
        assert.equal(f.closed(), 1); assert.equal(f.audioClosed(), 1); assert.deepEqual(f.applied(), ['Hello world.', 1, 3, true]);
        assert.equal(f.endpointVersion(), '1');
    }
});
test('normal end-of-file does not erase a score; Azure cancellations retain safe codes only', async () => {
    const args = { token: 'token', region: 'southeastasia', file: {}, reference: 'Hello world.', locale: 'en-US' };
    const normal = fakeSDK({ cancel: { reason: 2 } });
    assert.equal((await assessFile(normal.sdk, args)).scores.pronunciation, 85);
    for (const errorCode of [5, 6, 7]) {
        const f = fakeSDK({ cancel: { reason: 1, errorCode, errorDetails: 'private-key wss://server?Authorization=Bearer-secret websocket error code: 1006' } });
        await assert.rejects(assessFile(f.sdk, args), error => {
            assert.match(error.message, new RegExp(f.sdk.CancellationErrorCode[errorCode]));
            assert.match(error.message, /1006/); assert.doesNotMatch(error.message, /private|Bearer|wss/); return true;
        });
        assert.equal(f.closed(), 1); assert.equal(f.audioClosed(), 1);
    }
});
test('canceling a pending score closes the connection, and an already aborted call does not start', async () => {
    const f = fakeSDK({ hang: true }), aborter = new AbortController();
    const p = assessFile(f.sdk, { token: 'token', region: 'southeastasia', file: {}, reference: 'Hello.', locale: 'en-US', signal: aborter.signal });
    aborter.abort(); await assert.rejects(p, { name: 'AbortError' }); assert.equal(f.closed(), 1); assert.equal(f.audioClosed(), 1);
    const g = fakeSDK(); await assert.rejects(assessFile(g.sdk, { signal: aborter.signal }), { name: 'AbortError' }); assert.equal(g.closed(), 0);
});
test('cancel while the SDK is still loading does not leave the page busy', async () => {
    const aborter = new AbortController();
    const p = withAbort(new Promise(() => {}), aborter.signal);
    aborter.abort(); await assert.rejects(p, { name: 'AbortError' });
    assert.equal(await withAbort(Promise.resolve('ready'), new AbortController().signal), 'ready');
});
