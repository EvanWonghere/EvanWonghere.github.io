// 剪下来的纸屑：每一刀最多 3 块做真刚体（初速度、自转、阻尼），其余合并成一块只做视觉的碎片；
// 碎片总数由固定大小的池兜底，超出时最早的那块直接回收，手机上也不会越剪越卡。固定步长推进，和帧率无关。
// 碎片之间不碰撞，也不落在桌面上：它们一路掉出画面下沿就回收，不会挡住正在剪的纸。

import { regionArea } from './polygon-boolean.mjs';

export const STEP = 1 / 120;
export const RIGID_PER_CUT = 3;
export const POOL_SIZE = 32;

const GRAVITY = 1500;
const LINEAR_DAMPING = 0.8;
const ANGULAR_DAMPING = 0.6;

function regionCentroid(region) {
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (const ring of [region.outer, ...region.holes]) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const f = ring[j].x * ring[i].y - ring[i].x * ring[j].y;
            area += f;
            cx += (ring[j].x + ring[i].x) * f;
            cy += (ring[j].y + ring[i].y) * f;
        }
    }
    return { x: cx / (3 * area), y: cy / (3 * area) };
}

function centroidOf(regions) {
    let total = 0;
    let x = 0;
    let y = 0;
    for (const region of regions) {
        const area = regionArea(region);
        const c = regionCentroid(region);
        total += area;
        x += c.x * area;
        y += c.y * area;
    }
    return { x: x / total, y: y / total };
}

function makeFragment(regions, { rigid, style, impulse }) {
    const area = regions.reduce((sum, region) => sum + regionArea(region), 0);
    const c = centroidOf(regions);
    const toLocal = (ring) => ring.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
    const local = regions.map((region) => ({ outer: toLocal(region.outer), holes: region.holes.map(toLocal) }));
    // 外接圆半径：整块碎片都在质心周围这个半径以内，用来判断它是否已经完全掉出画面。
    const radius = Math.max(...local.flatMap((region) => region.outer.map((p) => Math.hypot(p.x, p.y))));
    // 自转与面积的平方根成反比：大块慢慢歪倒，小片转得快；重力对所有碎片一样。
    const spin = rigid ? impulse.side * Math.min(7, 40 / Math.sqrt(Math.max(area, 1))) : 0;
    return {
        regions: local, area, rigid, style,
        x: c.x, y: c.y, angle: 0,
        vx: impulse.vx + (rigid ? impulse.side * 30 : 0), vy: impulse.vy, w: spin,
        radius
    };
}

/**
 * 把掉下来的区域加入池子：按面积从大到小，前 rigidBudget 块各自是刚体，其余合成一块视觉碎片。
 * 一刀会分成很多批处理，调用方把这一刀剩下的刚体名额传进来，保证整刀最多 RIGID_PER_CUT 块刚体。
 * vx、vy 是沿剪刀方向的一点初速度；sideOf 按碎片在剪刀哪一侧决定自转方向。返回用掉的刚体名额。
 */
export function spawnFragments(pool, regions, { style, vx = 0, vy = -120, sideOf = () => 1, rigidBudget = RIGID_PER_CUT } = {}) {
    if (!regions.length) return 0;
    const sorted = regions.slice().sort((a, b) => regionArea(b) - regionArea(a));
    const rigid = sorted.slice(0, Math.max(0, rigidBudget));
    const rest = sorted.slice(rigid.length);
    for (const region of rigid) {
        const c = regionCentroid(region);
        pool.push(makeFragment([region], { rigid: true, style, impulse: { vx, vy, side: sideOf(c) } }));
    }
    if (rest.length) pool.push(makeFragment(rest, { rigid: false, style, impulse: { vx, vy, side: 1 } }));
    while (pool.length > POOL_SIZE) pool.shift();
    return rigid.length;
}

/** 推进一步；整块碎片都落到 bottom 以下（掉出画面）时回收。 */
export function stepFragments(pool, bottom, dt = STEP) {
    for (let i = pool.length - 1; i >= 0; i--) {
        const f = pool[i];
        f.vy += GRAVITY * dt;
        f.vx *= 1 - LINEAR_DAMPING * dt;
        f.vy *= 1 - LINEAR_DAMPING * dt * 0.5;
        f.w *= 1 - ANGULAR_DAMPING * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.angle += f.w * dt;
        if (f.y - f.radius > bottom) pool.splice(i, 1);
    }
}

export function advanceFragments(state, seconds, bottom, maxSteps = 8) {
    state.accumulator = Math.min(state.accumulator + seconds, STEP * maxSteps);
    let steps = 0;
    while (state.accumulator >= STEP) {
        stepFragments(state.pool, bottom);
        state.accumulator -= STEP;
        steps++;
    }
    return steps;
}

