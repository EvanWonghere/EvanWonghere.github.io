(function () {
    'use strict';
    let engine;
    let pausedByShell = false;
    const pauseReasons = new Set();
    let progressSent = 0;

    function post(type, detail) {
        if (parent === window) return;
        const payload = detail && typeof detail === 'object' ? Object.assign({ type: type }, detail) : { type: type, message: detail };
        parent.postMessage(payload, location.origin);
    }

    function sendProgress(ratio) {
        const clamped = Math.max(progressSent, Math.min(1, ratio));
        if (clamped - progressSent < 0.01 && clamped < 1) return;
        progressSent = clamped;
        post('fenghuo:progress', { finished: Math.round(clamped * 100), total: 100 });
    }

    window.addEventListener('message', function (event) {
        if (event.origin !== location.origin || event.source !== parent || !engine) return;
        const data = event.data || {};
        const reason = data.reason || 'shell';
        if (data.type === 'arcade:pause') pauseReasons.add(reason);
        else if (data.type === 'arcade:resume') pauseReasons.delete(reason);
        else return;
        if (pauseReasons.size && !engine.game.isPaused()) {
            engine.game.pause();
            pausedByShell = true;
        } else if (!pauseReasons.size && pausedByShell) {
            pausedByShell = false;
            engine.game.resume();
        }
    });
    window.addEventListener('error', function (event) { post('fenghuo:error', { message: event.message }); });
    window.addEventListener('unhandledrejection', function (event) {
        post('fenghuo:error', { message: String(event.reason && event.reason.message || event.reason) });
    });

    sendProgress(0.05);

    System.import('cc').then(function (cc) {
        engine = cc;
        sendProgress(0.35);
        const loadStart = performance.now();
        function waitForScene() {
            if (cc.director.getScene()) {
                sendProgress(1);
                post('fenghuo:ready');
                return;
            }
            const elapsed = performance.now() - loadStart;
            sendProgress(0.35 + Math.min(0.55, elapsed / 12000));
            requestAnimationFrame(waitForScene);
        }
        waitForScene();
    }).catch(function (error) { post('fenghuo:error', { message: String(error) }); });
}());
