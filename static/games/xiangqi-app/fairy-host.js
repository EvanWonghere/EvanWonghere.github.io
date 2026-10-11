// Hosts Fairy-Stockfish (WebAssembly, multi-threaded) for ai-worker.js: loads the engine and passes UCI lines both ways.
// Needs SharedArrayBuffer, so it only works on a cross-origin isolated page (see static/games/coi-sw.js).
importScripts('../vendor/fairy-stockfish/stockfish.js');

const base = new URL('../vendor/fairy-stockfish/', self.location.href).href;
let engine = null;
const queue = [];

Stockfish({
    locateFile: (file) => base + file,
    mainScriptUrlOrBlob: base + 'stockfish.js',
}).then((instance) => {
    engine = instance;
    engine.addMessageListener((line) => self.postMessage(String(line)));
    for (const command of queue.splice(0)) engine.postMessage(command);
    self.postMessage('__loaded');
}).catch((error) => self.postMessage('__failed ' + (error && error.message ? error.message : error)));

self.addEventListener('message', (event) => {
    if (engine) engine.postMessage(event.data); else queue.push(event.data);
});
