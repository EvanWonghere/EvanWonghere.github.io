const ORIGINS = new Set(['https://yufenghuang.tech', 'http://localhost:1313', 'http://127.0.0.1:1313']);
export function createHandler({ env, authenticate, fetcher = fetch, now = Date.now }) {
    let cached = null;
    return async function handleRequest(req) {
        const origin = req.headers.get('Origin');
        const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
        if (ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
        const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
        if (!ORIGINS.has(origin)) return json({ error: '不允许的请求来源。' }, 403);
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
        if (req.method !== 'POST') return json({ error: '仅支持 POST。' }, 405);
        const bearer = /^Bearer ([^\s]+)$/i.exec(req.headers.get('Authorization') || '')?.[1];
        if (!bearer || bearer.length > 8192) return json({ error: '请先登录管理员账户。' }, 401);
        try {
            const permission = await authenticate(bearer);
            if (!permission.user) return json({ error: '登录已失效，请重新登录。' }, 401);
            if (!permission.admin) return json({ error: '评分目前仅向网站管理员开放。' }, 403);
            const key = env('AZURE_SPEECH_KEY'), region = env('AZURE_SPEECH_REGION') || 'southeastasia';
            if (!key || region !== 'southeastasia') return json({ error: '尚未配置 Azure 评分服务，请完成服务端设置。' }, 503);
            // Tokens are valid for 10 minutes; reuse for 8 minutes. Never cache an authorization decision.
            if (!cached || cached.expires <= now()) {
                const response = await fetcher(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10000) });
                if (!response.ok) return json({ error: 'Azure 授权失败，请检查服务密钥、区域或资源状态。' }, 502);
                const token = await response.text();
                if (!token || token.length > 16384 || /\s/.test(token)) return json({ error: 'Azure 返回了无效授权。' }, 502);
                cached = { token, expires: now() + 480000 };
            }
            return json({ token: cached.token, region, expiresIn: Math.max(1, Math.floor((cached.expires - now()) / 1000)) });
        } catch { return json({ error: '评分服务暂不可用，请稍后重试。' }, 503); }
    };
}
