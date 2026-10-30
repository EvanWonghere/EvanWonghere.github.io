import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Run the actual shell script; only browser APIs and Hugo's template expression are replaced.
function makeShell() {
    const template = readFileSync(new URL('../layouts/games/single.html', import.meta.url), 'utf8');
    const scripts = [...template.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    assert.ok(scripts.length, 'game shell script must be present');
    const source = scripts.at(-1)[1].replace(/\{\{[\s\S]*?\}\}/g, '"/games/"');
    const events = () => {
        const listeners = new Map();
        return {
            addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
            emit(type, e = {}) { for (const fn of listeners.get(type) || []) fn(e); },
        };
    };
    function node() {
        const values = new Set();
        return Object.assign(events(), {
            classList: {
                add(...names) { names.forEach(n => values.add(n)); },
                remove(...names) { names.forEach(n => values.delete(n)); },
                contains(name) { return values.has(name); },
                toggle(name, force) { const enable = force === undefined ? !values.has(name) : force; enable ? values.add(name) : values.delete(name); return enable; },
            },
            textContent: '', style: {}, setAttribute() {}, focus() {},
        });
    }
    const nodes = new Map();
    for (const id of ['game-frame', 'game-loading', 'fullscreen-btn', 'fullscreen-label', 'loading-error-message', 'retry-btn', 'guide-panel', 'guide-backdrop', 'guide-close']) nodes.set(id, node());
    function attachFrameFeatures(frame, isConnected) {
        frame.isConnected = isConnected;
        frame.contentWindow = isConnected ? makeFrameWindow() : null;
        frame.cloneNode = function () {
            const clone = node();
            clone.src = this.src;
            attachFrameFeatures(clone, false);
            return clone;
        };
        frame.replaceWith = function (replacement) {
            this.isConnected = false;
            this.contentWindow = null;
            replacement.isConnected = true;
            replacement.contentWindow = makeFrameWindow();
            nodes.set('game-frame', replacement);
        };
    }
    function makeFrameWindow() {
        return { messages: [], postMessage(data, origin) { this.messages.push({ data, origin }); } };
    }
    const frame = nodes.get('game-frame');
    frame.src = 'https://example.test/games/fenghuo-app/index.html';
    attachFrameFeatures(frame, true);
    const container = node();
    const loadingLabel = node();
    const document = Object.assign(events(), {
        body: node(), hidden: false, fullscreenElement: null, activeElement: null,
        getElementById(id) { return nodes.get(id) || null; },
        querySelector(selector) {
            if (selector === '.game-container') return container;
            if (selector === '.loading-label') return loadingLabel;
            return null;
        },
    });
    const timers = new Map();
    let clock = 0, sequence = 0;
    const window = Object.assign(events(), {
        location: { origin: 'https://example.test', href: 'https://example.test/games/fenghuo/' },
        setTimeout(fn, ms = 0) { const id = ++sequence; timers.set(id, { at: clock + ms, fn }); return id; },
        clearTimeout(id) { timers.delete(id); },
    });
    function advance(ms) {
        const until = clock + ms;
        for (;;) {
            const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            timers.delete(next[0]); clock = next[1].at; next[1].fn();
        }
        clock = until;
    }
    vm.runInNewContext(source, { window, document, URL, Date, console }, { filename: 'games/single.html' });
    return { get frame() { return nodes.get('game-frame'); }, window, loading: nodes.get('game-loading'), error: nodes.get('loading-error-message'), retry: nodes.get('retry-btn'), label: loadingLabel, advance,
        message(type, options = {}) { window.emit('message', { origin: options.origin ?? window.location.origin, source: options.source ?? nodes.get('game-frame').contentWindow, data: { type, message: options.message } }); },
    };
}

test('slow load remains loading after 12 seconds; later ready displays game', () => {
    const shell = makeShell();
    shell.frame.emit('load');
    shell.advance(12000);
    assert.equal(shell.loading.classList.contains('is-hidden'), false);
    assert.equal(shell.loading.classList.contains('is-error'), false, 'slow is not an initialization failure');
    assert.equal(shell.loading.classList.contains('is-slow'), true, 'slow load must show the wait/retry prompt');
    assert.match(shell.error.textContent, /加载|载入/);
    shell.message('arcade:ready');
    assert.equal(shell.loading.classList.contains('is-hidden'), true, 'later ready must reveal the game');
    shell.advance(120000);
    assert.equal(shell.loading.classList.contains('is-hidden'), true, 'no stale timer can cover a ready game');
});

test('actual initialization error survives a later iframe load and retries reset it', () => {
    const shell = makeShell();
    shell.message('arcade:error', { message: '初始化失败' });
    assert.equal(shell.loading.classList.contains('is-error'), true);
    const text = shell.error.textContent;
    assert.match(text, /初始化失败/);
    shell.frame.emit('load');
    assert.equal(shell.loading.classList.contains('is-error'), true, 'iframe load must not hide the real error');
    assert.equal(shell.error.textContent, text);
    const previousSrc = shell.frame.src;
    shell.retry.emit('click');
    assert.equal(shell.loading.classList.contains('is-error'), false);
    assert.equal(shell.loading.classList.contains('is-hidden'), false);
    assert.notEqual(shell.frame.src, previousSrc, 'retry must reload the frame');
    shell.frame.emit('load');
    shell.message('arcade:ready');
    assert.equal(shell.loading.classList.contains('is-hidden'), true);
});

test('retry rejects queued ready and error from the replaced iframe and accepts the new iframe', () => {
    const shell = makeShell();
    shell.frame.emit('load');
    const oldWindow = shell.frame.contentWindow;
    const oldFrame = shell.frame;
    shell.retry.emit('click');
    assert.notEqual(shell.frame, oldFrame, 'retry must create a new browsing context');
    assert.notEqual(shell.frame.contentWindow, oldWindow, 'new iframe must have its own WindowProxy');
    shell.message('arcade:ready', { source: oldWindow });
    assert.equal(shell.loading.classList.contains('is-hidden'), false, 'old ready cannot reveal new loading');
    shell.message('arcade:error', { source: oldWindow, message: '过期错误' });
    assert.equal(shell.loading.classList.contains('is-error'), false, 'old error cannot fail new loading');
    shell.frame.emit('load');
    assert.ok(shell.frame.contentWindow.messages.some(m => m.data.type === 'arcade:hello'), 'new iframe load receives handshake');
    shell.message('arcade:ready');
    assert.equal(shell.loading.classList.contains('is-hidden'), true, 'new iframe ready completes loading');
});

test('the shared shell accepts a regular game ready only from its own same-origin iframe', () => {
    const shell = makeShell();
    shell.frame.emit('load');
    shell.message('arcade:ready', { origin: 'https://untrusted.test' });
    shell.message('arcade:ready', { source: {} });
    assert.equal(shell.loading.classList.contains('is-hidden'), false);
    shell.message('arcade:error', { source: {}, message: '伪造错误' });
    assert.equal(shell.loading.classList.contains('is-error'), false);
    shell.message('arcade:ready');
    assert.equal(shell.loading.classList.contains('is-hidden'), true);
    shell.frame.emit('load');
    assert.equal(shell.loading.classList.contains('is-hidden'), true, 'late iframe load must not cover a ready game');
});

// Execute the generated SystemJS entry point with a failing engine import and a failing scene start.
async function exerciseGameStartup(failure) {
    const source = readFileSync(new URL('../static/games/fenghuo-app/game/index.js', import.meta.url), 'utf8');
    let definition, reported = 0;
    const context = {
        document: { getElementById() { return { parentElement: { getBoundingClientRect() { return { width: 100, height: 100 }; } } }; } },
        window: { FenghuoLoadError() { reported++; } }, console: { error() {} },
        System: {
            register(_deps, factory) { definition = factory(() => {}, {}); },
            import() { return failure === 'engine' ? Promise.reject(new Error('engine failure')) : Promise.resolve({}); },
        },
    };
    vm.runInNewContext(source, context, { filename: 'game/index.js' });
    definition.setters[0]({ Application: class {
        init() { if (failure === 'init') throw new Error('init failure'); }
        start() { return failure === 'start' ? Promise.reject(new Error('scene failure')) : Promise.resolve(); }
    } });
    definition.execute();
    await new Promise(resolve => setImmediate(resolve));
    return reported;
}

test('the game entry point reports engine, initialization, and scene-start failures', async () => {
    for (const failure of ['engine', 'init', 'start']) {
        assert.equal(await exerciseGameStartup(failure), 1, `${failure} error must be reported`);
    }
    assert.equal(await exerciseGameStartup('none'), 0, 'successful startup must not report an error');
});

test('the bootstrap reports failure to load the game entry module', async () => {
    const html = readFileSync(new URL('../static/games/fenghuo-app/game/index.html', import.meta.url), 'utf8');
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes("System.import('./index.js')"));
    assert.ok(script, 'game bootstrap script must exist');
    let reported = 0;
    vm.runInNewContext(script, { System: { import() { return Promise.reject(new Error('missing script')); } },
        console: { error() {} }, window: { FenghuoLoadError() { reported++; } } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reported, 1);
});

test('the game bridge sends a sanitized initialization error to its wrapper', () => {
    const bridge = readFileSync(new URL('../static/games/fenghuo-app/game/arcade-bridge.js', import.meta.url), 'utf8');
    const sent = [];
    const parent = { postMessage(message, origin) { sent.push({ message, origin }); } };
    const window = { addEventListener() {} };
    vm.runInNewContext(bridge, { window, parent, location: { origin: 'https://example.test' },
        System: { import() { return new Promise(() => {}); } }, console });
    window.FenghuoLoadError(new Error('private details'));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].message.type, 'fenghuo:error');
    assert.equal(sent[0].origin, 'https://example.test');
    assert.ok(!sent[0].message.message.includes('private details'));
});

test('wrapper forwards an actual game error only from its own same-origin iframe', () => {
    const html = readFileSync(new URL('../static/games/fenghuo-app/index.html', import.meta.url), 'utf8');
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
    assert.ok(script, 'wrapper message bridge must exist');
    const handlers = new Map(), forwarded = [];
    const game = { contentWindow: { postMessage() {} } };
    const parent = { postMessage(data, origin) { forwarded.push({ data, origin }); },
        document: { body: { classList: { contains() { return false; } } }, hidden: false } };
    const window = { addEventListener(type, fn) { handlers.set(type, fn); } };
    vm.runInNewContext(script, { window, parent, document: { getElementById() { return game; } }, location: { origin: 'https://example.test' }, Set });
    const message = handlers.get('message');
    message({ origin: 'https://untrusted.test', source: game.contentWindow, data: { type: 'fenghuo:error', message: '伪造' } });
    message({ origin: 'https://example.test', source: {}, data: { type: 'fenghuo:error', message: '伪造' } });
    assert.equal(forwarded.length, 0);
    message({ origin: 'https://example.test', source: game.contentWindow, data: { type: 'fenghuo:error', message: '游戏启动失败' } });
    assert.equal(forwarded.length, 1);
    assert.equal(forwarded[0].origin, 'https://example.test');
    assert.equal(forwarded[0].data.type, 'arcade:error');
    assert.equal(forwarded[0].data.message, '游戏启动失败');
});
