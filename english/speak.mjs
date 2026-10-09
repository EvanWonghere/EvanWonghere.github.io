// Model reading through the browser's speech synthesis. Pre-rendered voices can replace it later without touching callers.
import { tokenize } from './library.mjs';
export const canSpeak = () => 'speechSynthesis' in globalThis && typeof globalThis.SpeechSynthesisUtterance === 'function';
// Natural-sounding system voices first; local voices before network ones because only they report word boundaries reliably.
const PREFERRED = /\b(ava|samantha|allison|evan|nathan|zoe|aria|jenny|guy|daniel|serena|google (us|uk) english)\b/i;
export function pickVoice(voices, locale = 'en-US') {
    const tag = locale.toLowerCase();
    const fits = v => v.lang?.toLowerCase().replace('_', '-') === tag;
    const english = v => v.lang?.toLowerCase().startsWith('en');
    const rank = v => (fits(v) ? 0 : english(v) ? 4 : 99) + (PREFERRED.test(v.name) ? 0 : 2) + (v.localService ? 0 : 1);
    const best = [...voices].filter(english).sort((a, b) => rank(a) - rank(b))[0];
    return best ?? null;
}
// Does a voice's language tag fit the accent asked for? "en_GB" and "en-gb" both fit en-GB.
export const accentMatches = (voiceLang, locale) => String(voiceLang ?? '').toLowerCase().replace('_', '-') === locale.toLowerCase();
// Which word does a speech boundary event point into?
export function wordAtChar(tokens, charIndex) {
    let index = -1;
    for (const t of tokens) {
        if (!t.word) continue;
        index += 1;
        if (charIndex < t.start + t.text.length) return index;
    }
    return index;
}
async function loadVoices() {
    const synth = globalThis.speechSynthesis;
    const now = synth.getVoices();
    if (now.length) return now;
    await new Promise(resolve => { const done = () => { synth.removeEventListener('voiceschanged', done); resolve(); }; synth.addEventListener('voiceschanged', done); setTimeout(done, 1000); });
    return synth.getVoices();
}
// onWord(wordIndex) fires at each word boundary; onEnd({boundaries, stopped, error, voiceLang}) fires once. Returns stop().
// voiceLang is the language of the voice that actually spoke, which may differ from `locale` when the device has no voice for it.
export function speak(text, { locale = 'en-US', rate = 0.9, pitch = 1, onWord, onEnd } = {}) {
    if (!canSpeak()) { queueMicrotask(() => onEnd?.({ boundaries: 0, stopped: false, error: 'unsupported' })); return () => {}; }
    const synth = globalThis.speechSynthesis;
    const tokens = tokenize(text);
    let boundaries = 0, over = false, stopped = false, voiceLang = null;
    const finish = extra => { if (over) return; over = true; onEnd?.({ boundaries, stopped, voiceLang, ...extra }); };
    synth.cancel();
    loadVoices().then(voices => {
        if (over) return;
        const utterance = new SpeechSynthesisUtterance(text);   // kept in `current`: some browsers drop unreferenced utterances
        speak.current = utterance;
        utterance.lang = locale; utterance.rate = rate; utterance.pitch = pitch;
        const voice = pickVoice(voices, locale);
        if (voice) { utterance.voice = voice; voiceLang = voice.lang; }
        utterance.onboundary = event => { if (event.name && event.name !== 'word') return; boundaries += 1; onWord?.(wordAtChar(tokens, event.charIndex)); };
        utterance.onend = () => finish();
        utterance.onerror = event => finish(event.error === 'canceled' || event.error === 'interrupted' ? {} : { error: event.error });
        synth.speak(utterance);
    });
    return () => { if (over) return; stopped = true; synth.cancel(); finish(); };
}
