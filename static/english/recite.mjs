// Reciting a text from memory, segment by segment, with more and more of it hidden.
// The score is local: it needs live dictation to hear what was said, and without it the learner checks against the text.
import { flatten, splitUnits, tokenize } from './library.mjs';
import { maskUnits, reciteScore, lineWordCounts } from './align.mjs';

export const LEVELS = [
    [1, '第 1 级：留一半', '每行只留前半截，后半截要自己想起来。'],
    [2, '第 2 级：首字母', '每个词只留首字母。'],
    [3, '第 3 级：几乎全隐', '每行只给第一个词的首字母。'],
];
const PASS = 6;   // out of 8

// api: { ctx, el, $, minutes, speakText(text, rate), stopSpeech(), backToLibrary(), liveOn(), setLive(on), conceal(on), onRecited(level) }
// recited: the highest level already passed. Returns { onClip, beforeRecord, onDiscard, dispose }.
export function startRecite(work, api, { recited = 0 } = {}) {
    const { ctx, el, $, speakText, stopSpeech } = api;
    const segs = work.segments;
    const unitsOf = i => splitUnits(segs[i].text, work.kind, { byLine: true });
    const outcomes = new Map();            // segment → { score: number | null, passed: boolean }
    let level = Math.min(3, recited + 1), at = 0, state = 'ready', pending = null, passedLevel = recited;
    const stage = $('read-stage'), bar = $('read-progress');
    const button = (label, onclick, cls = '') => el('button', { type: 'button', class: cls, onclick }, label);

    const drawBar = () => bar.replaceChildren(...segs.map((_, i) => el('i', { class: outcomes.has(i) ? 'done' : i === at && state !== 'ready' && state !== 'summary' ? 'now' : '' })));
    function render(next) { state = next; drawBar(); stage.replaceChildren(...({ ready, reciting, between, summary })[state]()); }
    function go(i) {
        if (!ctx.setReference(flatten(segs[i].text), true)) { $('status').textContent = '正在录音或评分，请等它结束再继续。'; return; }
        at = i; outcomes.delete(i); pending = null; render('reciting');
    }

    function ready() {
        const live = api.liveOn();
        return [el('p', {}, `共 ${segs.length} 段。每段只给提示，凭记忆背出来，用练习区录音。选难度：`),
            el('div', { class: 'levels' }, ...LEVELS.map(([n, name, note]) => el('label', { class: 'level-pick' }, el('input', { type: 'radio', name: 'recite-level', value: n, ...(n === level ? { checked: '' } : {}), onchange: () => { level = n; } }), el('span', {}, el('b', {}, name), el('small', {}, note + (n <= passedLevel ? '（已通过）' : ''))))),),
            el('p', { class: live ? 'hint' : 'notice', role: 'status' }, live ? '实时听写已开启：背完会自动数出背错和漏掉的词，按 8 分制给准确度。' : '自动评分需要打开练习区的“实时亮词”。不打开也可以背，背完对照原文自己判断。'),
            el('div', { class: 'controls' }, ...(live ? [] : [button('开启实时亮词', () => { api.setLive(true); render('ready'); })]), button('开始背诵', () => go(0), 'primary'))];
    }
    function reciting() {
        const masked = maskUnits(unitsOf(at), level).join('\n');
        const block = el('p', { class: 'follow-text mask', lang: 'en' }, masked);
        const peek = () => { block.textContent = segs[at].text; setTimeout(() => { if (state === 'reciting') block.textContent = masked; }, 1500); };
        return [el('p', { class: 'hint' }, `第 ${at + 1} / ${segs.length} 段 · 第 ${level} 级。看提示，背出来。`), block,
            el('div', { class: 'controls' }, button('偷看 1.5 秒', peek), button('▶ 听这段', () => speakText(flatten(segs[at].text), 0.9, undefined, 1, { segment: at })), button('■ 停止', stopSpeech))];
    }

    // The text with every word coloured by what was heard.
    function marked(marks) {
        let k = -1;
        return el('p', { class: 'follow-text small', lang: 'en' }, ...tokenize(segs[at].text).map(t => { if (!t.word) return t.text; k += 1; return el('span', { class: `lw ${marks[k] ?? 'pending'}` }, t.text); }));
    }
    function between() {
        const clip = pending;
        const last = at === segs.length - 1;
        const next = el('button', { type: 'button', class: 'primary', onclick: () => last ? render('summary') : go(at + 1) }, last ? '背完了，看总结 ▸' : '继续下一段 ▸');
        const again = button('再背这一段', () => go(at));
        if (clip?.local) {
            const { score, wrong, skippedLines } = reciteScore(clip.local.marks, lineWordCounts(unitsOf(at)));
            outcomes.set(at, { score, passed: score >= PASS }); drawBar();
            return [el('p', {}, `准确度 ${score} / 8。${wrong ? `背错或漏掉 ${wrong} 个词${skippedLines ? `，整行漏掉 ${skippedLines} 行` : ''}。` : '一个词都没错。'}`), marked(clip.local.marks),
                el('p', { class: 'hint' }, '听写会出错，所以分数只作参考。绿色是听到了，红色是没听到或听成别的词。'), el('div', { class: 'controls' }, again, next)];
        }
        const settle = passed => { outcomes.set(at, { score: null, passed }); drawBar(); stage.replaceChildren(...between()); };
        const decided = outcomes.get(at);
        return [el('p', {}, '这次没有听写结果，请对照原文自己判断。'), el('p', { class: 'follow-text small', lang: 'en' }, segs[at].text),
            el('div', { class: 'controls' }, ...(decided ? [el('span', { role: 'status' }, decided.passed ? '记作：背对了。' : '记作：还要再背。'), again, next] : [button('我背对了', () => settle(true), 'primary'), button('有错，要再背', () => settle(false))]))];
    }
    function summary() {
        const done = [...outcomes.values()];
        const passedAll = done.length === segs.length && done.every(o => o.passed);
        if (passedAll) { passedLevel = Math.max(passedLevel, level); api.onRecited(level); }
        const scored = done.filter(o => o.score !== null);
        const total = scored.length ? `，自动评分共 ${scored.reduce((n, o) => n + o.score, 0)} / ${scored.length * 8} 分` : '';
        return [el('p', {}, passedAll ? `第 ${level} 级通过了${total}。` : `第 ${level} 级还没有全部通过${total}。`),
            el('ul', { class: 'pick-list' }, ...segs.map((_, i) => { const o = outcomes.get(i); return el('li', {}, el('span', {}, `第 ${i + 1} 段 · ${!o ? '没背' : o.score !== null ? `${o.score} / 8` : o.passed ? '自评：背对了' : '自评：还要再背'}${o?.passed ? ' ✓' : ''}`)); })),
            el('div', { class: 'controls' }, ...(passedAll && level < 3 ? [button(`挑战第 ${level + 1} 级`, () => { level += 1; outcomes.clear(); at = 0; render('ready'); }, 'primary')] : []),
                button('再背一遍', () => { outcomes.clear(); at = 0; render('ready'); }), button('回到文库', api.backToLibrary))];
    }

    api.conceal(true);
    ctx.setReference('', true);
    render('ready');
    return {
        onClip(clip) { if (state === 'reciting') { pending = clip; render('between'); } },
        beforeRecord() { if (state === 'between') go(at); },
        onDiscard() { if (state === 'between') go(at); },
        dispose() { stopSpeech(); api.conceal(false); stage.replaceChildren(); bar.replaceChildren(); },
    };
}
