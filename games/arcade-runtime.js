(function () {
    'use strict';

    const pathMatch = location.pathname.match(/\/(?:games|study)\/([^/]+)-app\//);
    const slug = pathMatch ? pathMatch[1] : 'unknown';
    const prefix = `hive.arcade.${slug}.`;
    const legacyKeys = {
        dino: { best: 'dino_best' },
        flappy: { best: 'flappy_best' },
        '2048': { best: '2048-best' },
        snake: { best: 'neon-snake-best' }
    };
    let paused = false;
    let readySent = false;

    function post(type, detail) {
        if (window.parent === window) return;
        window.parent.postMessage(Object.assign({ type, slug }, detail || {}), location.origin);
    }

    function migrateLegacyStorage() {
        const marker = `${prefix}migration.v1`;
        if (localStorage.getItem(marker)) return;

        const mapping = legacyKeys[slug] || {};
        Object.entries(mapping).forEach(([nextKey, oldKey]) => {
            const value = localStorage.getItem(oldKey);
            if (value !== null && localStorage.getItem(`${prefix}${nextKey}`) === null) {
                localStorage.setItem(`${prefix}${nextKey}`, value);
            }
        });
        localStorage.setItem(marker, 'done');
    }

    function emitPauseState(nextPaused, reason) {
        if (paused === nextPaused) return;
        paused = nextPaused;
        window.dispatchEvent(new CustomEvent(nextPaused ? 'arcade:pause' : 'arcade:resume', {
            detail: { reason: reason || 'shell' }
        }));
    }

    function announceReady() {
        post('arcade:ready');
    }

    function ready() {
        readySent = true;
        announceReady();
    }

    function error(reason) {
        post('arcade:error', { message: String(reason || '游戏初始化失败') });
    }

    window.addEventListener('message', (event) => {
        if (event.origin !== location.origin || event.source !== window.parent) return;
        const data = event.data || {};
        if (data.type === 'arcade:hello' && readySent) announceReady();
        if ((data.type === 'arcade:key' || data.type === 'arcade:key-up') && data.code) {
            document.dispatchEvent(new KeyboardEvent(data.type === 'arcade:key' ? 'keydown' : 'keyup', {
                key: data.key || '', code: data.code, repeat: Boolean(data.repeat), bubbles: true, cancelable: true
            }));
        }
        if (data.type === 'arcade:pause') emitPauseState(true, data.reason);
        if (data.type === 'arcade:resume') emitPauseState(false, data.reason);
    });

    window.addEventListener('error', (event) => error(event.message));
    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason && event.reason.message ? event.reason.message : event.reason;
        error(reason);
    });

    window.ArcadeRuntime = Object.freeze({
        slug,
        key: (name) => `${prefix}${name}`,
        get: (name, fallback = null) => {
            const value = localStorage.getItem(`${prefix}${name}`);
            return value === null ? fallback : value;
        },
        set: (name, value) => localStorage.setItem(`${prefix}${name}`, String(value)),
        remove: (name) => localStorage.removeItem(`${prefix}${name}`),
        isPaused: () => paused,
        clampDelta: (milliseconds, maximum = 50) => Math.max(0, Math.min(milliseconds, maximum)) / 1000,
        ready,
        error
    });

    migrateLegacyStorage();
    window.addEventListener('load', () => requestAnimationFrame(() => requestAnimationFrame(ready)), { once: true });
}());
