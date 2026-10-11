import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { toEngineFen, fromEngineMove } = require('../static/games/xiangqi-app/uci-glue.js');

test('the rules library FEN is turned into Fairy-Stockfish FEN: only the side to move changes', () => {
    assert.equal(toEngineFen('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR r - - 0 1'), 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1');
    assert.equal(toEngineFen('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/4C2C1/9/RNBAKABNR b - - 1 1'), 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/4C2C1/9/RNBAKABNR b - - 1 1');
});

test('Fairy-Stockfish moves (ranks 1-10) become the rules library squares (ranks 0-9)', () => {
    assert.deepEqual(fromEngineMove('bestmove h3e3 ponder b10c8'), { from: 'h2', to: 'e2' });
    assert.deepEqual(fromEngineMove('bestmove h10g8'), { from: 'h9', to: 'g7' });
    assert.deepEqual(fromEngineMove('bestmove a1a10'), { from: 'a0', to: 'a9' });
    assert.deepEqual(fromEngineMove('bestmove e10e9'), { from: 'e9', to: 'e8' });
    assert.equal(fromEngineMove('bestmove (none)'), null); assert.equal(fromEngineMove('info depth 3'), null); assert.equal(fromEngineMove('bestmove j3e3'), null);
});

test('the vendored Fairy-Stockfish files are exactly the ones named in NOTICE.md', async () => {
    const dir = new URL('../static/games/vendor/fairy-stockfish/', import.meta.url);
    const notice = await readFile(new URL('NOTICE.md', dir), 'utf8');
    for (const name of ['stockfish.js', 'stockfish.wasm', 'stockfish.worker.js']) {
        const hash = createHash('sha256').update(await readFile(new URL(name, dir))).digest('hex');
        assert.ok(notice.includes(hash), `${name}: the file changed (or NOTICE.md is out of date)`);
    }
    assert.match(await readFile(new URL('Copying.txt', dir), 'utf8'), /GNU GENERAL PUBLIC LICENSE/);
});

test('the service worker adds the two isolation headers to what it fetches, and leaves opaque and only-if-cached requests alone', async () => {
    const listeners = {}; let answer;
    const sandbox = { self: { addEventListener: (type, fn) => { listeners[type] = fn; }, skipWaiting() {}, clients: { claim: () => 'claimed' } }, Headers, Response, fetch: async () => new Response('page', { status: 200, headers: { 'content-type': 'text/html' } }) };
    vm.runInNewContext(await readFile(new URL('../static/games/coi-sw.js', import.meta.url), 'utf8'), sandbox);
    assert.ok(listeners.install && listeners.activate && listeners.fetch);
    listeners.fetch({ request: { cache: 'default', mode: 'navigate' }, respondWith: promise => { answer = promise; } });
    const response = await answer;
    assert.equal(response.headers.get('Cross-Origin-Embedder-Policy'), 'credentialless'); assert.equal(response.headers.get('Cross-Origin-Opener-Policy'), 'same-origin');
    assert.equal(response.headers.get('content-type'), 'text/html'); assert.equal(await response.text(), 'page');
    answer = undefined;
    listeners.fetch({ request: { cache: 'only-if-cached', mode: 'cors' }, respondWith: () => { answer = 'responded'; } });
    assert.equal(answer, undefined, 'an only-if-cached request that is not same-origin is left to the browser');
});

test('only the xiangqi page asks for isolation, and the games shell registers the worker for it', async () => {
    assert.match(await readFile(new URL('../content/games/xiangqi.md', import.meta.url), 'utf8'), /^isolate: true$/m);
    for (const name of ['chess', 'gomoku', 'tetris', '2048']) assert.doesNotMatch(await readFile(new URL(`../content/games/${name}.md`, import.meta.url), 'utf8'), /isolate/, name);
    const shell = await readFile(new URL('../layouts/games/single.html', import.meta.url), 'utf8');
    assert.match(shell, /\.Params\.isolate/); assert.match(shell, /register\('\/games\/coi-sw\.js', \{ scope: '\/games\/' \}\)/);
});
