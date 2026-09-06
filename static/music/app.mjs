import { STORAGE_KEY, NOTE_NAMES, clamp, noteName, isBlack, localDay, freshProgress, validateProgress, loadProgress, saveProgress, recordAnswer, recordSkill, streakDays, pick, shuffle, earQuestion, detectPitch, midiPitch, scoreRhythm } from './core.mjs';
import { STAGES, LESSONS, QUESTIONS, PIECES, MELODIES, RHYTHMS, RESOURCES } from './curriculum.mjs';
import { PianoAudio, Transport, INSTRUMENTS } from './audio.mjs';
import { staff } from './notation.mjs';
import { LESSON_DETAILS } from './lesson-details.mjs';
import { KEYS, CHORD_TYPES, PROGRESSIONS, makeChord, progressionEvents, playableHands } from './harmony.mjs';
import { PIANO_LEVELS, preparePiece, PracticeJudge } from './practice.mjs';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let storage;
try { storage = window.localStorage; } catch { storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }; }
const loaded = loadProgress(storage);
let progress = loaded.progress, storageBlocked = loaded.blocked || false;
let tab = 'route', lastActive = Date.now(), lastTick = Date.now(), noticeTimer, currentTheory, theoryAnswered = false;
let currentEar, earAnswered = false, earHeard = false, earPending = false, earGeneration = 0;
let pendingImport = null, activeLesson = LESSONS.find(l => l.id === progress.lastLesson) || LESSONS[0];
const audio = new PianoAudio(text => { $('#audio-status').textContent = text; });
const transport = new Transport(audio);
let audioWarming = null;
function notify(text) { $('#notice').textContent = text; $('#notice').hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { $('#notice').hidden = true; }, 6500); }
function storageWarning(text) { $('#storage-warning').textContent = text; $('#storage-warning').hidden = !text; $('#save-state').textContent = text ? '进度未能保存，请备份' : '已保存在此浏览器'; }
if (loaded.error) storageWarning(loaded.error);
function persist() {
    if (storageBlocked) return;
    storageWarning(saveProgress(storage, progress));
}
function saveSkill(id, score) {
    const previous = progress.skills[id]; recordSkill(progress, id, score);
    if (id.startsWith('piano-')) { const skill = progress.skills[id]; skill.latestBpm = progress.settings.bpm; skill.bestBpm = !previous || score > previous.best || (score === previous.best && progress.settings.bpm > (previous.bestBpm || 0)) ? progress.settings.bpm : previous.bestBpm || 0; }
    persist(); updateStats();
}
function tick() {
    const now = Date.now();
    if (!document.hidden && now - lastActive < 120000) {
        const day = localDay(); progress.days[day] ||= { seconds: 0, answers: 0 };
        progress.days[day].seconds += Math.min((now - lastTick) / 1000, 16);
        persist(); updateStats();
    }
    lastTick = now;
}
setInterval(tick, 15000);
for (const event of ['pointerdown', 'keydown', 'change']) document.addEventListener(event, () => { lastActive = Date.now(); }, { passive: true });
function updateStats() {
    const seconds = progress.days[localDay()]?.seconds || 0, total = Object.values(progress.days).reduce((n, d) => n + d.seconds, 0);
    const learned = LESSONS.filter(l => progress.lessons[l.id]).length;
    const cards = Object.values(progress.cards), attempts = cards.reduce((n, c) => n + c.attempts, 0), correct = cards.reduce((n, c) => n + c.correct, 0);
    const stats = [[`${learned}<small> / ${LESSONS.length}</small>`, '课程已学习'], [`${Math.floor(total / 60)}`, '累计练习分钟'], [`${streakDays(progress.days)}`, '连续练习天数'], [attempts ? `${Math.round(correct / attempts * 100)}%` : '—', `答题正确率 · ${attempts} 题`]];
    const html = stats.map(([value, label]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join('');
    $('#overview-stats').innerHTML = html; $('#progress-stats').innerHTML = html;
    $('#today-minutes').textContent = `${Math.floor(seconds / 60)} / ${progress.settings.goal} 分钟`;
    $('#daily-progress').max = progress.settings.goal * 60; $('#daily-progress').value = seconds;
    $('#next-title').textContent = (LESSONS.find(l => !progress.lessons[l.id]) || activeLesson).title;
}
function setTab(name, focus = false) {
    if (!$(`[data-panel="${name}"]`)) name = 'route';
    stopActivities(); tab = name;
    if(name!=='piano')setPianoFocus(false);
    $$('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
    $$('#tabs button').forEach(b => { b.classList.toggle('active', b.dataset.tab === name); if (b.dataset.tab === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    history.replaceState(null, '', `#${name}`);
    if (name === 'theory') newTheory();
    if (name === 'ear') newEar();
    if (name === 'sight') renderSight();
    if (name === 'piano') { renderPiano(); requestAnimationFrame(centerKeyboard); }
    if (name === 'rhythm') renderRhythm();
    if (name === 'progress') renderProgress();
    if (name === 'harmony') renderHarmony();
    if (focus) $('#workspace').focus({ preventScroll: true });
    updateStats();
}
$('#tabs').addEventListener('click', e => { const button = e.target.closest('[data-tab]'); if (button) setTab(button.dataset.tab, true); });
window.addEventListener('hashchange', () => setTab(location.hash.slice(1)));
function renderCurriculum() {
    $('#curriculum').innerHTML = STAGES.map(([title, week, summary], stage) => `<article class="stage"><div class="stage-head"><span class="stage-number">0${stage + 1}</span><div><span class="stage-week">${week}</span><h3>${title}</h3><p>${summary}</p></div></div>${LESSONS.filter(l => l.stage === stage).map(l => `<button class="lesson-item ${progress.lessons[l.id] ? 'done' : ''}" data-lesson="${l.id}"><span>${l.title}</span><span>${progress.lessons[l.id] ? '已学习 ✓' : '学习 ↗'}</span></button>`).join('')}</article>`).join('');
}
function showLesson(id, scroll = true) {
    activeLesson = LESSONS.find(l => l.id === id) || LESSONS[0]; progress.lastLesson = activeLesson.id; persist();
    const l = activeLesson;
    $('#lesson-detail').hidden = false;
    const d = LESSON_DETAILS[l.id], quizDone = l.questions.filter(q => progress.cards[q.id]?.lastCorrect).length;
    $('#lesson-detail').innerHTML = `<span class="eyebrow">LESSON ${String(LESSONS.indexOf(l) + 1).padStart(2, '0')} / ${LESSONS.length}</span><h3>${l.title}</h3><div class="row"><span class="pill">本课小测 ${quizDone}/${l.questions.length}</span><span id="lesson-task-count" class="pill">作业自查 ${(progress.lessonTasks[l.id] || []).filter(Boolean).length}/${d.practice.length}</span></div><h4>学完这一课，你应能</h4><ul>${d.objectives.map(x=>`<li>${x}</li>`).join('')}</ul>${d.sections.map((section,i)=>`<section class="lesson-section"><h4>${i+1}. ${section.title}</h4><p>${section.text}</p></section>`).join('')}<div class="worked-example"><h4>${d.example.title}</h4><ol>${d.example.steps.map(x=>`<li>${x}</li>`).join('')}</ol><p><strong>核对：</strong>${d.example.answer}</p></div>${d.demo.length ? '<div id="lesson-score" class="score-wrap"></div><div class="button-row"><button id="lesson-demo">▶ 听本课谱例</button><button id="lesson-demo-stop">停止示范</button></div>' : ''}<details><summary>要点速记</summary><ol>${l.points.map(x=>`<li>${x}</li>`).join('')}</ol></details><h4>分步作业</h4><div class="lesson-tasks">${d.practice.map((task,i)=>`<label><input type="checkbox" data-task="${i}" ${(progress.lessonTasks[l.id] || [])[i] ? 'checked' : ''}><span>${task}</span></label>`).join('')}</div><div class="task"><strong>本课验收目标</strong><p>${d.check}</p></div><div class="button-row"><button id="lesson-quiz" class="primary">做本课小测</button><button id="lesson-tool">去动手练习</button><button id="lesson-complete">${progress.lessons[l.id] ? '已学过 ✓ · 继续巩固' : '标记为已学习'}</button></div><p class="muted">作业勾选是自我检查，课程完成不是演奏认证；结合实体触键、录音与老师反馈验收。</p>`;
    $$('#lesson-detail [data-task]').forEach(box => box.onchange = () => { progress.lessonTasks[l.id] ||= []; progress.lessonTasks[l.id][+box.dataset.task] = box.checked; $('#lesson-task-count').textContent=`作业自查 ${progress.lessonTasks[l.id].filter(Boolean).length}/${d.practice.length}`; persist(); });
    if (d.demo.length) {
        const events = d.demo.map(e=>typeof e==='number'?{notes:[e],beats:1}:e);
        $('#lesson-score').innerHTML = staff(events,{clef:events.some(e=>e.notes.some(n=>n<60))?'grand':'treble',showNames:true,label:l.title+'谱例'});
        $('#lesson-demo').onclick = async () => { stopActivities(); try { await transport.play(events,progress.settings.bpm); } catch(e) { notify(e.message); } };
        $('#lesson-demo-stop').onclick = () => transport.stop();
    }
    $('#lesson-quiz').onclick = () => { $('#theory-mode').value = 'knowledge'; $('#lesson-filter').value = l.id; setTab('theory', true); };
    $('#lesson-tool').onclick = () => {
        if (l.id === 'staff') $('#theory-mode').value = 'treble';
        const pieceMap = { pitch: 'free', touch: 'five', major: 'scale-g', scale: 'scale-c', inversion: 'triads', cadence: 'both', phrase: 'free' };
        if (pieceMap[l.id]) { $('#piano-piece').value = pieceMap[l.id]; $('#piano-hand').value='both'; $('#piano-from').value=1; $('#piano-to').value=999; $('#piano-repeats').value='1'; }
        if (['triad', 'minor'].includes(l.id)) $('#ear-mode').value = 'chord';
        if (['seventh','extensions','jazz251'].includes(l.id)) $('#ear-mode').value = 'seventh';
        if (l.id === 'interval') $('#ear-mode').value = 'interval';
        if (l.tool === 'harmony') { $('#harmony-kind').value = 'progression'; $('#harmony-progression').value = l.id === 'blues' ? 'blues' : l.id === 'classical-harmony' ? 'secondary' : l.id === 'extensions' ? 'extended251' : 'jazz251'; $('#harmony-voicing').value = 'shell'; }
        setTab(l.tool, true);
    };
    $('#lesson-complete').onclick = () => { progress.lessons[l.id] = true; persist(); renderCurriculum(); updateStats(); showLesson(l.id, false); notify('已记录本课学习进度。可以做小测检验掌握情况。'); };
    if (scroll) $('#lesson-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('#curriculum').onclick = e => { const button = e.target.closest('[data-lesson]'); if (button) showLesson(button.dataset.lesson); };
$('#continue').onclick = () => showLesson((LESSONS.find(l => !progress.lessons[l.id]) || activeLesson).id);
$('#lesson-filter').insertAdjacentHTML('beforeend', LESSONS.map(l => `<option value="${l.id}">${l.title}</option>`).join(''));
function notationQuestion(clef, note) {
    const pool = clef === 'bass' ? [43,45,47,48,50,52,53,55,57,59,60] : [60,62,64,65,67,69,71,72,74,76,77];
    note ??= pick(pool);
    const answer = noteName(note);
    return { id: `staff-${clef}-${note}`, clef, note, prompt: '这个音的音名与八度是？', answer, options: shuffle([answer, ...shuffle(pool.filter(n => n !== note)).slice(0,3).map(noteName)]), explanation: `${clef === 'bass' ? '低音谱号第四线是 F3' : '高音谱号第二线是 G4'}。从锚点逐线、逐间数，这个音是 ${answer}。` };
}
function reviewQuestion(id) {
    const known = QUESTIONS.find(q => q.id === id); if (known) return known;
    const match = /^staff-(treble|bass)-(\d+)$/.exec(id);
    if (match && +match[2] >= 43 && +match[2] <= 77 && !isBlack(+match[2])) return notationQuestion(match[1], +match[2]);
    const ear = /^ear-(interval|chord|seventh|direction)-(\d+)-(\d+)$/.exec(id);
    if (ear && +ear[2] >= 48 && +ear[2] <= 60) {
        const [, mode, root, value] = ear; const n = +value;
        const distances = mode === 'direction' ? [0,2,4,7,-2,-4,-7] : null;
        const index = mode === 'direction' ? distances.indexOf(n - 12) : n;
        const length = mode === 'seventh' ? 6 : mode === 'chord' ? 4 : mode === 'direction' ? 7 : 13;
        if (index < 0 || index >= length) return null;
        let call = 0;
        const q = earQuestion(mode, 'advanced', () => call++ === 0 ? (+root - 48 + .1) / 13 : (index + .1) / length);
        return { ...q, ear: true, prompt: '复习听音题：播放后选择答案。' };
    }
    return null;
}
function renderOptions(target, options, select) {
    target.innerHTML = '';
    options.forEach(option => { const b = document.createElement('button'); b.textContent = option; b.onclick = () => select(option); target.append(b); });
}
function markOptions(target, answer, selected) {
    [...target.children].forEach(b => { b.disabled = true; b.classList.toggle('correct', b.textContent === answer); b.classList.toggle('wrong', b.textContent === selected && selected !== answer); });
}
let reviewHeard = false;
function newTheory() {
    transport.stop(); const mode = $('#theory-mode').value;
    $('#lesson-filter-label').hidden = mode !== 'knowledge';
    if (mode === 'review') {
        const due = Object.entries(progress.cards).filter(([, c]) => !c.lastCorrect || c.due <= Date.now()).sort((a,b) => Number(a[1].lastCorrect) - Number(b[1].lastCorrect) || a[1].due - b[1].due).map(([id]) => reviewQuestion(id)).filter(Boolean);
        currentTheory = due[0]; $('#theory-count').textContent = `${due.length} 题待复习`;
    } else {
        const pool = QUESTIONS.filter(q => $('#lesson-filter').value === 'all' || q.lesson === $('#lesson-filter').value);
        currentTheory = ['treble','bass'].includes(mode) ? notationQuestion(mode) : pick(pool.filter(q => q.id !== currentTheory?.id).length ? pool.filter(q => q.id !== currentTheory?.id) : pool);
        $('#theory-count').textContent = mode === 'knowledge' ? `${pool.length} 题可练` : '随机识谱';
    }
    theoryAnswered = false; reviewHeard = false; $('#theory-next').hidden = true; $('#theory-feedback').textContent = ''; $('#theory-feedback').className = 'feedback'; $('#theory-staff').innerHTML = '';
    if (!currentTheory) { $('#theory-prompt').textContent = '暂时没有待复习的题'; $('#theory-options').innerHTML = ''; $('#theory-feedback').textContent = '新错题会加入这里，答对后按 1、3、7、14、30 天安排复习。'; return; }
    $('#theory-prompt').textContent = currentTheory.prompt;
    if (currentTheory.clef) $('#theory-staff').innerHTML = staff([{ notes: [currentTheory.note], beats: 1 }], { clef: currentTheory.clef, label: `${currentTheory.clef === 'treble' ? '高音' : '低音'}谱号识谱题` });
    if (currentTheory.ear) {
        const b = document.createElement('button'); b.textContent = '▶ 播放复习题'; $('#theory-staff').append(b);
        const question = currentTheory;
        b.onclick = async () => { try { await playEar(question); if (currentTheory === question && tab === 'theory') { reviewHeard = true; [...$('#theory-options').children].forEach(b => b.disabled = false); } } catch(e) { notify(e.message); } };
    }
    renderOptions($('#theory-options'), shuffle(currentTheory.options), answerTheory);
    if (currentTheory.ear) [...$('#theory-options').children].forEach(b => b.disabled = true);
}
function answerTheory(selected) {
    if (!currentTheory || theoryAnswered || (currentTheory.ear && !reviewHeard)) return;
    theoryAnswered = true; const correct = selected === currentTheory.answer;
    recordAnswer(progress, currentTheory.id, correct); persist(); updateStats();
    markOptions($('#theory-options'), currentTheory.answer, selected);
    $('#theory-feedback').className = `feedback ${correct ? 'good' : 'bad'}`;
    $('#theory-feedback').textContent = `${correct ? '答对了。' : `正确答案：${currentTheory.answer}。`} ${currentTheory.explanation} ${correct ? '已安排稍后复习。' : '已加入错题复习。'}`;
    $('#theory-next').hidden = false;
}
$('#theory-mode').onchange = newTheory; $('#lesson-filter').onchange = newTheory; $('#theory-new').onclick = newTheory; $('#theory-next').onclick = newTheory;
function newEar() {
    transport.stop(); earGeneration++; earPending = false;
    currentEar = earQuestion($('#ear-mode').value, $('#ear-level').value); earAnswered = false; earHeard = false;
    $('#ear-prompt').textContent = ['chord','seventh'].includes(currentEar.mode) ? '你听到的是哪一种和弦？' : currentEar.mode === 'direction' ? '第二个音向哪里走？' : '这两个音，隔着怎样的距离？';
    $('#ear-style').disabled = currentEar.mode !== 'interval';
    $('#ear-next').hidden = true; $('#ear-play').disabled = false; $('#ear-feedback').textContent = ''; $('#ear-feedback').className = 'feedback';
    renderOptions($('#ear-options'), currentEar.options, answerEar); [...$('#ear-options').children].forEach(b => b.disabled = true);
    $('#ear-instruction').textContent = '点击播放后选择答案；可以重复听。';
}
function playEar(q) {
    const simultaneous = ['chord','seventh'].includes(q.mode) || (q.mode === 'interval' && $('#ear-style').value === 'harmonic');
    return transport.play(simultaneous ? [{ notes: q.notes, beats: 2 }] : q.notes.map(n => ({ notes: [n], beats: 1 })), 72);
}
$('#ear-play').onclick = async () => {
    if (earPending) return;
    const generation = earGeneration; earPending = true; $('#ear-play').disabled = true;
    try { stopMetronome(); await playEar(currentEar); if (generation !== earGeneration || tab !== 'ear') return; earHeard = true; if (!earAnswered) [...$('#ear-options').children].forEach(b => b.disabled = false); $('#ear-instruction').textContent = '可以先轻声模唱，再选择答案。'; }
    catch(e) { notify(e.message); }
    finally { if (generation === earGeneration) { earPending = false; $('#ear-play').disabled = false; } }
};
function answerEar(selected) {
    if (!earHeard || earAnswered) return;
    earAnswered = true; const correct = selected === currentEar.answer;
    recordAnswer(progress, currentEar.id, correct); persist(); updateStats();
    markOptions($('#ear-options'), currentEar.answer, selected);
    $('#ear-feedback').className = `feedback ${correct ? 'good' : 'bad'}`;
    $('#ear-feedback').textContent = `${correct ? '听对了。' : `正确答案：${currentEar.answer}。`} ${currentEar.explanation} 音符：${currentEar.notes.map(noteName).join(' → ')}。`;
    $('#ear-next').hidden = false;
}
$('#ear-next').onclick = newEar; $('#ear-mode').onchange = newEar; $('#ear-level').onchange = newEar; $('#ear-style').onchange = () => { transport.stop(); };
// Shared transport. Every switch or stop cancels scheduled audio and pending starts.
let metroTimer = null, metroNext = 0, metroIndex = 0, metroSources = new Set(), metroGeneration = 0;
function stopMetronome() {
    metroGeneration++; clearInterval(metroTimer); metroTimer = null;
    for (const s of metroSources) { try { s.stop(); } catch { /* ended */ } } metroSources.clear();
    $('#metronome').setAttribute('aria-pressed', 'false'); $('#metro-beat').classList.remove('on');
}
$('#metronome').onclick = async () => {
    if (metroTimer) { stopMetronome(); return; }
    stopActivities(); const generation = metroGeneration;
    try {
        await audio.init(); if (generation !== metroGeneration) return;
        metroNext = audio.context.currentTime + .08; metroIndex = 0;
        $('#metronome').setAttribute('aria-pressed', 'true');
        const schedule = () => {
            while (metroNext < audio.context.currentTime + .12) {
                const s = audio.click(metroNext, metroIndex % 4 === 0); metroSources.add(s); s.addEventListener('ended', () => metroSources.delete(s), { once:true });
                $('#metro-beat').classList.toggle('on', metroIndex % 2 === 0); metroIndex++; metroNext += 60 / progress.settings.bpm;
            }
        };
        schedule(); metroTimer = setInterval(schedule, 25);
    } catch(e) { notify(e.message); }
};
$('#bpm').value = progress.settings.bpm;
$('#bpm').onchange = () => { stopActivities(); progress.settings.bpm = clamp(Math.round(Number($('#bpm').value) || 72), 40, 200); $('#bpm').value = progress.settings.bpm; persist(); };
$('#volume').value = progress.settings.volume; audio.setVolume(progress.settings.volume / 100);
$('#volume').oninput = () => { progress.settings.volume = +$('#volume').value; audio.setVolume(progress.settings.volume / 100); persist(); };
$('#sound-enable').onclick = async () => {
    try {
        await audio.init(); $('#sound-enable').textContent = '重新加载音色';
        if (!audioWarming) { audioWarming = audio.warm(); await audioWarming; audioWarming = null; }
    } catch(e) { audioWarming = null; notify(e.message); }
};

// Piano: independent source IDs allow overlapping pointers, computer keys and MIDI ports.
const held = new Map(); const pressedCodes = new Map();
const computerKeys = { KeyA:0, KeyW:1, KeyS:2, KeyE:3, KeyD:4, KeyF:5, KeyT:6, KeyG:7, KeyY:8, KeyH:9, KeyU:10, KeyJ:11, KeyK:12, KeyO:13, KeyL:14, KeyP:15, Semicolon:16, Quote:17 };
const keyLabels = { KeyA:'A',KeyW:'W',KeyS:'S',KeyE:'E',KeyD:'D',KeyF:'F',KeyT:'T',KeyG:'G',KeyY:'Y',KeyH:'H',KeyU:'U',KeyJ:'J',KeyK:'K',KeyO:'O',KeyL:'L',KeyP:'P',Semicolon:';',Quote:"'" };
let pianoRun = null, pianoStartGeneration = 0, pianoTimers = new Set(), pedalSources = new Set();
function buildKeyboard() {
    let whites = 0; const nodes = [];
    for (let note = 21; note <= 108; note++) {
        const black = isBlack(note), left = black ? whites * 45 - 14 : whites++ * 45;
        const b = document.createElement('button'); b.className = `piano-key ${black ? 'black' : 'white'}`; b.dataset.note = note;
        b.style.left = `${left}px`; b.setAttribute('aria-label', `弹奏 ${noteName(note)}`); b.setAttribute('aria-pressed', 'false');
        b.innerHTML = `<kbd></kbd><span>${noteName(note)}</span>`; nodes.push(b);
        b.addEventListener('pointerdown', e => { if (e.button !== 0 && e.pointerType === 'mouse') return; e.preventDefault(); b.focus({ preventScroll: true }); b.setPointerCapture(e.pointerId); press(`pointer-${e.pointerId}`, note, e.pointerType === 'pen' && e.pressure > 0 ? Math.round(20 + e.pressure * 107) : progress.settings.velocity); });
        const up = e => release(`pointer-${e.pointerId}`);
        b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
        b.addEventListener('keydown', e => { if (e.code === 'Enter' && !e.repeat) { e.preventDefault(); press(`enter-${note}`, note); } });
        b.addEventListener('keyup', e => { if (e.code === 'Enter') release(`enter-${note}`); });
    }
    $('#keyboard').replaceChildren(...nodes); keyboardLabels();
}
function keyboardLabels() {
    $$('.piano-key kbd').forEach(k => k.textContent = '');
    for (const [code, semitone] of Object.entries(computerKeys)) {
        const key = $(`.piano-key[data-note="${12 * (progress.settings.octave + 1) + semitone}"] kbd`); if (key) key.textContent = keyLabels[code];
    }
}
function centerKeyboard() {
    const note = pianoRun ? selectedPiece().events[pianoRun.index]?.notes[0] || 60 : selectedPiece()?.events[0]?.notes[0] || 60;
    const key = $(`.piano-key[data-note="${note}"]`); if (key) $('#piano-scroll').scrollLeft = key.offsetLeft - $('#piano-scroll').clientWidth * .3;
}
function updateKey(note) {
    const key = $(`.piano-key[data-note="${note}"]`), down = [...held.values()].some(h => h.note === note);
    if (key) { key.classList.toggle('pressed', down); key.setAttribute('aria-pressed', String(down)); }
}
async function press(token, note, velocity = progress.settings.velocity) {
    if (held.has(token)) return;
    const entry = { note, id: null }; held.set(token, entry); updateKey(note);
    try {
        await audio.init();
        if (held.get(token) !== entry || tab !== 'piano') return;
        entry.id = audio.noteOn(note, velocity);
        evaluatePiano(note, token);
    } catch(e) { release(token); notify(e.message); }
}
function release(token) {
    const entry = held.get(token); if (!entry) return;
    pianoRun?.judge?.noteOff(token, performance.now());
    held.delete(token); if (entry.id) audio.release(entry.id); updateKey(entry.note);
}
function setPedal(source, on) {
    if (on) pedalSources.add(source); else pedalSources.delete(source);
    const active = pedalSources.size > 0; audio.setPedal(active); $('#pedal').setAttribute('aria-pressed', String(active));
}
function allOff() {
    [...held.keys()].forEach(release); pressedCodes.clear(); pedalSources.clear(); audio.stopAll(); $('#pedal').setAttribute('aria-pressed', 'false');
}
$('#pedal').onclick = () => setPedal('button', !pedalSources.has('button'));
$('#all-off').onclick = () => { stopActivities(); notify('所有声音已停止。'); };
$('#center-keyboard').onclick = centerKeyboard;
$('#keyboard-position').oninput=()=>{const scroller=$('#piano-scroll');scroller.scrollLeft=(scroller.scrollWidth-scroller.clientWidth)*Number($('#keyboard-position').value)/100;};
$('#piano-scroll').addEventListener('scroll',()=>{const el=$('#piano-scroll');$('#keyboard-position').value=100*el.scrollLeft/Math.max(1,el.scrollWidth-el.clientWidth);},{passive:true});
function setPianoFocus(on){document.body.classList.toggle('piano-focus',on);$('#piano-focus').setAttribute('aria-pressed',String(on));$('#piano-focus').textContent=on?'退出专注':'专注练琴';}
$('#piano-focus').onclick=()=>{setPianoFocus(!document.body.classList.contains('piano-focus'));window.scrollTo(0,0);centerKeyboard();};
$('#keyboard-octave').value = progress.settings.octave;
$('#keyboard-octave').onchange = () => { allOff(); progress.settings.octave = +$('#keyboard-octave').value; keyboardLabels(); persist(); const key = $(`.piano-key[data-note="${12 * (progress.settings.octave + 1)}"]`); if (key) $('#piano-scroll').scrollLeft = key.offsetLeft - 80; };
$('#velocity').value = progress.settings.velocity; $('#velocity-value').textContent = progress.settings.velocity;
$('#velocity').oninput = () => { progress.settings.velocity = +$('#velocity').value; $('#velocity-value').textContent = progress.settings.velocity; persist(); };
const selectedPiece = () => preparePiece(PIECES.find(p => p.id === $('#piano-piece').value), {hand:$('#piano-hand').value,from:Number($('#piano-from').value)||1,to:Number($('#piano-to').value)||999,repeats:Number($('#piano-repeats').value)});
const pianoSkillId = piece => `piano-${piece.id}-${$('#piano-mode').value}${$('#piano-mode').value==='timed' && $('#piano-duration').value==='full' ? '-duration' : ''}`;
$('#piano-piece').insertAdjacentHTML('beforeend', PIECES.map(p => `<option value="${p.id}">L${p.level || (['five','left'].includes(p.id)?1:2)} · ${p.title}</option>`).join(''));
function renderPiano(active = -1) {
    const piece = selectedPiece(), events = piece?.events || [];
    $('#piano-target').textContent = piece ? `目标：${piece.target || '先准确读谱、均匀落键，再逐步提高速度。'} 建议目标 ${piece.goalBpm || 72} BPM；${piece.selection.hand==='both'?'按原谱':piece.selection.hand==='right'?'右手':'左手'}，音组 ${piece.selection.from}–${piece.selection.to}，重复 ${piece.selection.repeats} 遍。` : '';
    $('#piano-title').textContent = piece?.title || '自由弹奏';
    $('#piano-detail').textContent = piece?.detail || '从中央 C 开始。可以用鼠标、触屏、电脑键盘或外接 MIDI 琴。';
    $('#piano-fingers').textContent = piece ? `建议指法：${piece.fingers}。时值见谱；完整时值模式测量按键保持时间（±25%，最少 100 ms），不评价实体指法。` : '';
    const allNotes = events.flatMap(e => e.notes); const clef = allNotes.every(n => n >= 60) ? 'treble' : allNotes.every(n => n < 60) ? 'bass' : 'grand';
    const oldScroll = $('#piano-score').scrollLeft;
    $('#piano-score').innerHTML = piece ? staff(events, { clef, active, meter:piece.meter || null, label: `${piece.title}钢琴大谱表`, showNames: true }) : '';
    $('#piano-score').scrollLeft = active >= 0 ? Math.max(0,120+active*65-$('#piano-score').clientWidth*.5) : oldScroll;
    $('#piano-steps').innerHTML = events.map((e, i) => `<span class="note-step ${i === active ? 'current' : ''} ${pianoRun?.hit?.has(i) || (pianoRun?.mode === 'wait' && i < active) ? 'done' : ''}">${i + 1}. ${e.notes.length ? e.notes.map(n=>e.spellings?.[n] || noteName(n)).join('+') : e.sustain ? '保持' : '休止'}</span>`).join('');
    $$('.piano-key.target').forEach(k => k.classList.remove('target'));
    if (active >= 0) events[active]?.notes.forEach(n => $(`.piano-key[data-note="${n}"]`)?.classList.add('target'));
    $('#piano-start').disabled = !piece || !events.some(e=>e.notes.length) || !!pianoRun; $('#piano-demo').disabled = !piece;
    if (!pianoRun && active < 0) $('#piano-result').textContent = piece ? `最好 ${progress.skills[pianoSkillId(piece)]?.best ?? '—'} 分` : '随心探索';
}
function stopPiano(message = '') {
    pianoStartGeneration++; for (const timer of pianoTimers) clearTimeout(timer); pianoTimers.clear();
    pianoRun = null; $$('.piano-key.target').forEach(k => k.classList.remove('target')); $('#piano-start').disabled = !selectedPiece()?.events.some(e=>e.notes.length);
    if (message) $('#piano-result').textContent = message;
}
function pianoLater(fn, delay) { const id = setTimeout(() => { pianoTimers.delete(id); fn(); }, Math.max(0, delay)); pianoTimers.add(id); }
function finishPiano() {
    if (!pianoRun) return;
    const run = pianoRun, piece = selectedPiece(), result = run.judge.result(performance.now());
    const detail = `命中 ${result.hits}/${result.total} 音 · ${result.errors} 次错按${run.mode==='timed' && run.judge.duration ? ` · 时值 ${result.durationScore} 分` : ''}${result.timingMs!==null ? ` · 起音偏差 ${result.timingMs} ms` : ''}`;
    saveSkill(pianoSkillId(piece), result.score); stopPiano(); transport.stop(); allOff(); renderPiano();
    $('#piano-result').textContent = `${result.score} 分 · ${detail}`;
}
function evaluatePiano(note, token) {
    if (!pianoRun) return;
    const run = pianoRun, result = run.judge.noteOn(token,note,performance.now());
    if (!result.correct) { $('#piano-result').textContent = run.mode==='wait' ? '留意目标音；正确按键仍会保留' : '留意音高和起拍 · 窗口 ±0.25 拍'; return; }
    run.hit = run.judge.hit;
    if (result.complete) { finishPiano(); return; }
    if (run.mode === 'wait') run.index = run.judge.index;
    renderPiano(run.index); $('#piano-result').textContent = `命中 ${run.judge.hits.size}/${run.judge.totalNotes} 音 · 继续`;
}
$('#piano-start').onclick = async () => {
    const piece = selectedPiece(); if (!piece?.events.some(e=>e.notes.length)) return;
    stopActivities(); const generation = pianoStartGeneration; $('#piano-start').disabled = true;
    try {
        await audio.init(); await Promise.all([...new Set(piece.events.flatMap(e => e.notes))].map(n => audio.load(n)));
        if (generation !== pianoStartGeneration || tab !== 'piano') return;
        const beatMs = 60000 / progress.settings.bpm, mode = $('#piano-mode').value;
        const positions = []; let total = 0; for (const event of piece.events) { positions.push(total); total += event.beats; }
        const startAudio = audio.context.currentTime + .12;
        const start = performance.now() + (startAudio - audio.context.currentTime) * 1000 + 4 * beatMs;
        const judge = new PracticeJudge(piece.events,{mode,bpm:progress.settings.bpm,start,duration:$('#piano-duration').value==='full'});
        pianoRun = { index:judge.index, mode, hit:judge.hit, positions, start, beatMs, judge };
        renderPiano(pianoRun.index); centerKeyboard();
        if (mode === 'wait') { $('#piano-result').textContent = '弹亮点标出的音 · 本模式允许慢速拆分和弦；跟拍模式检查进入时间'; return; }
        $('#piano-result').textContent = '四拍预备…';
        for (let i = 0; i < total + 4; i++) transport.sources.add(audio.click(startAudio + i * beatMs / 1000, i % 4 === 0));
        positions.forEach((p, i) => pianoLater(() => { if (pianoRun) { pianoRun.index = i; renderPiano(i); $('#piano-result').textContent = `第 ${i + 1} / ${piece.events.length} 组`; } }, start + p * beatMs - performance.now()));
        pianoLater(finishPiano, start + total * beatMs - performance.now() + 250);
    } catch(e) { stopPiano(); notify(e.message); }
};
$('#piano-demo').onclick = async () => {
    const piece = selectedPiece(); if (!piece) return; stopActivities(); const generation = pianoStartGeneration;
    try { $('#piano-result').textContent = '示范播放中 · 不计成绩'; await transport.play(piece.events, progress.settings.bpm, { countIn:4, onEvent:i => { if (generation === pianoStartGeneration) renderPiano(i); }, onEnd:() => { renderPiano(); $('#piano-result').textContent = '示范结束，轮到你了'; } }); }
    catch(e) { notify(e.message); }
};
$('#piano-stop').onclick = () => { stopActivities(); renderPiano(); $('#piano-result').textContent = '已停止 · 未完成练习不记成绩'; };
$('#piano-piece').onchange = () => { stopActivities(); progress.preferences['piano-from']='1'; progress.preferences['piano-to']=String(PIECES.find(p=>p.id===$('#piano-piece').value)?.events.length || 1); $('#piano-from').value=1; $('#piano-to').value=PIECES.find(p=>p.id===$('#piano-piece').value)?.events.length || 1; renderPiano(); centerKeyboard(); };
for (const id of ['piano-hand','piano-from','piano-to','piano-repeats','piano-duration']) document.getElementById(id).addEventListener('change', () => { stopActivities(); renderPiano(); });
$('#piano-mode').onchange = () => { stopActivities(); renderPiano(); };

let midiAccess = null;
function bindMidi() {
    if (!midiAccess) return;
    const connected = [...midiAccess.inputs.values()].filter(input => input.state === 'connected');
    $('#midi-status').textContent = connected.length ? `已连接：${connected.map(i => i.name || 'MIDI 键盘').join('、')}。只在钢琴页接收弹奏。` : '尚未发现 MIDI 输入。接好 USB MIDI 琴后会自动识别。';
    for (const input of midiAccess.inputs.values()) input.onmidimessage = e => {
        if (tab !== 'piano' || document.hidden) return;
        const [status, note, value] = e.data, command = status & 0xf0, channel = status & 0x0f;
        const token = `midi-${input.id}-${channel}-${note}`;
        if (command === 0x90 && value > 0 && note >= 21 && note <= 108) press(token, note, value);
        else if (command === 0x80 || (command === 0x90 && value === 0)) release(token);
        else if (command === 0xb0 && note === 64) setPedal(`midi-${input.id}-${channel}`, value >= 64);
        else if (command === 0xb0 && [120,123].includes(note)) allOff();
        lastActive = Date.now();
    };
}
$('#midi-connect').onclick = async () => {
    if (!navigator.requestMIDIAccess) { $('#midi-status').textContent = '此浏览器未提供 Web MIDI。可尝试桌面 Chrome / Edge，或继续用触屏与电脑键盘。'; return; }
    try { await audio.init(); midiAccess ||= await navigator.requestMIDIAccess({ sysex:false }); midiAccess.onstatechange = () => { allOff(); bindMidi(); }; bindMidi(); }
    catch { $('#midi-status').textContent = 'MIDI 未获授权或连接失败。请检查浏览器权限、USB 连接后重试。'; }
};

// Rhythm uses Web Audio's clock for the click track and an aligned monotonic input clock.
let rhythmRun = null, rhythmGeneration = 0;
const rhythm = () => RHYTHMS.find(r => r.id === $('#rhythm-pattern').value) || RHYTHMS[0];
$('#rhythm-pattern').innerHTML = RHYTHMS.map(r => `<option value="${r.id}">${r.title}</option>`).join('');
function renderRhythm() {
    const r = rhythm(); $('#rhythm-label').textContent = r.label;
    $('#rhythm-grid').innerHTML = Array.from({length:16}, (_,i) => `<span class="rhythm-cell ${r.positions.includes(i / 2) ? 'on' : ''}" data-cell="${i}">${i % 2 === 0 ? (Math.floor(i / 2) % 4) + 1 : '&'}</span>`).join('');
}
function stopRhythm() { rhythmGeneration++; rhythmRun = null; $('#tap').disabled = true; $('#rhythm-start').disabled = false; $$('.rhythm-cell').forEach(c => c.classList.remove('current')); }
function tap() {
    if (!rhythmRun || performance.now() < rhythmRun.start || performance.now() > rhythmRun.start + rhythmRun.beatMs * 8) return;
    rhythmRun.taps.push(performance.now() - rhythmRun.start);
    $('#tap').classList.add('hit'); setTimeout(() => $('#tap').classList.remove('hit'), 90);
    // A short high click gives input feedback without changing the reference schedule.
    audio.click(audio.context.currentTime, true);
}
$('#tap').addEventListener('pointerdown', e => { e.preventDefault(); tap(); });
$('#tap').addEventListener('click', e => { if (e.detail === 0) tap(); });
$('#rhythm-start').onclick = async () => {
    stopActivities(); const generation = rhythmGeneration; $('#rhythm-start').disabled = true;
    try {
        await audio.init(); if (generation !== rhythmGeneration || tab !== 'rhythm') return;
        const beatMs = 60000 / progress.settings.bpm, startAudio = audio.context.currentTime + .2;
        const start = performance.now() + (startAudio - audio.context.currentTime) * 1000 + beatMs * 4;
        rhythmRun = { start, beatMs, taps:[] }; $('#rhythm-result').textContent = '先听四拍预备，再跟随亮格拍击。';
        for (let i=0;i<12;i++) transport.sources.add(audio.click(startAudio + i * beatMs / 1000, i % 4 === 0));
        for (let i=0;i<4;i++) transport.later(() => { $('#rhythm-count').textContent = `预备 ${i+1} / 4`; }, start - beatMs * (4-i) - performance.now());
        for (let i=0;i<16;i++) transport.later(() => {
            $('#tap').disabled = false; $('#rhythm-count').textContent = `${i < 8 ? '第一' : '第二'}小节 · ${i % 2 === 0 ? Math.floor(i / 2) % 4 + 1 : '&'}`;
            $$('.rhythm-cell').forEach(c => c.classList.toggle('current', +c.dataset.cell === i));
        }, start + i * beatMs / 2 - performance.now());
        transport.later(() => {
            if (!rhythmRun) return;
            const result = scoreRhythm(rhythm().positions, rhythmRun.taps, beatMs);
            saveSkill(`rhythm-${rhythm().id}`, result.score);
            stopRhythm(); transport.stop(); $('#rhythm-count').textContent = `${result.score} 分`;
            $('#rhythm-result').textContent = `命中 ${result.matched}/${rhythm().positions.length} · 多余或偏离拍点 ${result.extra} 次${result.errorMs !== null ? ` · 命中拍点平均偏差 ${result.errorMs} ms` : ''}。可降低速度再练。`;
        }, start + beatMs * 8 - performance.now() + 80);
    } catch(e) { stopRhythm(); notify(e.message); }
};
$('#rhythm-demo').onclick = async () => {
    stopActivities();
    try {
        const r = rhythm(), events = [];
        for (let i=0;i<16;i++) events.push({notes:r.positions.includes(i/2) ? [76] : [],beats:.5});
        $('#rhythm-count').textContent = '四拍预备后听示范';
        await transport.play(events, progress.settings.bpm, { countIn:4, clicks:true, onEvent:i => { $$('.rhythm-cell').forEach(c => c.classList.toggle('current', +c.dataset.cell === i)); }, onEnd:() => { $('#rhythm-count').textContent = '示范结束'; renderRhythm(); } });
    } catch(e) { notify(e.message); }
};
$('#rhythm-stop').onclick = () => { stopActivities(); $('#rhythm-count').textContent = '已停止'; $('#rhythm-result').textContent = '未完成练习不记成绩。'; };
$('#rhythm-pattern').onchange = () => { stopActivities(); renderRhythm(); $('#rhythm-count').textContent = '准备好了吗？'; };
let micStream = null, micSource = null, analyser = null, micFrame = 0, micGeneration = 0, micPending = false, sing = null;
const melody = () => MELODIES.find(m => m.id === $('#sight-piece').value) || MELODIES[0];
const sightNotes = () => melody().notes.map(n => n + Number($('#sight-octave').value));
$('#sight-piece').innerHTML = MELODIES.map(m => `<option value="${m.id}">${m.title}</option>`).join('');
function renderSight(active = -1) {
    const m = melody(), notes = sightNotes();
    $('#sight-title').textContent = m.title; $('#sight-key').textContent = m.key;
    $('#sight-score').innerHTML = staff(notes.map((n,i) => ({notes:[n],beats:m.beats[i]})), { clef:Number($('#sight-octave').value) < 0 ? 'bass' : 'treble', active, meter:4, label:`${m.title}视唱谱，各音时值标于下方` });
    $('#solfege').textContent = m.solfege; $('#solfege').hidden = !$('#solfege-toggle').checked;
    $('#sing-target').textContent = `目标 ${noteName(notes[active >= 0 ? active : 0])}`;
    $('#sing-progress').textContent = `${active >= 0 ? active : 0} / ${notes.length}`;
}
function stopMic(message = '') {
    micGeneration++; micPending = false; cancelAnimationFrame(micFrame);
    if (micStream) micStream.getTracks().forEach(track => track.stop());
    micSource?.disconnect(); analyser?.disconnect(); micSource = null; analyser = null; micStream = null; sing = null;
    $('#mic-start').disabled = false; $('#mic-stop').disabled = true;
    if (message) $('#pitch-cents').textContent = message;
}
$('#mic-start').onclick = async () => {
    if (micStream || micPending) return;
    stopActivities();
    if (!navigator.mediaDevices?.getUserMedia) { notify('此环境无法使用麦克风。请通过 HTTPS 或本机 localhost 打开，或使用自主视唱。'); return; }
    const generation = micGeneration; micPending = true; $('#mic-start').disabled = true; $('#mic-stop').disabled = false; $('#pitch-cents').textContent = '等待麦克风授权…';
    try {
        await audio.init();
        const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
        if (generation !== micGeneration || tab !== 'sight') { stream.getTracks().forEach(track => track.stop()); return; }
        micStream = stream; micPending = false;
        micSource = audio.context.createMediaStreamSource(stream); analyser = audio.context.createAnalyser(); analyser.fftSize = 4096;
        micSource.connect(analyser); // Deliberately never connect the microphone to speakers.
        sing = { index:0, stableSince:0, good:0, voiced:0, last:0, started:performance.now(), mustPause:false, previous:null };
        renderSight(0);
        const buffer = new Float32Array(analyser.fftSize);
        const analyze = now => {
            if (!sing || !analyser) return;
            if (now - sing.started > 120000) { stopMic('本轮已超时。休息后可重新开始。'); return; }
            if (now - sing.last > 90) {
                sing.last = now; analyser.getFloatTimeDomainData(buffer);
                const hz = detectPitch(buffer, audio.context.sampleRate), target = sightNotes()[sing.index];
                if (!hz) { $('#pitch-name').textContent = '—'; $('#pitch-cents').textContent = '等待稳定的单音'; sing.stableSince = 0; sing.mustPause = false; }
                else {
                    const pitch = midiPitch(hz), nearest = Math.round(pitch), cents = Math.round((pitch - target) * 100);
                    $('#pitch-name').textContent = noteName(nearest);
                    $('#pitch-cents').textContent = Math.abs(cents) <= 35 ? '音准在目标附近' : `${cents > 0 ? '偏高' : '偏低'} ${Math.abs(cents)} 音分`;
                    $('#pitch-needle').style.left = `${50 + clamp(cents, -100, 100) * .45}%`;
                    sing.voiced++; if (Math.abs(cents) <= 35) sing.good++;
                    if (sing.mustPause) { $('#pitch-cents').textContent = '同音重复：先停顿，再唱一次'; }
                    else if (Math.abs(cents) <= 35) {
                        if (!sing.stableSince) sing.stableSince = now;
                        if (now - sing.stableSince >= 480) {
                            sing.index++; sing.stableSince = 0;
                            if (sing.index >= sightNotes().length) {
                                const count = sing.index, score = Math.round(100 * sing.good / sing.voiced);
                                saveSkill(`sight-${melody().id}`, score); stopMic(); renderSight();
                                $('#sing-progress').textContent = `${count} / ${count} 完成 · 稳定音准帧占比 ${score}%`;
                                $('#pitch-cents').textContent = '完成！麦克风已关闭'; return;
                            }
                            sing.mustPause = sightNotes()[sing.index] === target; renderSight(sing.index);
                        }
                    } else { sing.stableSince = 0; }
                }
            }
            micFrame = requestAnimationFrame(analyze);
        };
        micFrame = requestAnimationFrame(analyze);
        stream.getTracks().forEach(t => t.addEventListener('ended', () => { if (micStream === stream) stopMic('麦克风连接已中断，可重新开启。'); }));
    } catch(e) {
        if (generation !== micGeneration) return;
        stopMic(); $('#pitch-cents').textContent = e.name === 'NotAllowedError' ? '未获得麦克风权限，仍可自主视唱。' : '无法使用麦克风，请检查设备后重试。';
    }
};
$('#mic-stop').onclick = () => stopMic('麦克风已关闭 · 未完成不计分');
$('#sight-root').onclick = async () => {
    stopActivities();
    try { await transport.play([{notes:[sightNotes()[0]],beats:2}],progress.settings.bpm); } catch(e) { notify(e.message); }
};
$('#sight-demo').onclick = async () => {
    stopActivities(); const m = melody();
    try { await transport.play(sightNotes().map((n,i) => ({notes:[n],beats:m.beats[i]})), progress.settings.bpm, { countIn:4, onEvent:renderSight, onEnd:() => renderSight() }); } catch(e) { notify(e.message); }
};
$('#sight-stop').onclick = () => { stopActivities(); renderSight(); };
$('#sight-piece').onchange = $('#sight-octave').onchange = () => { stopActivities(); renderSight(); $('#sight-manual').disabled = false; };
$('#solfege-toggle').onchange = () => { $('#solfege').hidden = !$('#solfege-toggle').checked; };
$('#sight-manual').onclick = () => {
    saveSkill(`manual-${melody().id}`, 0); $('#sight-manual').disabled = true;
    notify('已记录一次自主视唱，不计自动音准分。重新选择旋律可练下一轮。');
};

function skillName(id) {
    const prefix = id.split('-')[0];
    if (prefix === 'piano') { const mode = id.endsWith('-duration') ? '跟拍+时值' : id.endsWith('-timed') ? '跟拍' : '等音'; const pieceId = id.replace(/^piano-/, '').replace(/-(wait|timed)(-duration)?$/, ''); const base=pieceId.split('--')[0]; return `钢琴 · ${PIECES.find(p => p.id === base)?.title || workshopName(base) || base}${pieceId.includes('--') ? ' · 分段/分手' : ''} · ${mode}`; }
    if (prefix === 'rhythm') return `节奏 · ${RHYTHMS.find(r => `rhythm-${r.id}` === id)?.title || '训练'}`;
    if (prefix === 'sight' || prefix === 'manual') return `${prefix === 'manual' ? '自主视唱' : '视唱音准'} · ${MELODIES.find(m => `${prefix}-${m.id}` === id)?.title || '短句'}`;
    return '练习';
}
function renderProgress() {
    updateStats();
    const maxSeconds = Math.max(progress.settings.goal * 60, ...Object.values(progress.days).map(d => d.seconds));
    const days = Array.from({length:14},(_,i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); return { key:localDay(d), label:`${d.getMonth()+1}/${d.getDate()}` }; });
    $('#activity').innerHTML = days.map(({key,label}) => `<div class="activity-day" title="${key}：${Math.floor((progress.days[key]?.seconds || 0)/60)} 分钟"><span>${Math.floor((progress.days[key]?.seconds || 0)/60)}</span><span class="activity-bar" style="height:${Math.max(3, 100 * (progress.days[key]?.seconds || 0) / maxSeconds)}px"></span><span>${label}</span></div>`).join('');
    const skills = Object.entries(progress.skills);
    $('#skill-results').innerHTML = skills.length ? `<div class="table-scroll"><table class="results-table"><thead><tr><th>练习</th><th>次数</th><th>最好</th><th>最近</th></tr></thead><tbody>${skills.map(([id,v]) => `<tr><td>${esc(skillName(id))}</td><td>${v.attempts}</td><td>${id.startsWith('manual-') ? '自主记录' : `${v.best} 分${v.bestBpm ? ` / ${v.bestBpm} BPM` : ''}`}</td><td>${id.startsWith('manual-') ? '—' : `${v.latest} 分${v.latestBpm ? ` / ${v.latestBpm} BPM` : ''}`}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">完成钢琴、节奏或视唱练习后，成绩会出现在这里。</p>';
    $('#history').innerHTML = progress.history.length ? [...progress.history].reverse().slice(0,15).map(h => `<div class="history-row"><span>${esc(skillName(h.skill))}${h.skill.startsWith('manual-') ? '' : ` · ${h.score} 分`}</span><span>${esc(new Date(h.at).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}))}</span></div>`).join('') : '<p class="muted">今天的第一段练习，从一个音开始。</p>';
    $('#daily-goal').value = progress.settings.goal;
    renderJournal();
}
$('#daily-goal').onchange = () => { progress.settings.goal = +$('#daily-goal').value; persist(); renderProgress(); };
$('#review-go').onclick = () => { $('#theory-mode').value = 'review'; setTab('theory', true); };
function download(data, suffix = '') {
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'}), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `hive-music-${localDay()}${suffix}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
$('#export').onclick = () => {
    tick();
    if (storageBlocked) {
        try { const raw = storage.getItem(STORAGE_KEY); if (raw) download({ unrecoveredRaw:raw, currentSession:progress }, '-recovery'); else download(progress); }
        catch { download(progress); }
    } else download(progress);
    notify('已准备进度文件，请确认浏览器下载成功。');
};
$('#import').onchange = async e => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
        if (file.size > 3 * 1024 * 1024) throw new Error('备份文件过大，请选择 3 MB 以内的进度 JSON。');
        pendingImport = validateProgress(JSON.parse(await file.text()));
        $('#import-summary').textContent = `备份包含 ${Object.keys(pendingImport.lessons).length} 节已学课程、${Object.keys(pendingImport.cards).length} 道题记录。确认后替换当前音乐进度。`;
        $('#import-confirm').hidden = false;
    } catch(error) { pendingImport = null; $('#import-confirm').hidden = true; notify(`未导入：${error.message}`); }
    e.target.value = '';
};
$('#import-cancel').onclick = () => { pendingImport = null; $('#import-confirm').hidden = true; };
$('#import-apply').onclick = () => {
    if (!pendingImport) return;
    if (storageBlocked) { try { download({ unrecoveredRaw:storage.getItem(STORAGE_KEY), currentSession:progress }, '-before-import-recovery'); } catch { download(progress, '-before-import'); } }
    else download(progress, '-before-import');
    const error = saveProgress(storage, pendingImport);
    if (error) { storageWarning(error); return; }
    stopActivities(); progress = pendingImport; pendingImport = null; storageBlocked = false;
    $('#import-confirm').hidden = true; storageWarning(null); syncSettings(); renderCurriculum(); renderProgress(); notify('音乐进度已恢复。原进度已发起下载备份。');
};
$('#reset').onclick = () => {
    if (!confirm('重置此浏览器的音乐课程、题目、练习记录与设置？其他学习工具不受影响。建议先导出备份。')) return;
    const fresh = freshProgress(), error = saveProgress(storage, fresh);
    if (error) { storageWarning(error); return; }
    stopActivities(); progress = fresh; storageBlocked = false; storageWarning(null); syncSettings(); renderCurriculum(); renderProgress(); $('#lesson-detail').hidden = true; notify('音乐进度已重置。');
};
let controlDefaults;
function syncSettings() {
    controlDefaults ||= Object.fromEntries($$('select, input[type=number], #harmony-bass, #harmony-smooth').filter(e=>e.id).map(e=>[e.id,e.type==='checkbox'?String(e.checked):e.value]));
    for(const [id,value] of Object.entries(controlDefaults)){const control=document.getElementById(id);if(control.type==='checkbox')control.checked=value==='true';else control.value=value;}
    $('#bpm').value = progress.settings.bpm; $('#volume').value = progress.settings.volume; audio.setVolume(progress.settings.volume / 100);
    $('#velocity').value = progress.settings.velocity; $('#velocity-value').textContent = progress.settings.velocity;
    $('#keyboard-octave').value = progress.settings.octave; keyboardLabels();
    activeLesson = LESSONS.find(l => l.id === progress.lastLesson) || LESSONS[0];
    for (const [id,value] of Object.entries(progress.preferences || {})) { const select = document.getElementById(id); if(select?.type==='checkbox'){select.checked=value==='true';continue;} if (select && (select.tagName==='INPUT' || [...select.options].some(o => o.value === value))) select.value = value; }
    const savedWorkshop=progress.preferences?.['piano-piece']; if(savedWorkshop?.startsWith('workshop_')) { const spec=workshopSpec(savedWorkshop);if(spec){installWorkshop(spec);$('#piano-piece').value=savedWorkshop;} }
    audio.setInstrument($('#instrument').value); $('#instrument-label').textContent=INSTRUMENTS[$('#instrument').value].name;
}
$('#resources').innerHTML = RESOURCES.map((r,i) => `<article class="card"><span class="eyebrow">REFERENCE 0${i+1}</span><h3><a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.title} ↗</a></h3><p>${r.author}</p><p>${r.text}</p><small>${r.license}</small>${i === 3 ? '<p><a href="/music/samples/NOTICE.md">采样来源与署名</a> · <a href="https://creativecommons.org/licenses/by/3.0/us/" target="_blank" rel="noopener noreferrer">CC BY 3.0 US</a></p>' : ''}</article>`).join('');
// Chord workshop: all generated exercises use the same score, input and progress pipeline.
$('#harmony-root').innerHTML = KEYS.map((name,i)=>`<option value="${i}">${name}</option>`).join('');
$('#harmony-type').innerHTML = [...new Set(CHORD_TYPES.map(t=>t.family))].map(family=>`<optgroup label="${family}">${CHORD_TYPES.filter(t=>t.family===family).map(t=>`<option value="${t.id}">${t.name} · ${t.symbol || '大三'}</option>`).join('')}</optgroup>`).join('');
$('#harmony-progression').innerHTML = PROGRESSIONS.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
let harmonyEvents = [];
function harmonySpec() { return {kind:$('#harmony-kind').value==='chord'?'c':'p',root:+$('#harmony-root').value,type:$('#harmony-kind').value==='chord'?$('#harmony-type').value:$('#harmony-progression').value,voicing:$('#harmony-voicing').value,inversion:+$('#harmony-inversion').value,bass:$('#harmony-bass').checked,smooth:$('#harmony-smooth').checked}; }
function eventsForHarmony(spec) {
    const root=KEYS[spec.root] || 'C';
    const events=spec.kind==='c'?[makeChord(root,spec.type,{voicing:spec.voicing,inversion:spec.inversion,bass:spec.bass})]:progressionEvents(spec.type,root,spec.voicing,spec.smooth);
    return events.map(e=>spec.kind==='p'&&!spec.bass?{...e,left:[],notes:e.right}:e);
}
function renderHarmony(active=-1) {
    const spec=harmonySpec(),type=CHORD_TYPES.find(t=>t.id===spec.type),progression=PROGRESSIONS.find(p=>p.id===spec.type);
    $('#harmony-type-label').hidden=spec.kind!=='c';$('#harmony-progression-label').hidden=spec.kind==='c';$('#harmony-inversion-label').hidden=spec.kind!=='c';$('#harmony-smooth').disabled=spec.kind==='c';
    harmonyEvents=eventsForHarmony(spec);
    $('#harmony-title').textContent=spec.kind==='c'?`${KEYS[spec.root]}${type.symbol} · ${type.name}`:`${KEYS[spec.root]} · ${progression.name}`;
    $('#harmony-formula').textContent=spec.kind==='c'?type.formula:`${harmonyEvents.length} 小节 · 每和弦四拍`;
    $('#harmony-explanation').textContent=spec.kind==='c'?type.hint:progression.description;
    $('#harmony-score').innerHTML=staff(harmonyEvents,{clef:'grand',active,showNames:true,meter:4,label:$('#harmony-title').textContent});
    if(active>=0)$('#harmony-score').scrollLeft=Math.max(0,120+active*65-$('#harmony-score').clientWidth*.4);
    $('#harmony-chords').innerHTML=harmonyEvents.map((e,i)=>`<div class="chord-tile ${i===active?'current':''}"><span class="eyebrow">${spec.kind==='c'?'CHORD':`BAR ${i+1}`}</span><h4>${esc(e.label || e.symbol)}</h4><p>${esc(e.type.formula)}</p><p>${e.notes.map(n=>esc(e.spellings[n] || noteName(n))).join(' · ')}</p><small>${e.left.length?`左手 ${e.left.map(n=>esc(e.spellings[n] || noteName(n))).join(' ')} / `:''}右手 ${e.right.map(n=>esc(e.spellings[n] || noteName(n))).join(' ')}</small></div>`).join('');
    const parts=spec.voicing==='shell'?Math.min(2,type?.degrees.length || 2):spec.voicing==='rootless'?(type?.degrees.length || 4)-1:type?.degrees.length || 4;
    [...$('#harmony-inversion').options].forEach(o=>o.disabled=+o.value>=parts);
}
for(const id of ['harmony-kind','harmony-root','harmony-type','harmony-voicing','harmony-inversion','harmony-progression','harmony-bass','harmony-smooth'])document.getElementById(id).addEventListener('change',()=>{stopActivities();if(id==='harmony-type'||id==='harmony-voicing')$('#harmony-inversion').value='0';renderHarmony();});
$('#harmony-play').onclick=async()=>{stopActivities();renderHarmony();try{await transport.play(harmonyEvents,progress.settings.bpm,{onEvent:renderHarmony,onEnd:()=>renderHarmony()});}catch(e){notify(e.message);}};
$('#harmony-arpeggio').onclick=async()=>{stopActivities();renderHarmony();const events=harmonyEvents.flatMap(e=>e.notes.map(n=>({notes:[n],beats:.5})));try{await transport.play(events,progress.settings.bpm);}catch(e){notify(e.message);}};
$('#harmony-stop').onclick=()=>{stopActivities();renderHarmony();};
function workshopId(spec){return `workshop_${spec.kind}_${spec.root}_${spec.type}_${spec.voicing}_${spec.inversion}_${+spec.bass}_${+spec.smooth}`;}
function workshopSpec(id){const [,kind,root,type,voicing,inversion,bass,smooth]=id.split('_');if(!['c','p'].includes(kind)||!KEYS[+root]||!['close','shell','open','rootless'].includes(voicing)||!(kind==='c'?CHORD_TYPES:PROGRESSIONS).some(x=>x.id===type))return null;return{kind,root:+root,type,voicing,inversion:clamp(+inversion||0,0,3),bass:bass==='1',smooth:smooth==='1'};}
function workshopName(id){const spec=workshopSpec(id);if(!spec)return '';return `${KEYS[spec.root]} · ${spec.kind==='c'?CHORD_TYPES.find(t=>t.id===spec.type).name:PROGRESSIONS.find(p=>p.id===spec.type).name}`;}
function installWorkshop(spec){
    const id=workshopId(spec);if(PIECES.some(p=>p.id===id))return id;
    const events=eventsForHarmony(spec).map(playableHands);
    const piece={id,title:workshopName(id),level:4,hand:'both',events,meter:4,fingers:'按谱面分手；先分手找位，选择舒适指法，不强行拉伸',detail:`工坊配置 · ${spec.voicing} · 每和弦四拍；跨度过大的完整结构已分配给双手`,goalBpm:60,target:'说出根音与导向音，连贯换和弦；先等音，再跟拍。'};
    PIECES.push(piece);const option=document.createElement('option');option.value=id;option.textContent=`工坊 · ${piece.title}`;$('#piano-piece').append(option);return id;
}
$('#harmony-train').onclick=()=>{const id=installWorkshop(harmonySpec());$('#piano-piece').value=id;$('#piano-hand').value='both';$('#piano-from').value=1;$('#piano-to').value=PIECES.find(p=>p.id===id).events.length;$('#piano-repeats').value='1';$('#piano-mode').value='wait';progress.preferences['piano-piece']=id;for(const key of ['piano-hand','piano-from','piano-to','piano-repeats','piano-mode'])progress.preferences[key]=document.getElementById(key).value;persist();setTab('piano',true);};
$('#harmony-lesson').onclick=()=>{setTab('route',true);showLesson('jazz251');};
$('#instrument').onchange=async()=>{stopActivities();audio.setInstrument($('#instrument').value);$('#instrument-label').textContent=INSTRUMENTS[$('#instrument').value].name;try{await audio.warm();}catch(e){notify(e.message);}};
$('#piano-syllabus').innerHTML=`<details><summary>分级练习路线 · ${PIECES.length} 组基础练习 + 十二调和弦工坊</summary><div class="syllabus-grid">${PIANO_LEVELS.map(level=>`<div><h4>${level.name}</h4><p>${level.goal}</p><p class="muted">${level.book}</p></div>`).join('')}</div><p>推荐每段以 50–60 BPM 起步；连续三次准确、放松后增加 4 BPM。先分手，再合手；先短片段，再完整乐句。本站等级为学习顺序，不对应考级证书。</p></details>`;
function renderJournal(){ $('#journal-list').innerHTML=[...(progress.journal || [])].reverse().slice(0,20).map(entry=>`<article class="journal-entry"><span class="muted">${esc(new Date(entry.at).toLocaleString('zh-CN'))} · ${entry.bpm} BPM</span><p>${esc(entry.text)}</p></article>`).join('') || '<p class="muted">还没有日志。写下具体困难，比只记“练了半小时”更有用。</p>'; }
$('#journal-save').onclick=()=>{const text=$('#journal-text').value.trim();if(!text){notify('先写下本次观察或下一次目标。');return;}progress.journal ||= [];progress.journal.push({text:text.slice(0,1200),at:Date.now(),bpm:progress.settings.bpm});progress.journal=progress.journal.slice(-100);persist();$('#journal-text').value='';renderJournal();notify('练习日志已保存。');};

function stopActivities() {
    transport.stop(); stopMetronome(); stopPiano(); stopRhythm(); stopMic(micStream || micPending ? '麦克风已关闭' : ''); allOff();
    earGeneration++; earPending = false; $('#ear-play').disabled = false;
}
const formFocused = target => target instanceof Element && !!target.closest('input,select,textarea,[contenteditable=true]');
document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || formFocused(e.target)) return;
    if (e.code === 'Escape') { stopActivities(); notify('播放和练习已停止。'); return; }
    if (tab === 'rhythm' && e.code === 'Space' && rhythmRun) { e.preventDefault(); tap(); return; }
    if (tab !== 'piano') return;
    if (e.code === 'Space') { e.preventDefault(); setPedal('space',true); return; }
    if (computerKeys[e.code] !== undefined) { e.preventDefault(); const note = (progress.settings.octave + 1) * 12 + computerKeys[e.code]; pressedCodes.set(e.code,note); press(`computer-${e.code}`,note); }
});
document.addEventListener('keyup', e => { if (e.code === 'Space') setPedal('space',false); if (pressedCodes.has(e.code)) { release(`computer-${e.code}`); pressedCodes.delete(e.code); } });
window.addEventListener('blur', () => { transport.stop(); stopMetronome(); stopPiano(); stopRhythm(); allOff(); if (micStream) stopMic('麦克风已关闭'); lastActive = 0; });
document.addEventListener('visibilitychange', () => { if (document.hidden) { tick(); stopActivities(); } else { lastTick = Date.now(); lastActive = Date.now(); } });
window.addEventListener('pagehide', () => { tick(); stopActivities(); });
window.addEventListener('storage', e => {
    if (e.key !== STORAGE_KEY) return;
    try { const incoming = e.newValue ? validateProgress(JSON.parse(e.newValue)) : freshProgress(); stopActivities(); progress = incoming; storageBlocked = false; syncSettings(); renderCurriculum(); updateStats(); if (tab === 'progress') renderProgress(); notify('已载入另一个页面更新的音乐进度。'); }
    catch { storageBlocked = true; storageWarning('另一个页面写入了无法识别的进度；已暂停保存，请先备份。'); }
});
for (const id of ['piano-piece','piano-mode','sight-piece','sight-octave','rhythm-pattern','ear-mode','ear-level','ear-style','theory-mode','lesson-filter','instrument','piano-hand','piano-repeats','piano-duration','harmony-bass','harmony-smooth','harmony-kind','harmony-root','harmony-type','harmony-voicing','harmony-inversion','harmony-progression','piano-from','piano-to']) document.getElementById(id).addEventListener('change', e => { progress.preferences ||= {}; progress.preferences[id] = e.target.type==='checkbox'?String(e.target.checked):e.target.value; persist(); });
buildKeyboard(); syncSettings(); renderCurriculum(); renderSight(); renderPiano(); renderRhythm(); updateStats();
setTab(['route','theory','ear','sight','piano','rhythm','harmony','progress','resources'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'route');
