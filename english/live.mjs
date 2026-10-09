// Live dictation probe. The browser's own recognizer hears the microphone; nothing is recorded, uploaded to this site or stored.
// Chrome hands the audio to Google and Safari to Apple, so the probe only runs when the visitor presses a button.
const Recognition = () => globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
export const recognitionSupported = () => Boolean(Recognition());
const ADVICE = {
    'not-allowed': '麦克风或听写被拒绝。请在地址栏的网站权限里允许麦克风；Safari 还要在系统设置里开启听写。',
    'service-not-allowed': '浏览器不允许本页使用听写服务。',
    network: '浏览器的听写服务连不上网络。Chrome 的听写要访问 Google 的服务，在部分地区可能连不上。',
    'no-speech': '没有听到声音。请靠近麦克风，对它说一句英语。',
    'audio-capture': '找不到可用的麦克风。',
    'language-not-supported': '这个浏览器不支持英语听写。',
    aborted: '测试已取消。',
    unsupported: '这个浏览器没有提供实时听写（Firefox 不支持）。',
};
export const describeRecognitionError = code => ADVICE[code] ?? `听写出错：${code}`;

// Resolves {ok:true, heard} on the first words the recognizer returns, otherwise {ok:false, code}.
export function probeRecognition({ locale = 'en-US', seconds = 8, signal, onInterim } = {}) {
    const Engine = Recognition();
    if (!Engine) return Promise.resolve({ ok: false, code: 'unsupported' });
    return new Promise(resolve => {
        const engine = new Engine();
        let settled = false;
        const finish = result => {
            if (settled) return;
            settled = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
            try { engine.abort(); } catch { /* already stopped */ }
            resolve(result);
        };
        const onAbort = () => finish({ ok: false, code: 'aborted' });
        const timer = setTimeout(() => finish({ ok: false, code: 'no-speech' }), seconds * 1000);
        engine.lang = locale; engine.interimResults = true; engine.continuous = false; engine.maxAlternatives = 1;
        engine.onresult = event => {
            const heard = Array.from(event.results, r => r[0].transcript).join(' ').trim();
            if (!heard) return;
            onInterim?.(heard);
            if (event.results[event.results.length - 1].isFinal) finish({ ok: true, heard });
        };
        engine.onerror = event => finish({ ok: false, code: event.error });
        engine.onend = () => finish({ ok: false, code: 'no-speech' });
        signal?.addEventListener('abort', onAbort, { once: true });
        try { engine.start(); } catch (error) { finish({ ok: false, code: error.name === 'NotAllowedError' ? 'not-allowed' : 'audio-capture' }); }
    });
}

const FATAL = new Set(['not-allowed', 'service-not-allowed', 'network', 'audio-capture', 'language-not-supported']);
const join = (a, b) => `${a} ${b}`.trim();
// Continuous dictation while someone reads. Browsers end a session after a pause or a minute or so, so this starts a new one
// and keeps the words heard so far. Returns null when the browser has no recognizer.
// onText(everything heard so far) fires on every update; onError(code) fires once for a failure that restarting cannot fix.
export function createLive({ locale = 'en-US', onText, onError } = {}) {
    const Engine = Recognition();
    if (!Engine) return null;
    let engine, active = false, dead = false, base = '', session = '', closing = null, quick = 0, startedAt = 0;
    const text = () => join(base, session);
    const fail = code => { active = false; onError?.(code); };
    const open = () => {
        engine = new Engine();
        engine.lang = locale; engine.continuous = true; engine.interimResults = true; engine.maxAlternatives = 1;
        session = '';
        engine.onresult = event => { if (dead) return; session = Array.from(event.results, r => r[0].transcript).join(' ').trim(); onText?.(text()); };
        engine.onerror = event => { if (FATAL.has(event.error)) fail(event.error); };
        engine.onend = () => {
            base = text(); session = '';
            if (active) {
                // A session that ends at once, again and again, means the service is unreachable; stop instead of looping.
                quick = Date.now() - startedAt < 400 ? quick + 1 : 0;
                if (quick >= 4) { fail('network'); return; }
                try { startedAt = Date.now(); open(); engine.start(); } catch { fail('audio-capture'); }
            } else closing?.();
        };
    };
    return {
        start() { active = true; dead = false; base = ''; quick = 0; startedAt = Date.now(); try { open(); engine.start(); } catch { fail('audio-capture'); } },
        // Resolves with all the words heard, after the recognizer has delivered its last result.
        stop() {
            const was = active; active = false;
            return new Promise(resolve => {
                const done = () => { clearTimeout(timer); closing = null; dead = true; resolve(text()); };   // later results belong to nobody
                const timer = setTimeout(done, 1000);
                closing = done;
                try { engine.stop(); } catch { done(); }
                if (!was) done();
            });
        },
        abort() { active = false; dead = true; try { engine?.abort(); } catch { /* already stopped */ } },
    };
}
