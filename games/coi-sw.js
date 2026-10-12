// Gives the pages under /games/ the two response headers that make a page "cross-origin isolated", which is what SharedArrayBuffer
// (and so a multi-threaded WebAssembly engine) needs. GitHub Pages cannot send headers, so this service worker adds them to every
// response it handles. Scope is /games/ only; the rest of the site is untouched. Only pages that ask for it (front matter `isolate:
// true`, see layouts/games/single.html) register it. "credentialless" (rather than "require-corp") lets cross-origin images and fonts
// still load; browsers that do not know it (Safari) simply stay not isolated and the page keeps its fallback.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;
    event.respondWith(fetch(request).then(response => {
        if (response.status === 0) return response;   // an opaque response cannot be rewritten
        const headers = new Headers(response.headers);
        headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }).catch(() => fetch(request)));
});
