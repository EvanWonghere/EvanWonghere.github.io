// The detail shown when a scored word is tapped: its sounds, a tip, and buttons to hear the model and your own voice.
import { errorLabel } from './core.mjs';
import { tipFor, phonemeKey, heardAs } from './phoneme-tips.mjs';
import { speak } from './speak.mjs';

const show = score => score === null || score === undefined ? '—' : String(score);
const el = (tag, attrs = {}, ...kids) => { const node = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') node.className = v; else if (k.startsWith('on')) node[k] = v; else node.setAttribute(k, v); } node.append(...kids); return node; };
const BREAK = { unexpected: '前面有一个不自然的停顿。', missing: '前面少了一个该有的停顿。' };
const WEAK = 70;

// Plays a stretch of the 16 kHz WAV that was scored. A WAV seeks reliably; the recorder's own file often does not.
export function createSpanPlayer() {
    let url = '', audio = null, timer = 0;
    const stop = () => { clearTimeout(timer); audio?.pause(); };
    return {
        load(file) { this.release(); url = URL.createObjectURL(file); audio = new Audio(url); },
        play(startMs, durationMs) {
            if (!audio) return;
            stop();
            audio.currentTime = Math.max(0, startMs / 1000 - 0.08);
            audio.play().catch(() => {});
            timer = setTimeout(() => audio?.pause(), durationMs + 160);
        },
        release() { stop(); audio = null; if (url) URL.revokeObjectURL(url); url = ''; },
    };
}

// word: one entry of a parsed result. canReplay: the recording it was scored from is still on this page.
// locale: the accent the word was scored against. The sound tips describe American English only, so other accents get none.
export function renderWordDetail(box, word, { player, canReplay, locale = 'en-US' }) {
    const lines = [`${word.text} · ${errorLabel(word.error) || `准确度 ${show(word.accuracy)}`}`];
    if (word.breakBefore) lines.push(BREAK[word.breakBefore]);
    box.replaceChildren(el('strong', { lang: 'en' }, lines[0]), ...lines.slice(1).map(l => el('div', {}, l)));
    if (word.phonemes.length) {
        box.append(el('div', { class: 'phonemes' }, '音素：', ...word.phonemes.map(p => el('span', { class: p.accuracy !== null && p.accuracy < WEAK ? 'weak' : '' }, `${p.text} ${show(p.accuracy)}`))));
        const worst = locale !== 'en-US' ? null : word.phonemes.filter(p => typeof p.accuracy === 'number' && p.accuracy < WEAK && tipFor(p.text)).sort((a, b) => a.accuracy - b.accuracy)[0];
        if (worst) {
            const tip = tipFor(worst.text), heard = worst.spoken ? heardAs(worst.text, worst.spoken) : '';
            box.append(el('div', { class: 'tip' }, el('b', {}, `${phonemeKey(worst.text)} /${tip.ipa}/`), heard ? ` ${heard}` : '', ` ${tip.zh}`));
        }
    } else box.append(el('div', {}, '该词没有音素分数。'));
    const buttons = el('div', { class: 'controls' }, el('button', { type: 'button', onclick: () => speak(word.text, { rate: 0.7, locale }) }, '▶ 范读（慢）'));
    if (canReplay && Number.isInteger(word.offsetMs) && Number.isInteger(word.durationMs) && word.durationMs > 0) {
        buttons.append(el('button', { type: 'button', onclick: () => player.play(word.offsetMs, word.durationMs) }, '▶ 我读的这个词'));
    }
    box.append(buttons);
}
