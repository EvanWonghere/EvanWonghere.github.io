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
        assert.equal(params.ReferenceText, 'Hello world.'); assert.equal(params.EnableMiscue, true); assert.equal(params.EnableProsodyAssessment, false); assert.equal(params.Granularity, 'Phoneme');
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
