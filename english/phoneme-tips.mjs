// What to do with the mouth for each American English sound, written for Chinese speakers.
// Keys are the SAPI phoneme names Azure returns for en-US (the REST default). Other accents may return nothing usable; then no tip shows.
// These are our own words; they need a teacher's eye before anyone relies on them.
const T = (ipa, zh) => ({ ipa, zh });
export const PHONEME_TIPS = {
    th: T('θ', '舌尖轻放在上下齿之间，只送气，不振动声带。常被读成 s。'),
    dh: T('ð', '舌位和 th 一样，但要振动声带。常被读成 z 或 d。'),
    v: T('v', '上齿轻咬下唇，让气流擦过去，同时振动声带。常被读成 w。'),
    w: T('w', '双唇收圆并向前突出，不碰牙齿，然后迅速滑开。常被读成 v。'),
    r: T('r', '舌尖向后卷起但不碰上颚，嘴唇微圆。不要读成 l，也不要读成汉语的“日”。'),
    l: T('l', '舌尖顶住上齿后面的牙龈。词尾的 l 舌尖也要顶上去，不要变成 n 或 o。'),
    ih: T('ɪ', '短而放松，嘴不要咧开。sit 的元音，不是汉语的“衣”。'),
    iy: T('iː', '长而紧，嘴角向两边拉开。seat 的元音，要比 ih 长。'),
    ae: T('æ', '嘴张大，舌头放低在前面，介于“啊”和“诶”之间。cat 的元音，常被读成 e。'),
    eh: T('ɛ', '嘴半开，舌位中等偏前。bed 的元音，比 ae 的嘴形小。'),
    ah: T('ʌ', '短促，嘴微张，舌放松在中间。cut 的元音，不要读成 o。'),
    aa: T('ɑ', '嘴张大，舌头放低靠后。father 的元音。'),
    ao: T('ɔ', '嘴唇收圆，舌头靠后。thought 的元音。'),
    uh: T('ʊ', '短，嘴唇放松微圆。book 的元音，不要拉长成 u。'),
    uw: T('uː', '长，嘴唇收圆并向前突出。food 的元音。'),
    er: T('ɜr', '卷舌元音，舌尖不碰上颚。bird 的元音，要连着 r 的音色读。'),
    ax: T('ə', '弱读的中性元音，轻而短。about 开头的音，不要读成清楚的 a 或 o。'),
    ng: T('ŋ', '舌根抵住软腭，气流从鼻子出来。sing 结尾不要再加 g。'),
    sh: T('ʃ', '嘴唇微圆向前，舌尖靠近上齿龈后面但不碰，送气。'),
    zh: T('ʒ', '口形和 sh 一样，但要振动声带。vision 中间的音。'),
    ch: T('tʃ', '先让舌尖顶住上齿龈，再带着 sh 的音送气放开。'),
    jh: T('dʒ', '口形和 ch 一样，但要振动声带。judge 的开头。'),
    s: T('s', '舌尖靠近上齿龈，送气，不振动声带。'),
    z: T('z', '口形和 s 一样，但要振动声带，喉咙能感到震动。'),
    t: T('t', '舌尖顶上齿龈，爆发送气。词尾的 t 也要轻轻读出来，不要吞掉。'),
    d: T('d', '舌尖顶上齿龈，振动声带。词尾的 d 要轻轻读出来。'),
    k: T('k', '舌根抵住软腭再放开。词尾的 k 要轻轻读出来，不要丢。'),
    g: T('g', '口形和 k 一样，但要振动声带。词尾的 g 要轻轻读出来。'),
    p: T('p', '双唇闭合再放开，送气。词尾的 p 要轻轻读出来。'),
    b: T('b', '双唇闭合再放开，振动声带。词尾的 b 要轻轻读出来。'),
    f: T('f', '上齿轻咬下唇，送气，不振动声带。'),
    m: T('m', '双唇闭合，气流从鼻子出来。词尾的 m 要把嘴唇合上。'),
    n: T('n', '舌尖顶上齿龈，气流从鼻子出来。词尾的 n 不要读成 ng。'),
    h: T('h', '喉咙放松，只送气，不要带出摩擦声。'),
    y: T('j', '舌面靠近硬腭，然后迅速滑向后面的元音。'),
    ey: T('eɪ', '从 e 滑到 ɪ，要有一个明显的滑动，不要读成单纯的“诶”。'),
    ay: T('aɪ', '从 a 滑到 ɪ，开头要张大嘴。'),
    aw: T('aʊ', '从 a 滑到 ʊ，嘴唇最后才收圆。'),
    ow: T('oʊ', '从 o 滑到 ʊ，嘴唇逐渐收圆，不要读成纯 o。'),
    oy: T('ɔɪ', '从 ɔ 滑到 ɪ，开头嘴唇收圆。'),
};
const ALIAS = { hh: 'h', ix: 'ih', axr: 'er' };
// IPA names, which the detailed path returns, back to our sound keys. r, g and the r-coloured vowels have several spellings.
const IPA_KEY = new Map([...Object.entries(PHONEME_TIPS).map(([key, tip]) => [tip.ipa, key]), ['ɹ', 'r'], ['ɡ', 'g'], ['ɚ', 'er'], ['ɝ', 'er'], ['ɜ', 'er'], ['i', 'iy'], ['u', 'uw'], ['e', 'eh'], ['ɔː', 'ao'], ['ɑː', 'aa'], ['ʧ', 'ch'], ['ʤ', 'jh'], ['ɛ', 'eh']]);
export const phonemeKey = symbol => {
    const raw = String(symbol ?? '').trim();
    if (IPA_KEY.has(raw)) return IPA_KEY.get(raw);
    const k = raw.toLowerCase().replace(/[^a-z]/g, '');
    return ALIAS[k] ?? k;
};
export const tipFor = symbol => { const key = phonemeKey(symbol); return Object.hasOwn(PHONEME_TIPS, key) ? PHONEME_TIPS[key] : null; };

// Sounds that scored low across a set of words, worst first: [{ key, ipa, average, count }].
export function weakPhonemes(words, { below = 70, limit = 5 } = {}) {
    const seen = new Map();
    for (const word of words) for (const p of word.phonemes ?? []) {
        if (p.accuracy === null || p.accuracy === undefined) continue;
        const key = phonemeKey(p.text);
        if (!Object.hasOwn(PHONEME_TIPS, key)) continue;
        const entry = seen.get(key) ?? { key, ipa: PHONEME_TIPS[key].ipa, total: 0, count: 0 };
        entry.total += p.accuracy; entry.count += 1; seen.set(key, entry);
    }
    return [...seen.values()].map(e => ({ key: e.key, ipa: e.ipa, average: Math.round(e.total / e.count), count: e.count }))
        .filter(e => e.average < below).sort((a, b) => a.average - b.average || b.count - a.count).slice(0, limit);
}

const VOWELS = new Set(['aa', 'ae', 'ah', 'ao', 'aw', 'ax', 'ay', 'eh', 'er', 'ey', 'ih', 'iy', 'ow', 'oy', 'uh', 'uw']);
// What to say when the service heard another sound where this one was expected. A vowel heard as a consonant (or the other way round)
// means a sound was swallowed or added, which is not the same as one sound being read as another.
export function heardAs(target, spoken) {
    const a = phonemeKey(target), b = phonemeKey(spoken) || String(spoken ?? '').trim();   // a symbol we do not know is shown as it came
    if (!a || !b || a === b) return '';
    const label = tipFor(spoken)?.ipa ?? String(spoken);
    if (VOWELS.has(a) && !VOWELS.has(b)) return `这里的元音几乎没读出来，听起来像 /${label}/。`;
    if (!VOWELS.has(a) && VOWELS.has(b)) return `这个辅音没读清楚，听起来带上了元音 /${label}/。`;
    return `你读成了 /${label}/。`;
}
