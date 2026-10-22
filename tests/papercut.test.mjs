import test from 'node:test';
import assert from 'node:assert/strict';

import {
    booleanOp, shapeArea, isValidShape, ringArea, pointInShape, pointInRing, ringsOf, normalizeShape
} from '../static/games/engines/polygon-boolean.mjs';
import {
    makeBand, capsule, cutPaper, nextBatch, simplifyPath, FOLDS, unfold, unfoldCopies, similarity, starsFor, foldSupport,
    freshSheet, foldAlong, unfoldOne, cutFolded, AXES, applyMap
} from '../static/games/engines/papercut.mjs';
import { spawnFragments, advanceFragments, POOL_SIZE, RIGID_PER_CUT, STEP } from '../static/games/engines/paper-fragments.mjs';
import { LEVELS } from '../static/games/papercut-app/levels.mjs';
import { CUT_RADIUS } from '../static/games/papercut-app/config.mjs';

const rect = (x0, y0, x1, y1) => [{ outer: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], holes: [] }];
const P = (pairs) => pairs.map(([x, y]) => ({ x, y }));
const near = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? ''} ${actual} ≠ ${expected}`);

const paper = rect(0, 0, 200, 300);

// 面积守恒：剪之前的纸 = 剪之后的所有块（留下的 + 掉下的）+ 纸和带子的交集。交集是独立算的，不是用减法倒推。
function assertConserved(before, band, after, label = '') {
    const removed = booleanOp(before, band, 'intersection');
    assert.ok(removed, `${label} 交集失败`);
    near(shapeArea(after) + shapeArea(removed), shapeArea(before), 1e-6 * shapeArea(before), `${label} 面积不守恒`);
}

// ---- 带子与切割 ----

test('带子：折线向两侧膨胀、两端和转角是圆角，轨迹上的采样点都在带子里', () => {
    const path = P([[100, 100], [160, 120], [200, 190], [150, 240]]);
    const band = makeBand(path, 4);
    assert.ok(band && isValidShape(band));
    assert.equal(band.length, 1, '连续轨迹应是一整条带子');
    for (let i = 0; i + 1 < path.length; i++) {
        for (let t = 0; t <= 1; t += 0.1) {
            const p = { x: path[i].x + (path[i + 1].x - path[i].x) * t, y: path[i].y + (path[i + 1].y - path[i].y) * t };
            assert.ok(pointInShape(p, band), `采样点不在带子里：${JSON.stringify(p)}`);
        }
    }
    assert.ok(pointInShape({ x: 100 - 3.8 * 0.95, y: 100 - 3.8 * 0.3 }, band), '端点外侧接近半径处仍在带子里：两端是圆角');
    assert.ok(!pointInShape({ x: 160, y: 130 }, band), '离轨迹超过半径的点不在带子里');
});

test('一刀剪断：纸分成两块，大的留在手里，小的掉下；面积守恒', () => {
    const band = makeBand(P([[-20, 220], [220, 220]]), 3);
    const result = cutPaper(paper, band);
    assert.ok(result.changed);
    assert.equal(result.kept.length, 1);
    assert.equal(result.fallen.length, 1);
    assert.ok(isValidShape(result.kept) && isValidShape(result.fallen));
    assert.ok(result.kept[0].outer.every((p) => p.y <= 220), '留下的是上面大的那块');
    assertConserved(paper, band, [...result.kept, ...result.fallen]);
});

test('在中间剪：不碰边界的一刀挖出一个洞，洞在外轮廓里，方向相反', () => {
    const band = makeBand(P([[60, 150], [140, 150]]), 3);
    const result = cutPaper(paper, band);
    assert.equal(result.kept.length, 1);
    assert.equal(result.fallen.length, 0);
    const region = result.kept[0];
    assert.equal(region.holes.length, 1);
    assert.ok(ringArea(region.outer) > 0 && ringArea(region.holes[0]) < 0);
    assert.ok(region.holes[0].every((p) => pointInRing(p, region.outer)));
    assertConserved(paper, band, result.kept);
});

test('绕一圈剪：中间的岛失去支撑掉下去，纸上留下一个洞', () => {
    const band = makeBand(P([[50, 100], [150, 100], [150, 200], [50, 200], [50, 100]]), 3);
    assert.ok(band && isValidShape(band));
    assert.equal(band[0].holes.length, 1, '闭合的带子本身带一个洞');
    const result = cutPaper(paper, band);
    assert.equal(result.kept.length, 1);
    assert.equal(result.kept[0].holes.length, 1);
    assert.equal(result.fallen.length, 1, '岛掉下去');
    assertConserved(paper, band, [...result.kept, ...result.fallen]);
});

test('洞里的岛还能再挖洞：新洞挂在岛上，不挂在外面那块上', () => {
    const square = rect(0, 0, 100, 100);
    const ring = booleanOp(rect(20, 20, 80, 80), rect(25, 25, 75, 75), 'difference');
    const withIsland = booleanOp(square, ring, 'difference');
    const nested = booleanOp(withIsland, rect(40, 40, 60, 60), 'difference');
    assert.ok(nested && isValidShape(nested));
    assert.equal(nested.length, 2);
    const [outer, island] = nested.slice().sort((a, b) => shapeArea([b]) - shapeArea([a]));
    assert.equal(outer.holes.length, 1, '外面那块只有原来的环形洞');
    assert.equal(island.holes.length, 1, '新洞属于岛');
    near(shapeArea(nested), 10000 - 1100 - 400, 1e-6);

    // 再在岛的边上剪一刀：岛上那个洞离剪刀很远，不进平面划分，算完要挂回岛上，不能挂到外面那块。
    const again = booleanOp(nested, capsule({ x: 70, y: 30 }, { x: 70, y: 36 }, 1.5), 'difference');
    assert.ok(again && isValidShape(again));
    const [bigAgain, islandAgain] = again.slice().sort((a, b) => shapeArea([b]) - shapeArea([a]));
    assert.equal(bigAgain.holes.length, 1);
    assert.equal(islandAgain.holes.length, 2, '岛上原来的洞和新剪的洞都在');
});

test('凹形的纸一刀剪成三块：最大的留下，另外两块掉下', () => {
    const u = [{ outer: P([[0, 0], [200, 0], [200, 300], [140, 300], [140, 60], [60, 60], [60, 300], [0, 300]]), holes: [] }];
    const band = makeBand(P([[-20, 200], [220, 200]]), 3);
    const result = cutPaper(u, band);
    assert.equal(result.kept.length, 1);
    assert.equal(result.fallen.length, 2);
    assert.ok(result.kept[0].outer.every((p) => p.y <= 200));
    assertConserved(u, band, [...result.kept, ...result.fallen]);
});

test('剪刀没碰到纸时不算改变几何', () => {
    const result = cutPaper(paper, makeBand(P([[300, 10], [380, 30]]), 3));
    assert.equal(result.changed, false);
    assert.equal(result.kept, paper);
});

// ---- 边拖边剪 ----

test('分批：相邻两批首尾重叠一段；同一处剪两次结果不变', () => {
    const samples = P([[0, 0], [10, 0], [20, 0], [30, 0], [40, 0], [50, 0]]);
    assert.equal(nextBatch(samples.slice(0, 3), 0), null, '新点不够');
    const first = nextBatch(samples.slice(0, 4), 0);
    assert.deepEqual(first.points, samples.slice(0, 4));
    assert.equal(first.cursor, 3);
    const second = nextBatch(samples, first.cursor, { final: true });
    assert.deepEqual(second.points, samples.slice(2), '第二批从上一批的倒数第二个点开始');

    const band = makeBand(P([[-20, 160], [220, 160]]), 3);
    const once = booleanOp(paper, band, 'difference');
    const twice = booleanOp(once, band, 'difference');
    assert.ok(twice && isValidShape(twice));
    near(shapeArea(twice), shapeArea(once), 1e-6, '重复减同一条带子');
    assert.equal(twice.length, once.length);
});

test('边拖边剪：一笔分成很多批剪完，交界处没有留下细缝，纸确实断成两块', () => {
    const samples = [];
    for (let x = -20; x <= 220; x += 5) samples.push({ x, y: 150 + Math.sin(x / 25) * 30 });
    let shape = paper;
    let cursor = 0;
    let batches = 0;
    for (let end = 2; end <= samples.length; end++) {
        const batch = nextBatch(samples.slice(0, end), cursor, { final: end === samples.length });
        if (!batch) continue;
        cursor = batch.cursor;
        batches++;
        const band = makeBand(simplifyPath(batch.points, 0.8), 2);
        const next = booleanOp(shape, band, 'difference');
        assert.ok(next && isValidShape(next));
        assertConserved(shape, band, next, `第 ${end} 个点`);
        shape = next;
    }
    assert.ok(batches > 10, `应分成很多批：${batches}`);
    assert.equal(shape.length, 2, '一笔横穿应剪成两块');
});

// ---- 随机测试 ----

function random(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function blob(rand, cx, cy, radius) {
    const count = 10 + Math.floor(rand() * 20);
    return [{
        outer: Array.from({ length: count }, (_, i) => {
            const angle = i / count * Math.PI * 2;
            const r = radius * (0.55 + rand() * 0.45);
            return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
        }),
        holes: []
    }];
}

test('随机形状 + 随机剪刀轨迹，连续剪 12 刀：每一刀都面积守恒、结果合法', () => {
    const rand = random(20261019);
    let cuts = 0;
    let holes = 0;
    let splits = 0;
    for (let round = 0; round < 25; round++) {
        let shape = blob(rand, 300, 300, 120 + rand() * 60);
        for (let k = 0; k < 12; k++) {
            const points = [];
            let p = { x: 140 + rand() * 320, y: 140 + rand() * 320 };
            const steps = 2 + Math.floor(rand() * 6);
            for (let i = 0; i < steps; i++) {
                points.push(p);
                p = { x: p.x + (rand() - 0.5) * 160, y: p.y + (rand() - 0.5) * 160 };
            }
            const band = makeBand(points, 2 + rand() * 4);
            assert.ok(band, '带子并集失败');
            const next = booleanOp(shape, band, 'difference');
            assert.ok(next, `第 ${round} 轮第 ${k} 刀差集失败`);
            assert.ok(isValidShape(next));
            assertConserved(shape, band, next, `第 ${round} 轮第 ${k} 刀`);
            if (next.some((region) => region.holes.length)) holes++;
            if (next.length > shape.length) splits++;
            shape = next;
            cuts++;
        }
    }
    assert.equal(cuts, 300);
    assert.ok(holes > 10 && splits > 10, `覆盖不够：洞 ${holes}，断开 ${splits}`);
});

test('并集、交集、差集互相印证：|A| = |A − B| + |A ∩ B|，|A ∪ B| = |A| + |B| − |A ∩ B|', () => {
    const rand = random(7);
    for (let i = 0; i < 120; i++) {
        const a = blob(rand, 300, 300, 150);
        const b = blob(rand, 260 + rand() * 80, 260 + rand() * 80, 110);
        const diff = booleanOp(a, b, 'difference');
        const both = booleanOp(a, b, 'intersection');
        const union = booleanOp(a, b, 'union');
        assert.ok(diff && both && union);
        assert.ok(isValidShape(diff) && isValidShape(both) && isValidShape(union));
        near(shapeArea(diff) + shapeArea(both), shapeArea(a), 1e-6 * shapeArea(a));
        near(shapeArea(union), shapeArea(a) + shapeArea(b) - shapeArea(both), 1e-6 * shapeArea(union));
    }
});

test('退化情况：边重合、顶点落在边上、只在一个角接触、同一个胶囊减两次', () => {
    const square = rect(0, 0, 100, 100);
    near(shapeArea(booleanOp(square, rect(-10, -5, 110, 0), 'difference')), 10000, 1e-6, '带子贴着边');
    const sharedEdge = booleanOp(square, rect(100, 0, 150, 100), 'union');
    assert.equal(sharedEdge.length, 1);
    near(shapeArea(sharedEdge), 15000, 1e-6);
    const corner = booleanOp(square, rect(100, 100, 150, 150), 'union');
    assert.equal(corner.length, 2, '只碰一个角的两块仍是两块');
    assert.ok(isValidShape(corner));
    const vertexOnEdge = booleanOp(square, P([[50, 0], [60, 20], [40, 20]]).length && [{ outer: P([[50, 0], [60, 20], [40, 20]]), holes: [] }], 'difference');
    assert.ok(isValidShape(vertexOnEdge));
    near(shapeArea(vertexOnEdge), 9800, 1e-6);
    const once = booleanOp(square, capsule({ x: 50, y: 50 }, { x: 70, y: 50 }, 5), 'difference');
    const twice = booleanOp(once, capsule({ x: 50, y: 50 }, { x: 70, y: 50 }, 5), 'difference');
    assert.ok(isValidShape(twice));
    assert.equal(twice[0].holes.length, 1);
});

// ---- 折纸与展开 ----

test('展开：没剪过的一片展开后是整张纸，折痕被抹掉', () => {
    for (const fold of [2, 4, 8]) {
        const sheet = unfold(FOLDS[fold].wedge, fold);
        assert.ok(sheet && isValidShape(sheet));
        assert.equal(sheet.length, 1, `${fold} 折展开应是一整张`);
        assert.equal(sheet[0].holes.length, 0);
        near(shapeArea(sheet), 300 * 300, 1e-6);
        assert.equal(unfoldCopies(FOLDS[fold].wedge, fold).length, fold);
    }
});

test('展开：折痕上的缺口变成洞，展开后的图案关于每条折痕对称', () => {
    const wedge = FOLDS[8].wedge;
    const notched = cutPaper(wedge, makeBand(P([[60, -10], [60, 20], [90, 20], [90, -10]]), 2), foldSupport(8)).kept;
    const sheet = unfold(notched, 8);
    assert.ok(sheet && isValidShape(sheet));
    assert.equal(sheet.length, 1);
    assert.equal(sheet[0].holes.length, 4, '贴着 x 轴折痕的缺口，八折展开后是四个洞');
    const rand = random(3);
    for (let i = 0; i < 300; i++) {
        const p = { x: (rand() - 0.5) * 300, y: (rand() - 0.5) * 300 };
        const inside = pointInShape(p, sheet);
        for (const mirror of [{ x: -p.x, y: p.y }, { x: p.x, y: -p.y }, { x: p.y, y: p.x }]) {
            assert.equal(pointInShape(mirror, sheet), inside, `不对称：${JSON.stringify(p)}`);
        }
    }
});

test('留在手里的是贴着折痕最长的那块：剪出半颗心时，心留下、比它大的废纸掉下', () => {
    const wedge = FOLDS[2].wedge;
    // 从折痕上 y = −120 剪到右边再回到折痕 y = 120：剩下的那块面积大得多，但贴着折痕的只有 60；剪出的这块贴着 240。
    const band = makeBand(P([[-5, -120], [40, -120], [40, 120], [-5, 120]]), 1.5);
    const result = cutPaper(wedge, band, foldSupport(2));
    assert.equal(result.fallen.length, 1);
    assert.ok(shapeArea(result.kept) < shapeArea(result.fallen), '留下的那块比掉下的小');
    assert.ok(result.kept[0].outer.every((p) => p.x <= 42), '留下的是贴着折痕的那块');
    const byArea = cutPaper(wedge, band);
    assert.ok(shapeArea(byArea.kept) > shapeArea(byArea.fallen), '默认规则按面积');
    const corner = cutPaper(FOLDS[4].wedge, makeBand(P([[100, 160], [160, 100]]), 1.5), foldSupport(4));
    assert.ok(corner.kept[0].outer.some((p) => p.x === 0), '外角剪下的碎片不贴折痕，掉下去');
});

// ---- 自由折叠 ----

test('自由折叠：每折一次层数翻倍、面积减半；最多折三次，沿边或重复的轴折不了', () => {
    let state = freshSheet();
    const areas = [];
    for (const key of ['vertical', 'horizontal', 'diagonal']) {
        state = foldAlong(state, key);
        assert.ok(state, `${key} 应能折`);
        areas.push(shapeArea(state.wedge));
    }
    assert.deepEqual(areas.map(Math.round), [45000, 22500, 11250]);
    assert.equal(state.maps.length, 8);
    assert.equal(foldAlong(state, 'anti'), null, '第四条轴贴着这一叠的边，折不了');
    assert.equal(foldAlong(foldAlong(freshSheet(), 'vertical'), 'vertical'), null, '同一条轴不能再折');
    const back = unfoldOne(state);
    assert.equal(back.maps.length, 4);
    near(shapeArea(back.wedge), 22500, 1e-6);
    assert.equal(back.sheet, state.sheet, '展开不改纸');
});

test('自由折叠：折成八层后剪，和关卡里"折好的一片 + 展开"结果一致', () => {
    let state = freshSheet();
    for (const key of ['vertical', 'horizontal', 'diagonal']) state = foldAlong(state, key);
    const band = makeBand(P([[60, -10], [60, 20], [90, 20], [90, -10]]), 2);
    const loop = makeBand(P([[110, 40], [130, 40], [130, 60], [110, 60], [110, 40]]), 1.5);
    let free = cutFolded(state, band).state;
    free = cutFolded(free, loop).state;
    let wedge = cutPaper(FOLDS[8].wedge, band, foldSupport(8)).kept;
    wedge = cutPaper(wedge, loop, foldSupport(8)).kept;
    const sheet = unfold(wedge, 8);
    assert.ok(isValidShape(free.sheet));
    near(shapeArea(free.sheet), shapeArea(sheet), 1e-6 * shapeArea(sheet));
    assert.equal(free.sheet[0].holes.length, sheet[0].holes.length);
});

test('自由折叠：先剪再折——折之前剪的洞只有一个，折之后剪的才是对称的一对', () => {
    let state = freshSheet();
    state = cutFolded(state, makeBand(P([[-110, -110], [-90, -110], [-90, -90], [-110, -90], [-110, -110]]), 1.5)).state;
    assert.equal(state.sheet[0].holes.length, 1);
    state = foldAlong(state, 'vertical');
    state = cutFolded(state, makeBand(P([[50, 50], [70, 50], [70, 70], [50, 70], [50, 50]]), 1.5)).state;
    const holes = state.sheet[0].holes;
    assert.equal(holes.length, 3, '先剪的 1 个 + 折着剪的 2 个');
    assert.ok(isValidShape(state.sheet));
    // 折着剪的那一对关于竖轴对称，先剪的那个在左上，右上对应位置没有洞。
    assert.ok(!pointInShape({ x: 60, y: 60 }, state.sheet) && !pointInShape({ x: -60, y: 60 }, state.sheet));
    assert.ok(!pointInShape({ x: -100, y: -100 }, state.sheet) && pointInShape({ x: 100, y: -100 }, state.sheet));
});

test('自由折叠：只剪这一叠范围内的部分，带子伸到外面的那截不会剪到别的层', () => {
    const state = foldAlong(freshSheet(), 'vertical');
    // 折好后只剩右半边一叠（两层）。从左边画面外剪到 x = 100：真正剪到纸的只有 0..100 这一截，
    // 两层展开是 −100..100 的一道缝，纸不会断开；如果不裁，左边那截会再剪一次，把整张纸剪成两半。
    const result = cutFolded(state, makeBand(P([[-200, 0], [100, 0]]), 2));
    assert.ok(result.changed);
    assert.equal(result.fallen.length, 0);
    assert.equal(result.state.sheet.length, 1);
    assert.equal(result.state.sheet[0].holes.length, 1, '中间一道缝');
    assert.ok(pointInShape({ x: 130, y: 0 }, result.state.sheet) && pointInShape({ x: -130, y: 0 }, result.state.sheet));
});

test('自由折叠：先斜折再反斜折，四层各自落在整张纸的对应位置', () => {
    let state = foldAlong(freshSheet(), 'diagonal');
    state = foldAlong(state, 'anti');
    assert.equal(state.maps.length, 4);
    // 在 (100, 30) 附近挖一个小洞：四层分别对应整张纸上的 (100,30)、(30,100)、(−30,−100)、(−100,−30)。
    state = cutFolded(state, makeBand(P([[96, 26], [104, 26], [104, 34], [96, 34], [96, 26]]), 1)).state;
    for (const [x, y] of [[100, 30], [30, 100], [-30, -100], [-100, -30]]) assert.ok(!pointInShape({ x, y }, state.sheet), `(${x}, ${y}) 应是洞`);
    for (const [x, y] of [[100, -30], [-100, 30]]) assert.ok(pointInShape({ x, y }, state.sheet), `(${x}, ${y}) 不在任何一层上`);
    assert.equal(state.sheet[0].holes.length, 4);
});

test('自由折叠：只能沿这一叠的对称轴折；任何合法折法下，各层的像正好铺满整张纸、互不重叠', () => {
    assert.equal(foldAlong(foldAlong(freshSheet(), 'vertical'), 'diagonal'), null, '竖折后的半张纸关于对角线不对称，折不齐');
    assert.equal(foldAlong(foldAlong(freshSheet(), 'horizontal'), 'anti'), null);
    const keys = Object.keys(AXES);
    let checked = 0;
    let deepest = 0;
    const walk = (state, depth) => {
        const images = state.maps.map((m) => normalizeShape(state.wedge.map((region) => ({ outer: region.outer.map((p) => applyMap(m, p)), holes: [] }))));
        near(images.reduce((sum, image) => sum + shapeArea(image), 0), 90000, 1e-6, `${state.axes.join(',')} 各层面积之和`);
        let union = images[0];
        for (const image of images.slice(1)) union = booleanOp(union, image, 'union');
        near(shapeArea(union), 90000, 1e-6, `${state.axes.join(',')} 各层的像没有铺满或有重叠`);
        checked++;
        deepest = Math.max(deepest, depth);
        for (const key of keys) {
            const next = foldAlong(state, key);
            if (next) walk(next, depth + 1);
        }
    };
    walk(freshSheet(), 0);
    assert.equal(deepest, 3, '最多折三次');
    assert.equal(checked, 13, '不折 1 种；第一次 4 条轴；之后每一步都只剩 1 条对称轴：1 + 4 + 4 + 4');
});

// ---- 评分与关卡 ----

test('相似度：完全一样是 1，完全不重叠是 0；星级按 0.70 / 0.80 / 0.90', () => {
    near(similarity(paper, paper), 1, 1e-12);
    assert.equal(similarity(rect(0, 0, 10, 10), rect(20, 20, 30, 30)), 0);
    near(similarity(rect(0, 0, 10, 10), rect(0, 0, 10, 20)), 0.5, 1e-12);
    assert.deepEqual([0.69, 0.7, 0.8, 0.9, 1].map(starsFor), [0, 1, 2, 3, 3]);
});

// 参考剪法：沿着铅笔线（目标边界里不贴着纸边的部分）把该剪掉的每一块绕一圈剪下来。
function traceSolution(level) {
    const wedge = FOLDS[level.fold].wedge;
    const waste = booleanOp(wedge, level.target, 'difference');
    let shape = wedge;
    for (const ring of ringsOf(waste)) {
        const band = makeBand([...ring, ring[0]], CUT_RADIUS);
        assert.ok(band, `${level.id} 带子失败`);
        const next = cutPaper(shape, band, foldSupport(level.fold));
        assert.ok(next, `${level.id} 剪切失败`);
        shape = next.kept;
    }
    return shape;
}

test('每一关：目标合法、在折好的那片里；不剪 0 星，沿铅笔线剪能拿三星', () => {
    const ids = new Set();
    for (const level of LEVELS) {
        assert.ok(!ids.has(level.id));
        ids.add(level.id);
        const wedge = FOLDS[level.fold].wedge;
        assert.ok(isValidShape(level.target), `${level.id} 目标不合法`);
        near(shapeArea(booleanOp(level.target, wedge, 'intersection')), shapeArea(level.target), 1e-6, `${level.id} 目标超出了折好的那片`);
        assert.equal(starsFor(similarity(wedge, level.target)), 0, `${level.id} 不剪就有星`);
        const traced = traceSolution(level);
        const score = similarity(traced, level.target);
        assert.equal(starsFor(score), 3, `${level.id} 沿线剪只有 ${score.toFixed(3)}`);
        assert.ok(unfold(level.target, level.fold), `${level.id} 展开失败`);
    }
    assert.ok(LEVELS.length >= 8 && LEVELS.length <= 12);
});

// ---- 碎片 ----

test('碎片：每刀最多 3 块刚体，其余合并成一块；池子最多 32 块', () => {
    const pool = [];
    const pieces = Array.from({ length: 7 }, (_, i) => rect(i * 30, 0, i * 30 + 10 + i * 3, 20)[0]);
    spawnFragments(pool, pieces, { style: 'paper' });
    assert.equal(pool.length, RIGID_PER_CUT + 1);
    assert.equal(pool.filter((f) => f.rigid).length, RIGID_PER_CUT);
    const smallestRigid = Math.min(...pool.filter((f) => f.rigid).map((f) => f.area));
    const largestMerged = Math.max(...pool.find((f) => !f.rigid).regions.map((region) => shapeArea([region])));
    assert.ok(smallestRigid >= largestMerged, '刚体应是最大的几块');
    for (let i = 0; i < 20; i++) spawnFragments(pool, pieces, { style: 'paper' });
    assert.equal(pool.length, POOL_SIZE);
    // 一刀分成好几批时，名额用完后的批次只产生视觉碎片。
    const later = [];
    assert.equal(spawnFragments(later, pieces.slice(0, 2), { style: 'paper', rigidBudget: 2 }), 2);
    assert.equal(spawnFragments(later, pieces.slice(2, 4), { style: 'paper', rigidBudget: 1 }), 1);
    assert.equal(spawnFragments(later, pieces.slice(4), { style: 'paper', rigidBudget: 0 }), 0);
    assert.equal(later.filter((f) => f.rigid).length, RIGID_PER_CUT, '整刀最多 3 块刚体');
});

test('碎片：小片转得比大块快，掉出画面下沿后回收；固定步长与帧率无关', () => {
    const run = (frame, seconds) => {
        const state = { pool: [], accumulator: 0 };
        spawnFragments(state.pool, [rect(0, 0, 200, 100)[0], rect(300, 0, 310, 10)[0]], { style: 'paper', sideOf: () => 1 });
        const spins = state.pool.map((f) => Math.abs(f.w));
        let steps = 0;
        for (let t = 0; t < seconds - 1e-9; t += frame) steps += advanceFragments(state, frame, 800);
        return { state, spins, steps };
    };
    const fine = run(1 / 120, 0.5);
    const coarse = run(1 / 50, 0.5);
    assert.ok(fine.spins[1] > fine.spins[0] * 3, '小片应转得更快');
    assert.equal(fine.steps, coarse.steps);
    assert.equal(fine.steps, Math.round(0.5 / STEP));
    fine.state.pool.forEach((f, i) => near(f.y, coarse.state.pool[i].y, 1e-9));
    assert.equal(fine.state.pool.length, 2, '半秒时还在画面里');
    assert.ok(fine.state.pool.every((f) => f.y > 50), '在往下掉');
    assert.equal(run(1 / 60, 3).state.pool.length, 0, '三秒后都掉出了画面下沿、被回收');
});
