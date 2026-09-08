import { freshCreative, validateCreative } from './composition.mjs';
// Pure music, assessment and progress functions shared by the browser and tests.
export const STORAGE_KEY = 'hive-music-v1';
export const DAY = 86400000;
export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const INTERVALS = ['纯一度', '小二度', '大二度', '小三度', '大三度', '纯四度', '三全音', '纯五度', '小六度', '大六度', '小七度', '大七度', '纯八度'];
export const CHORDS = { '大三和弦': [0, 4, 7], '小三和弦': [0, 3, 7], '减三和弦': [0, 3, 6], '增三和弦': [0, 4, 8] };
export const SEVENTHS = { '大七和弦':[0,4,7,11], '属七和弦':[0,4,7,10], '小七和弦':[0,3,7,10], '半减七和弦':[0,3,6,10], '减七和弦':[0,3,6,9], '小大七和弦':[0,3,7,11] };
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const noteName = n => NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
export const frequency = n => 440 * 2 ** ((n - 69) / 12);
export const midiPitch = hz => 69 + 12 * Math.log2(hz / 440);
export const isBlack = n => [1, 3, 6, 8, 10].includes(n % 12);
export const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function freshProgress() {
    return { version: 1, lessons: {}, cards: {}, skills: {}, days: {}, history: [], settings: { bpm: 72, volume: 65, velocity: 85, octave: 4, goal: 20 }, lastLesson: 'pitch', preferences: {}, lessonTasks: {}, journal: [], creative: freshCreative() };
}
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const finite = (value, fallback, min = 0, max = 1e9) => typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
const safeKey = key => /^[a-zA-Z0-9_-]{1,100}$/.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key);
export function validateProgress(raw) {
    if (!object(raw) || raw.version !== 1 || !object(raw.lessons) || !object(raw.cards) || !object(raw.settings)) throw new Error('不是支持的音乐练习室备份（需要 version: 1）。');
    const p = freshProgress();
    for (const [id, value] of Object.entries(raw.lessons)) if (safeKey(id) && value === true) p.lessons[id] = true;
    for (const [id, value] of Object.entries(raw.cards).slice(0, 10000)) if (safeKey(id) && object(value)) p.cards[id] = {
        attempts: Math.floor(finite(value.attempts, 0)), correct: Math.floor(finite(value.correct, 0, 0, finite(value.attempts, 0))),
        streak: Math.floor(finite(value.streak, 0, 0, 30)), due: finite(value.due, 0, 0, 8640000000000000), lastCorrect: value.lastCorrect === true
    };
    for (const [id, value] of Object.entries(raw.skills || {})) if (safeKey(id) && object(value)) p.skills[id] = { attempts: Math.floor(finite(value.attempts, 0)), best: finite(value.best, 0, 0, 100), latest: finite(value.latest, 0, 0, 100), ...(value.bestBpm !== undefined ? { bestBpm:finite(value.bestBpm,0,0,200), latestBpm:finite(value.latestBpm,0,0,200) } : {}) };
    for (const [id, value] of Object.entries(raw.days || {})) if (/^\d{4}-\d{2}-\d{2}$/.test(id) && object(value)) p.days[id] = { seconds: finite(value.seconds, 0, 0, 86400), answers: Math.floor(finite(value.answers, 0)) };
    p.history = (Array.isArray(raw.history) ? raw.history : []).filter(v => object(v) && safeKey(v.skill) && typeof v.at === 'number' && Number.isFinite(v.at) && v.at >= 0 && v.at <= 8640000000000000).slice(-150).map(v => ({ skill: v.skill, score: finite(v.score, 0, 0, 100), at: v.at }));
    const s = raw.settings;
    p.settings = { bpm: Math.round(finite(s.bpm, 72, 40, 200)), volume: finite(s.volume, 65, 0, 100), velocity: finite(s.velocity, 85, 20, 127), octave: Math.round(finite(s.octave, 4, 1, 6)), goal: Math.round(finite(s.goal, 20, 5, 60)) };
    if (typeof raw.lastLesson === 'string' && safeKey(raw.lastLesson)) p.lastLesson = raw.lastLesson;
    if (object(raw.lessonTasks)) for (const [id, tasks] of Object.entries(raw.lessonTasks)) {
        if (safeKey(id) && Array.isArray(tasks)) p.lessonTasks[id] = tasks.slice(0, 12).map(Boolean);
    }
    p.journal = (Array.isArray(raw.journal) ? raw.journal : []).filter(v => object(v) && typeof v.text === 'string' && typeof v.at === 'number' && Number.isFinite(v.at) && v.at >= 0 && v.at <= 8640000000000000).slice(-100).map(v => ({ text:v.text.slice(0, 1200), at:v.at, bpm:finite(v.bpm,72,40,200) }));
    if (object(raw.preferences)) for (const [key, value] of Object.entries(raw.preferences)) {
        if (['piano-piece','piano-mode','sight-piece','sight-octave','rhythm-pattern','ear-mode','ear-level','ear-style','theory-mode','lesson-filter','instrument','piano-hand','piano-repeats','piano-duration','harmony-bass','harmony-smooth','harmony-kind','harmony-root','harmony-type','harmony-voicing','harmony-inversion','harmony-progression','piano-from','piano-to'].includes(key) && typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value)) p.preferences[key] = value;
    }
    p.creative = validateCreative(raw.creative);
    return p;
}
export function loadProgress(storage) {
    try { const raw = storage.getItem(STORAGE_KEY); return { progress: raw ? validateProgress(JSON.parse(raw)) : freshProgress(), error: null }; }
    catch { return { progress: freshProgress(), error: '无法读取本地进度。原记录未覆盖；请先导出备份或恢复有效备份。', blocked: true }; }
}
export function saveProgress(storage, progress) {
    try { storage.setItem(STORAGE_KEY, JSON.stringify(progress)); return null; }
    catch { return '浏览器未能保存进度，请导出备份，避免关闭页面后丢失。'; }
}
export function recordAnswer(p, id, correct, now = Date.now()) {
    const c = p.cards[id] || { attempts: 0, correct: 0, streak: 0 };
    c.attempts++; c.correct += correct ? 1 : 0; c.streak = correct ? c.streak + 1 : 0;
    c.lastCorrect = correct; c.due = now + (correct ? [1, 3, 7, 14, 30][Math.min(c.streak - 1, 4)] * DAY : 10 * 60000);
    p.cards[id] = c;
    const day = localDay(new Date(now));
    p.days[day] ||= { seconds: 0, answers: 0 }; p.days[day].answers++;
    return c;
}
export function recordSkill(p, skill, score, now = Date.now()) {
    const old = p.skills[skill] || { attempts: 0, best: 0 };
    p.skills[skill] = { ...old, attempts: old.attempts + 1, best: Math.max(old.best, score), latest: score };
    p.history.push({ skill, score, at: now }); p.history = p.history.slice(-150);
}
export function streakDays(days, today = new Date()) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const practiced = () => (days[localDay(d)]?.seconds || 0) > 0 || (days[localDay(d)]?.answers || 0) > 0;
    if (!practiced()) d.setDate(d.getDate() - 1);
    let count = 0;
    while (practiced() && count < 100000) { count++; d.setDate(d.getDate() - 1); }
    return count;
}
export const pick = (xs, rng = Math.random) => xs[Math.floor(rng() * xs.length)];
export function shuffle(xs, rng = Math.random) {
    const result = [...xs]; for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; } return result;
}
export function earQuestion(mode = 'interval', level = 'beginner', rng = Math.random) {
    const root = 48 + Math.floor(rng() * 13);
    if (mode === 'seventh') {
        const options=Object.keys(SEVENTHS).slice(0,level==='beginner'?3:6),answer=pick(options,rng);
        return {id:`ear-seventh-${root}-${options.indexOf(answer)}`,mode,notes:SEVENTHS[answer].map(n=>n+root),options,answer,explanation:`${answer}相对根音的半音数：${SEVENTHS[answer].join('、')}。先辨三和弦底色，再听七音。`};
    }
    if (mode === 'chord') {
        const options = level === 'beginner' ? Object.keys(CHORDS).slice(0, 2) : Object.keys(CHORDS);
        const answer = pick(options, rng); return { id: `ear-chord-${root}-${options.indexOf(answer)}`, mode, notes: CHORDS[answer].map(n => n + root), options, answer, explanation: `${answer}相对根音的半音数：${CHORDS[answer].join('、')}。` };
    }
    if (mode === 'direction') {
        const distance = pick([0, 2, 4, 7, -2, -4, -7], rng); const answer = distance === 0 ? '相同' : distance > 0 ? '上行' : '下行';
        return { id: `ear-direction-${root}-${distance + 12}`, mode, notes: [root, root + distance], options: ['上行', '下行', '相同'], answer, explanation: `第二个音${answer === '相同' ? '与第一个音相同' : answer === '上行' ? '更高' : '更低'}。` };
    }
    const distances = level === 'beginner' ? [0, 2, 4, 5, 7, 12] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const distance = pick(distances, rng);
    return { id: `ear-interval-${root}-${distance}`, mode, notes: [root, root + distance], options: distances.map(n => INTERVALS[n]), answer: INTERVALS[distance], explanation: `两音相隔 ${distance} 个半音，为${INTERVALS[distance]}。先唱根音，再内听第二个音。` };
}
// Normalized autocorrelation: only the first strong local peak, to avoid octave/subharmonic mistakes.
export function detectPitch(samples, sampleRate) {
    let energy = 0, mean = 0; for (const x of samples) mean += x; mean /= samples.length;
    for (const x of samples) energy += (x - mean) ** 2;
    if (Math.sqrt(energy / samples.length) < .012) return null;
    const min = Math.floor(sampleRate / 1100), max = Math.min(Math.ceil(sampleRate / 70), Math.floor(samples.length / 2));
    const corr = new Float32Array(max + 2);
    for (let lag = min; lag <= max + 1; lag++) {
        let sum = 0, a = 0, b = 0;
        for (let i = 0; i < samples.length - lag; i += 2) { const x = samples[i] - mean, y = samples[i + lag] - mean; sum += x * y; a += x * x; b += y * y; }
        corr[lag] = sum / Math.sqrt(a * b || 1);
    }
    for (let lag = min + 1; lag < max; lag++) if (corr[lag] > .90 && corr[lag] >= corr[lag - 1] && corr[lag] > corr[lag + 1]) {
        const delta = .5 * (corr[lag - 1] - corr[lag + 1]) / (corr[lag - 1] - 2 * corr[lag] + corr[lag + 1]);
        return sampleRate / (lag + (Number.isFinite(delta) ? delta : 0));
    }
    return null;
}
export function scoreRhythm(expected, actual, beatMs, tolerance = .22) {
    // Absolute positions after count-in: extra and missing taps are penalized, no drift normalization.
    const remaining = [...actual]; let matched = 0; let totalError = 0;
    for (const beat of expected) {
        const target = beat * beatMs;
        let nearest = -1, distance = Infinity;
        remaining.forEach((tap, i) => { if (Math.abs(tap - target) < distance) { distance = Math.abs(tap - target); nearest = i; } });
        if (nearest >= 0 && distance <= beatMs * tolerance) { matched++; totalError += distance; remaining.splice(nearest, 1); }
    }
    return { score: Math.round(100 * matched / Math.max(expected.length, actual.length, 1)), matched, errorMs: matched ? Math.round(totalError / matched) : null, extra: remaining.length };
}
