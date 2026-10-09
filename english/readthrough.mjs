// Reading a whole text segment by segment (or taking one part of a dialogue): ready → reading/model → between → … → review → scoring → report.
// Recording, playback and scoring stay in the practice panel (app.mjs); this module decides which segment is next and what to show.
import { flatten } from './library.mjs';
import { buildReport } from './report.mjs';

const pct = value => value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`;
const num = value => value === null || value === undefined ? '—' : String(value);

// api: { ctx, el, $, minutes, speakText(text, rate, done, pitch, target), stopSpeech(), backToLibrary(), onFinished(), onReport(report), addWords(words) }
// dub: the work is a dialogue; the learner reads one role and the other is read aloud.
// Returns { onClip, beforeRecord, onDiscard, dispose }.
export function startRead(work, api, { dub = false } = {}) {
    const { ctx, el, $, minutes, speakText, stopSpeech } = api;
    const segs = work.segments;
    const clips = new Map(), results = new Map();
    let state = 'ready', at = 0, notice = '', role = null, finished = false;
    const stage = $('read-stage'), bar = $('read-progress');
    const mine = i => !dub || segs[i].speaker === role;

    const drawBar = () => bar.replaceChildren(...segs.map((_, i) => {
        const done = i < at || (i === at && state === 'between') || ['review', 'scoring', 'report'].includes(state);
        return el('i', { class: done ? 'done' : i === at && (state === 'reading' || state === 'model') ? 'now' : '' });
    }));
    const text = (value, extra = '') => el('p', { class: `follow-text ${extra}`.trim(), lang: 'en' }, value);
    const button = (label, onclick, cls = '') => el('button', { type: 'button', class: cls, onclick }, label);
    const who = i => dub ? `${segs[i].speaker}${mine(i) ? '（你）' : ''}` : '';

    function render(next) {
        state = next; drawBar();
        const draw = { ready, reading, model, between, review, scoring: () => [], report }[state];
        stage.replaceChildren(...draw());
    }
    function go(i) {
        // Refused while recording or scoring: stay where we are, so the text and the practice panel never disagree.
        if (!ctx.setReference(mine(i) ? flatten(segs[i].text) : '', true)) { $('status').textContent = '正在录音或评分，请等它结束再继续。'; return; }
        at = i; clips.delete(i);
        if (mine(i)) { render('reading'); return; }
        render('model'); listenModel();
    }
    function listenModel() {
        const i = at;
        speakText(flatten(segs[i].text), 0.9, info => { if (!info.error && state === 'model' && at === i) advance(); }, segs[i].speaker === work.roles[0] ? 1 : 0.8, { segment: i });
    }
    function advance() { if (at + 1 < segs.length) go(at + 1); else finish(); }
    function finish() {
        if (!finished) { finished = true; api.onFinished?.(); }
        render('review');
    }

    function ready() {
        if (dub) {
            return [el('p', {}, `这是一段对话，共 ${segs.length} 句，${minutes(work.seconds)}。选一个角色，另一个角色由范读读出。轮到你时先看句子，再用练习区录音。`),
                el('div', { class: 'controls' }, ...work.roles.map(r => button(`我来读 ${r}`, () => { role = r; go(0); }, 'primary')))];
        }
        return [el('p', {}, `共 ${segs.length} 段，${minutes(work.seconds)}。点“开始朗读”，一段一段读：每段读完点下面练习区的“结束录音”，这里会停下来给出这一段的小结。`),
            el('div', { class: 'controls' }, button('开始朗读', () => go(0), 'primary'))];
    }
    function reading() {
        return [el('p', { class: 'hint' }, `第 ${at + 1} / ${segs.length} ${dub ? `句 · ${who(at)}。轮到你了。` : '段。'}读完点练习区的“结束录音”。`), text(segs[at].text),
            el('div', { class: 'controls' }, button('▶ 听这段范读', () => speakText(flatten(segs[at].text), 0.9, undefined, 1, { segment: at })), button('▶ 慢速', () => speakText(flatten(segs[at].text), 0.7, undefined, 1, { segment: at })), button('■ 停止', stopSpeech))];
    }
    function model() {
        return [el('p', { class: 'hint' }, `第 ${at + 1} / ${segs.length} 句 · ${who(at)}，范读正在读。`), text(segs[at].text),
            el('div', { class: 'controls' }, button('再听一遍', listenModel), button('跳过 ▸', () => { stopSpeech(); advance(); }, 'primary'))];
    }
    function between() {
        const clip = clips.get(at), last = at === segs.length - 1;
        const local = clip?.local ? `读对 ${clip.local.hits} / ${clip.local.total} 个词（听写比对，只作参考）。` : '这一段没有听写比对。';
        return [el('p', {}, `第 ${at + 1} ${dub ? '句' : '段'}读完，用时 ${clip ? clip.seconds.toFixed(1) : '—'} 秒。${local}`), text(segs[at].text, 'small'),
            el('p', { class: 'hint' }, '可以在练习区回听。不满意就重读。'),
            el('div', { class: 'controls' }, button(dub ? '重读这一句' : '重读这一段', () => go(at)), button(last ? '读完了，看总结 ▸' : dub ? '继续 ▸' : '继续下一段 ▸', advance, 'primary'))];
    }

    function review() {
        const picked = new Set(clips.keys());
        const admin = ctx.isAdmin();
        const send = el('button', { type: 'button', class: 'primary', onclick: () => score([...picked].sort((a, b) => a - b)) });
        const refresh = () => { send.textContent = `送评 ${picked.size} 段 ↗`; send.disabled = picked.size === 0; };
        refresh();
        const rows = segs.flatMap((segment, i) => {
            const clip = clips.get(i);
            if (dub && !clip) return [];   // the other role's lines have no recording
            const box = el('input', { type: 'checkbox', id: `pick-${i}`, ...(admin && clip ? { checked: '' } : { disabled: '' }) });
            box.onchange = () => { box.checked ? picked.add(i) : picked.delete(i); refresh(); };
            const label = el('label', { for: `pick-${i}` }, `第 ${i + 1} ${dub ? '句' : '段'} · ${clip ? clip.seconds.toFixed(1) + ' 秒' : '没有录音'}${clip?.local ? ` · 读对 ${clip.local.hits}/${clip.local.total}` : ''}`);
            return [el('li', {}, box, label, el('small', { lang: 'en' }, flatten(segment.text).slice(0, 70) + (flatten(segment.text).length > 70 ? '…' : '')))];
        });
        return [el('p', {}, '读完了。'), ...(notice ? [el('p', { class: 'bad', role: 'alert' }, notice)] : []),
            el('ul', { class: 'pick-list' }, ...rows),
            el('p', { class: 'hint' }, admin ? '勾选要送去评分的段落。评分会把这些录音发到 Azure；不勾选的段落只保留本地比对。' : '评分只向管理员开放；这里只能看本地比对。'),
            el('div', { class: 'controls' }, ...(admin ? [send] : []), button('只看本地结果', () => render('report'), admin ? '' : 'primary'))];
    }

    async function score(chosen) {
        notice = '';
        render('scoring');
        const line = el('p', { role: 'status' }, '正在准备评分……');
        stage.replaceChildren(line, el('p', { class: 'hint' }, '一段一段发送，每段评分前不会重复发送。需要的话可以点“取消评分”。'));
        let outcome;
        try {
            outcome = await ctx.withScoring(async (signal, scoreOne) => {
                for (const [n, i] of chosen.entries()) {
                    line.textContent = `正在评分第 ${i + 1} 段（${n + 1} / ${chosen.length}）……`;
                    const record = await scoreOne(clips.get(i));
                    results.set(i, record.result);
                }
                return true;
            });
        } catch (error) {
            notice = error.name === 'AbortError' ? '评分已取消；已发送的音频可能已计入 Azure 用量。' : `评分没有全部完成：${error.message || '服务暂不可用'}`;
        }
        if (outcome === null) notice = '现在不能评分（可能正在录音，或没有管理员权限）。';
        render(results.size ? 'report' : 'review');
    }

    function report() {
        const items = [];
        segs.forEach((segment, i) => {
            const clip = clips.get(i);
            if (clip) items.push({ id: segment.id, text: flatten(segment.text), seconds: clip.seconds, locale: clip.locale, local: clip.local ? { marks: clip.local.marks, hits: clip.local.hits, total: clip.local.total } : null, azure: results.get(i) ?? null });
        });
        const r = buildReport(items);
        api.onReport?.(r);
        const tiles = [['正确词/分钟', r.local?.wcpm], ['读对（听写）', r.local ? pct(r.local.hitRate) : null], ['发音', r.azure?.pronunciation], ['流利', r.azure?.fluency], ['完整', r.azure?.completeness], ['韵律', r.azure?.prosody]]
            .filter(([, v]) => v !== null && v !== undefined);
        const out = [];
        if (notice) out.push(el('p', { class: 'bad', role: 'alert' }, notice));
        out.push(el('div', { class: 'tiles' }, ...(tiles.length ? tiles.map(([label, value]) => el('div', { class: 'score' }, el('strong', {}, num(value)), el('span', {}, label))) : [el('p', {}, '这次没有可显示的数字：没有听写比对，也没有评分。')])));
        if (r.azure?.monotone) out.push(el('p', {}, `有 ${r.azure.monotone} 段语调偏平。`));
        if (r.azure?.unexpectedBreaks) out.push(el('p', {}, `有 ${r.azure.unexpectedBreaks} 处停顿不自然。`));
        if (r.notHeard.length) out.push(el('p', { class: 'hint' }, `听写没听到这些词，请自己核对（听写也会出错）：${[...new Set(r.notHeard)].slice(0, 12).join('、')}`));
        if (r.hardWords.length) {
            const added = el('span', { class: 'hint', role: 'status' });
            out.push(el('h3', {}, '需要练的词'));
            out.push(el('ul', { class: 'hard-words' }, ...r.hardWords.map(w => el('li', {},
                el('strong', { lang: 'en' }, w.text), ` ${num(w.accuracy)} 分`, ...(w.weakest ? [el('div', { class: 'tip' }, el('b', {}, `${w.weakest.key} /${w.weakest.ipa}/`), ` ${w.weakest.tip}`)] : []),
                el('div', { class: 'controls' }, button('▶ 范读（慢）', () => speakText(w.text, 0.7)), button('练这个词', () => practiceWord(w.text)))))));
            out.push(el('div', { class: 'controls' }, button('全部加入生词本', () => { const { added: n, full } = api.addWords(r.hardWords.map(w => w.text)); added.textContent = n ? `已加入 ${n} 个词，明天开始复习。` : full ? '生词本已满，先在档案里移出一些词。' : '这些词已经都在生词本里。'; }), added));
        } else if (r.azure) out.push(el('p', {}, '没有低于 70 分的词。'));
        if (r.weakPhonemes.length) out.push(el('p', {}, '最弱的音：', ...r.weakPhonemes.flatMap(p => [el('b', {}, `${p.key} /${p.ipa}/`), ` 平均 ${p.average} 分；`])));
        out.push(el('p', { class: 'hint' }, '分数是自动评估的参考，不代表语言水平认证。听写比对依赖浏览器的听写，会有误差。'));
        out.push(el('div', { class: 'controls' }, button('再读一遍', () => { clips.clear(); results.clear(); notice = ''; at = 0; finished = false; role = null; render('ready'); }), button('回到文库', api.backToLibrary)));
        return out;
    }
    function practiceWord(word) {
        if (!ctx.setReference(word, true)) return;
        $('status').textContent = `练习这个词：${word}。先听范读，再录音；管理员可以评分。`;
        $('workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    ctx.setReference('', true);   // nothing to record until a segment is chosen
    render('ready');
    return {
        onClip(clip) { if (state === 'reading') { clips.set(at, clip); render('between'); } },
        // Recording again after a segment finished means reading that segment again.
        beforeRecord() { if (state === 'between') go(at); },
        // Dropping the recording in the practice panel drops it here too, so it cannot be sent for scoring later.
        onDiscard() { if (state === 'between') go(at); },
        dispose() { stopSpeech(); stage.replaceChildren(); bar.replaceChildren(); },
    };
}
