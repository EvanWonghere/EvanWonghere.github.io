import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, decodeInput, normalizeAssessment } from '../supabase/functions/speech-assess/core.mjs';
import { encodeWav, parseAssessment } from '../static/english/core.mjs';
import { requestAssessment } from '../static/english/service.mjs';
const input = () => ({ reference: 'Hello world.', locale: 'en-US', audio: Buffer.from(encodeWav(new Float32Array(16000))).toString('base64') });
const raw = { RecognitionStatus: 'Success', NBest: [{ Display: 'Hello world.', PronScore: 88, AccuracyScore: 90, FluencyScore: 86, CompletenessScore: 100, Words: [{ Word: 'hello', AccuracyScore: 90, ErrorType: 'None', Phonemes: [{ Phoneme: 'h', AccuracyScore: 80 }] }] }] };
const request = (data = input(), token = 'admin', origin = 'https://yufenghuang.tech') => new Request('https://example.com', { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${token}` }, body: JSON.stringify(data) });
const permission = async token => ({ user: token !== 'invalid', admin: token === 'admin' });
test('REST input enforces actual WAV format, duration, text, and allowed accents', () => {
    assert.equal(decodeInput(input()).bytes.length, 32044);
    for (const patch of [{ locale: 'zh-CN' }, { reference: 'x '.repeat(61) }, { reference: '' }, { audio: 'AAAA' }, { audio: '*'.repeat(40) }, { audio: Buffer.alloc(832046).toString('base64') }]) assert.throws(() => decodeInput({ ...input(), ...patch }));
    const bad = Buffer.from(input().audio, 'base64'); bad.writeUInt32LE(48000, 24);
    assert.throws(() => decodeInput({ ...input(), audio: bad.toString('base64') }));
});
test('HTTPS scoring authenticates before uploads, pins Azure destination and sanitizes failures', async () => {
    let calls = 0;
    const handler = createHandler({ env: name => name === 'AZURE_SPEECH_KEY' ? 'private-key' : '', authenticate: permission, fetcher: async (url, options) => {
        calls++; assert.equal(url, 'https://southeastasia.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed');
        assert.equal(options.headers['Ocp-Apim-Subscription-Key'], 'private-key');
        const params = JSON.parse(Buffer.from(options.headers['Pronunciation-Assessment'], 'base64').toString());
        assert.equal(params.ReferenceText, 'Hello world.'); assert.equal(params.EnableMiscue, true); assert.equal(params.EnableProsodyAssessment, 'True'); assert.equal(params.Granularity, 'Phoneme');
        assert.equal(options.body.length, 32044); return Response.json(raw);
    } });
    assert.equal((await handler(request({}, 'invalid'))).status, 401);
    assert.equal((await handler(request({}, 'user'))).status, 403);
    assert.equal((await handler(request(input(), 'admin', 'https://evil.example'))).status, 403);
    assert.equal((await handler(request({}))).status, 400); assert.equal(calls, 0);
    const response = await handler(request()); assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const parsed = parseAssessment(await response.json()); assert.equal(parsed.scores.pronunciation, 88); assert.equal(parsed.words[0].phonemes[0].accuracy, 80);
    for (const status of [401, 429, 500]) {
        const failed = createHandler({ env: () => 'southeastasia', authenticate: permission, fetcher: async () => new Response('private-key sensitive upstream error', { status }) });
        const r = await failed(request()); assert.equal(r.status, 502); assert.doesNotMatch(await r.text(), /private|sensitive/);
    }
});
test('oversized streamed request is rejected before Azure is contacted', async () => {
    const handler = createHandler({ env: () => 'southeastasia', authenticate: permission, fetcher: () => { throw new Error('must not send'); } });
    assert.equal((await handler(request({ audio: 'a'.repeat(1120001) }))).status, 413);
});
test('browser HTTPS client uploads only WAV/reference and returns actual normalized feedback', async () => {
    const client = { auth: { getSession: async () => ({ data: { session: { access_token: 'user-session' } } }) } };
    const args = { file: new Blob([encodeWav(new Float32Array(16000))]), reference: 'Hello world.', locale: 'en-US' };
    const result = await requestAssessment(client, { url: 'https://project.supabase.co', key: 'public-key' }, args, async (url, options) => {
        assert.equal(url, 'https://project.supabase.co/functions/v1/speech-assess');
        assert.equal(options.headers.Authorization, 'Bearer user-session'); assert.equal(decodeInput(JSON.parse(options.body)).bytes.length, 32044);
        return Response.json(normalizeAssessment(raw));
    });
    assert.equal(result.scores.pronunciation, 88);
    await assert.rejects(requestAssessment(client, { url: 'https://project.supabase.co', key: 'public-key' }, args, async () => Response.json({ error: 'Azure HTTP 429' }, { status: 502 })), /429/);
});

test('prosody is asked for only with the American accent, the one locale the service supports it for', async () => {
    const asked = [];
    const handler = createHandler({ env: name => name === 'AZURE_SPEECH_KEY' ? 'private-key' : '', authenticate: permission, fetcher: async (url, options) => {
        asked.push([new URL(url).searchParams.get('language'), JSON.parse(Buffer.from(options.headers['Pronunciation-Assessment'], 'base64').toString()).EnableProsodyAssessment]);
        return Response.json(raw);
    } });
    await handler(request()); await handler(request({ ...input(), locale: 'en-GB' }));
    assert.deepEqual(asked, [['en-US', 'True'], ['en-GB', false]]);
});

// The Speech SDK answer for "Hello world.": IPA sounds, candidates for each, prosody inside each word's assessment.
const sdkAnswer = { RecognitionStatus: 'Success', NBest: [{ Display: 'Hello world.', PronunciationAssessment: { AccuracyScore: 90, FluencyScore: 95, CompletenessScore: 100, ProsodyScore: 88, PronScore: 91 }, Words: [
    { Word: 'hello', Offset: 1000000, Duration: 5000000, PronunciationAssessment: { AccuracyScore: 90, ErrorType: 'None', Feedback: { Prosody: { Break: { ErrorTypes: ['None'], UnexpectedBreak: { Confidence: 0.9 } }, Intonation: { ErrorTypes: ['Monotone'] } } } },
      Phonemes: [{ Phoneme: 'h', PronunciationAssessment: { AccuracyScore: 95, NBestPhonemes: [{ Phoneme: 'h', Score: 100 }] } }, { Phoneme: 'ɹ', PronunciationAssessment: { AccuracyScore: 40, NBestPhonemes: [{ Phoneme: 'w', Score: 80 }, { Phoneme: 'ɹ', Score: 30 }] } }] }] }] };

test('the detailed path answers with the SDK result, and plain scoring is not contacted', async () => {
    const asked = [];
    const handler = createHandler({ env: name => name === 'AZURE_SPEECH_KEY' ? 'private-key' : '', authenticate: permission,
        fetcher: () => { throw new Error('the plain path must not run'); },
        assessDetail: async args => { asked.push(args); return structuredClone(sdkAnswer); } });
    const response = await handler(request({ ...input(), detail: true }));
    assert.equal(response.status, 200);
    const raw = await response.json();
    assert.equal(raw.HiveDetail, 'sdk');
    assert.equal(asked.length, 1); assert.equal(asked[0].reference, 'Hello world.'); assert.equal(asked[0].locale, 'en-US'); assert.equal(asked[0].bytes.length, 32044); assert.equal(asked[0].region, 'southeastasia');
    const parsed = parseAssessment(raw);
    assert.equal(parsed.detail, 'sdk'); assert.equal(parsed.spokenReported, true); assert.equal(parsed.scores.prosody, 88);
    assert.deepEqual(parsed.words[0].phonemes.map(p => p.spoken), [null, 'w']);          // 'ɹ' was heard as 'w'
    assert.equal(parsed.words[0].breakBefore, 'unexpected'); assert.equal(parsed.monotone, true); assert.equal(parsed.words[0].offsetMs, 100);
});

test('when the detailed path fails or is not wanted, the plain path answers', async () => {
    const calls = [];
    const plain = async (url, options) => { calls.push(new URL(url).searchParams.get('language')); return Response.json(raw); };
    const failing = createHandler({ env: name => name === 'AZURE_SPEECH_KEY' ? 'private-key' : '', authenticate: permission, fetcher: plain, assessDetail: async () => { throw new Error('websocket closed: private-key'); } });
    const fellBack = await failing(request({ ...input(), detail: true }));
    const body = await fellBack.json();
    assert.equal(fellBack.status, 200); assert.equal(body.HiveDetail, 'unavailable'); assert.equal(parseAssessment(body).detail, 'unavailable'); assert.doesNotMatch(JSON.stringify(body), /private-key|websocket/);
    assert.equal(calls.length, 1);
    const handler = createHandler({ env: name => name === 'AZURE_SPEECH_KEY' ? 'private-key' : '', authenticate: permission, fetcher: plain, assessDetail: async () => { throw new Error('must not run'); } });
    for (const body of [input(), { ...input(), detail: 'yes' }, { ...input(), detail: true, locale: 'en-GB' }]) assert.equal((await handler(request(body))).status, 200);
    assert.equal(calls.length, 4); assert.equal((await (await handler(request())).json()).HiveDetail, undefined);
    const noSdk = createHandler({ env: name => name === 'AZURE_SPEECH_KEY' ? 'private-key' : '', authenticate: permission, fetcher: plain });
    assert.equal((await noSdk(request({ ...input(), detail: true }))).status, 200);
});

test('the detailed path refuses what the plain path refuses, and reports no speech clearly', async () => {
    const handler = createHandler({ env: name => name === 'AZURE_SPEECH_KEY' ? 'private-key' : '', authenticate: permission, fetcher: () => { throw new Error('must not run'); }, assessDetail: async () => ({ RecognitionStatus: 'NoMatch' }) });
    assert.equal((await handler(request({ ...input(), detail: true }, 'invalid'))).status, 401);
    assert.equal((await handler(request({ ...input(), detail: true }, 'user'))).status, 403);
    assert.equal((await handler(request({ ...input(), detail: true, audio: 'AAAA' }))).status, 400);
    assert.equal((await handler(request({ ...input(), detail: true }))).status, 422);
});
