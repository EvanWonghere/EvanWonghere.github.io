// 剪窗花的规则层：剪刀带子、边拖边剪的分批、一刀剪开后哪块留在手里、折纸与展开、和目标比相似度。
// 全部是纯函数，不碰 DOM；几何运算用 polygon-boolean.mjs。

import { booleanOp, shapeArea, normalizeShape, distanceToSegment, pointInShape } from './polygon-boolean.mjs';

// ---- 带子 ----

const CIRCLE_SIDES = 16;

// 圆在固定的角度上取点。相邻两段在同一个点上的圆角因此顶点完全一样，叠在一起是"重合"而不是"差一点点地交错"。
function circlePoints(center, radius) {
    return Array.from({ length: CIRCLE_SIDES }, (_, k) => {
        const angle = k * Math.PI * 2 / CIRCLE_SIDES;
        return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
    });
}

// 单调链凸包，返回逆时针（数学方向）的凸多边形。
function convexHull(points) {
    const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const half = (list) => {
        const out = [];
        for (const p of list) {
            while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
            out.push(p);
        }
        return out;
    };
    const lower = half(sorted);
    const upper = half(sorted.slice().reverse());
    return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// 一段轨迹膨胀出的"胶囊"：两端圆的凸包，相当于线段两侧各偏移 radius、两端圆角。
export function capsule(a, b, radius) {
    return [{ outer: convexHull([...circlePoints(a, radius), ...circlePoints(b, radius)]), holes: [] }];
}

/**
 * 折线向两侧各膨胀 radius，转角和两端都是圆角：每一段生成一个胶囊，再求并集。
 * 某次并集失败时返回 null。
 */
export function makeBand(points, radius) {
    if (!points.length) return [];
    let band = capsule(points[0], points[Math.min(1, points.length - 1)], radius);
    for (let i = 1; i + 1 < points.length; i++) {
        band = booleanOp(band, capsule(points[i], points[i + 1], radius), 'union');
        if (!band) return null;
    }
    return band;
}

// Ramer–Douglas–Peucker：每批输入先化简，减少胶囊数量。
export function simplifyPath(points, tolerance) {
    if (points.length <= 2) return points.slice();
    const keep = new Array(points.length).fill(false);
    keep[0] = keep[points.length - 1] = true;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
        const [start, end] = stack.pop();
        let worst = -1;
        let worstDistance = tolerance;
        for (let i = start + 1; i < end; i++) {
            const d = distanceToSegment(points[i], points[start], points[end]);
            if (d > worstDistance) { worst = i; worstDistance = d; }
        }
        if (worst >= 0) {
            keep[worst] = true;
            stack.push([start, worst], [worst, end]);
        }
    }
    return points.filter((_, i) => keep[i]);
}

// ---- 边拖边剪：输入分批 ----

/**
 * 从一笔的采样点里取下一批：从上一批的倒数第二个点开始（两批重叠一段，交界处不会留下没剪断的细缝），
 * 到当前最后一个点为止。新点不足 minNew 个且不是收尾时返回 null。
 * cursor 是已经处理到的最后一个采样点下标；第一批 cursor 为 0。
 */
export function nextBatch(samples, cursor, { minNew = 3, final = false } = {}) {
    const fresh = samples.length - 1 - cursor;
    if (fresh < 1 || (!final && fresh < minNew)) return null;
    return { points: samples.slice(Math.max(0, cursor - 1)), cursor: samples.length - 1 };
}

// ---- 一刀剪开 ----

const byArea = (region) => [0, shapeArea([region])];

/**
 * 纸 − 带子。剪完后只有一块还捏在手里，其余失去支撑、掉下去（绕一圈剪下的岛就这样掉出去，留下一个洞）。
 * 哪块留下由 support(区域) 决定：返回 [主要分, 次要分]，比大小选第一名；默认按面积。
 * 返回 { changed, kept, fallen }；布尔运算失败时返回 null，调用方保留这一刀之前的纸。
 */
export function cutPaper(paper, band, support = byArea) {
    const rest = booleanOp(paper, band, 'difference');
    if (!rest) return null;
    const before = shapeArea(paper);
    const after = shapeArea(rest);
    if (before - after <= before * 1e-9 && rest.length === paper.length) return { changed: false, kept: paper, fallen: [] };
    const scored = rest.map((region) => ({ region, score: support(region) }));
    scored.sort((a, b) => b.score[0] - a.score[0] || b.score[1] - a.score[1]);
    return { changed: true, kept: [scored[0].region], fallen: scored.slice(1).map((item) => item.region) };
}

// ---- 折纸与展开 ----

export const SHEET = 150;   // 整张纸是以原点为中心、边长 300 的正方形
const S = SHEET;
const rect = (x0, y0, x1, y1) => [{ outer: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], holes: [] }];

// 每种折法：折好后露在外面的那一片（wedge）、它贴着的折痕（到折痕的有向距离），以及展开时它的各个镜像。
// 镜像都是坐标取反或交换，折痕上的点映射后完全不变。
export const FOLDS = {
    2: { wedge: rect(0, -S, S, S), foldLines: [(p) => p.x], maps: [(p) => p, (p) => ({ x: -p.x, y: p.y })] },
    4: {
        wedge: rect(0, 0, S, S),
        foldLines: [(p) => p.x, (p) => p.y],
        maps: [(p) => p, (p) => ({ x: -p.x, y: p.y }), (p) => ({ x: p.x, y: -p.y }), (p) => ({ x: -p.x, y: -p.y })]
    },
    8: {
        wedge: [{ outer: [{ x: 0, y: 0 }, { x: S, y: 0 }, { x: S, y: S }], holes: [] }],
        foldLines: [(p) => p.y, (p) => (p.x - p.y) * Math.SQRT1_2],
        maps: [
            (p) => p, (p) => ({ x: p.y, y: p.x }), (p) => ({ x: -p.x, y: p.y }), (p) => ({ x: -p.y, y: p.x }),
            (p) => ({ x: p.x, y: -p.y }), (p) => ({ x: p.y, y: -p.x }), (p) => ({ x: -p.x, y: -p.y }), (p) => ({ x: -p.y, y: -p.x })
        ]
    }
};

const mapShape = (shape, map) => normalizeShape(shape.map((region) => ({
    outer: region.outer.map(map), holes: region.holes.map((hole) => hole.map(map))
})));

/** 展开后的各个镜像（不合并），画面直接把它们叠着画。 */
export const unfoldCopies = (shape, fold) => FOLDS[fold].maps.map((map) => mapShape(shape, map));

/**
 * 剪窗花时手捏着的是折起来的那一边：一块纸贴着折痕的边越长，展开后连成的那片就越大。
 * 所以留下的是贴着折痕最长的那块；都不贴折痕（比如外角上剪下的碎片）时，按面积。
 */
export function foldSupport(fold) {
    const lines = FOLDS[fold].foldLines;
    return (region) => {
        let length = 0;
        for (const ring of [region.outer, ...region.holes]) {
            for (let i = 0; i < ring.length; i++) {
                const a = ring[i];
                const b = ring[(i + 1) % ring.length];
                if (lines.some((distance) => Math.abs(distance(a)) <= 1e-6 * SHEET && Math.abs(distance(b)) <= 1e-6 * SHEET)) {
                    length += Math.hypot(b.x - a.x, b.y - a.y);
                }
            }
        }
        return [Math.round(length * 1000) / 1000, shapeArea([region])];
    };
}

/** 展开后合并成一整张：相邻两片沿折痕共边，并集会把折痕抹掉，折痕上的缺口变成洞。 */
export function unfold(shape, fold) {
    let sheet = [];
    for (const copy of unfoldCopies(shape, fold)) {
        sheet = sheet.length ? booleanOp(sheet, copy, 'union') : copy;
        if (!sheet) return null;
    }
    return sheet;
}

// ---- 自由折叠 ----
//
// 自由模式里玩家自己挑对称轴折，折了还能剪、剪了还能再折。所以不再只存"折好的那一片"，而是存：
//   sheet：展开状态下的整张纸（权威几何，剪刀最终改的是它）；
//   wedge：现在折成的这一叠露在外面的形状（纸的坐标）；
//   maps：这一叠里每一层对应整张纸的哪里——wedge 上的点 p 在第 i 层就是整张纸上的 maps[i](p)。
// 一刀剪在折好的这一叠上，就是把（带子 ∩ wedge）经过每一层的映射搬到整张纸上，再从整张纸里减掉。
// 对称轴只有过纸中心的竖、横、两条对角线四条，映射都是 0 和 ±1 组成的矩阵，复合是精确的；最多折三次，最多 8 层。

// 线性映射 [a, b, c, d]：p ↦ (a·x + b·y, c·x + d·y)。
export const applyMap = (m, p) => ({ x: m[0] * p.x + m[1] * p.y, y: m[2] * p.x + m[3] * p.y });
const compose = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3]];
export const invertMap = (m) => [m[0], m[2], m[1], m[3]];   // 正交矩阵的逆就是转置
const IDENTITY = [1, 0, 0, 1];
const BIG = 4 * S;
const half = (points) => [{ outer: points.map(([x, y]) => ({ x, y })), holes: [] }];

// 每条轴：名字、镜像矩阵、折的时候留下哪一侧（把另一侧翻过来叠上去）、轴在整张纸上的那条折痕。
export const AXES = {
    vertical: { name: '竖折', reflect: [-1, 0, 0, 1], keep: half([[0, -BIG], [BIG, -BIG], [BIG, BIG], [0, BIG]]), crease: [{ x: 0, y: -S }, { x: 0, y: S }] },
    horizontal: { name: '横折', reflect: [1, 0, 0, -1], keep: half([[-BIG, 0], [BIG, 0], [BIG, BIG], [-BIG, BIG]]), crease: [{ x: -S, y: 0 }, { x: S, y: 0 }] },
    diagonal: { name: '斜折', reflect: [0, 1, 1, 0], keep: half([[-BIG, -BIG], [BIG, -BIG], [BIG, BIG]]), crease: [{ x: -S, y: -S }, { x: S, y: S }] },
    anti: { name: '反斜折', reflect: [0, -1, -1, 0], keep: half([[BIG, -BIG], [BIG, BIG], [-BIG, BIG]]), crease: [{ x: -S, y: S }, { x: S, y: -S }] }
};

const mapRegions = (shape, m) => mapShape(shape, (p) => applyMap(m, p));

/** 一张没剪过、没折过的纸。 */
export const freshSheet = () => ({ sheet: rect(-S, -S, S, S), wedge: rect(-S, -S, S, S), maps: [IDENTITY], axes: [] });

/**
 * 沿一条轴把现在这一叠折起来。只能沿这一叠自己的对称轴折：折过去的那一半要正好盖住留下的那一半，
 * 每一层才铺满新的这一叠（例如竖折后的半张纸关于对角线不对称，斜着折会有一截悬在外面，不允许）。
 * 不对称、或者轴没穿过这一叠时返回 null。翻过来的那些层，在新位置 p 上对应的是旧位置 R(p)，所以新层的映射是 m∘R。
 */
export function isSymmetricAbout(wedge, key) {
    const mirrored = mapRegions(wedge, AXES[key].reflect);
    const overlap = booleanOp(wedge, mirrored, 'intersection');
    const area = shapeArea(wedge);
    return Boolean(overlap) && Math.abs(shapeArea(overlap) - area) <= area * 1e-9;
}

export function foldAlong(state, key) {
    const axis = AXES[key];
    if (!isSymmetricAbout(state.wedge, key)) return null;
    // 关于这条轴对称，轴就一定穿过这一叠的中间，折完正好剩一半。
    const wedge = booleanOp(state.wedge, axis.keep, 'intersection');
    if (!wedge) return null;
    const seen = new Set();
    const maps = [...state.maps, ...state.maps.map((m) => compose(m, axis.reflect))].filter((m) => {
        const id = m.join();
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
    });
    return { sheet: state.sheet, wedge, maps, axes: [...state.axes, key] };
}

/** 按顺序重新折一遍：展开一层 = 少折最后那一次。 */
export function refold(sheet, axes) {
    let state = { ...freshSheet(), sheet };
    for (const key of axes) {
        state = foldAlong(state, key);
        if (!state) return null;
    }
    return state;
}

export const unfoldOne = (state) => refold(state.sheet, state.axes.slice(0, -1));

// 线段 a→b 落在区域内部的总长度：和每条边求交，把线段切成小段，逐段看中点在不在区域里。
function lineCoverage(region, a, b) {
    const ts = [0, 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    for (const ring of [region.outer, ...region.holes]) {
        for (let i = 0; i < ring.length; i++) {
            const p = ring[i];
            const q = ring[(i + 1) % ring.length];
            const ex = q.x - p.x;
            const ey = q.y - p.y;
            const denom = dx * ey - dy * ex;
            if (denom === 0) continue;
            const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / denom;
            const u = ((p.x - a.x) * dy - (p.y - a.y) * dx) / denom;
            if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
        }
    }
    ts.sort((m, n) => m - n);
    let length = 0;
    for (let i = 0; i + 1 < ts.length; i++) {
        const mid = (ts[i] + ts[i + 1]) / 2;
        if (pointInShape({ x: a.x + dx * mid, y: a.y + dy * mid }, [region])) length += (ts[i + 1] - ts[i]) * Math.hypot(dx, dy);
    }
    return length;
}

/**
 * 自由模式里哪块留在手里：和折好的那一片一样的道理，手捏的是折痕。把这一叠里所有折痕（各层镜像的对称轴）
 * 放回整张纸上，哪块盖住的折痕最长就留哪块；还没折过时按面积。
 */
export function creaseSupport(state) {
    const creases = Object.values(AXES).filter((axis) => state.maps.some((m) => m.join() === axis.reflect.join())).map((axis) => axis.crease);
    return (region) => [Math.round(creases.reduce((sum, [a, b]) => sum + lineCoverage(region, a, b), 0) * 1000) / 1000, shapeArea([region])];
}

/**
 * 在折好的这一叠上剪一刀：带子先裁到这一叠的范围里，再按每一层的映射搬到整张纸上减掉。
 * 返回 { changed, state, fallen }，fallen 是整张纸坐标里掉下去的块；任何一步布尔运算失败都返回 null，
 * 调用方保留这一刀之前的纸（整刀一起回滚，保证各层始终对称）。
 */
export function cutFolded(state, band) {
    const piece = booleanOp(band, state.wedge, 'intersection');
    if (!piece) return null;
    if (!piece.length) return { changed: false, state, fallen: [] };
    let sheet = state.sheet;
    for (const m of state.maps) {
        sheet = booleanOp(sheet, mapRegions(piece, m), 'difference');
        if (!sheet) return null;
    }
    const before = shapeArea(state.sheet);
    if (before - shapeArea(sheet) <= before * 1e-9 && sheet.length === state.sheet.length) return { changed: false, state, fallen: [] };
    const support = creaseSupport(state);
    const scored = sheet.map((region) => ({ region, score: support(region) }));
    scored.sort((a, b) => b.score[0] - a.score[0] || b.score[1] - a.score[1]);
    return { changed: true, state: { ...state, sheet: [scored[0].region] }, fallen: scored.slice(1).map((item) => item.region) };
}

// ---- 评分 ----

/**
 * 相似度 = 交并比 IoU(纸, 目标)。各个镜像完全相同，所以在折好的一片上算就等于在展开的整张上算。
 * 剪少了（该剪的没剪）和剪多了（剪进了图案）都会拉低它。
 */
export function similarity(paper, target) {
    const both = booleanOp(paper, target, 'intersection');
    if (!both) return null;
    const inter = shapeArea(both);
    const union = shapeArea(paper) + shapeArea(target) - inter;
    return union > 0 ? inter / union : 1;
}

export const STAR_LINES = [0.7, 0.8, 0.9];
export const starsFor = (score) => STAR_LINES.filter((line) => score >= line).length;
