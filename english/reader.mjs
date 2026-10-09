// Library home, reader (listen / follow-read), free practice and the dictation probe.
// The practice panel (recording, scoring, history) stays in app.mjs and is reached only through `ctx`.
import { KINDS, todaysPick, tokenize, splitUnits, flatten, validateIndex, validateWork } from './library.mjs';
import { canSpeak, speak, accentMatches } from './speak.mjs';
import { probeRecognition, describeRecognitionError } from './live.mjs';
import { startRead } from './readthrough.mjs';
import { startRecite } from './recite.mjs';
import { createLearner, browserStorage, noStorage } from './learner.mjs';
import { dayOf, recordClip, recordFinished, recordBest, recordRecited, addWord, removeWord, hasWord, dueWords, reviewWord, applyScores, recordPhonemes, weakSounds, streakDays, weekView, mergeProgress, validateProgress, wordKey, WORD_LIMIT } from './progress.mjs';
import { findContext, summaryLine } from './archive.mjs';
import { tipFor } from './phoneme-tips.mjs';
import { loadTrack, playRange } from './voiceplayer.mjs';
import { unitsOf, unitAt } from './voice.mjs';

const $ = id => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) { if (key === 'class') node.className = value; else if (key.startsWith('on')) node[key] = value; else node.setAttribute(key, value); }
    node.append(...kids);
    return node;
};
const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const SPEEDS = [['慢速', 0.7], ['正常', 0.9], ['原速', 1]];
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const minutes = seconds => seconds < 90 ? `${seconds} 秒` : `约 ${Math.round(seconds / 60)} 分钟`;
const version = document.querySelector('meta[name="hive-english-library"]')?.dataset.version ?? '';
const libraryURL = (name, v = version) => new URL(`./library/${name}.json?v=${v}`, import.meta.url);
async function getJSON(url) { const response = await fetch(url); if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }

let ctx, index, kindFilter = 'all', skip = 0, applied = '', stopSpeech = () => {}, active = null;   // active: the whole-text reading in progress
const works = new Map();
const learner = createLearner(browserStorage() ?? noStorage);
let currentWork = null;   // the work being opened or read, so a recording counts towards it
async function getWork(id) {
    const entry = index?.works.find(w => w.id === id);
    if (!entry) throw new Error('unknown work');
    if (!works.has(id)) works.set(id, validateWork(await getJSON(libraryURL(id, entry.rev))));
    return works.get(id);
}
const stop = () => { stopSpeech(); stopSpeech = () => {}; $('human-audio')?.pause(); };

// ---- The model voice: pre-rendered when the folder has it, the device's own voice otherwise ----
let voiceElement = null, refreshSource = () => {};
const voiceAudio = () => {
    if (!voiceElement) { voiceElement = new Audio(); voiceElement.addEventListener('loadedmetadata', () => refreshSource()); }
    return voiceElement;
};
const tracks = new Map();   // `${work}|${accent}` → 'loading', a track, or null when nothing was rendered or it failed
const trackKey = work => `${work.id}|${ctx.locale()}`;
// A track is usable only when its file is the one loaded in the audio element and the length is known: then play() can run
// inside the click, which phones require. Until then the device voice speaks.
const readyTrack = work => {
    const track = tracks.get(trackKey(work)), audio = voiceElement;
    return track && track !== 'loading' && ctx.pref('voice') !== 'device' && audio && audio.src === track.src && audio.readyState >= 1 ? track : null;
};
const failTrack = work => { tracks.set(trackKey(work), null); refreshSource(); };
function preloadTrack(work) {
    const key = trackKey(work), accent = ctx.locale();
    const prime = track => {
        if (track && track !== 'loading' && currentWork?.id === work.id && ctx.locale() === accent && voiceAudio().src !== track.src) { const audio = voiceAudio(); audio.preload = 'auto'; audio.src = track.src; audio.load(); }
        refreshSource();
    };
    if (tracks.has(key)) { prime(tracks.get(key)); return; }
    tracks.set(key, 'loading');
    loadTrack(work, accent, import.meta.url).then(track => { tracks.set(key, track); prime(track); });
}
const rangeOf = (timeline, spec) => {
    const segment = timeline.segments[spec.segment];
    if (!segment) return null;
    const unit = spec.unit === undefined ? segment : segment.units[spec.unit];
    return unit ? { start: unit.start, end: unit.end } : null;
};
// spec: { text, segment?, unit? }. Returns stop(); onEnd gets { stopped, error, voiceLang, boundaries }.
function say(work, spec, rate, { pitch = 1, onEnd } = {}) {
    const device = () => speak(spec.text, { rate, pitch, locale: ctx.locale(), onEnd });
    const track = readyTrack(work), range = track && rangeOf(track.timeline, spec);
    if (!range) { preloadTrack(work); return device(); }
    let stopper = playRange(voiceAudio(), track, range.start, range.end, {
        rate: rate / 0.9,
        // A failing file must not leave the learner in silence: remember it is bad and let the device voice read instead.
        onEnd: info => { if (info.error) { failTrack(work); stopper = device(); return; } onEnd?.({ boundaries: 1, voiceLang: ctx.locale(), ...info }); },
    });
    return () => stopper();
}
const ACCENT_NAME = { 'en-US': '美式', 'en-GB': '英式' };
// Said when the device has no voice for the chosen accent and another English voice spoke instead.
const voiceNote = info => info.voiceLang && !accentMatches(info.voiceLang, ctx.locale()) ? `这台设备没有${ACCENT_NAME[ctx.locale()]}语音，刚才用的是 ${info.voiceLang} 的声音。` : '';
const show = (...names) => { for (const id of ['view-home', 'view-reader', 'view-archive']) $(id).hidden = !names.includes(id); };
const setNav = hash => { for (const link of document.querySelectorAll('#tabs a')) link.setAttribute('aria-current', String(link.getAttribute('href') === hash)); };

function renderHome() {
    const kinds = Object.keys(KINDS).filter(kind => index.works.some(w => w.kind === kind));
    $('kinds').replaceChildren(...['all', ...kinds].map(kind => {
        const chip = el('button', { type: 'button', class: 'chip', 'aria-pressed': String(kind === kindFilter) }, kind === 'all' ? '全部' : KINDS[kind]);
        chip.onclick = () => { kindFilter = kind; renderHome(); };
        return chip;
    }));
    const shown = index.works.filter(w => kindFilter === 'all' || w.kind === kindFilter)
        .sort((a, b) => Object.keys(KINDS).indexOf(a.kind) - Object.keys(KINDS).indexOf(b.kind) || a.title.localeCompare(b.title));
    $('works').replaceChildren(...shown.map(w => el('li', {}, el('a', { href: `#w/${w.id}` }, el('strong', { lang: 'en' }, w.title), el('small', {}, `${w.author} · ${KINDS[w.kind]} · ${minutes(w.seconds)}`)), el('span', { class: 'level' }, w.level))));
    renderStrip(); renderToday();
}
// One line on the first screen: streak, time today, words waiting.
function renderStrip() {
    const p = learner.read(), today = dayOf();
    $('today-strip').replaceChildren(summaryLine({ streak: streakDays(p, today), seconds: p.days[today]?.seconds ?? 0, due: dueWords(p, today, 400).length }), ' ', el('a', { href: '#archive' }, '我的档案 ▸'));
}
async function renderToday() {
    const card = $('today');
    const pick = todaysPick(index.works, localDay(), skip);
    card.hidden = !pick;
    if (!pick) return;
    const heading = `今日一篇 · ${WEEKDAY[new Date().getDay()]} · ${KINDS[pick.kind]}${(learner.read().texts[pick.id]?.reads ?? 0) > 0 ? ' · 已读过' : ''}`;
    const intro = el('p', { class: 'intro-text' }, '正在读取导读……');
    const swap = el('button', { type: 'button', onclick: () => { skip += 1; renderToday(); } }, '换一篇 ↻');
    card.replaceChildren(el('span', { class: 'eyebrow' }, heading), el('h2', { lang: 'en' }, pick.title),
        el('p', { class: 'meta' }, `${pick.author} · ${pick.year} · ${pick.level} · ${minutes(pick.seconds)}`), intro,
        el('div', { class: 'controls' }, el('a', { class: 'button primary', href: `#w/${pick.id}` }, '开始读'), el('a', { class: 'button', href: `#w/${pick.id}/follow` }, '逐句跟读'), swap));
    try { const work = await getWork(pick.id); if (card.contains(intro)) intro.textContent = work.intro; }
    catch { intro.textContent = '导读暂时无法加载，仍可以开始读。'; }
}

function head(work) {
    $('reader-head').replaceChildren(el('a', { href: '#', class: 'back' }, '← 文库'), el('span', { class: 'eyebrow' }, `${KINDS[work.kind]} · ${work.level}`),
        el('h2', { lang: 'en' }, work.title), el('p', { class: 'meta' }, `${work.author} · ${work.year} · ${work.words} 词 · ${minutes(work.seconds)}`),
        el('p', { class: 'intro-text' }, work.intro),
        ...(work.tips.length ? [el('ul', { class: 'tips' }, ...work.tips.map(t => el('li', {}, t)))] : []),
        el('p', { class: 'hint' }, `来源：${work.source.name}。版权：${work.rights}。`));
}
// A dialogue is dubbed rather than read through; only real texts can be recited.
const modesFor = work => [['listen', '听'], ['follow', '逐句跟读'], ...(work.roles ? [['dub', '配音']] : [['read', '朗读整篇']]), ...(work.kind === 'lesson' ? [] : [['recite', '背诵']])];
const modeTabs = (work, mode) => $('mode-tabs').replaceChildren(...modesFor(work).map(([key, label]) => el('a', { href: `#w/${work.id}/${key}`, 'aria-current': String(key === mode) }, label)));

function renderListen(work) {
    const words = [];                       // words[segment][n] is the span for the n-th word of that segment
    const markRange = (seg, a, b) => words.forEach((list, s) => list.forEach((span, k) => { span.classList.toggle('now', s === seg && k >= a && k <= b); span.classList.toggle('past', s < seg || (s === seg && k < a)); }));
    const mark = (seg, n) => markRange(seg, n, n);
    const clear = () => markRange(-1, -1, -1);
    // The words each unit covers, to light a whole sentence (or poem clause) while a pre-rendered voice reads it.
    const unitWords = work.segments.map(segment => {
        let at = 0;
        return unitsOf(segment, work.kind).map(unit => { const n = tokenize(unit).filter(t => t.word).length; const range = [at, at + n - 1]; at += n; return range; });
    });
    const markUnit = (seg, k) => { const range = words[seg] && unitWords[seg][k]; if (range && unitWords[seg].at(-1)[1] === words[seg].length - 1) markRange(seg, range[0], range[1]); };
    // Words in your word list carry a dot, in this text too.
    const refreshCarry = () => { const p = learner.read(); for (const list of words) for (const span of list) span.classList.toggle('carry', Object.hasOwn(p.words, span.dataset.key)); };
    const note = $('listen-note');
    // A volunteer's recording, when this text has one. It plays through its own control, never together with the speech voice.
    const human = $('human'), audio = $('human-audio');
    human.hidden = !work.human;
    audio.pause(); audio.removeAttribute('src');
    if (work.human) {
        audio.src = new URL(work.human.src, import.meta.url).href;
        $('human-credit').replaceChildren(el('a', { href: work.human.url, target: '_blank', rel: 'noopener' }, work.human.credit), '。公有领域的志愿者录音，用的版本可能和下面的文字略有出入。');
        audio.onplay = () => { stopSpeech(); stopSpeech = () => {}; clear(); };   // only the speech voice stops; stop() would pause this audio too
    }
    let speed = 0.9, failNote = '';   // failNote: why the device voice is reading, kept next to the device voice's own notes
    const source = $('listen-source');
    source.value = ctx.pref('voice') ?? 'auto';
    source.onchange = () => { ctx.setPref('voice', source.value); failNote = ''; stop(); clear(); };
    refreshSource = () => { $('listen-source-box').hidden = !tracks.get(trackKey(work)) || tracks.get(trackKey(work)) === 'loading'; };
    refreshSource();
    const play = (from, all) => {
        stop(); clear();
        const text = work.segments[from].text;
        const track = readyTrack(work);
        if (track) {
            const segments = track.timeline.segments;
            note.textContent = `声音：预生成（${track.timeline.voices.join('、')}）。`;
            stopSpeech = playRange(voiceAudio(), track, segments[from].start, all ? segments.at(-1).end : segments[from].end, {
                rate: speed / 0.9,
                onTime: ms => { const at = unitAt(track.timeline, ms); if (at) markUnit(at[0], at[1]); },
                onEnd: info => { clear(); if (info.error) { failTrack(work); failNote = '预生成的声音没能播放，已改用设备声音。'; play(from, all); note.textContent = failNote; } },
            });
            return;
        }
        preloadTrack(work);
        if (from === 0 || !all) note.textContent = '';
        stopSpeech = speak(text, {
            rate: speed, locale: ctx.locale(),
            onWord: n => mark(from, n),
            onEnd: info => {
                if (info.error) { clear(); note.textContent = info.error === 'unsupported' ? '这个浏览器不能朗读。' : `朗读出错：${info.error}`; return; }
                if (!info.stopped) note.textContent = [failNote, voiceNote(info), info.boundaries === 0 ? '这个语音不提供逐词位置，所以没有高亮。换一个系统语音可能有。' : ''].filter(Boolean).join(' ');
                if (!info.stopped && all && from + 1 < work.segments.length) { play(from + 1, true); return; }
                clear();
            },
        });
    };
    const body = $('listen-text');
    body.replaceChildren(...work.segments.map((segment, s) => {
        const spans = [];
        const paragraph = el('p', { class: 'seg-text', lang: 'en' });
        for (const token of tokenize(segment.text)) {
            if (!token.word) { paragraph.append(token.text); continue; }
            const span = el('span', { class: 'w', role: 'button', tabindex: '0' }, token.text);
            const pick = () => word(work, token.text, span, refreshCarry);
            span.onclick = pick; span.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
            span.dataset.key = wordKey(token.text);
            spans.push(span); paragraph.append(span);
        }
        words.push(spans);
        return el('div', { class: 'seg' }, el('button', { type: 'button', class: 'seg-play', 'aria-label': `播放第 ${s + 1} 段`, onclick: () => play(s, false) }, '▶'), paragraph);
    }));
    $('listen-speed').replaceChildren(...SPEEDS.map(([label, value]) => el('option', { value, ...(value === speed ? { selected: '' } : {}) }, label)));
    $('listen-speed').onchange = e => { speed = Number(e.target.value); };
    $('listen-all').onclick = () => play(0, true);
    $('listen-stop').onclick = () => { stop(); clear(); };
    $('word-pop').textContent = '点任意一个词，听它的读音，并查看释义。';
    refreshCarry();
    const unsupported = !canSpeak();
    $('listen-all').disabled = unsupported;
    note.textContent = unsupported ? '这个浏览器不能朗读，只能阅读原文。' : '';
}
function word(work, text, span, refreshCarry) {
    const key = text.toLowerCase().replaceAll('’', "'");
    const gloss = Object.hasOwn(work.glossary, key) ? '· ' + work.glossary[key] : '· 本篇没有收录释义';
    const listable = /^[a-z][a-z'-]*$/.test(wordKey(text));
    const showPop = () => {
        const known = hasWord(learner.read(), text);
        const toggle = el('button', { type: 'button', onclick: () => {
            const saved = learner.update(p => known ? removeWord(p, text) : addWord(p, text, work.id, dayOf()));
            if (!saved) { $('word-pop').textContent = '生词本现在不能写入（存储被禁用，或档案损坏、来自更新的版本）。原数据没有动。'; return; }
            if (!known && !hasWord(learner.read(), text)) { $('word-pop').textContent = `生词本已满（最多 ${WORD_LIMIT} 个），先移出一些词再加。`; return; }
            refreshCarry(); showPop();
        } }, known ? '移出生词本' : '＋ 生词本');
        $('word-pop').replaceChildren(el('strong', { lang: 'en' }, text), ` ${gloss} `, ...(listable ? [toggle] : []));
    };
    showPop();
    for (const other of document.querySelectorAll('#listen-text .w.picked')) other.classList.remove('picked');
    span.classList.add('picked');
    stop(); stopSpeech = speak(text, { rate: 0.8, locale: ctx.locale() });
}

function renderFollow(work) {
    const byLine = $('follow-by-line');
    $('follow-grain').hidden = work.kind !== 'poem';
    byLine.checked = false;
    let units = [], refs = null, at = -1;   // refs[i]: which segment and unit of the pre-rendered voice units[i] is (only when the units are the default ones)
    const go = next => {
        if (next < 0 || next >= units.length || next === at) return;
        if (!ctx.setReference(flatten(units[next]), true)) return;     // refused while recording
        at = next; stop();
        $('follow-count').textContent = `第 ${at + 1} / ${units.length} 句`;
        $('follow-text').textContent = units[at];
        $('follow-prev').disabled = at === 0; $('follow-next').disabled = at === units.length - 1;
        for (const [i, li] of [...$('follow-list').children].entries()) li.classList.toggle('on', i === at);
    };
    const build = keep => {
        units = work.segments.flatMap(s => splitUnits(s.text, work.kind, { byLine: byLine.checked }));
        refs = byLine.checked ? null : work.segments.flatMap((s, i) => splitUnits(s.text, work.kind).map((_, k) => ({ segment: i, unit: k })));
        $('follow-list').replaceChildren(...units.map((unit, i) => el('li', { lang: 'en' }, el('button', { type: 'button', onclick: () => { go(i); $('follow-text').scrollIntoView({ block: 'nearest' }); } }, unit))));
        // Stay at the same place in the poem when the grouping changes.
        const first = keep?.split('\n')[0];
        at = -1; go(Math.max(0, first ? units.findIndex(u => u.split('\n').includes(first)) : 0));
    };
    const listen = rate => {
        stop();
        stopSpeech = say(work, { ...(refs?.[at] ?? {}), text: flatten(units[at]) }, rate, { onEnd: info => { $('follow-note').textContent = info.error === 'unsupported' ? '这个浏览器不能朗读。' : info.stopped ? '' : voiceNote(info); } });
    };
    byLine.onchange = () => { if (ctx.isBusy()) { byLine.checked = !byLine.checked; return; } build(units[at]); };
    $('follow-prev').onclick = () => go(at - 1);
    $('follow-next').onclick = () => go(at + 1);
    $('follow-listen').onclick = () => listen(0.9);
    $('follow-slow').onclick = () => listen(0.7);
    $('follow-stop').onclick = stop;
    $('follow-listen').disabled = $('follow-slow').disabled = !canSpeak();
    $('follow-note').textContent = '';
    build(null);
}

async function openWork(id, requested, turn) {
    show('view-reader'); setNav('#');
    let work;
    try { work = await getWork(id); }
    catch { if (turn === navigation) location.hash = ''; return; }
    if (turn !== navigation) return;   // the reader moved on while the text was loading
    const mode = modesFor(work).some(([key]) => key === requested) ? requested : 'listen';
    currentWork = work; preloadTrack(work);
    head(work); modeTabs(work, mode);
    $('mode-listen').hidden = mode !== 'listen'; $('mode-follow').hidden = mode !== 'follow'; $('mode-read').hidden = !['read', 'recite', 'dub'].includes(mode);
    if (mode === 'listen') { ctx.setReference(null, false); ctx.showPractice(false); renderListen(work); }
    else if (mode === 'follow') { ctx.showPractice(true); renderFollow(work); }
    else {
        ctx.showPractice(true);
        const api = {
            ctx, el, $, minutes, stopSpeech: stop,
            speakText: (text, rate, done, pitch = 1, target = {}) => { stop(); stopSpeech = say(work, { ...target, text }, rate, { pitch, onEnd: info => { if (!info.stopped) done?.(info); } }); },
            backToLibrary: () => { location.hash = ''; },
            onFinished: () => learner.update(p => recordFinished(p, work.id, dayOf())),
            onReport: report => { if (report.azure?.pronunciation != null) learner.update(p => recordBest(p, work.id, report.azure.pronunciation)); },
            // { added, full }: full means the list is at its limit, which is not the same as the words already being in it
            addWords: words => { let added = 0; learner.update(p => { for (const w of words) if (addWord(p, w, work.id, dayOf())) added += 1; }); return { added, full: Object.keys(learner.read().words).length >= WORD_LIMIT }; },
            liveOn: () => ctx.liveOn(), setLive: on => ctx.setLive(on), conceal: on => ctx.conceal(on),
            onRecited: level => learner.update(p => recordRecited(p, work.id, level)),
        };
        active = mode === 'recite' ? startRecite(work, api, { recited: learner.read().texts[work.id]?.recited ?? 0 }) : startRead(work, api, { dub: mode === 'dub' });
    }
    window.scrollTo(0, 0);
}

let routed = false, reverting = false, navigation = 0;
function route() {
    const hash = location.hash === '#' ? '' : location.hash;
    // Other fragments (the skip link) are plain in-page anchors, not routes.
    if (routed && hash !== '' && hash !== '#free' && hash !== '#archive' && !hash.startsWith('#w/')) return;
    if (reverting) { reverting = false; return; }                                // the hashchange caused by the line below
    if (ctx.isBusy() && hash !== applied) { reverting = true; location.hash = applied; return; }   // do not leave a recording half-way
    routed = true; applied = hash; const turn = ++navigation;
    stop(); active?.dispose(); active = null; currentWork = null;
    const match = /^#w\/([a-z0-9-]+)(?:\/(listen|follow|read|recite|dub))?$/.exec(hash);
    if (match) { openWork(match[1], match[2] ?? 'listen', turn); return; }
    if (hash === '#free') { show(); setNav('#free'); ctx.setReference(null, false); ctx.showPractice(true); $('reference').focus({ preventScroll: true }); return; }
    if (hash === '#archive') { show('view-archive'); setNav('#archive'); ctx.setReference(null, false); ctx.showPractice(false); renderArchive(); return; }
    show('view-home'); setNav('#'); ctx.setReference(null, false); ctx.showPractice(false);
    if (index) renderStrip();
}

// ---- The archive page ----
const weekdayOf = day => { const [y, m, d] = day.split('-').map(Number); return WEEKDAY[new Date(y, m - 1, d).getDay()].slice(1); };
function renderArchive() {
    const p = learner.read(), today = dayOf(), writable = learner.writable();
    $('archive-warning').hidden = writable;
    $('archive-warning').textContent = '学习档案现在不能写入：浏览器存储被禁用，或档案损坏、来自更新的版本。原数据已保留；可以先导出备份。';
    const texts = Object.values(p.texts);
    const tile = (value, label) => el('div', { class: 'score' }, el('strong', {}, String(value)), el('span', {}, label));
    $('archive-summary').replaceChildren(tile(streakDays(p, today), '连续天数'), tile(Math.round((p.days[today]?.seconds ?? 0) / 60), '今天（分钟）'), tile(texts.filter(t => t.reads > 0).length, '读完的作品'), tile(texts.filter(t => t.recited > 0).length, '背下的作品'), tile(Object.keys(p.words).length, '生词本'));
    const week = weekView(p, today), top = Math.max(60, ...week.map(d => d.seconds));
    $('archive-week').replaceChildren(el('h3', {}, '最近 7 天'), el('div', { class: 'week' }, ...week.map(d => el('div', { class: 'day', title: `${d.day} · ${Math.round(d.seconds / 60)} 分钟` }, el('i', { class: d.seconds ? 'on' : '', style: `height:${Math.max(4, Math.round(d.seconds / top * 56))}px` }), el('small', {}, weekdayOf(d.day))))));
    const weak = weakSounds(p);
    $('archive-sounds').replaceChildren(el('h3', {}, '最弱的音'), ...(weak.length
        ? [el('ul', { class: 'hard-words' }, ...weak.map(s => el('li', {}, el('b', {}, `${s.key} /${s.ipa}/`), ` 近 ${s.count} 次平均 ${s.average} 分`, el('div', { class: 'tip' }, tipFor(s.key).zh))))]
        : [el('p', { class: 'hint' }, '管理员用美式口音评分后，这里会列出得分最低的音。')]));
    renderReview();
    const words = Object.entries(p.words).sort(([a, x], [b, y]) => x.due < y.due ? -1 : x.due > y.due ? 1 : a < b ? -1 : 1);
    $('archive-words').replaceChildren(el('h3', {}, `生词本（${words.length}）`), ...(words.length
        ? [el('ul', { class: 'word-list' }, ...words.map(([key, w]) => el('li', {}, el('button', { type: 'button', class: 'linkish', lang: 'en', onclick: () => { stop(); stopSpeech = speak(key, { rate: 0.8, locale: ctx.locale() }); } }, key), el('small', {}, w.due <= today ? '今天复习' : `下次 ${w.due}`), el('button', { type: 'button', 'aria-label': `移出 ${key}`, onclick: () => { learner.update(q => removeWord(q, key)); renderArchive(); } }, '移出'))))]
        : [el('p', { class: 'hint' }, '读文章时点一个词，选“＋ 生词本”；朗读报告里的难词也可以一键加入。')]));
}
function renderReview() {
    const box = $('archive-review'), p = learner.read(), today = dayOf();
    const due = dueWords(p, today);
    if (!due.length) {
        const next = Object.values(p.words).map(w => w.due).sort()[0];
        box.replaceChildren(el('h3', {}, '今日复习'), el('p', {}, next ? `今天没有到期的词。下一批在 ${next}。` : '生词本还是空的，没有要复习的词。'));
        return;
    }
    const total = dueWords(p, today, 400).length;
    box.replaceChildren(el('h3', {}, '今日复习'), el('p', {}, `${total} 个词到期${total > due.length ? `，先复习 ${due.length} 个` : ''}。每个词先读出来，再看释义和例句，然后告诉我记得还是不熟。`), el('div', { class: 'controls' }, el('button', { type: 'button', class: 'primary', onclick: () => reviewCard(due, 0, { good: 0, bad: 0 }) }, '开始复习')));
}
async function reviewCard(queue, i, tally) {
    const box = $('archive-review'), today = dayOf();
    if (i >= queue.length) {
        box.replaceChildren(el('h3', {}, '今日复习'), el('p', {}, `复习完了：记得 ${tally.good} 个，不熟 ${tally.bad} 个。不熟的明天再来。`), el('div', { class: 'controls' }, el('button', { type: 'button', onclick: renderArchive }, '好的')));
        return;
    }
    const item = queue[i];
    box.replaceChildren(el('p', { class: 'hint', role: 'status' }, '正在准备下一个词……'));   // the old buttons must not stay clickable while this loads
    let work = null;
    if (item.source) { try { work = await getWork(item.source); } catch { /* the source text may be gone; the word still reviews */ } }
    if (applied !== '#archive') return;   // left the page while the text was loading
    const gloss = work && Object.hasOwn(work.glossary, item.key) ? work.glossary[item.key] : '';
    const sentence = work ? findContext(work, item.key) : null;
    const detail = el('div', { class: 'review-detail', hidden: '' }, el('p', {}, gloss || '这个词没有收录释义。'), ...(sentence ? [el('p', { class: 'follow-text small', lang: 'en' }, sentence)] : []), ...(work ? [el('small', {}, `出自《${work.title}》`)] : []));
    const rate = good => { learner.update(p => reviewWord(p, item.key, good, today)); reviewCard(queue, i + 1, { good: tally.good + (good ? 1 : 0), bad: tally.bad + (good ? 0 : 1) }); };
    box.replaceChildren(el('h3', {}, `今日复习 · ${i + 1} / ${queue.length}`), el('p', { class: 'review-word', lang: 'en' }, item.key),
        el('div', { class: 'controls' }, el('button', { type: 'button', onclick: () => { stop(); stopSpeech = speak(item.key, { rate: 0.8, locale: ctx.locale() }); } }, '▶ 范读'), el('button', { type: 'button', onclick: () => { detail.hidden = false; } }, '看释义和例句')),
        detail, el('div', { class: 'controls' }, el('button', { type: 'button', class: 'primary', onclick: () => rate(true) }, '想起来了'), el('button', { type: 'button', onclick: () => rate(false) }, '还不熟')));
}
function setupBackup() {
    const download = (data, name) => { const url = URL.createObjectURL(new Blob([data], { type: 'application/json' })), link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    $('archive-export').onclick = () => download(learner.raw() ?? JSON.stringify(learner.read(), null, 2), `hive-english-archive-${dayOf()}.json`);
    $('archive-import').onchange = async event => {
        const file = event.target.files[0]; event.target.value = ''; if (!file) return;
        const note = $('archive-note');
        try {
            if (file.size > 2 * 1024 * 1024) throw new Error('档案文件超过 2 MB。');
            if (!learner.writable()) throw new Error('现有档案不能写入；请先导出备份并检查存储问题。');
            const imported = validateProgress(JSON.parse(await file.text()));
            // merged inside the update, so it starts from what is stored now and not from what was read before the file was opened
            if (!learner.update(p => Object.assign(p, mergeProgress(p, imported)))) throw new Error('写入失败，原档案已保留。');
            note.textContent = '已合并档案，原有的内容都还在。'; renderArchive();
        } catch (error) { note.textContent = error.message || '导入失败，原档案已保留。'; }
    };
}

let probing = null;
function setupProbe() {
    const run = $('probe-run'), out = $('probe-status');
    run.onclick = async () => {
        if (ctx.isBusy()) { out.textContent = '正在录音，请先结束录音再测试。'; return; }
        run.disabled = true; out.textContent = '请允许麦克风，然后对它说一句英语……';
        probing = new AbortController();
        const result = await probeRecognition({ signal: probing.signal, onInterim: heard => { out.textContent = `听到：${heard}`; } });
        probing = null; run.disabled = false;
        if (result.ok) out.textContent = `可以实时听写。听到：“${result.heard}”。`;
        else out.textContent = describeRecognitionError(result.code);
    };
}

export async function initReader(context) {
    ctx = context;
    ctx.hooks.beforeRecord = () => { stop(); probing?.abort(); active?.beforeRecord(); };
    ctx.hooks.onClip = clip => { learner.update(p => recordClip(p, { day: dayOf(), seconds: clip.seconds, workId: currentWork?.id ?? null })); active?.onClip(clip); };
    // Every scored recording feeds the word queue and the list of weak sounds (sound names are American English only).
    ctx.hooks.onScored = record => learner.update(p => { applyScores(p, record.result.words, dayOf()); if (record.locale === 'en-US') recordPhonemes(p, record.result.words); });
    ctx.hooks.onDiscard = () => active?.onDiscard();
    setupProbe(); setupBackup();
    $('accent').addEventListener('change', () => { stop(); if (currentWork) preloadTrack(currentWork); });   // another accent has its own recording; what is playing belongs to the old one
    document.addEventListener('click', event => {
        const link = event.target.closest?.('#tabs a, #view-reader a, #view-home a');
        if (link && ctx.isBusy()) { event.preventDefault(); $('status').textContent = '正在录音或评分，请先结束再切换。'; }
    });
    window.addEventListener('hashchange', route);
    window.addEventListener('pagehide', stop);
    try { index = validateIndex(await getJSON(libraryURL('index'))); }
    catch {
        $('library-error').hidden = false; $('library-error').textContent = '文库暂时无法加载。自由练习仍然可用。';
        $('today').hidden = true; route();
        return;
    }
    renderHome();
    route();
}
