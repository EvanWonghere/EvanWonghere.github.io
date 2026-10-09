import { phonemeKey } from './phoneme-tips.mjs';
export const STORAGE_KEY = 'hive-english-v1';
export const MAX_SECONDS = 25;
export const MAX_RECORDS = 50;
export const SAMPLES = [
    { id: 'evening', title: '01 · 每天读一点', text: 'I usually read a little every evening. Today, I want to improve my English pronunciation.' },
    { id: 'introduction', title: '02 · 自我介绍', text: 'I enjoy building small games and learning how things work. I am practicing English a little every day.' },
    { id: 'weekend', title: '03 · 周末计划', text: 'This weekend, I would like to take a walk, visit a bookstore, and spend some time with my friends.' },
    { id: 'project', title: '04 · 介绍项目', text: 'I built this project from scratch. First, I made a simple prototype. Then, I tested the main features and improved the design.' },
];
export const wordCount = text => text.trim().split(/\s+/).filter(Boolean).length;
export function validateReference(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('先填写要朗读的英语文本。');
    if (text.length > 600 || wordCount(text) > 60) throw new Error('请拆成不超过 60 词、600 字符的短句。');
    if (!/[a-z]/i.test(text)) throw new Error('请填写英语朗读文本。');
    return text.trim();
}
const score = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value * 10) / 10 : null;
const boundedText = (value, max) => typeof value === 'string' && value.length <= max ? value : '';
// Azure counts time in 100-nanosecond units; the page keeps milliseconds.
const millis = value => { const n = Number(value); return Number.isFinite(n) && n >= 0 && n <= 6e11 ? Math.round(n / 10000) : null; };
// The service gives a confidence for a break before a word; the documentation suggests 0.75 as the line. Prosody is only reported for en-US.
function breakBefore(feedback) {
    const b = feedback?.Prosody?.Break;
    const types = Array.isArray(b?.ErrorTypes) ? b.ErrorTypes : [];
    if (types.includes('UnexpectedBreak') || b?.UnexpectedBreak?.Confidence > 0.75) return 'unexpected';
    return types.includes('MissingBreak') ? 'missing' : null;
}
const isMonotone = word => { const types = feedbackOf(word)?.Prosody?.Intonation?.ErrorTypes; return Array.isArray(types) && types.includes('Monotone'); };
// The sound the service thinks was said instead, when it was asked for candidates and the best one is not the expected sound.
const spokenInstead = phoneme => {
    const candidates = phoneme.PronunciationAssessment?.NBestPhonemes;
    const best = Array.isArray(candidates) ? candidates[0]?.Phoneme : null;
    return typeof best === 'string' && best.length > 0 && best.length <= 8 && phonemeKey(best) !== phonemeKey(phoneme.Phoneme) ? best : null;
};
// Prosody feedback sits on the word in a REST answer and inside its PronunciationAssessment in an SDK answer.
const feedbackOf = word => word.Feedback ?? word.PronunciationAssessment?.Feedback;
export function parseAssessment(raw) {
    if (typeof raw === 'string') raw = JSON.parse(raw);
    if (raw?.RecognitionStatus !== 'Success') throw new Error('没有识别到清晰的英语语音，请检查麦克风并重录。');
    const best = raw.NBest?.[0];
    const p = best?.PronunciationAssessment;
    if (!p || score(p.PronScore) === null || !Array.isArray(best.Words) || !best.Words.length || best.Words.length > 200) throw new Error('服务没有返回完整的发音反馈，请重试。');
    return {
        recognized: boundedText(best.Display || best.Lexical, 1200),
        scores: { pronunciation: score(p.PronScore), accuracy: score(p.AccuracyScore), fluency: score(p.FluencyScore), completeness: score(p.CompletenessScore), prosody: score(p.ProsodyScore) },
        monotone: best.Words.some(isMonotone),
        // 'sdk': the detailed path answered; 'unavailable': it was asked for and the plain path answered instead.
        detail: raw.HiveDetail === 'sdk' || raw.HiveDetail === 'unavailable' ? raw.HiveDetail : undefined,
        spokenReported: best.Words.some(w => Array.isArray(w.Phonemes) && w.Phonemes.some(x => Array.isArray(x.PronunciationAssessment?.NBestPhonemes))),
        words: best.Words.map(w => ({ offsetMs: millis(w.Offset), durationMs: millis(w.Duration), breakBefore: breakBefore(feedbackOf(w)), text: boundedText(w.Word, 120), accuracy: score(w.PronunciationAssessment?.AccuracyScore), error: boundedText(w.PronunciationAssessment?.ErrorType, 40) || 'None', phonemes: (Array.isArray(w.Phonemes) ? w.Phonemes : []).slice(0, 60).map(x => ({ text: boundedText(x.Phoneme, 80), accuracy: score(x.PronunciationAssessment?.AccuracyScore), spoken: spokenInstead(x) })) })),
    };
}
export function validateResult(result) {
    if (!result || typeof result.recognized !== 'string' || result.recognized.length > 1200 || !result.scores || score(result.scores.pronunciation) === null) return false;
    if (!['pronunciation', 'accuracy', 'fluency', 'completeness'].every(k => result.scores[k] === null || score(result.scores[k]) !== null)) return false;
    // Added later: records saved before have none of these, so each is optional.
    if (result.scores.prosody != null && score(result.scores.prosody) === null) return false;
    if (result.monotone !== undefined && typeof result.monotone !== 'boolean') return false;
    if (result.spokenReported !== undefined && typeof result.spokenReported !== 'boolean') return false;
    if (result.detail !== undefined && !['sdk', 'unavailable'].includes(result.detail)) return false;
    const time = v => v === undefined || v === null || (Number.isInteger(v) && v >= 0 && v <= 6e7);
    if (!result.words?.every?.(w => w && time(w.offsetMs) && time(w.durationMs) && (w.breakBefore === undefined || w.breakBefore === null || ['unexpected', 'missing'].includes(w.breakBefore)))) return false;
    return Array.isArray(result.words) && result.words.length > 0 && result.words.length <= 200 && result.words.every(w => w && typeof w.text === 'string' && w.text.length <= 120 && typeof w.error === 'string' && w.error.length <= 40 && (w.accuracy === null || score(w.accuracy) !== null) && Array.isArray(w.phonemes) && w.phonemes.length <= 60 && w.phonemes.every(p => p && (p.spoken === undefined || p.spoken === null || (typeof p.spoken === 'string' && p.spoken.length <= 8)) && typeof p.text === 'string' && p.text.length <= 80 && (p.accuracy === null || score(p.accuracy) !== null)));
}
export function validateStore(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.records) || value.records.length > MAX_RECORDS) throw new Error('记录损坏或版本较新，原数据已保留。请先导出备份。');
    const ids = new Set();
    for (const r of value.records) {
        if (!r || typeof r.id !== 'string' || r.id.length > 80 || !r.id || ids.has(r.id) || !Number.isFinite(Date.parse(r.date)) || !['en-US', 'en-GB'].includes(r.locale) || typeof r.seconds !== 'number' || r.seconds <= 0 || r.seconds > MAX_SECONDS + 1 || !validateResult(r.result)) throw new Error('记录内容不完整，原数据已保留。');
        validateReference(r.reference); ids.add(r.id);
    }
    return { version: 1, records: value.records.map(r => ({ id: r.id, date: r.date, reference: r.reference, locale: r.locale, seconds: r.seconds, result: r.result })) };
}
export function mergeStores(current, imported) {
    validateStore(current); validateStore(imported);
    const records = new Map(current.records.map(r => [r.id, r]));
    for (const r of imported.records) if (!records.has(r.id)) records.set(r.id, r);
    return { version: 1, records: [...records.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, MAX_RECORDS) };
}
// Mono PCM16 WAV, as required by Speech SDK file input. Audio resampling occurs locally.
export function encodeWav(samples, sampleRate = 16000) {
    if (!(samples instanceof Float32Array) || !samples.length || samples.length > (MAX_SECONDS + 1) * sampleRate || sampleRate !== 16000) throw new Error('录音长度或格式无效，请重录。');
    const out = new ArrayBuffer(44 + samples.length * 2), view = new DataView(out);
    const write = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    write(0, 'RIFF'); view.setUint32(4, out.byteLength - 8, true); write(8, 'WAVE'); write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, samples.length * 2, true);
    samples.forEach((s, i) => { s = Number.isFinite(s) ? Math.max(-1, Math.min(1, s)) : 0; view.setInt16(44 + 2 * i, Math.round(s < 0 ? s * 32768 : s * 32767), true); });
    return out;
}
export const errorLabel = type => ({ None: '', Mispronunciation: '发音需练习', Omission: '漏读', Insertion: '多读', UnexpectedBreak: '停顿', MissingBreak: '缺少停顿' })[type] ?? type;
export function wordClass(word) {
    if (word.error === 'Omission') return 'missing';
    if (word.error !== 'None' || word.accuracy === null || word.accuracy < 60) return 'weak';
    return word.accuracy < 80 ? 'fair' : 'good';
}
