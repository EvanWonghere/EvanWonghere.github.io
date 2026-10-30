(function () {
    'use strict';
    let engine;
    let pausedByShell = false;
    const pauseReasons = new Set();
    function post(type, message) {
        if (parent !== window) parent.postMessage({ type: type, message: message }, location.origin);
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
    window.addEventListener('error', function (event) { post('fenghuo:error', event.message); });
    window.addEventListener('unhandledrejection', function (event) {
        post('fenghuo:error', String(event.reason && event.reason.message || event.reason));
    });
    System.import('cc').then(function (cc) {
        engine = cc;
        function waitForScene() {
            if (cc.director.getScene()) post('fenghuo:ready');
            else requestAnimationFrame(waitForScene);
        }
        waitForScene();
    }).catch(function (error) { post('fenghuo:error', String(error)); });
}());
