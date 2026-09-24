// Arrangement desk UI: library, meta, timeline with chord lane, inspector, staff, checks and Strudel.
// Every edit goes through applyOps, so the document stays valid and each edit is one undo step.
import { CHORD_TYPES, PROGRESSIONS, rootPC, spellPitch } from './harmony.mjs';
import { ROLES, ROOTS, VOICINGS, INSTRUMENT_IDS, MAJOR_KEYS, MINOR_KEYS, LIMITS, validateDocument } from './arrangement-schema.mjs';
import { STYLES, stylesForRole, normalizeParams, voiceChord } from './arrange-styles.mjs';
import { ARRANGE_KEY, TEMPLATES, applyOps, applySelected, describeOp, docHash, realize, createFromTemplate, newDocId, loadStore, saveStore, validateStore, positionLabel, spellInKey, spellingMidi } from './arrangement.mjs';
import { compileABC } from './arrange-abc.mjs';
import { compileStrudel } from './arrange-strudel.mjs';
import { checkArrangement } from './arrange-check.mjs';
import { ArrangePlayer, playbackNotes } from './arrange-player.mjs';
import { strudelURL, MAX_SOURCE } from './composition.mjs';
import { INSTRUMENTS } from './audio.mjs';
import { loadABC, highlightStarts } from './abc-loader.mjs';
import { cycleToBeat } from './strudel-bridge.mjs';
import { sharedSandbox } from './strudel-sandbox.mjs';

const $ = s => document.querySelector(s);
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LENGTHS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];
const LENGTH_NAMES = { 0.25: '十六分', 0.5: '八分', 0.75: '附点八分', 1: '四分', 1.5: '附点四分', 2: '二分', 3: '附点二分', 4: '全音符', 6: '6 拍', 8: '8 拍', 12: '12 拍', 16: '16 拍' };
function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const filename = s => (s || 'arrangement').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 70) || 'arrangement';
/** Accepts E♭4, Eb4, F#3, f♯3; returns a normalized spelling and MIDI pitch. */
export function parseSpelling(value) {
    const m = /^\s*([A-Ga-g])\s*(bb|𝄫|b|♭|##|𝄪|#|♯)?\s*(-?\d)\s*$/u.exec(value || '');
    if (!m) return null;
    const acc = { bb: '𝄫', '𝄫': '𝄫', b: '♭', '♭': '♭', '##': '𝄪', '𝄪': '𝄪', '#': '♯', '♯': '♯' }[m[2]] || '';
    const spelling = m[1].toUpperCase() + acc + m[3], pitch = spellingMidi(spelling);
    return pitch >= 21 && pitch <= 108 ? { spelling, pitch } : null;
}
function keyboardSVG(notes) {
    if (!notes.length) return '';
    const low = Math.floor(Math.min(...notes) / 12) * 12, high = Math.max(low + 23, Math.ceil((Math.max(...notes) + 1) / 12) * 12 - 1);
    const whites = [], blacks = []; let x = 0;
    for (let n = low; n <= high; n++) {
        const black = [1, 3, 6, 8, 10].includes(n % 12), on = notes.includes(n);
        if (black) blacks.push(`<rect x="${x - 3.5}" y="0" width="7" height="26" class="${on ? 'on' : 'black'}"/>`);
        else { whites.push(`<rect x="${x}" y="0" width="10" height="42" class="${on ? 'on' : 'white'}"/>`); x += 10; }
    }
    return `<svg class="arr-keys" viewBox="0 0 ${x} 42" role="img" aria-label="和弦配置">${whites.join('')}${blacks.join('')}</svg>`;
}

// The unsaved example keeps one id across reloads so a pending AI proposal still finds it.
const DEMO_ID = 'demo';
export function mountArrange({ audio, storage, notify, setTab, stopAll, creative }) {
    const loaded = loadStore(storage);
    let store = loaded.store, blocked = loaded.blocked, doc, past = [], future = [], selection = null, real, compiled = { abc: '', map: {} };
    let visual = null, renderTimer = null, renderGeneration = 0, saved = true, highlight = '';
    const player = new ArrangePlayer(audio);
    let playing = null;
    // AI proposal state: `preview.original` is the saved document while a proposal is being previewed.
    let preview = null, proposal = null, assistant = null, openAssistant = null, resumed = false;
    const previewGuard = () => { if (!preview) return false; notify('正在预览 AI 提案：先接受或退出预览，再做其他修改。'); return true; };
    const warning = text => { $('#arr-warning').textContent = text || ''; $('#arr-warning').hidden = !text; };
    if (loaded.error) warning(loaded.error);

    function openDoc(next, { keepHistory = false } = {}) {
        doc = next; if (!keepHistory) { past = []; future = []; }
        selection = null; stop(); refresh();
    }
    doc = store.arrangements.find(a => a.id === store.active) || store.arrangements[0] || createFromTemplate('pop', DEMO_ID);
    saved = store.arrangements.some(a => a.id === doc.id);

    function persist() {
        if (blocked) { $('#arr-save').textContent = '存档不可读，暂停保存'; return; }
        const list = store.arrangements.filter(a => a.id !== doc.id);
        if (list.length >= LIMITS.docs && !store.arrangements.some(a => a.id === doc.id)) { warning(`最多保存 ${LIMITS.docs} 份编曲，请先导出并删除不再需要的编曲。`); return; }
        const index = store.arrangements.findIndex(a => a.id === doc.id);
        const arrangements = [...store.arrangements]; if (index >= 0) arrangements[index] = doc; else arrangements.push(doc);
        const next = { version: 1, active: doc.id, arrangements }, error = saveStore(storage, next);
        if (error) { warning(error); $('#arr-save').textContent = '未能保存'; return; }
        store = next; saved = true; warning(''); $('#arr-save').textContent = '已保存在此浏览器';
    }
    /** One user edit: validated, recorded for undo, saved, and every view refreshed. */
    function commit(ops) {
        if (previewGuard()) return false;
        let next;
        try { next = applyOps(doc, ops); } catch (error) { notify(error.message); return false; }
        past.push(doc); if (past.length > 100) past.shift(); future = [];
        doc = next; persist(); refresh(); return true;
    }
    function travel(from, to) { if (previewGuard() || !from.length) return; to.push(doc); doc = from.pop(); persist(); refresh(); }

    // ---------- library and meta ----------
    function renderLibrary() {
        const list = store.arrangements.some(a => a.id === doc.id) ? store.arrangements : [doc, ...store.arrangements];
        $('#arr-select').replaceChildren(...list.map(a => new Option(a.title + (a.id === doc.id && !saved ? '（示例，编辑后保存）' : ''), a.id)));
        $('#arr-select').value = doc.id;
        $('#arr-delete').disabled = !saved;
        $('#arr-undo').disabled = !past.length; $('#arr-redo').disabled = !future.length;
        if (blocked) $('#arr-save').textContent = '存档不可读，暂停保存';
        else if (!saved) $('#arr-save').textContent = '示例编曲，改动后自动保存';
    }
    function renderMeta() {
        const keys = doc.meta.mode === 'major' ? MAJOR_KEYS : MINOR_KEYS;
        $('#arr-key').replaceChildren(...keys.map(k => new Option(k + (doc.meta.mode === 'minor' ? ' 小调' : ' 大调'), k)));
        if (document.activeElement !== $('#arr-title')) $('#arr-title').value = doc.title;
        $('#arr-tempo').value = doc.meta.tempo; $('#arr-key').value = doc.meta.key; $('#arr-mode').value = doc.meta.mode; $('#arr-meter').value = doc.meta.meter;
        $('#arr-swing').value = doc.meta.swing; $('#arr-swing-value').textContent = doc.meta.swing > 0.5 ? `摇摆 ${Math.round(doc.meta.swing * 100)}%` : '直拍';
        $('#arr-classical').checked = doc.meta.classical;
        const loop = $('#arr-loop'), value = loop.value;
        loop.replaceChildren(new Option('整首一遍', 'once'), new Option('整首循环', 'all'), ...real.sections.map(s => new Option(`循环：${s.name}`, `section:${s.id}`)));
        loop.value = [...loop.options].some(o => o.value === value) ? value : 'once';
    }

    // ---------- timeline ----------
    function miniPreview(events, section) {
        if (!events.length) return '';
        const pitches = events.filter(e => !e.drum).map(e => e.pitch), lo = Math.min(...pitches, 127), hi = Math.max(...pitches, 0);
        const rows = { kick: 17, snare: 10, hat: 3 };
        const rects = events.slice(0, 400).map(e => {
            const x = (e.start - section.start) / section.beats * 100, w = Math.max(0.6, e.beats / section.beats * 100);
            const y = e.drum ? rows[e.drum] : 18 - (hi > lo ? (e.pitch - lo) / (hi - lo) * 16 : 8);
            return `<rect x="${x.toFixed(2)}" y="${y.toFixed(1)}" width="${w.toFixed(2)}" height="2.4"/>`;
        }).join('');
        return `<svg class="arr-mini" viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true">${rects}</svg>`;
    }
    function clipLabel(track, section) {
        const clip = track.clips[section.id];
        if (!clip) return '空';
        if (clip.kind === 'notes') return `手写 · ${clip.events.length} 音`;
        return STYLES[clip.style].name;
    }
    function renderTimeline() {
        const totalBars = Math.round(real.totalBeats / real.bpb);
        const col = s => `grid-column:${Math.round(s.start / real.bpb) + 2} / span ${s.bars}`;
        const cells = [];
        cells.push('<div class="arr-corner">段落</div>');
        for (const s of real.sections) cells.push(`<button class="arr-section${selection?.type === 'section' && selection.id === s.id ? ' selected' : ''}" style="${col(s)}" data-select="section" data-id="${esc(s.id)}">${esc(s.name)} <small>${s.bars} 小节</small></button>`);
        cells.push('<div class="arr-corner">小节</div>');
        for (let b = 0; b < totalBars; b++) cells.push(`<div class="arr-bar-number" style="grid-column:${b + 2}">${b + 1}</div>`);
        cells.push('<div class="arr-lane-label">和弦</div>');
        for (const s of real.sections) {
            const chips = real.chords.filter(c => c.section === s.id).map(c => `<button class="arr-chord fn-${c.fn || 'x'}${selection?.type === 'chord' && selection.id === c.id ? ' selected' : ''}" data-chord="${esc(c.id)}" style="left:${c.at / s.beats * 100}%;width:${c.beats / s.beats * 100}%" title="${esc(`${c.symbol} · ${c.numeral} · ${positionLabel(c.start, real.bpb)}`)}"><strong>${esc(c.symbol)}</strong><small>${esc(c.numeral)}</small></button>`).join('');
            cells.push(`<div class="arr-chord-lane" style="${col(s)};--span:${s.bars}" data-lane="${esc(s.id)}" title="点击空白处添加和弦">${chips}</div>`);
        }
        for (const t of doc.tracks) {
            cells.push(`<button class="arr-track${selection?.type === 'track' && selection.id === t.id ? ' selected' : ''}" data-select="track" data-id="${esc(t.id)}"><strong>${esc(t.name)}</strong><small>${ROLES[t.role]}${t.mute ? ' · 静音' : ''}${t.solo ? ' · 独奏' : ''}</small></button>`);
            for (const s of real.sections) {
                const events = real.events.filter(e => e.trackId === t.id && e.sectionId === s.id), clip = t.clips[s.id];
                const sel = selection?.type === 'clip' && selection.track === t.id && selection.section === s.id;
                cells.push(`<button class="arr-clip${clip ? ` kind-${clip.kind}` : ' empty'}${sel ? ' selected' : ''}${t.mute ? ' muted' : ''}" style="${col(s)}" data-clip="${esc(t.id)}" data-section="${esc(s.id)}"><span>${esc(clipLabel(t, s))}</span>${miniPreview(events, s)}</button>`);
            }
        }
        const timeline = $('#arr-timeline');
        timeline.style.setProperty('--bars', totalBars);
        timeline.innerHTML = cells.join('') + '<div id="arr-playhead" class="arr-playhead" hidden></div>';
    }

    // ---------- inspector ----------
    const sectionById = id => real.sections.find(s => s.id === id);
    const lengthOptions = (max, value) => LENGTHS.filter(l => l <= max + 1e-9 || l === value).map(l => `<option value="${l}"${l === value ? ' selected' : ''}>${LENGTH_NAMES[l]}</option>`).join('');
    const rootOptions = (value, empty) => (empty ? `<option value=""${!value ? ' selected' : ''}>无</option>` : '') + ROOTS.map(r => `<option${r === value ? ' selected' : ''}>${r}</option>`).join('');
    const typeOptions = value => [...new Set(CHORD_TYPES.map(t => t.family))].map(f => `<optgroup label="${f}">${CHORD_TYPES.filter(t => t.family === f).map(t => `<option value="${t.id}"${t.id === value ? ' selected' : ''}>${t.symbol || '（大三）'} · ${t.name}</option>`).join('')}</optgroup>`).join('');
    const posFields = (prefix, at, section) => `<label>小节<input id="${prefix}-bar" type="number" min="1" max="${section.bars}" value="${Math.floor(at / real.bpb) + 1}"></label><label>拍<input id="${prefix}-beat" type="number" min="1" max="${real.bpb + 0.75}" step="0.25" value="${+(at % real.bpb + 1).toFixed(2)}"></label>`;
    const readPos = prefix => (Number($(`#${prefix}-bar`).value) - 1) * real.bpb + Number($(`#${prefix}-beat`).value) - 1;
    const chordFields = c => ({ at: c.at, beats: c.beats, root: c.root, type: c.type, bass: c.bass, inversion: c.inversion, voicing: c.voicing });

    function renderInspector() {
        const box = $('#arr-inspector');
        if (!selection) { box.innerHTML = '<h3>编辑</h3><p class="muted">选择时间线上的和弦、片段、段落或声部。</p>'; return; }
        if (selection.type === 'chord') return chordInspector(box);
        if (selection.type === 'clip') return clipInspector(box);
        if (selection.type === 'section') return sectionInspector(box);
        if (selection.type === 'track') return trackInspector(box);
    }
    function chordInspector(box) {
        const c = doc.chords.find(x => x.id === selection.id);
        if (!c) { selection = null; return renderInspector(); }
        const s = sectionById(c.section), r = real.chords.find(x => x.id === c.id), voiced = voiceChord(c, {});
        box.innerHTML = `<div class="row"><h3>和弦 · ${esc(r.symbol)}</h3><span class="eyebrow">${esc(r.numeral)}${r.fn ? ` · ${{ T: '主功能', S: '下属功能', D: '属功能' }[r.fn]}` : ''}</span></div>
            <div class="arr-form"><label>根音<select id="ch-root">${rootOptions(c.root)}</select></label><label>性质<select id="ch-type">${typeOptions(c.type)}</select></label>
            <label>转位<select id="ch-inversion">${[0, 1, 2, 3].map(i => `<option value="${i}"${i === c.inversion ? ' selected' : ''}>${['原位', '第一转位', '第二转位', '第三转位'][i]}</option>`).join('')}</select></label>
            <label>配置<select id="ch-voicing">${Object.entries(VOICINGS).map(([k, v]) => `<option value="${k}"${k === c.voicing ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
            <label>低音（斜线和弦）<select id="ch-bass">${rootOptions(c.bass, true)}</select></label>
            ${posFields('ch', c.at, s)}<label>时值<select id="ch-beats">${lengthOptions(s.beats - c.at, c.beats)}</select></label></div>
            ${keyboardSVG(voiced.notes)}<p class="muted">${voiced.notes.map(n => esc(voiced.spellings[n])).join(' · ')}</p>
            <div class="button-row"><button id="ch-listen">试听</button><button id="ch-split">拆成两半</button><button id="ch-delete">删除和弦</button></div>`;
        const change = () => {
            const at = readPos('ch'), beats = Number($('#ch-beats').value);
            const next = { at, beats, root: $('#ch-root').value, type: $('#ch-type').value, bass: $('#ch-bass').value || null, inversion: Number($('#ch-inversion').value), voicing: $('#ch-voicing').value };
            if (commit([{ type: 'setChords', section: c.section, from: Math.min(c.at, at), to: Math.min(s.beats, Math.max(c.at + c.beats, at + beats)), chords: [next] }])) selectChordAt(c.section, at);
        };
        for (const id of ['ch-root', 'ch-type', 'ch-inversion', 'ch-voicing', 'ch-bass', 'ch-beats', 'ch-bar', 'ch-beat']) $('#' + id).onchange = change;
        $('#ch-listen').onclick = () => listen(c);
        $('#ch-split').onclick = () => { const half = Math.max(0.25, Math.round(c.beats / 2 * 4) / 4); if (half >= c.beats) return notify('这个和弦已经短到不能再拆。'); commit([{ type: 'setChords', section: c.section, from: c.at, to: c.at + c.beats, chords: [{ ...chordFields(c), beats: half }, { ...chordFields(c), at: c.at + half, beats: c.beats - half }] }]); };
        $('#ch-delete').onclick = () => { if (commit([{ type: 'setChords', section: c.section, from: c.at, to: c.at + c.beats, chords: [] }])) { selection = null; renderInspector(); } };
    }
    function selectChordAt(section, at) { const c = doc.chords.find(x => x.section === section && Math.abs(x.at - at) < 1e-6); selection = c ? { type: 'chord', id: c.id } : null; renderTimeline(); renderInspector(); }
    async function listen(c) {
        try {
            stop(); await audio.init();
            const { notes } = voiceChord(c, {}), bass = rootPC(c.bass || c.root) + 36;
            for (const n of [bass, ...notes]) { await audio.load(n); const id = audio.noteOn(n, 78); if (id) setTimeout(() => audio.release(id, undefined, true), 1400); }
        } catch (e) { notify(e.message); }
    }
    function clipInspector(box) {
        const t = doc.tracks.find(x => x.id === selection.track), s = sectionById(selection.section);
        if (!t || !s) { selection = null; return renderInspector(); }
        const clip = t.clips[s.id], styles = stylesForRole(t.role);
        const kind = clip?.kind || 'none';
        let body = '';
        if (clip?.kind === 'style') {
            const spec = STYLES[clip.style].params;
            body = `<div class="arr-form"><label>伴奏型<select id="clip-style">${styles.map(x => `<option value="${x.id}"${x.id === clip.style ? ' selected' : ''}>${x.name}</option>`).join('')}</select></label>
                ${Object.entries(spec).map(([k, p]) => p.type === 'number' ? `<label>${p.label}<input data-param="${k}" type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${clip.params[k]}"><span class="arr-value">${clip.params[k]}</span></label>`
                    : p.type === 'enum' ? `<label>${p.label}<select data-param="${k}">${Object.entries(p.values).map(([v, n]) => `<option value="${v}"${v === clip.params[k] ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`
                    : `<label class="check"><input data-param="${k}" type="checkbox"${clip.params[k] ? ' checked' : ''}>${p.label}</label>`).join('')}</div>
                <div class="button-row"><button id="clip-seed">换一种变化（第 ${clip.seed} 种）</button>${t.role !== 'drums' ? '<button id="clip-to-notes">转为手写音符</button>' : ''}</div>`;
        } else if (clip?.kind === 'notes') {
            const events = clip.events, sel = events.find(e => e.id === selection.note);
            body = `<div class="arr-notes"><table><thead><tr><th>位置</th><th>音</th><th>时值</th><th>力度</th></tr></thead><tbody>${events.map(e => `<tr class="${e.id === selection.note ? 'selected' : ''}"><td><button class="link-button" data-note="${esc(e.id)}">${positionLabel(e.at, real.bpb)}</button></td><td>${esc(e.spelling || spellInKey(e.pitch, doc.meta.key, doc.meta.mode))}</td><td>${LENGTH_NAMES[e.beats] || `${e.beats} 拍`}</td><td>${e.vel}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">还没有音符。</td></tr>'}</tbody></table></div>
                <div class="arr-form"><label>音名<input id="note-name" type="text" value="${esc(sel ? sel.spelling || spellInKey(sel.pitch, doc.meta.key, doc.meta.mode) : spellInKey(72 + (rootPC(doc.meta.key) % 12) - 12, doc.meta.key, doc.meta.mode))}" placeholder="如 E♭4、F#3" autocomplete="off"></label>
                ${posFields('note', sel ? sel.at : 0, s)}<label>时值<select id="note-beats">${lengthOptions(s.beats, sel ? sel.beats : 1)}</select></label><label>力度<input id="note-vel" type="number" min="1" max="127" value="${sel ? sel.vel : 84}"></label></div>
                <div class="button-row"><button id="note-add" class="primary">添加音符</button>${sel ? '<button id="note-update">修改所选</button><button id="note-remove">删除所选</button>' : ''}</div>`;
        }
        box.innerHTML = `<div class="row"><h3>${esc(t.name)} · ${esc(s.name)}</h3><span class="eyebrow">${ROLES[t.role]}</span></div>
            <fieldset class="arr-kind"><legend>片段内容</legend><label><input type="radio" name="clip-kind" value="none"${kind === 'none' ? ' checked' : ''}>空</label>${styles.length ? `<label><input type="radio" name="clip-kind" value="style"${kind === 'style' ? ' checked' : ''}>伴奏型</label>` : ''}${t.role !== 'drums' ? `<label><input type="radio" name="clip-kind" value="notes"${kind === 'notes' ? ' checked' : ''}>手写音符</label>` : ''}</fieldset>${body}`;
        for (const input of box.querySelectorAll('input[name="clip-kind"]')) input.onchange = () => {
            const ops = input.value === 'none' ? [{ type: 'clearClip', track: t.id, section: s.id }] : input.value === 'style' ? [{ type: 'setClipStyle', track: t.id, section: s.id, style: styles[0].id }] : [{ type: 'setClipNotes', track: t.id, section: s.id, events: [] }];
            commit(ops);
        };
        if (clip?.kind === 'style') {
            $('#clip-style').onchange = () => commit([{ type: 'setClipStyle', track: t.id, section: s.id, style: $('#clip-style').value, params: {} }]);
            for (const input of box.querySelectorAll('[data-param]')) input.onchange = () => {
                const params = { ...clip.params }, spec = STYLES[clip.style].params[input.dataset.param];
                params[input.dataset.param] = spec.type === 'number' ? Number(input.value) : spec.type === 'boolean' ? input.checked : input.value;
                commit([{ type: 'setClipStyle', track: t.id, section: s.id, style: clip.style, params: normalizeParams(clip.style, params, t.role) }]);
            };
            $('#clip-seed').onclick = () => commit([{ type: 'setClipStyle', track: t.id, section: s.id, style: clip.style, seed: clip.seed + 1 }]);
            if ($('#clip-to-notes')) $('#clip-to-notes').onclick = () => {
                const events = real.events.filter(e => e.trackId === t.id && e.sectionId === s.id).map(e => ({ at: e.start - s.start, beats: e.beats, pitch: e.pitch, spelling: e.spelling, vel: e.vel }));
                commit([{ type: 'setClipNotes', track: t.id, section: s.id, events }]);
            };
        }
        if (clip?.kind === 'notes') {
            const plain = clip.events.map(({ at, beats, pitch, spelling, vel }) => ({ at, beats, pitch, spelling, vel }));
            for (const b of box.querySelectorAll('[data-note]')) b.onclick = () => { selection = { ...selection, note: b.dataset.note }; renderInspector(); highlightEvents([b.dataset.note]); };
            const read = () => {
                const parsed = parseSpelling($('#note-name').value);
                if (!parsed) { notify('音名格式如 E♭4、Eb4 或 F#3，须在钢琴音域内。'); return null; }
                return { at: readPos('note'), beats: Number($('#note-beats').value), pitch: parsed.pitch, spelling: parsed.spelling, vel: Math.round(Number($('#note-vel').value)) };
            };
            const index = clip.events.findIndex(e => e.id === selection.note);
            const reselect = note => { const e = doc.tracks.find(x => x.id === t.id).clips[s.id]?.events.find(x => Math.abs(x.at - note.at) < 1e-6 && x.pitch === note.pitch); selection = { ...selection, note: e?.id }; renderInspector(); };
            $('#note-add').onclick = () => { const note = read(); if (note && commit([{ type: 'setClipNotes', track: t.id, section: s.id, events: [...plain, note] }])) reselect(note); };
            if ($('#note-update')) $('#note-update').onclick = () => { const note = read(); if (note && commit([{ type: 'setClipNotes', track: t.id, section: s.id, events: plain.map((e, i) => i === index ? note : e) }])) reselect(note); };
            if ($('#note-remove')) $('#note-remove').onclick = () => { if (commit([{ type: 'setClipNotes', track: t.id, section: s.id, events: plain.filter((_, i) => i !== index) }])) { selection = { ...selection, note: null }; renderInspector(); } };
        }
    }
    function sectionInspector(box) {
        const s = sectionById(selection.id);
        if (!s) { selection = null; return renderInspector(); }
        const index = doc.sections.findIndex(x => x.id === s.id);
        box.innerHTML = `<div class="row"><h3>段落 · ${esc(s.name)}</h3><span class="eyebrow">${positionLabel(s.start, real.bpb)} 起</span></div>
            <div class="arr-form"><label>名称<input id="sec-name" type="text" maxlength="40" value="${esc(s.name)}"></label><label>小节数<input id="sec-bars" type="number" min="1" max="64" value="${s.bars}"></label>
            <label>按进行填充和弦<select id="sec-progression"><option value="">选择和弦进行…</option>${PROGRESSIONS.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label></div>
            <div class="button-row"><button id="sec-left"${index === 0 ? ' disabled' : ''}>前移</button><button id="sec-right"${index === doc.sections.length - 1 ? ' disabled' : ''}>后移</button><button id="sec-copy">复制段落</button><button id="sec-down">本段移调 −1</button><button id="sec-up">本段移调 +1</button><button id="sec-delete"${doc.sections.length === 1 ? ' disabled' : ''}>删除段落</button></div>`;
        $('#sec-name').onchange = () => commit([{ type: 'renameSection', section: s.id, name: $('#sec-name').value.trim() || s.name }]);
        $('#sec-bars').onchange = () => { const bars = Math.round(Number($('#sec-bars').value)); if (bars >= 1 && bars <= 64) commit([{ type: 'resizeSection', section: s.id, bars }]); else notify('每段 1–64 小节。'); };
        $('#sec-progression').onchange = () => {
            const p = PROGRESSIONS.find(x => x.id === $('#sec-progression').value); if (!p) return;
            const key = doc.meta.key, chords = Array.from({ length: s.bars }, (_, i) => { const step = p.steps[i % p.steps.length]; return { at: i * real.bpb, beats: real.bpb, root: spellPitch(key, step.degree, 60 + rootPC(key) + step.offset).replace(/-?\d+$/, ''), type: step.type }; });
            commit([{ type: 'setChords', section: s.id, from: 0, to: s.beats, chords }]);
        };
        $('#sec-left').onclick = () => commit([{ type: 'moveSection', section: s.id, index: index - 1 }]);
        $('#sec-right').onclick = () => commit([{ type: 'moveSection', section: s.id, index: index + 1 }]);
        $('#sec-copy').onclick = () => commit([{ type: 'addSection', name: `${s.name} 反复`.slice(0, 40), bars: s.bars, after: s.id, copyFrom: s.id }]);
        $('#sec-down').onclick = () => commit([{ type: 'transpose', semitones: -1, section: s.id }]);
        $('#sec-up').onclick = () => commit([{ type: 'transpose', semitones: 1, section: s.id }]);
        $('#sec-delete').onclick = () => { if (!confirm(`删除段落“${s.name}”及其中的和弦与片段？可以用撤销恢复。`)) return; if (commit([{ type: 'removeSection', section: s.id }])) { selection = null; renderInspector(); } };
    }
    function trackInspector(box) {
        const t = doc.tracks.find(x => x.id === selection.id);
        if (!t) { selection = null; return renderInspector(); }
        box.innerHTML = `<div class="row"><h3>声部 · ${esc(t.name)}</h3><span class="eyebrow">${ROLES[t.role]}</span></div>
            <div class="arr-form"><label>名称<input id="trk-name" type="text" maxlength="40" value="${esc(t.name)}"></label>
            <label>类型<select id="trk-role">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}"${k === t.role ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
            <label>导出音色<select id="trk-instrument">${INSTRUMENT_IDS.map(i => `<option value="${i}"${i === t.instrument ? ' selected' : ''}>${INSTRUMENTS[i].name}</option>`).join('')}</select></label>
            <label>音量<input id="trk-volume" type="range" min="0" max="1" step="0.05" value="${t.volume}"></label>
            <label class="check"><input id="trk-mute" type="checkbox"${t.mute ? ' checked' : ''}>静音</label><label class="check"><input id="trk-solo" type="checkbox"${t.solo ? ' checked' : ''}>独奏</label></div>
            <p class="muted">改变类型时，新类型用不了的伴奏型片段会被清空。导出音色写入 MIDI 与 Strudel；本站播放统一使用底栏音色。</p>
            <div class="button-row"><button id="trk-delete">删除声部</button></div>`;
        const set = patch => commit([{ type: 'setTrack', track: t.id, ...patch }]);
        $('#trk-name').onchange = () => set({ name: $('#trk-name').value.trim() || t.name });
        $('#trk-role').onchange = () => set({ role: $('#trk-role').value });
        $('#trk-instrument').onchange = () => set({ instrument: $('#trk-instrument').value });
        $('#trk-volume').onchange = () => set({ volume: Number($('#trk-volume').value) });
        $('#trk-mute').onchange = () => set({ mute: $('#trk-mute').checked });
        $('#trk-solo').onchange = () => set({ solo: $('#trk-solo').checked });
        $('#trk-delete').onclick = () => { if (!confirm(`删除声部“${t.name}”？可以用撤销恢复。`)) return; if (commit([{ type: 'removeTrack', track: t.id }])) { selection = null; renderInspector(); } };
    }

    // ---------- staff, checks, Strudel ----------
    function renderStaff() {
        clearTimeout(renderTimer);
        renderTimer = setTimeout(async () => {
            const generation = ++renderGeneration;
            compiled = compileABC(real, doc, { mode: $('#arr-staff-mode').value });
            try {
                await loadABC(); if (generation !== renderGeneration) return;
                const sheet = $('#arr-sheet');
                const tunes = window.ABCJS.renderAbc('arr-sheet', compiled.abc, { add_classes: true, responsive: 'resize', staffwidth: Math.max(320, sheet.clientWidth - 50), paddingleft: 20, paddingright: 20, clickListener: abcelem => selectFromStaff(abcelem) });
                visual = tunes[0] || null; highlight = '';
                $('#arr-export-midi').disabled = !visual;
                $('#arr-staff-status').textContent = `${Math.round(real.totalBeats / real.bpb)} 小节 · ${compiled.voices.length} 行谱表 · ${real.events.filter(e => !e.drum).length} 个音`;
            } catch (e) { $('#arr-staff-status').textContent = e.message; $('#arr-export-midi').disabled = true; }
        }, 220);
    }
    // abcjs ranges can include a note's annotations and a leading space, so match by containment.
    const idsInRange = (from, to) => Object.entries(compiled.map).filter(([, [start]]) => start >= from && start < to).map(([id]) => id);
    function selectFromStaff(abcelem) {
        const ids = idsInRange(abcelem.startChar, abcelem.endChar); if (!ids.length) return;
        const e = real.events.find(x => x.id === ids[0]); if (!e) return;
        selection = e.generated ? { type: 'clip', track: e.trackId, section: e.sectionId } : { type: 'clip', track: e.trackId, section: e.sectionId, note: e.id };
        renderTimeline(); renderInspector(); highlightEvents(ids);
        $('#arr-inspector').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    function highlightEvents(ids) {
        const starts = new Set(ids.map(id => compiled.map[id]?.[0]).filter(v => v !== undefined)), key = [...starts].join(',');
        if (key === highlight) return; highlight = key;
        highlightStarts(visual, $('#arr-sheet'), starts);
    }
    function renderChecks() {
        const issues = checkArrangement(real, doc), list = $('#arr-checks');
        list.innerHTML = issues.length ? issues.map((i, n) => `<li class="level-${i.level}"><span class="arr-level">${{ error: '错误', warning: '注意', info: '提示' }[i.level]}</span><button class="link-button" data-issue="${n}">${esc(i.message)}</button></li>`).join('') : '<li class="level-ok">没有发现问题。</li>';
        for (const b of list.querySelectorAll('[data-issue]')) b.onclick = () => {
            const issue = issues[Number(b.dataset.issue)];
            if (issue.trackId) { const e = real.events.find(x => issue.eventIds?.includes(x.id)); selection = { type: 'clip', track: issue.trackId, section: e?.sectionId || real.sections[0].id, note: e && !e.generated ? e.id : undefined }; }
            else if (issue.sectionId) selection = { type: 'section', id: issue.sectionId };
            renderTimeline(); renderInspector(); if (issue.eventIds) highlightEvents(issue.eventIds);
        };
    }
    let strudelCode = '';
    function renderStrudel() { const next = compileStrudel(real, doc); if (next === strudelCode) return; strudelCode = next; $('#arr-strudel').textContent = strudelCode; sandboxResend(); }

    function refresh() {
        real = realize(doc);
        renderLibrary(); renderMeta(); renderTimeline(); renderInspector(); renderChecks(); renderStrudel(); renderStaff(); renderVibe();
        if (playing) player.update(regionNotes(), { tempo: doc.meta.tempo, length: playing.length, loop: playing.loop });
    }

    // ---------- playback ----------
    function region() {
        const value = $('#arr-loop').value;
        if (value.startsWith('section:')) { const s = sectionById(value.slice(8)); if (s) return { from: s.start, to: s.start + s.beats, loop: true }; }
        return { from: 0, to: real.totalBeats, loop: value === 'all' };
    }
    function regionNotes() { const r = region(); playing && Object.assign(playing, { from: r.from, length: r.to - r.from, loop: r.loop }); return playbackNotes(real, doc, r); }
    async function play() {
        stopAll(); const r = region();
        playing = { from: r.from, length: r.to - r.from, loop: r.loop };
        $('#arr-play').disabled = true; $('#arr-stop').disabled = false; $('#arr-time').textContent = '正在加载音色…';
        try {
            await player.play(playbackNotes(real, doc, r), { tempo: doc.meta.tempo, length: playing.length, loop: r.loop, onTime: beat => tickView(beat), onEnd: () => { stop(); $('#arr-time').textContent = '播放完成'; } });
        } catch (e) { stop(); notify(e.message); }
    }
    function tickView(beat) { if (playing) showPosition(playing.from + beat); }
    // Shared by the site's player and the Strudel sandbox: time label, staff, playhead and chord lane.
    function showPosition(absolute) {
        $('#arr-time').textContent = `${positionLabel(absolute, real.bpb)} · ${Math.floor(absolute / real.bpb) + 1}/${Math.round(real.totalBeats / real.bpb)} 小节`;
        highlightEvents(real.events.filter(e => !e.drum && e.start <= absolute + 1e-6 && e.start + e.beats > absolute + 1e-6).map(e => e.id));
        const head = $('#arr-playhead'), timeline = $('#arr-timeline'), first = timeline.querySelector('.arr-bar-number');
        if (head && first) {
            const left = first.offsetLeft, width = timeline.scrollWidth - left;
            head.hidden = false; head.style.left = `${left + absolute / real.totalBeats * width}px`;
        }
        const chord = real.chords.find(c => c.start <= absolute + 1e-6 && c.start + c.beats > absolute + 1e-6);
        timeline.querySelectorAll('.arr-chord.playing').forEach(el => { if (el.dataset.chord !== chord?.id) el.classList.remove('playing'); });
        if (chord) timeline.querySelector(`.arr-chord[data-chord="${CSS.escape(chord.id)}"]`)?.classList.add('playing');
    }
    function clearPosition() {
        const head = $('#arr-playhead'); if (head) head.hidden = true;
        document.querySelectorAll('#arr-timeline .arr-chord.playing').forEach(el => el.classList.remove('playing'));
        highlightEvents([]);
    }

    // ---------- Strudel sandbox: the exported code itself plays here, and its events move the views ----------
    const sandbox = sharedSandbox();
    let sandboxRun = null, resendTimer = 0;
    const sandboxStatus = text => { $('#arr-sandbox-status').textContent = text; };
    function sandboxBusy(on) { $('#arr-sandbox-play').disabled = on; $('#arr-sandbox-stop').disabled = !on; }
    sandbox.subscribe(message => {
        if (message.type === 'status' && sandboxRun) sandboxStatus(message.message);
        if (!sandboxRun || (message.id !== undefined && message.id !== null && message.id !== sandboxRun.id)) return;
        if (message.type === 'hap') {
            const run = sandboxRun, beat = cycleToBeat(message.cycle, run.bars, run.bpb);
            const timer = setTimeout(() => { run.timers.delete(timer); if (sandboxRun === run) showPosition(beat); }, Math.max(0, message.delay * 1000));
            run.timers.add(timer);
        }
        if (message.type === 'error') sandboxStatus(`Strudel 报错：${message.message}`);
        if (message.type === 'log') sandboxStatus(message.message);
    });
    async function sandboxPlay() {
        stopAll();
        const run = { id: `arr-${Date.now().toString(36)}`, bars: Math.round(real.totalBeats / real.bpb), bpb: real.bpb, timers: new Set() };
        sandboxRun = run; sandboxBusy(true); sandboxStatus('正在启动 Strudel 沙箱…');
        try {
            await sandbox.play(strudelCode, run.id, { online: $('#arr-sandbox-online').checked, instrument: audio.instrument });
            if (sandboxRun === run) sandboxStatus('Strudel 正在沙箱里演奏这段代码；五线谱与时间线跟随它前进。');
        } catch (e) { if (sandboxRun === run) { sandboxStop(); sandboxStatus(`未能演奏：${e.message}`); } }
    }
    // Edits while the sandbox plays are re-evaluated, like pressing update in Strudel's editor.
    function sandboxResend() {
        if (!sandboxRun) return;
        clearTimeout(resendTimer);
        resendTimer = setTimeout(() => {
            if (!sandboxRun) return;
            Object.assign(sandboxRun, { bars: Math.round(real.totalBeats / real.bpb), bpb: real.bpb });
            sandbox.play(strudelCode, sandboxRun.id, { online: $('#arr-sandbox-online').checked, instrument: audio.instrument }).catch(e => sandboxStatus(e.message));
        }, 400);
    }
    function sandboxStop() {
        clearTimeout(resendTimer);
        if (sandboxRun) { for (const t of sandboxRun.timers) clearTimeout(t); sandboxRun = null; sandbox.stop(); sandboxStatus('沙箱演奏已停止。'); clearPosition(); }
        sandboxBusy(false);
    }
    function stop() {
        player.stop(); playing = null;
        $('#arr-play').disabled = false; $('#arr-stop').disabled = true;
        clearPosition(); sandboxStop();
    }

    // ---------- events ----------
    $('#arr-template').replaceChildren(...Object.entries(TEMPLATES).map(([id, t]) => new Option(t.name, id)), ...PROGRESSIONS.map(p => new Option(`和弦工坊：${p.name}`, `progression:${p.id}`)));
    $('#arr-new').onclick = () => { if (previewGuard()) return; if (store.arrangements.length >= LIMITS.docs) return notify(`最多保存 ${LIMITS.docs} 份编曲。`); openDoc(createFromTemplate($('#arr-template').value, newDocId())); persist(); renderLibrary(); };
    $('#arr-duplicate').onclick = () => { if (previewGuard()) return; if (store.arrangements.length >= LIMITS.docs) return notify(`最多保存 ${LIMITS.docs} 份编曲。`); openDoc(validateDocument({ ...JSON.parse(JSON.stringify(doc)), id: newDocId(), title: `${doc.title}（副本）`.slice(0, 100) })); persist(); renderLibrary(); };
    $('#arr-delete').onclick = () => {
        if (previewGuard()) return;
        if (!saved || !confirm(`删除编曲“${doc.title}”？此操作不能撤销，建议先导出 JSON。`)) return;
        const arrangements = store.arrangements.filter(a => a.id !== doc.id), next = { version: 1, active: arrangements[0]?.id || '', arrangements };
        const error = blocked ? '存档不可读，暂停保存' : saveStore(storage, next); if (error) return notify(error);
        store = next; saved = arrangements.length > 0; openDoc(arrangements[0] || createFromTemplate('pop', DEMO_ID));
    };
    $('#arr-select').onchange = () => { if (previewGuard()) { $('#arr-select').value = doc.id; return; } const next = store.arrangements.find(a => a.id === $('#arr-select').value); if (next) { openDoc(next); persist(); } };
    $('#arr-undo').onclick = () => travel(past, future);
    $('#arr-redo').onclick = () => travel(future, past);
    $('#arr-title').onchange = () => { const title = $('#arr-title').value.trim(); if (title) commit([{ type: 'setMeta', title }]); else $('#arr-title').value = doc.title; };
    $('#arr-tempo').onchange = () => { const tempo = Math.round(Number($('#arr-tempo').value)); if (tempo >= 40 && tempo <= 200) commit([{ type: 'setMeta', tempo }]); else { notify('速度须在 40–200 BPM 之间。'); $('#arr-tempo').value = doc.meta.tempo; } };
    $('#arr-key').onchange = () => commit([{ type: 'setMeta', key: $('#arr-key').value }]);
    $('#arr-mode').onchange = () => { const mode = $('#arr-mode').value, keys = mode === 'major' ? MAJOR_KEYS : MINOR_KEYS; commit([{ type: 'setMeta', mode, key: keys[rootPC(doc.meta.key)] }]); };
    $('#arr-meter').onchange = () => { if (confirm('改变拍号会保留小节数，超出新小节长度的和弦与音符将被截短。继续？')) commit([{ type: 'setMeta', meter: $('#arr-meter').value }]); else $('#arr-meter').value = doc.meta.meter; };
    $('#arr-swing').oninput = () => { $('#arr-swing-value').textContent = Number($('#arr-swing').value) > 0.5 ? `摇摆 ${Math.round(Number($('#arr-swing').value) * 100)}%` : '直拍'; };
    $('#arr-swing').onchange = () => commit([{ type: 'setMeta', swing: Number($('#arr-swing').value) }]);
    $('#arr-classical').onchange = () => commit([{ type: 'setMeta', classical: $('#arr-classical').checked }]);
    $('#arr-transpose-down').onclick = () => commit([{ type: 'transpose', semitones: -1 }]);
    $('#arr-transpose-up').onclick = () => commit([{ type: 'transpose', semitones: 1 }]);
    $('#arr-add-section').onclick = () => { const last = doc.sections.at(-1); if (commit([{ type: 'addSection', name: `段落 ${doc.sections.length + 1}`, bars: 4, after: last.id }])) { selection = { type: 'section', id: doc.sections.at(-1).id }; renderTimeline(); renderInspector(); } };
    $('#arr-add-track').onclick = () => { if (commit([{ type: 'addTrack', role: 'comp', name: `声部 ${doc.tracks.length + 1}` }])) { selection = { type: 'track', id: doc.tracks.at(-1).id }; renderTimeline(); renderInspector(); } };
    $('#arr-timeline').addEventListener('click', e => {
        const chord = e.target.closest('[data-chord]'), clip = e.target.closest('[data-clip]'), pick = e.target.closest('[data-select]'), lane = e.target.closest('[data-lane]');
        if (chord) selection = { type: 'chord', id: chord.dataset.chord };
        else if (clip) selection = { type: 'clip', track: clip.dataset.clip, section: clip.dataset.section };
        else if (pick) selection = { type: pick.dataset.select, id: pick.dataset.id };
        else if (lane) {
            const s = sectionById(lane.dataset.lane), rect = lane.getBoundingClientRect();
            const at = Math.min(s.beats - 1, Math.floor((e.clientX - rect.left) / rect.width * s.beats));
            const taken = real.chords.filter(c => c.section === s.id), next = taken.find(c => c.at > at);
            if (taken.some(c => c.at <= at && c.at + c.beats > at)) return;
            const beats = Math.min(real.bpb - at % real.bpb, (next ? next.at : s.beats) - at);
            const chord = { at, beats, root: doc.meta.key, type: doc.meta.mode === 'minor' ? 'minor' : 'major' };
            if (commit([{ type: 'setChords', section: s.id, from: at, to: at + beats, chords: [chord] }])) selectChordAt(s.id, at);
            return;
        } else return;
        renderTimeline(); renderInspector();
    });
    $('#arr-staff-mode').onchange = renderStaff;
    $('#arr-play').onclick = () => void play();
    $('#arr-stop').onclick = stop;
    $('#arr-loop').onchange = () => { if (playing) { stop(); void play(); } };
    $('#arr-sandbox-play').onclick = () => void sandboxPlay();
    $('#arr-sandbox-stop').onclick = stop;
    $('#arr-sandbox-online').onchange = () => { if (sandboxRun) { stop(); void sandboxPlay(); } };
    $('#arr-copy-strudel').onclick = async () => {
        try { await navigator.clipboard.writeText(strudelCode); notify('Strudel 代码已复制。'); }
        catch { const range = document.createRange(); range.selectNodeContents($('#arr-strudel')); getSelection().removeAllRanges(); getSelection().addRange(range); notify('浏览器不允许自动复制，已选中代码，请按 Ctrl/⌘+C。'); }
    };
    $('#arr-open-strudel').onclick = () => { try { window.open(strudelURL(strudelCode), '_blank', 'noopener,noreferrer'); } catch (e) { notify(e.message); } };
    $('#arr-to-live').onclick = () => { if (strudelCode.length > MAX_SOURCE) return notify('代码超过 40000 字符，请缩短编曲后再存入。'); stop(); creative.importLive(strudelCode, doc.title); };
    $('#arr-to-score').onclick = () => { stop(); creative.importScore(compileABC(real, doc, { mode: 'score' }).abc); };
    $('#arr-export-midi').onclick = () => { if (!visual) return; try { download(window.ABCJS.synth.getMidiFile(visual, { midiOutputType: 'binary', chordsOff: true }), `${filename(doc.title)}.mid`, 'audio/midi'); } catch (e) { notify('MIDI 导出失败：' + e.message); } };
    $('#arr-export-json').onclick = () => download(JSON.stringify(doc, null, 2), `${filename(doc.title)}.arrangement.json`, 'application/json');
    $('#arr-import').onchange = async e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file || previewGuard()) return;
        try {
            if (file.size > LIMITS.docBytes * 2) throw new Error('文件过大。');
            if (store.arrangements.length >= LIMITS.docs) throw new Error(`最多保存 ${LIMITS.docs} 份编曲。`);
            const incoming = validateDocument(JSON.parse(await file.text()));
            openDoc(store.arrangements.some(a => a.id === incoming.id) ? { ...incoming, id: newDocId() } : incoming); persist(); renderLibrary();
            notify(`已导入编曲“${incoming.title}”。`);
        } catch (error) { notify('未导入：' + error.message); }
    };
    window.addEventListener('storage', e => {
        if (e.key !== ARRANGE_KEY) return;
        const next = loadStore(storage);
        if (next.blocked) { blocked = true; warning('另一个页面写入了无法识别的编曲存档；已暂停保存，请先备份。'); return; }
        store = next.store; blocked = false; warning('');
        if (preview) return;
        const same = store.arrangements.find(a => a.id === doc.id);
        if (same) { doc = same; saved = true; } refresh();
    });


    // ---------- vibe arrangement (administrator AI; the card exists only when the AI is enabled) ----------
    const PROPOSAL_KEY = 'hive-music-arrange-proposal';
    const tabStore = (() => { try { return window.sessionStorage; } catch { return null; } })();
    function saveProposal() { try { if (proposal) tabStore?.setItem(PROPOSAL_KEY, JSON.stringify(proposal)); else tabStore?.removeItem(PROPOSAL_KEY); } catch { /* the proposal stays in memory */ } }
    try { const kept = JSON.parse(tabStore?.getItem(PROPOSAL_KEY) || 'null'); if (kept && typeof kept.arrangementId === 'string' && Array.isArray(kept.ops)) proposal = kept; } catch { /* no kept proposal */ }
    const vibeStatus = (text, bad = false) => { const el = $('#arr-vibe-status'); if (el) { el.textContent = text; el.classList.toggle('bad', bad); } };
    const selectedOps = () => proposal.ops.filter((_, i) => proposal.selected[i] !== false);
    function renderVibe() {
        document.querySelector('.arr-board')?.classList.toggle('arr-previewing', Boolean(preview));
        if (!$('#arr-vibe')) return;
        const scope = $('#arr-vibe-scope'), value = scope.value, base = preview ? preview.original : doc;
        scope.replaceChildren(new Option('整首', ''), ...base.sections.map(s => new Option(`段落：${s.name}`, `section:${s.id}`)), ...base.tracks.map(t => new Option(`声部：${t.name}`, `track:${t.id}`)));
        scope.value = [...scope.options].some(o => o.value === value) ? value : '';
        const box = $('#arr-proposal');
        if (!proposal) { box.hidden = true; box.replaceChildren(); return; }
        box.hidden = false;
        if (proposal.arrangementId !== base.id) {
            const other = store.arrangements.find(a => a.id === proposal.arrangementId);
            box.innerHTML = `<p class="muted">有一份未处理的提案属于${other ? `编曲“${esc(other.title)}”，切换过去即可查看` : '一份已不存在的编曲'}。</p><div class="button-row"><button id="arr-discard">放弃提案</button></div>`;
            $('#arr-discard').onclick = discard; return;
        }
        const describe = op => { try { return describeOp(op, base); } catch { return op.type; } };
        box.innerHTML = `<div class="row"><h4>AI 提案</h4><span class="eyebrow">${proposal.ops.length} 项修改</span></div>
            <p class="arr-summary">${esc(proposal.summary)}</p><p id="arr-proposal-stale" class="arr-stale" hidden>编曲在提案生成后改动过。接受时会逐条尝试，与现有内容冲突的修改会被跳过。</p>
            <ol class="arr-ops">${proposal.ops.map((op, i) => `<li><label class="check"><input type="checkbox" data-op="${i}"${proposal.selected[i] !== false ? ' checked' : ''}><span>${esc(describe(op))}</span></label>${op.reason ? `<small>${esc(op.reason)}</small>` : ''}</li>`).join('')}</ol>
            <div class="button-row"><button id="arr-preview">${preview ? '退出预览' : '预览所选'}</button><button id="arr-accept" class="primary">接受所选</button><button id="arr-discard">放弃提案</button></div>`;
        docHash(base).then(hash => { const el = $('#arr-proposal-stale'); if (el) el.hidden = hash === proposal?.baseHash; });
        for (const box of document.querySelectorAll('#arr-proposal [data-op]')) box.onchange = () => { proposal.selected[Number(box.dataset.op)] = box.checked; saveProposal(); if (preview) enterPreview(); };
        $('#arr-preview').onclick = () => preview ? exitPreview() : enterPreview();
        $('#arr-accept').onclick = accept;
        $('#arr-discard').onclick = discard;
    }
    function enterPreview() {
        const base = preview ? preview.original : doc, result = applySelected(base, selectedOps());
        if (!result.applied.length) { vibeStatus('所选修改都无法应用到当前编曲。', true); return; }
        stop(); preview = { original: base }; doc = result.doc; selection = null; refresh();
        vibeStatus(`正在预览 ${result.applied.length} 项修改${result.skipped.length ? `，${result.skipped.length} 项与当前编曲冲突已跳过` : ''}。预览可以播放，但不会保存。`);
    }
    function exitPreview() { if (!preview) return; stop(); doc = preview.original; preview = null; selection = null; refresh(); vibeStatus('已退出预览，编曲没有改动。'); }
    function accept() {
        const base = preview ? preview.original : doc, result = applySelected(base, selectedOps());
        if (!result.applied.length) { vibeStatus('所选修改都无法应用到当前编曲。', true); return; }
        stop(); preview = null; past.push(base); if (past.length > 100) past.shift(); future = [];
        doc = result.doc; proposal = null; saveProposal(); selection = null; persist(); refresh();
        vibeStatus(`已接受 ${result.applied.length} 项修改${result.skipped.length ? `；跳过 ${result.skipped.length} 项：${result.skipped.map(x => x.error).join('；')}` : ''}。可以用“撤销”一步恢复。`, result.skipped.length > 0);
    }
    function discard() { if (preview) { stop(); doc = preview.original; preview = null; } proposal = null; saveProposal(); selection = null; refresh(); vibeStatus('已放弃提案，编曲没有改动。'); }
    function handleResult(result, arrangementId) {
        if (!$('#arr-vibe')) return;
        $('#arr-vibe-go').disabled = false; $('#arr-vibe-retry').hidden = result?.status !== 'pending';
        if (!result) { vibeStatus(''); return; }
        if (result.status !== 'done') { vibeStatus(result.error, true); return; }
        proposal = { arrangementId, summary: result.proposal.summary, ops: result.proposal.ops, baseHash: result.proposal.baseHash, selected: result.proposal.ops.map(() => true) };
        saveProposal(); renderVibe();
        vibeStatus(result.proposal.recovered ? '已取回之前生成的提案。' : '提案已生成：逐条查看，预览后再接受。');
    }
    async function requestProposal() {
        if (!assistant?.isAdmin()) { openAssistant?.(); return; }
        if (previewGuard()) return;
        if (proposal && !confirm('生成新提案会替换当前未处理的提案，继续？')) return;
        const [kind, id] = $('#arr-vibe-scope').value.split(':'), scope = kind === 'section' ? { section: id } : kind === 'track' ? { track: id } : {};
        if (!saved) persist();
        const checks = checkArrangement(real, doc).map(i => i.message), arrangementId = doc.id;
        $('#arr-vibe-go').disabled = true; $('#arr-vibe-retry').hidden = true;
        vibeStatus('正在生成提案，通常需要十几秒到一分钟；刷新页面不会丢失这个请求。');
        let result;
        try { result = await assistant.requestArrangement({ doc, scope, message: $('#arr-vibe-text').value, checks }); }
        catch (error) { result = { status: 'failed', error: error.message }; }
        handleResult(result, arrangementId);
    }
    if ($('#arr-vibe')) {
        $('#arr-vibe-go').onclick = () => void requestProposal();
        $('#arr-vibe-signin').onclick = () => openAssistant?.();
        $('#arr-vibe-retry').onclick = () => {
            const pending = assistant?.pendingArrangement(); if (!pending) return;
            $('#arr-vibe-retry').hidden = true; $('#arr-vibe-go').disabled = true; vibeStatus('正在重试同一请求…');
            void assistant.retryArrangement().then(r => handleResult(r, pending.arrangementId));
        };
    }
    function attachAssistant(api) {
        assistant = api;
        api.onAdminChange(admin => {
            if (!$('#arr-vibe')) return;
            $('#arr-vibe-login').hidden = admin; $('#arr-vibe-form').hidden = !admin;
            const pending = admin && !resumed && api.pendingArrangement();
            if (pending) {
                resumed = true; $('#arr-vibe-go').disabled = true; vibeStatus('正在核对刷新前的提案请求…');
                void api.retryArrangement().then(r => handleResult(r, pending.arrangementId));
            }
        });
    }

    refresh();
    return {
        attachAssistant,
        setAssistantOpener(fn) { openAssistant = fn; },
        show(name) { if (name === 'arrange') { renderStaff(); } },
        stop,
        /** For the progress backup: the stored arrangements, or null when the archive is unreadable. */
        backup: () => blocked ? null : store,
        /** Replaces all arrangements from a backup; the caller has already confirmed the import. */
        restore(raw) {
            const next = validateStore(raw), error = saveStore(storage, next);
            if (error) throw new Error(error);
            store = next; blocked = false; warning(''); preview = null; proposal = null; saveProposal();
            saved = store.arrangements.length > 0; openDoc(store.arrangements.find(a => a.id === store.active) || createFromTemplate('pop', DEMO_ID));
        },
        summary: raw => validateStore(raw).arrangements.length
    };
}
