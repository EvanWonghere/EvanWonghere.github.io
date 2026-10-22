import { booleanOp, shapeArea, shapeBounds, ringsOf } from '../engines/polygon-boolean.mjs';
import {
    makeBand, simplifyPath, nextBatch, cutPaper, foldSupport, FOLDS, SHEET, unfold, unfoldCopies, similarity, starsFor,
    AXES, freshSheet, foldAlong, unfoldOne, cutFolded, applyMap, invertMap
} from '../engines/papercut.mjs';
import { spawnFragments, advanceFragments, RIGID_PER_CUT } from '../engines/paper-fragments.mjs';
import { LEVELS, FREE } from './levels.mjs';
import { CUT_RADIUS } from './config.mjs';

const W = 600;
const H = 800;
const WORK = { x: 300, y: 470, w: 500, h: 520 };   // 折好的纸摆在这个区域里
const SAMPLE_SPACING = 4;       // 屏幕上每移动 4 个逻辑像素采一个点
const BATCH_MIN = 3;
const SIMPLIFY = 0.5;           // 纸的坐标
const UNDO_LIMIT = 40;
const FOLD_TIME = 0.45;
const RED = '#c8322a';
const STAGES = [...LEVELS, FREE];

const runtime = window.ArcadeRuntime;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
const ui = {
    levelName: $('level-name'), tip: $('tip'), best: $('best'), hints: $('hints'), foldbar: $('foldbar'), unfoldOne: $('unfold-one'),
    result: $('result'), resultTitle: $('result-title'), resultStars: $('result-stars'), resultText: $('result-text'),
    nextLevel: $('next-level'), undo: $('undo'), unfold: $('unfold')
};

const stored = (name, fallback) => runtime?.get(name, fallback) ?? fallback;
let stageIndex = Math.min(Math.max(0, Number(stored('level', 0)) || 0), STAGES.length - 1);
let hints = stored('hints', '1') !== '0';
let view = { scale: 1, x: 0, y: 0 };
let paused = false;
let game;

const stage = () => STAGES[stageIndex];
const isFree = () => !stage().target;
const bestKey = (id) => (hints ? `best.${id}` : `challenge.${id}`);

// 纸的坐标 → 画布坐标：把折好的那一叠放大摆在工作区中间。
function layoutFor(shape, box = WORK) {
    const b = shapeBounds(shape);
    const k = Math.min(box.w / (b.maxX - b.minX), box.h / (b.maxY - b.minY));
    return { k, ox: box.x - (b.minX + b.maxX) / 2 * k, oy: box.y - (b.minY + b.maxY) / 2 * k };
}
const toScreen = (layout, p) => ({ x: layout.ox + p.x * layout.k, y: layout.oy + p.y * layout.k });
const toPaper = (layout, p) => ({ x: (p.x - layout.ox) / layout.k, y: (p.y - layout.oy) / layout.k });
const lerpLayout = (a, b, t) => ({ k: a.k + (b.k - a.k) * t, ox: a.ox + (b.ox - a.ox) * t, oy: a.oy + (b.oy - a.oy) * t });
const ease = (t) => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, t))) / 2;

// ---- 开始一关 / 自由剪纸 ----

function startStage() {
    const s = stage();
    game = {
        history: [],
        fragments: { pool: [], accumulator: 0 },
        stroke: null,
        cuts: 0,
        failures: 0,
        mode: 'cut',          // 关卡：cut | unfolding | unfolded；自由模式一直是 cut
        unfoldTime: 0,
        paths: {}
    };
    if (s.target) {
        game.fold = s.fold;
        game.paper = FOLDS[s.fold].wedge;
        game.support = foldSupport(s.fold);
        game.layout = layoutFor(game.paper);
        game.sheetLayout = { k: 400 / (SHEET * 2), ox: 300, oy: 375 };   // 展开后整张纸摆在结算卡上方
        game.paths.target = toPath(s.target);
    } else {
        game.state = freshSheet();
        game.layout = layoutFor(game.state.wedge);
        game.anim = null;
        game.pendingUnfolds = 0;
    }
    ui.result.classList.add('hidden');
    updateHud();
}

function updateHud() {
    const s = stage();
    const free = isFree();
    ui.levelName.textContent = free ? s.name : `${stageIndex + 1}/${LEVELS.length} · ${s.name}`;
    ui.tip.textContent = free ? s.tip : hints ? s.tip : '挑战模式：没有铅笔线，只看左上角的目标。';
    ui.hints.hidden = free;
    ui.hints.setAttribute('aria-pressed', String(hints));
    ui.hints.textContent = hints ? '提示线' : '挑战';
    ui.foldbar.hidden = !free;
    if (free) {
        const idle = !game.anim && !game.stroke;
        document.querySelectorAll('[data-axis]').forEach((button) => {
            const possible = Boolean(foldAlong(game.state, button.dataset.axis));
            button.disabled = !idle || !possible;
            button.title = possible ? '' : '这一叠不关于这条轴对称，折不齐';
        });
        ui.unfoldOne.disabled = !idle || !game.state.axes.length;
        ui.unfold.disabled = !idle || !game.state.axes.length;
        ui.unfold.textContent = '全部展开';
        ui.best.textContent = game.state.axes.length ? `${game.state.maps.length} 层` : '没折';
    } else {
        const normal = stored(`best.${s.id}`, null);
        const challenge = stored(`challenge.${s.id}`, null);
        ui.best.textContent = [normal === null ? '' : `最好 ${normal}%`, challenge === null ? '' : `挑战 ${challenge}%`].filter(Boolean).join(' · ');
        ui.unfold.disabled = game.mode !== 'cut';
        ui.unfold.textContent = '展开';
    }
    ui.undo.disabled = !game.history.length || game.mode !== 'cut' || Boolean(game.anim);
}

function goto(delta) {
    stageIndex = (stageIndex + delta + STAGES.length) % STAGES.length;
    runtime?.set('level', stageIndex);
    startStage();
}

// ---- 剪：边拖边剪 ----

// 自由模式掉下来的块在整张纸的坐标里；画到折好的这一叠上时，要换回它所在那一层的位置。
// 一块纸可能跨过折痕、同时属于好几层：按每一层的逆映射搬回来、裁到这一叠里，取露出面积最大的那一层。
function toFoldedView(region, state) {
    let best = null;
    let bestArea = 0;
    for (const m of state.maps) {
        const back = (p) => applyMap(invertMap(m), p);
        const clipped = booleanOp([{ outer: region.outer.map(back), holes: region.holes.map((hole) => hole.map(back)) }], state.wedge, 'intersection');
        const area = clipped ? shapeArea(clipped) : 0;
        if (area > bestArea) { best = clipped; bestArea = area; }
    }
    return best ?? [];
}

const centroidOf = (shape) => {
    let x = 0;
    let y = 0;
    let n = 0;
    for (const region of shape) for (const p of region.outer) { x += p.x; y += p.y; n++; }
    return { x: x / n, y: y / n };
};

function processBatch(final) {
    const stroke = game.stroke;
    const batch = nextBatch(stroke.samples, stroke.cursor, { minNew: BATCH_MIN, final });
    if (!batch) return;
    stroke.cursor = batch.cursor;
    const band = makeBand(simplifyPath(batch.points, SIMPLIFY), CUT_RADIUS);
    if (!band) { game.failures++; return; }
    let fallen;
    if (isFree()) {
        const result = cutFolded(game.state, band);
        // 布尔运算没通过检查时只丢掉这一批（整叠一起），纸保持上一批的样子，这一笔后面的批次照常剪。
        if (!result) { game.failures++; return; }
        if (!result.changed) return;
        remember(stroke);
        game.state = result.state;
        // 一块纸剪下来，折叠时它的几层叠在一起；搬回这一叠后按位置去重，同一处只放一片纸屑。
        const seen = [];
        fallen = [];
        for (const region of result.fallen) {
            const shape = toFoldedView(region, game.state);
            if (!shape.length) continue;
            const c = centroidOf(shape);
            if (seen.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < 0.5)) continue;
            seen.push(c);
            fallen.push(...shape);
        }
    } else {
        const result = cutPaper(game.paper, band, game.support);
        if (!result) { game.failures++; return; }
        if (!result.changed) return;
        remember(stroke);
        game.paper = result.kept;
        fallen = result.fallen;
    }
    game.paths.paper = null;
    if (fallen.length) {
        const last = batch.points[batch.points.length - 1];
        const prev = batch.points[Math.max(0, batch.points.length - 2)];
        const dx = last.x - prev.x;
        const dy = last.y - prev.y;
        const toScreenShape = (region) => ({
            outer: region.outer.map((p) => toScreen(game.layout, p)),
            holes: region.holes.map((hole) => hole.map((p) => toScreen(game.layout, p)))
        });
        const tip = toScreen(game.layout, last);
        stroke.rigidLeft -= spawnFragments(game.fragments.pool, fallen.map(toScreenShape), {
            style: RED,
            rigidBudget: stroke.rigidLeft,
            vx: Math.sign(dx) * 40,
            vy: -80,
            sideOf: (c) => Math.sign(dx * (c.y - tip.y) - dy * (c.x - tip.x)) || 1
        });
    }
}

// 每一笔（以及自由模式的每次折、展开）只记一次撤销点。
function remember(stroke) {
    if (stroke?.changed) return;
    game.history.push(isFree() ? game.state : game.paper);
    if (game.history.length > UNDO_LIMIT) game.history.shift();
    if (stroke) stroke.changed = true;
}

// 一笔 = 按下到抬起；抬起时把剩下的采样点作为最后一批剪完。
function finishStroke() {
    if (!game.stroke) return;
    processBatch(true);
    if (game.stroke.changed) game.cuts++;
    game.stroke = null;
    updateHud();
}

function undo() {
    // 剪到一半按撤销：先把这一笔收尾，再撤掉整笔，避免这一笔后面的批次剪在撤销后的纸上、再也撤不回。
    finishStroke();
    if (!game.history.length || game.mode !== 'cut' || game.anim) return;
    if (isFree()) {
        game.state = game.history.pop();
        game.layout = layoutFor(game.state.wedge);
        game.pendingUnfolds = 0;
    } else {
        game.paper = game.history.pop();
        game.cuts = Math.max(0, game.cuts - 1);
    }
    game.paths.paper = null;
    updateHud();
}

// ---- 自由模式：折、展开一层、全部展开 ----

// 翻折动画：big 是折之前（层数少、面积大）的状态，被翻过去的那一半按 p ↦ p + s·(R(p) − p) 压扁再翻到另一侧。
// s 从 0 到 1 是折，从 1 到 0 是展开；s = 0.5 时那一半正好压成折痕上的一条线，看起来就是纸立起来又倒下去。
function startAnim(direction, big, small, axisKey) {
    const axis = AXES[axisKey];
    game.anim = {
        direction, big, small, axis, t: 0,
        keep: toPath(booleanOp(big.wedge, axis.keep, 'intersection') ?? []),
        moving: toPath(booleanOp(big.wedge, axis.keep, 'difference') ?? []),   // 被翻过去的那一半
        from: direction > 0 ? layoutFor(big.wedge) : layoutFor(small.wedge),
        to: direction > 0 ? layoutFor(small.wedge) : layoutFor(big.wedge)
    };
    game.paths.paper = null;
    updateHud();
}

function foldOn(axisKey) {
    if (!isFree() || game.anim || game.stroke) return;
    const next = foldAlong(game.state, axisKey);
    if (!next) return;
    remember(null);
    game.pendingUnfolds = 0;
    startAnim(1, game.state, next, axisKey);
}

function unfoldLayer() {
    if (!isFree() || game.anim || game.stroke || !game.state.axes.length) return;
    const big = unfoldOne(game.state);
    if (!big) return;
    remember(null);
    startAnim(-1, big, game.state, game.state.axes[game.state.axes.length - 1]);
}

function unfoldAll() {
    if (!isFree() || game.anim || game.stroke || !game.state.axes.length) return;
    game.pendingUnfolds = game.state.axes.length - 1;
    unfoldLayer();
}

function finishAnim() {
    const anim = game.anim;
    game.state = anim.direction > 0 ? anim.small : anim.big;
    game.layout = anim.to;
    game.anim = null;
    game.paths.paper = null;
    if (game.pendingUnfolds > 0) {
        game.pendingUnfolds--;
        const big = unfoldOne(game.state);
        startAnim(-1, big, game.state, game.state.axes[game.state.axes.length - 1]);
        return;
    }
    updateHud();
}

// ---- 关卡：展开与评分 ----

function startUnfold() {
    if (isFree()) { unfoldAll(); return; }
    if (game.mode !== 'cut') return;
    finishStroke();
    game.mode = 'unfolding';
    game.unfoldTime = 0;
    game.fragments.pool.length = 0;
    game.copies = unfoldCopies(game.paper, game.fold).map(toPath);
    // 镜像只用来做翻开的动画；翻开后画并集，折痕处是一整张纸，不会出现接缝。
    const sheet = unfold(game.paper, game.fold);
    game.sheet = sheet ? toPath(sheet) : null;
    const target = unfold(stage().target, game.fold);
    game.targetSheet = target ? toPath(target) : null;
    updateHud();
}

function showResult() {
    game.mode = 'unfolded';
    const s = stage();
    const score = similarity(game.paper, s.target) ?? 0;
    const percent = Math.round(score * 100);
    const stars = starsFor(score);
    const key = bestKey(s.id);
    const best = Number(stored(key, -1));
    if (percent > best) runtime?.set(key, percent);
    ui.resultTitle.textContent = (hints ? '' : '挑战 · ') + (stars === 3 ? '剪得真好' : stars ? '展开了' : '还差一点');
    ui.resultStars.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    ui.resultText.textContent = `和目标相似 ${percent}%${percent > best && best >= 0 ? '，新纪录' : ''} · 剪了 ${game.cuts} 刀`;
    ui.nextLevel.textContent = stageIndex === LEVELS.length - 1 ? '自由剪纸' : '下一关';
    ui.result.classList.remove('hidden');
    updateHud();
}

function refold() {
    ui.result.classList.add('hidden');
    game.mode = 'cut';
    updateHud();
}

// ---- 输入 ----

function toWorld(event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: ((event.clientX - rect.left) * (canvas.width / rect.width) - view.x) / view.scale,
        y: ((event.clientY - rect.top) * (canvas.height / rect.height) - view.y) / view.scale
    };
}

canvas.addEventListener('pointerdown', (event) => {
    if (game.mode !== 'cut' || paused || game.stroke || game.anim) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    const p = toWorld(event);
    game.stroke = { id: event.pointerId, screen: [p], samples: [toPaper(game.layout, p)], cursor: 0, changed: false, rigidLeft: RIGID_PER_CUT };
    if (isFree()) updateHud();
});

canvas.addEventListener('pointermove', (event) => {
    const stroke = game.stroke;
    if (!stroke || event.pointerId !== stroke.id) return;
    const p = toWorld(event);
    // 按距离采样：手指划得快、两次事件隔得远时，按固定间距补点。
    const last = stroke.screen[stroke.screen.length - 1];
    const count = Math.floor(Math.hypot(p.x - last.x, p.y - last.y) / SAMPLE_SPACING);
    for (let i = 1; i <= count; i++) {
        const q = { x: last.x + (p.x - last.x) * i / count, y: last.y + (p.y - last.y) * i / count };
        stroke.screen.push(q);
        stroke.samples.push(toPaper(game.layout, q));
    }
});

const release = (event) => { if (game.stroke && event.pointerId === game.stroke.id) finishStroke(); };
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

$('prev').addEventListener('click', () => goto(-1));
$('next').addEventListener('click', () => goto(1));
$('restart').addEventListener('click', startStage);
$('retry').addEventListener('click', startStage);
$('refold').addEventListener('click', refold);
ui.undo.addEventListener('click', undo);
ui.unfold.addEventListener('click', startUnfold);
ui.unfoldOne.addEventListener('click', unfoldLayer);
ui.nextLevel.addEventListener('click', () => goto(1));
document.querySelectorAll('[data-axis]').forEach((button) => button.addEventListener('click', () => foldOn(button.dataset.axis)));
ui.hints.addEventListener('click', () => {
    hints = !hints;
    runtime?.set('hints', hints ? '1' : '0');
    // 换模式就重新开始这一关，成绩各记各的。
    startStage();
});
document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.code === 'KeyZ') { event.preventDefault(); undo(); }
    else if (event.code === 'Enter' || event.code === 'Space') { event.preventDefault(); game.mode === 'cut' ? startUnfold() : refold(); }
    else if (event.code === 'ArrowLeft') goto(-1);
    else if (event.code === 'ArrowRight') goto(1);
});

window.addEventListener('arcade:pause', () => { finishStroke(); paused = true; });
window.addEventListener('arcade:resume', () => { paused = false; lastTime = performance.now(); });

// ---- 绘制 ----

function resize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const scale = Math.min(canvas.width / W, canvas.height / H);
    view = { scale, x: (canvas.width - W * scale) / 2, y: (canvas.height - H * scale) / 2 };
}
new ResizeObserver(resize).observe(canvas);

// 几何是不可变的（每一刀都换成新数组），所以按形状对象缓存 Path2D 就够了。
const pathCache = new WeakMap();
const pathFor = (shape) => {
    if (!pathCache.has(shape)) pathCache.set(shape, toPath(shape));
    return pathCache.get(shape);
};

function toPath(shape) {
    const path = new Path2D();
    for (const ring of ringsOf(shape)) {
        ring.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
        path.closePath();
    }
    return path;
}

// 带洞的多边形直接用 Canvas 的 evenodd 填充：洞、洞里的岛都由奇偶规则处理，不需要三角化。
function drawPaper(path, layout, { alpha = 1, shadow = true, outline = true } = {}) {
    ctx.save();
    ctx.translate(layout.ox, layout.oy);
    ctx.scale(layout.k, layout.k);
    ctx.globalAlpha = alpha;
    if (shadow) {
        ctx.save();
        ctx.translate(3 / layout.k, 5 / layout.k);
        ctx.fillStyle = 'rgba(60, 30, 10, 0.22)';
        ctx.fill(path, 'evenodd');
        ctx.restore();
    }
    ctx.fillStyle = RED;
    ctx.fill(path, 'evenodd');
    if (outline) {
        ctx.strokeStyle = '#9a221c';
        ctx.lineWidth = 1 / layout.k;
        ctx.stroke(path);
    }
    ctx.restore();
}

// 自由模式的一叠纸：不做布尔运算，每一层把整张纸按这一层的逆映射搬回来、裁到这一叠的轮廓里画。
// 只有每一层都剪掉的地方才透光，和真的叠在一起的纸一样。
function drawStack(state, layout, clip, squash = null, shadow = false) {
    const sheet = pathFor(state.sheet);
    for (const [index, m] of state.maps.entries()) {
        const inverse = invertMap(m);
        ctx.save();
        // 影子：同样的层、同样的裁剪，整体往右下错开一点，洞里和剪掉的角上就不会有影子。
        ctx.translate(layout.ox + (shadow ? 3 : 0), layout.oy + (shadow ? 5 : 0));
        ctx.scale(layout.k, layout.k);
        if (squash) ctx.transform(squash[0], squash[2], squash[1], squash[3], 0, 0);
        ctx.clip(clip);
        ctx.transform(inverse[0], inverse[2], inverse[1], inverse[3], 0, 0);
        ctx.fillStyle = shadow ? 'rgba(60, 30, 10, 0.1)' : RED;
        ctx.fill(sheet, 'evenodd');
        if (index === 0 && !shadow) {
            ctx.strokeStyle = '#9a221c';
            ctx.lineWidth = 1 / layout.k;
            ctx.stroke(sheet);
        }
        ctx.restore();
    }
}

function drawFree() {
    const anim = game.anim;
    if (!anim) {
        const wedge = pathFor(game.state.wedge);
        drawStack(game.state, game.layout, wedge, null, true);
        drawStack(game.state, game.layout, wedge);
        drawCreases(game.state, game.layout);
        return;
    }
    const s = anim.direction > 0 ? ease(anim.t) : 1 - ease(anim.t);
    const layout = lerpLayout(anim.from, anim.to, ease(anim.t));
    const r = anim.axis.reflect;
    const squash = [1 + s * (r[0] - 1), s * r[1], s * r[2], 1 + s * (r[3] - 1)];
    drawStack(anim.big, layout, anim.keep);
    drawStack(anim.big, layout, anim.moving, squash);
    // 翻到一半时给翻起来的那部分一点高光，像纸立起来迎着光。
    ctx.save();
    ctx.translate(layout.ox, layout.oy);
    ctx.scale(layout.k, layout.k);
    ctx.transform(squash[0], squash[2], squash[1], squash[3], 0, 0);
    ctx.fillStyle = `rgba(255, 235, 220, ${0.25 * Math.sin(Math.PI * s)})`;
    ctx.fill(anim.moving);
    ctx.restore();
}

// 折痕：这一叠贴着折痕的边画成虚线，提示"在这条边上剪的缺口，展开会变成洞"。
function dashedEdges(outer, layout, onCrease) {
    ctx.save();
    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = 'rgba(255, 240, 220, 0.9)';
    ctx.lineWidth = 2;
    for (let i = 0; i < outer.length; i++) {
        const a = outer[i];
        const b = outer[(i + 1) % outer.length];
        if (!onCrease(a) || !onCrease(b)) continue;
        const p = toScreen(layout, a);
        const q = toScreen(layout, b);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
    ctx.restore();
}

const ON_AXIS = { vertical: (p) => p.x, horizontal: (p) => p.y, diagonal: (p) => p.x - p.y, anti: (p) => p.x + p.y };

function drawCreases(state, layout) {
    if (!state.axes.length) return;
    const lines = state.axes.map((key) => ON_AXIS[key]);
    for (const region of state.wedge) dashedEdges(region.outer, layout, (p) => lines.some((d) => Math.abs(d(p)) < 1e-6));
}

function drawFoldEdges() {
    const lines = FOLDS[game.fold].foldLines;
    dashedEdges(FOLDS[game.fold].wedge[0].outer, game.layout, (p) => lines.some((d) => Math.abs(d(p)) < 1e-9));
}

function drawTable() {
    ctx.fillStyle = '#e9dcc5';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(120, 90, 60, 0.08)';
    ctx.lineWidth = 1;
    for (let y = 30; y < H; y += 34) { ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(200, y + 6, 400, y - 6, W, y + 3); ctx.stroke(); }
}

// 目标小样：展开后的完整窗花。自由模式里换成"展开预览"：现在这张纸摊开是什么样。
function drawCard() {
    const box = { x: 14, y: 14, w: 132, h: 132 };
    ctx.fillStyle = '#fffaf2';
    ctx.strokeStyle = '#dcc6a6';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, 10); ctx.fill(); ctx.stroke();
    const layout = { k: (box.w - 36) / (SHEET * 2), ox: box.x + box.w / 2, oy: box.y + box.h / 2 - 7 };
    let label = '目标';
    if (isFree()) {
        drawPaper(pathFor((game.anim ? game.anim.big : game.state).sheet), layout, { shadow: false });
        label = '展开后';
    } else {
        game.cardSheet ??= toPath(unfold(stage().target, game.fold) ?? stage().target);
        drawPaper(game.cardSheet, layout, { shadow: false });
    }
    ctx.fillStyle = '#8b7563';
    ctx.font = '600 11px ui-sans-serif,system-ui,sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, box.x + 8, box.y + box.h - 6);
}

function drawPencil() {
    if (!hints || !game.paths.target) return;
    const L = game.layout;
    ctx.save();
    ctx.translate(L.ox, L.oy);
    ctx.scale(L.k, L.k);
    ctx.setLineDash([5 / L.k, 4 / L.k]);
    ctx.strokeStyle = 'rgba(40, 20, 10, 0.55)';
    ctx.lineWidth = 1.3 / L.k;
    ctx.stroke(game.paths.target);
    ctx.restore();
}

function drawFragments() {
    for (const f of game.fragments.pool) {
        f.path ??= toPath(f.regions);
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.translate(f.x, f.y);
        ctx.rotate(f.angle);
        ctx.fillStyle = RED;
        ctx.fill(f.path, 'evenodd');
        ctx.strokeStyle = '#9a221c';
        ctx.lineWidth = 1;
        ctx.stroke(f.path);
        ctx.restore();
    }
}

function drawStroke() {
    const stroke = game.stroke;
    if (!stroke) return;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = Math.max(2, CUT_RADIUS * 2 * game.layout.k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    stroke.screen.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
}

// 关卡的展开动画：镜像一片一片翻出来，最后叠上目标的轮廓做对照。
function drawUnfolded() {
    const L = game.sheetLayout;
    const t = game.unfoldTime;
    const per = 0.9 / game.copies.length;
    if (t < 1 || !game.sheet) {
        game.copies.forEach((path, i) => {
            const alpha = Math.min(1, Math.max(0, (t - i * per) / per));
            if (alpha > 0) drawPaper(path, L, { alpha, shadow: false, outline: false });
        });
    } else {
        drawPaper(game.sheet, L);
    }
    if (game.targetSheet && t > 1) {
        ctx.save();
        ctx.translate(L.ox, L.oy);
        ctx.scale(L.k, L.k);
        ctx.globalAlpha = Math.min(1, t - 1);
        ctx.setLineDash([5 / L.k, 4 / L.k]);
        ctx.strokeStyle = 'rgba(40, 20, 10, 0.6)';
        ctx.lineWidth = 1.2 / L.k;
        ctx.stroke(game.targetSheet);
        ctx.restore();
    }
}

function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#e9dcc5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawTable();
    drawFragments();   // 纸屑画在纸的后面，往下掉的时候不会挡住正在剪的纸
    if (isFree()) {
        drawFree();
    } else if (game.mode === 'cut') {
        game.paths.paper ??= toPath(game.paper);
        drawPaper(game.paths.paper, game.layout);
        drawFoldEdges();
        drawPencil();
    } else {
        drawUnfolded();
    }
    drawCard();
    drawStroke();
    if (paused) {
        ctx.fillStyle = 'rgba(59, 42, 32, 0.4)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fffaf2';
        ctx.font = '700 28px ui-sans-serif,system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('已暂停', W / 2, H / 2);
    }
}

let lastTime = performance.now();
function frame(now) {
    const delta = Math.min(Math.max(now - lastTime, 0), 50) / 1000;
    lastTime = now;
    if (!paused) {
        if (game.stroke) processBatch(false);
        if (game.anim) {
            game.anim.t += delta / FOLD_TIME;
            if (game.anim.t >= 1) finishAnim();
        }
        if (game.mode === 'unfolding') {
            game.unfoldTime += delta;
            if (game.unfoldTime >= 1.2) showResult();
        } else if (game.mode === 'unfolded') {
            game.unfoldTime += delta;
        }
        // 画布比逻辑画面高时（窄屏），上下留白也看得见：按画布真正的下沿回收纸屑。
        advanceFragments(game.fragments, delta, (canvas.height - view.y) / view.scale + 20);
    }
    render();
    requestAnimationFrame(frame);
}

resize();
startStage();
requestAnimationFrame(frame);
