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
    window.FenghuoLoadError = function () { post('fenghuo:error', '游戏启动失败，请重新载入。'); };
    window.addEventListener('error', function () { window.FenghuoLoadError(); });
    window.addEventListener('unhandledrejection', function () { window.FenghuoLoadError(); });
    System.import('cc').then(function (cc) {
        engine = cc;
        function waitForScene() {
            if (cc.director.getScene()) post('fenghuo:ready');
            else requestAnimationFrame(waitForScene);
        }
        waitForScene();
    }).catch(function (error) { console.error(error); window.FenghuoLoadError(); });
}());
