import { parseAssessment } from './core.mjs';
export async function requestAssessment(client, config, { file, reference, locale, signal }, fetcher = fetch) {
    const { data } = await client.auth.getSession();
    if (!data.session) throw new Error('登录已失效，请重新登录。');
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    const response = await fetcher(`${config.url}/functions/v1/speech-assess`, { method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: config.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: btoa(binary), reference, locale }), signal });
    const raw = await response.json();
    if (!response.ok) throw new Error(raw.error || '评分服务暂不可用。');
    return parseAssessment(raw);
}
