import { parseAssessment } from './core.mjs';
let sdkPromise;
export function loadSDK() {
    if (globalThis.SpeechSDK) return Promise.resolve(globalThis.SpeechSDK);
    if (!sdkPromise) sdkPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL('./vendor/speech-sdk-1.52.0.js', import.meta.url).href;
        const fail = () => { clearTimeout(timer); script.remove(); sdkPromise = null; reject(new Error('语音组件加载失败，请检查网络后重试。')); };
        const timer = setTimeout(fail, 15000);
        script.onload = () => { clearTimeout(timer); globalThis.SpeechSDK ? resolve(globalThis.SpeechSDK) : fail(); };
        script.onerror = fail;
        document.head.append(script);
    });
    return sdkPromise;
}
export function withAbort(promise, signal) {
    return new Promise((resolve, reject) => {
        const abort = () => { signal.removeEventListener('abort', abort); reject(new DOMException('已取消评分。', 'AbortError')); };
        if (signal.aborted) { abort(); return; }
        signal.addEventListener('abort', abort, { once: true });
        promise.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
    });
}
export function assessFile(sdk, { token, region, file, reference, locale, signal }) {
    return new Promise((resolve, reject) => {
        let recognizer, audio, timer, settled = false;
        const dispose = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); try { recognizer?.close(); } catch { /* already closed */ } try { audio?.close(); } catch { /* already closed */ } };
        const finish = (error, result) => { if (settled) return; settled = true; dispose(); error ? reject(error) : resolve(result); };
        const abort = () => finish(new DOMException('已取消评分。', 'AbortError'));
        if (signal?.aborted) { abort(); return; }
        signal?.addEventListener('abort', abort, { once: true });
        try {
            const config = sdk.SpeechConfig.fromAuthorizationToken(token, region);
            config.speechRecognitionLanguage = locale;
            config.outputFormat = sdk.OutputFormat.Detailed;
            audio = sdk.AudioConfig.fromWavFileInput(file);
            recognizer = new sdk.SpeechRecognizer(config, audio);
            new sdk.PronunciationAssessmentConfig(reference, sdk.PronunciationAssessmentGradingSystem.HundredMark, sdk.PronunciationAssessmentGranularity.Phoneme, true).applyTo(recognizer);
            // Short recorded files retain Azure's omission/insertion calculation. Prosody is off.
            timer = setTimeout(() => finish(new Error('评分超时。录音仍在本页，可以检查网络后重试。')), 45000);
            recognizer.canceled = () => finish(new Error('Azure 未能完成评分。请检查网络、资源额度或稍后重试。'));
            recognizer.recognizeOnceAsync(result => {
                try {
                    if (result.reason !== sdk.ResultReason.RecognizedSpeech) throw new Error('没有识别到清晰的英语语音。请回听录音并重试。');
                    finish(null, parseAssessment(result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult)));
                } catch (error) { finish(error); }
            }, () => finish(new Error('无法连接语音评分服务。录音已保留，请检查网络后重试。')));
        } catch { finish(new Error('无法打开录音或启动评分，请重录后再试。')); }
    });
}
