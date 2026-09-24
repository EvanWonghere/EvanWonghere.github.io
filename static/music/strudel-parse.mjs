import { beatsPerBar, spellInKey } from './arrangement.mjs';
// Reads the notatable subset of a Strudel draft (setcpm/setcps, stack, $:, note/n/s with
// mini-notation, .scale, .slow/.fast, .add/.transpose and sound-shaping methods) into timed events,
// so the draft can be shown on a staff. Anything outside the subset is reported, never guessed.
// Nothing here evaluates the code: it is a text parser.

const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11], ionian: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], aeolian: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
    locrian: [0, 1, 3, 5, 6, 8, 10], harmonicminor: [0, 2, 3, 5, 7, 8, 11], melodicminor: [0, 2, 3, 5, 7, 9, 11],
    pentatonic: [0, 2, 4, 7, 9], majorpentatonic: [0, 2, 4, 7, 9], minorpentatonic: [0, 3, 5, 7, 10], blues: [0, 3, 5, 6, 7, 10],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
};
const LETTER = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const DRUMS = { bd: 'kick', kick: 'kick', sd: 'snare', sn: 'snare', cp: 'snare', rim: 'snare', rm: 'snare', hh: 'hat', oh: 'hat', ch: 'hat', hat: 'hat' };
// Methods that change timbre or mix only; the notes stay the same.
const SOUND_METHODS = new Set(['s', 'sound', 'bank', 'gain', 'velocity', 'postgain', 'lpf', 'hpf', 'bpf', 'cutoff', 'hcutoff', 'lpq', 'hpq', 'resonance', 'room', 'size', 'roomsize', 'delay', 'delaytime', 'delayfeedback', 'pan', 'attack', 'decay', 'sustain', 'release', 'adsr', 'clip', 'legato', 'orbit', 'vowel', 'shape', 'crush', 'coarse', 'distort', 'color', 'lpenv', 'hpenv', 'analyze', 'dry', 'cps', 'n']);
export const MAX_CYCLES = 32;

/** Parses "C4:major" style names; octave defaults to 3 as in Strudel. */
export function parseNoteName(text, defaultOctave = 3) {
    const m = /^([a-gA-G])(bb|b|##|#|s|f)?(-?\d)?$/.exec(String(text).trim());
    if (!m) return null;
    const acc = { b: -1, bb: -2, f: -1, '#': 1, s: 1, '##': 2 }[m[2]] || 0;
    const octave = m[3] === undefined ? defaultOctave : Number(m[3]);
    return (octave + 1) * 12 + LETTER[m[1].toLowerCase()] + acc;
}
function spellingOf(text, pitch) {
    const m = /^([a-gA-G])(bb|b|##|#|s|f)?(-?\d)?$/.exec(String(text).trim());
    if (!m) return null;
    const acc = { b: '♭', f: '♭', bb: '𝄫', '#': '♯', s: '♯', '##': '𝄪' }[m[2]] || '';
    const letterOctave = Math.round((pitch - LETTER[m[1].toLowerCase()] - ({ '♭': -1, '𝄫': -2, '♯': 1, '𝄪': 2 }[acc] || 0)) / 12) - 1;
    return `${m[1].toUpperCase()}${acc}${letterOctave}`;
}

// ---------- mini-notation ----------
function tokenizeMini(text) {
    const tokens = [], re = /\s+|([\[\]<>,])|([@*!]\s*[\d.]+)|([A-Za-z0-9#_.:~-]+)|(.)/gy;
    let m;
    while ((m = re.exec(text))) {
        if (m[1]) tokens.push({ t: m[1] }); else if (m[2]) tokens.push({ t: m[2][0], v: Number(m[2].slice(1)) }); else if (m[3]) tokens.push({ t: 'word', v: m[3] }); else if (m[4]) tokens.push({ t: 'bad', v: m[4] });
    }
    return tokens;
}
/** AST: {k:'seq', items:[{node, weight, times}]}, {k:'stack', layers}, {k:'alt', items}, {k:'atom', v}, {k:'rest'}. */
export function parseMini(text) {
    const tokens = tokenizeMini(text), unsupported = new Set();
    let i = 0;
    const peek = () => tokens[i];
    function sequence(end) {
        const layers = [[]];
        while (i < tokens.length && peek().t !== end) {
            const tok = tokens[i++];
            if (tok.t === ',') { layers.push([]); continue; }
            let node;
            if (tok.t === '[') { node = sequence(']'); i++; }
            else if (tok.t === '<') { node = sequence('>'); i++; node = node.k === 'stack' ? (unsupported.add('<> 里的逗号'), node.layers[0]) : node; node = { k: 'alt', items: node.items.map(x => x.node) }; }
            else if (tok.t === 'word' && tok.v === '_') { unsupported.add('_'); continue; }
            else if (tok.t === 'word') node = tok.v === '~' || tok.v === '-' ? { k: 'rest' } : { k: 'atom', v: tok.v };
            else if (tok.v === '(') {
                // Euclidean rhythms such as bd(3,8): skip the whole group and mark the previous step.
                unsupported.add('(k,n) 欧几里得节奏'); let depth = 1;
                while (i < tokens.length && depth) { const t = tokens[i++]; if (t.v === '(') depth++; else if (t.v === ')') depth--; }
                continue;
            }
            else { unsupported.add(tok.v ?? tok.t); continue; }
            const item = { node, weight: 1, times: 1 };
            while (i < tokens.length && ['@', '*', '!'].includes(peek().t)) {
                const mod = tokens[i++];
                if (mod.t === '@') item.weight = mod.v;
                else if (mod.t === '*') item.times = mod.v;
                else for (let r = 1; r < mod.v; r++) layers.at(-1).push({ ...item });
            }
            layers.at(-1).push(item);
        }
        const seqs = layers.map(items => ({ k: 'seq', items }));
        return seqs.length > 1 ? { k: 'stack', layers: seqs } : seqs[0];
    }
    const ast = sequence(undefined);
    return { ast, unsupported: [...unsupported] };
}
const gcd = (a, b) => b ? gcd(b, a % b) : a, lcm = (a, b) => a / gcd(a, b) * b;
function period(node) {
    if (node.k === 'seq') return node.items.reduce((p, it) => lcm(p, period(it.node)), 1);
    if (node.k === 'stack') return node.layers.reduce((p, l) => lcm(p, period(l)), 1);
    if (node.k === 'alt') return node.items.length * node.items.reduce((p, n) => lcm(p, period(n)), 1);
    return 1;
}
/** Events of one cycle; `alt` counts how often enclosing alternations have advanced. */
function render(node, begin, span, alt, out) {
    if (node.k === 'atom') out.push({ begin, dur: span, value: node.v });
    else if (node.k === 'stack') for (const layer of node.layers) render(layer, begin, span, alt, out);
    else if (node.k === 'alt') { if (node.items.length) render(node.items[((alt % node.items.length) + node.items.length) % node.items.length], begin, span, Math.floor(alt / node.items.length), out); }
    else if (node.k === 'seq') {
        const total = node.items.reduce((n, it) => n + it.weight, 0) || 1;
        let at = begin;
        for (const it of node.items) {
            const slot = span * it.weight / total, times = Math.max(1, Math.round(it.times));
            for (let r = 0; r < times; r++) render(it.node, at + r * slot / times, slot / times, alt * times + r, out);
            at += slot;
        }
    }
}

// ---------- the JavaScript around the patterns ----------
const stripComments = code => code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
/** Evaluates plain arithmetic such as 72/4 without eval; returns null for anything else. */
export function arithmetic(text) {
    const src = String(text).replace(/\s+/g, '');
    if (!/^[\d.+\-*/()]+$/.test(src)) return null;
    let i = 0;
    const num = () => { if (src[i] === '(') { i++; const v = expr(); i++; return v; } if (src[i] === '-') { i++; return -num(); } const m = /^\d+(\.\d+)?/.exec(src.slice(i)); if (!m) throw 0; i += m[0].length; return Number(m[0]); };
    const term = () => { let v = num(); while (src[i] === '*' || src[i] === '/') { const op = src[i++], r = num(); v = op === '*' ? v * r : v / r; } return v; };
    const expr = () => { let v = term(); while (src[i] === '+' || src[i] === '-') { const op = src[i++], r = term(); v = op === '+' ? v + r : v - r; } return v; };
    try { const v = expr(); return i === src.length && Number.isFinite(v) ? v : null; } catch { return null; }
}
// Splits "a(x).b(y, z)" into calls, respecting nested brackets and string literals.
function calls(expr) {
    const out = []; let i = 0;
    const skipWs = () => { while (/\s/.test(expr[i] || '')) i++; };
    while (i < expr.length) {
        skipWs(); if (expr[i] === '.') { i++; skipWs(); }
        const m = /^[A-Za-z_$][\w$]*/.exec(expr.slice(i)); if (!m) return null;
        i += m[0].length; skipWs();
        if (expr[i] !== '(') return null;
        const start = ++i; let depth = 1, quote = null;
        for (; i < expr.length && depth; i++) {
            const c = expr[i];
            if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; }
            else if (c === '"' || c === "'" || c === '`') quote = c;
            else if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
        }
        if (depth) return null;
        out.push({ name: m[0], args: splitArgs(expr.slice(start, i - 1)) });
        skipWs();
    }
    return out;
}
function splitArgs(text) {
    const args = []; let depth = 0, quote = null, start = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
        if (c === '"' || c === "'" || c === '`') quote = c;
        else if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
        else if (c === ',' && !depth) { args.push(text.slice(start, i).trim()); start = i + 1; }
    }
    if (text.slice(start).trim()) args.push(text.slice(start).trim());
    return args;
}
const stringValue = arg => { const m = /^(["'`])([\s\S]*)\1$/.exec(arg || ''); return m ? m[2] : null; };

function parseVoice(expr, label, warnings) {
    const chain = calls(expr);
    if (!chain?.length) { warnings.push(`${label}：无法识别的写法，未显示在谱面上。`); return null; }
    const [head, ...methods] = chain;
    if (head.name === 'stack') return { stack: head.args, methods };
    if (!['note', 'n', 's', 'sound'].includes(head.name)) { warnings.push(`${label}：${head.name}() 不在可识别的子集中。`); return null; }
    const mini = stringValue(head.args[0]);
    if (mini === null) { warnings.push(`${label}：${head.name}() 的参数不是字符串，未显示。`); return null; }
    const parsed = parseMini(mini);
    for (const u of parsed.unsupported) warnings.push(`${label}：迷你记谱 “${u}” 不支持，已忽略。`);
    const voice = { label, kind: head.name === 'note' ? 'note' : head.name === 'n' ? 'degree' : 'drum', ast: parsed.ast, scale: null, speed: 1, add: 0, approximate: false };
    for (const m of methods) {
        if (m.name === 'scale') voice.scale = stringValue(m.args[0]);
        else if (m.name === 'slow' || m.name === 'fast') { const k = arithmetic(m.args[0]); if (k && k > 0) voice.speed *= m.name === 'fast' ? k : 1 / k; else { voice.approximate = true; warnings.push(`${label}：.${m.name}() 的参数不是数字，已忽略。`); } }
        else if (m.name === 'add' || m.name === 'transpose') { const k = arithmetic(m.args[0]); if (k !== null && voice.kind !== 'drum') voice.add += k; else { voice.approximate = true; warnings.push(`${label}：.${m.name}() 只支持数字。`); } }
        else if (!SOUND_METHODS.has(m.name)) { voice.approximate = true; warnings.push(`${label}：.${m.name}() 会改变节奏或音高，谱面没有体现。`); }
    }
    return voice;
}

/** Parses a draft into voices of events. Cycles are rendered up to the pattern period (max 32). */
export function parseStrudel(code) {
    const warnings = [], src = stripComments(String(code || ''));
    let cpm = null;
    const tempo = /\bset(cpm|cps)\s*\(([^)]*)\)/.exec(src);
    if (tempo) { const v = arithmetic(tempo[2]); if (v && v > 0) cpm = tempo[1] === 'cps' ? v * 60 : v; else warnings.push('setcpm/setcps 的参数不是数字，按默认速度显示。'); }
    const body = src.replace(/\bset(cpm|cps)\s*\([^)]*\)\s*;?/g, '').trim();
    const exprs = /^\s*\$\s*:/m.test(body) ? body.split(/^\s*\$\s*:/m).map(s => s.trim()).filter(Boolean) : body ? [body.replace(/;\s*$/, '')] : [];
    const voices = [];
    const collect = (expr, label, outerMethods = []) => {
        if (/^silence\s*;?$/.test(expr.trim())) return;
        const v = parseVoice(expr, label, warnings);
        if (!v) return;
        if (v.stack) {
            for (const m of [...v.methods, ...outerMethods]) if (!SOUND_METHODS.has(m.name)) warnings.push(`${label}：stack 之后的 .${m.name}() 谱面没有体现。`);
            v.stack.forEach((arg, i) => collect(arg, `${label === '手稿' ? '' : label + ' · '}第 ${i + 1} 层`, v.methods));
            return;
        }
        voices.push(v);
    };
    exprs.forEach((e, i) => collect(e.replace(/;\s*$/, ''), exprs.length > 1 ? `第 ${i + 1} 段` : '手稿'));
    let cycles = voices.reduce((p, v) => lcm(p, Math.max(1, Math.ceil(period(v.ast) / v.speed))), 1);
    if (cycles > MAX_CYCLES) { warnings.push(`图案每 ${cycles} 个循环才重复，谱面只显示前 ${MAX_CYCLES} 个。`); cycles = MAX_CYCLES; }
    const out = voices.map((v, index) => {
        const events = [], tonic = v.scale ? parseNoteName(v.scale.split(':')[0]) : null, steps = v.scale ? SCALES[(v.scale.split(':')[1] || 'major').toLowerCase().replace(/[\s_-]/g, '')] : null;
        if (v.kind === 'degree' && (!steps || tonic === null)) warnings.push(`${v.label}：n() 需要可识别的 .scale("C4:major")，否则无法换算音高。`);
        for (let cycle = 0; cycle < cycles * v.speed; cycle++) {
            const raw = []; render(v.ast, 0, 1, cycle, raw);
            for (const e of raw) {
                const at = (cycle + e.begin) / v.speed; if (at >= cycles - 1e-9) continue;
                const event = { voice: index, time: at, dur: e.dur / v.speed, name: e.value };
                const word = e.value.split(':')[0];
                if (v.kind === 'drum') { event.drum = DRUMS[word.toLowerCase()] || null; if (!event.drum) event.sound = word; }
                else if (v.kind === 'note') {
                    const pitch = /^-?\d+(\.\d+)?$/.test(word) ? Number(word) : parseNoteName(word);
                    if (pitch === null) { warnings.push(`${v.label}：无法识别的音名 “${word}”。`); continue; }
                    event.pitch = Math.round(pitch + v.add); event.spelling = v.add ? null : spellingOf(word, event.pitch);
                } else {
                    const degree = Number(word);
                    if (!Number.isFinite(degree) || !steps || tonic === null) continue;
                    const len = steps.length, oct = Math.floor(degree / len), idx = ((degree % len) + len) % len;
                    event.pitch = Math.round(tonic + oct * 12 + steps[idx] + v.add); event.spelling = null;
                }
                if (event.pitch !== undefined && (event.pitch < 21 || event.pitch > 108)) { warnings.push(`${v.label}：${word} 超出钢琴音域，未显示。`); continue; }
                events.push(event);
            }
        }
        return { label: v.label, kind: v.kind === 'drum' ? 'drum' : 'pitched', approximate: v.approximate, events };
    });
    return { cpm, cycles, voices: out, warnings: [...new Set(warnings)] };
}

/**
 * Places parsed voices on a staff: one cycle is one bar of the chosen meter. Returns the pieces
 * compileABC needs, plus notes about anything moved to the sixteenth-note grid.
 */
export function parsedScore(parsed, { meter = '4/4', title = '即兴手稿' } = {}) {
    const bpb = beatsPerBar(meter), notes = [];
    let moved = 0;
    const tracks = [], events = [];
    parsed.voices.forEach((voice, index) => {
        if (voice.kind !== 'pitched' || !voice.events.length) return;
        const id = `v${index}`, pitches = voice.events.map(e => e.pitch).sort((a, b) => a - b), median = pitches[Math.floor(pitches.length / 2)];
        tracks.push({ id, name: voice.label, role: median < 55 ? 'bass' : 'comp', instrument: 'grand', clips: {} });
        voice.events.forEach((e, i) => {
            const exact = e.time * bpb, start = Math.round(exact * 4) / 4, end = Math.max(start + 0.25, Math.round((e.time + e.dur) * bpb * 4) / 4);
            if (Math.abs(exact - start) > 1e-6 || Math.abs((e.time + e.dur) * bpb - end) > 1e-6) moved++;
            events.push({ id: `${id}-${i}`, trackId: id, role: 'comp', sectionId: 'draft', start, beats: Math.min(end, parsed.cycles * bpb) - start, pitch: e.pitch, vel: 80, drum: null, spelling: e.spelling || spellInKey(e.pitch, 'C', 'major'), time: e.time });
        });
    });
    if (moved) notes.push(`${moved} 个音不在十六分音符网格上（如三连音），谱面已就近取整；播放不受影响。`);
    if (parsed.voices.some(v => v.kind === 'drum' && v.events.length)) notes.push('鼓组不记谱。');
    const totalBeats = parsed.cycles * bpb;
    const doc = { title, meta: { tempo: Math.min(200, Math.max(40, Math.round((parsed.cpm ?? 30) * bpb))), meter, key: 'C', mode: 'major', swing: 0.5 }, tracks };
    const real = { bpb, totalBeats, sections: [{ id: 'draft', name: '手稿', start: 0, beats: totalBeats, bars: parsed.cycles }], chords: [], events: events.filter(e => e.beats > 0).sort((a, b) => a.start - b.start || a.pitch - b.pitch) };
    return { doc, real, notes };
}

// In Strudel only the last bare expression plays, while every `$:` block plays together. To add a
// layer, both codes are rewritten into `$:` blocks (text only). Returns null when a code has
// statements that cannot be wrapped safely; the page then offers replace or manual editing.
const TEMPO = /^[ \t]*set(?:cpm|cps)\s*\([^)]*\)\s*;?[ \t]*$/gm;
function asBlocks(code) {
    const text = String(code || '').replace(/\r\n?/g, '\n'), tempo = text.match(TEMPO)?.map(t => t.trim()) || [];
    const body = text.replace(TEMPO, '').trim(), bare = stripComments(body).trim();
    if (!bare) return { tempo, blocks: '' };
    if (/^\s*\$\s*:/m.test(bare)) return /^\$\s*:/.test(bare) ? { tempo, blocks: body } : null;
    if (/\b(?:const|let|var|function)\b/.test(bare) || /;\s*\S/.test(bare)) return null;
    const lead = /^(?:[ \t]*\/\/[^\n]*\n)*/.exec(body)[0];
    return { tempo, blocks: `${lead}$: ${body.slice(lead.length).replace(/;\s*$/, '')}` };
}
export function appendLayer(draft, snippet) {
    const a = asBlocks(draft), b = asBlocks(snippet);
    if (!a || !b) return null;
    const tempo = a.tempo.length ? a.tempo : b.tempo;
    return [...tempo, a.blocks, b.blocks && `// AI 片段\n${b.blocks}`].filter(Boolean).join('\n\n') + '\n';
}
