// 带洞多边形的布尔运算（差集、交集、并集），不依赖任何几何库。
//
// 数据：形状 Shape = 区域数组；区域 Region = { outer: 外轮廓, holes: [洞...] }；轮廓是 {x, y} 顶点数组。
// 输出的外轮廓逆时针（按 x 右、y 上的数学方向计面积为正），洞顺时针，洞里的岛是另一个独立区域。
//
// 做法是"平面划分 + 面分类"：
//   1. 把两个形状的所有边放在一起，在交点处断开；距离 ε 以内的点并成同一个结点。
//   2. 重合的边合并成一条，记下它在 A、B 里各出现了几次。
//   3. 沿半边走出平面图的每个面；在面里取一个样本点，用奇偶规则判断它在不在 A、在不在 B。
//   4. 按运算保留面（差集：在 A 不在 B），只留"一侧保留、另一侧不保留"的半边作为结果边界。
//   5. 把结果边界串成环：逆时针的是外轮廓，顺时针的是洞，洞挂到包含它的最小外轮廓下。
// 整个流程不靠"边的走向"判断里外，所以边重合、顶点落在边上这类退化情况不需要单独分支。
// 结果会再做一次合法性检查（环不自交、环之间只在顶点处接触、洞在外轮廓里），不合格返回 null，交给调用方回滚。
//
// 约定：形状、环和点都当作不可变的值，运算总是返回新的数组，不会改动传进来的形状。
// 所以环的面积和包围盒可以按环对象缓存，没碰到的环也可以原样放进结果里，不必复制。

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

const areaCache = new WeakMap();
const boxCache = new WeakMap();

export function ringArea(ring) {
    let area = areaCache.get(ring);
    if (area === undefined) {
        let sum = 0;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += ring[j].x * ring[i].y - ring[i].x * ring[j].y;
        area = sum / 2;
        areaCache.set(ring, area);
    }
    return area;
}

function ringBox(ring) {
    let box = boxCache.get(ring);
    if (!box) {
        box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        for (const p of ring) {
            if (p.x < box.minX) box.minX = p.x;
            if (p.x > box.maxX) box.maxX = p.x;
            if (p.y < box.minY) box.minY = p.y;
            if (p.y > box.maxY) box.maxY = p.y;
        }
        boxCache.set(ring, box);
    }
    return box;
}

export function regionArea(region) {
    return Math.abs(ringArea(region.outer)) - region.holes.reduce((sum, hole) => sum + Math.abs(ringArea(hole)), 0);
}

export const shapeArea = (shape) => shape.reduce((sum, region) => sum + regionArea(region), 0);

export const ringsOf = (shape) => shape.flatMap((region) => [region.outer, ...region.holes]);

export function distanceToSegment(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return dist(p, a);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

export function pointInRing(p, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i];
        const b = ring[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

// 奇偶规则：落在奇数个环里就算在形状内（洞自然被扣掉，洞里的岛又算回来）。
export const pointInShape = (p, shape) => ringsOf(shape).reduce((inside, ring) => (pointInRing(p, ring) ? !inside : inside), false);

export function shapeBounds(shape) {
    const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const ring of ringsOf(shape)) {
        const r = ringBox(ring);
        box.minX = Math.min(box.minX, r.minX); box.maxX = Math.max(box.maxX, r.maxX);
        box.minY = Math.min(box.minY, r.minY); box.maxY = Math.max(box.maxY, r.maxY);
    }
    return box;
}

const boxesOverlap = (a, b, pad = 0) => a.minX <= b.maxX + pad && b.minX <= a.maxX + pad && a.minY <= b.maxY + pad && b.minY <= a.maxY + pad;

// 外轮廓转成逆时针、洞转成顺时针；面积为零的环丢掉。方向已经对的环原样复用。
export function normalizeShape(shape) {
    return shape.filter((region) => region.outer.length >= 3 && ringArea(region.outer) !== 0).map((region) => ({
        outer: ringArea(region.outer) > 0 ? region.outer : region.outer.slice().reverse(),
        holes: region.holes.filter((hole) => hole.length >= 3 && ringArea(hole) !== 0)
            .map((hole) => (ringArea(hole) < 0 ? hole : hole.slice().reverse()))
    }));
}

function segmentsOf(shape, source) {
    const segments = [];
    for (const ring of ringsOf(shape)) {
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i];
            const b = ring[(i + 1) % ring.length];
            if (a.x === b.x && a.y === b.y) continue;
            segments.push({
                a, b, source, splits: [],
                minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y)
            });
        }
    }
    return segments;
}

// 记录 s 与 t 的公共点：真正相交的交点，以及一条线段的端点贴在另一条上（含共线重叠的两端）。
function recordContacts(s, t, eps) {
    for (const p of [s.a, s.b]) if (distanceToSegment(p, t.a, t.b) <= eps) t.splits.push(p);
    for (const p of [t.a, t.b]) if (distanceToSegment(p, s.a, s.b) <= eps) s.splits.push(p);
    const o1 = orient(s.a, s.b, t.a);
    const o2 = orient(s.a, s.b, t.b);
    const o3 = orient(t.a, t.b, s.a);
    const o4 = orient(t.a, t.b, s.b);
    if (o1 * o2 < 0 && o3 * o4 < 0) {
        const k = o1 / (o1 - o2);
        const p = { x: t.a.x + (t.b.x - t.a.x) * k, y: t.a.y + (t.b.y - t.a.y) * k };
        s.splits.push(p);
        t.splits.push(p);
    }
}

const KEEP = {
    difference: (inA, inB) => inA && !inB,
    intersection: (inA, inB) => inA && inB,
    union: (inA, inB) => inA || inB
};

/**
 * a op b。op 为 'difference' | 'intersection' | 'union'。
 * 返回规范化的形状；结果没通过合法性检查时返回 null（调用方应保留原几何）。
 */
export function booleanOp(a, b, op, { epsilon } = {}) {
    const keep = KEEP[op];
    if (!keep) throw new Error(`未知运算 ${op}`);
    const shapeA = normalizeShape(a);
    const shapeB = normalizeShape(b);
    if (!shapeA.length || !shapeB.length) {
        if (op === 'intersection') return [];
        return op === 'union' ? [...shapeA, ...shapeB] : shapeA;
    }
    const boxA = shapeBounds(shapeA);
    const boxB = shapeBounds(shapeB);
    const scale = Math.hypot(Math.max(boxA.maxX, boxB.maxX) - Math.min(boxA.minX, boxB.minX),
        Math.max(boxA.maxY, boxB.maxY) - Math.min(boxA.minY, boxB.minY));
    const eps = epsilon ?? Math.max(scale * 1e-8, 1e-9);
    if (!boxesOverlap(boxA, boxB, eps)) {
        if (op === 'intersection') return [];
        return op === 'union' ? [...shapeA, ...shapeB] : shapeA;
    }
    // 差集和交集只跟 B 碰得到的那些区域有关：包围盒碰不到 B 的区域原样保留（差集）或直接丢掉（交集），
    // 只把剩下的送进平面划分。剪过很多刀的纸会带着很多洞，这一步让每一刀的开销只取决于剪刀附近。
    // 同理，碰得到 B 的区域里，离 B 很远的洞也不参与：差集之后把它们挂回包含它们的结果区域，交集里直接丢掉。
    if (op !== 'union') {
        const near = [];
        const far = [];
        const farHoles = [];
        for (const region of shapeA) {
            if (!boxesOverlap(shapeBounds([region]), boxB, eps)) { far.push(region); continue; }
            const holes = [];
            for (const hole of region.holes) (boxesOverlap(ringBox(hole), boxB, eps) ? holes : farHoles).push(hole);
            near.push({ outer: region.outer, holes });
        }
        if (far.length || farHoles.length) {
            if (!near.length) return op === 'intersection' ? [] : far;
            const partial = booleanOp(near, shapeB, op, { epsilon: eps });
            if (!partial) return null;
            if (op === 'intersection') return partial;
            for (const hole of farHoles) {
                // 洞的左侧紧挨着它所在的区域：在那里取一个点，找包含它的最小结果外轮廓。
                let best = 0;
                for (let i = 1; i < hole.length; i++) {
                    if (dist(hole[i], hole[(i + 1) % hole.length]) > dist(hole[best], hole[(best + 1) % hole.length])) best = i;
                }
                const a = hole[best];
                const b = hole[(best + 1) % hole.length];
                const sample = { x: (a.x + b.x) / 2 - (b.y - a.y) * 1e-4, y: (a.y + b.y) / 2 + (b.x - a.x) * 1e-4 };
                const owner = partial.filter((region) => pointInRing(sample, region.outer))
                    .sort((p, q) => ringArea(p.outer) - ringArea(q.outer))[0];
                if (!owner) return null;
                owner.holes.push(hole);
            }
            return [...far, ...partial];
        }
    }

    const segmentsA = segmentsOf(shapeA, 0);
    const segmentsB = segmentsOf(shapeB, 1);
    for (const s of segmentsA) {
        if (!boxesOverlap(s, boxB, eps)) continue;
        for (const t of segmentsB) if (boxesOverlap(s, t, eps)) recordContacts(s, t, eps);
    }

    // 结点合并：网格哈希里查相邻格子，eps 以内的点视为同一结点。
    // 同一个顶点对象被相邻两条边共用，先按对象查一次，省掉一半网格查找。
    const nodes = [];
    const cell = Math.max(eps * 4, scale / 4096);
    const grid = new Map();
    const known = new Map();
    const nodeOf = (p) => {
        const cached = known.get(p);
        if (cached !== undefined) return cached;
        const index = locate(p);
        known.set(p, index);
        return index;
    };
    const locate = (p) => {
        const cx = Math.floor(p.x / cell);
        const cy = Math.floor(p.y / cell);
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const bucket = grid.get((cx + dx) * 4194304 + cy + dy);
                if (bucket) for (const index of bucket) if (dist(nodes[index], p) <= eps) return index;
            }
        }
        nodes.push({ x: p.x, y: p.y });
        const key = cx * 4194304 + cy;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(nodes.length - 1);
        return nodes.length - 1;
    };

    // 边去重：同一对结点只留一条边，分别数它在 A、B 里出现的次数（奇偶决定它是不是边界）。
    const edges = new Map();
    for (const segment of [...segmentsA, ...segmentsB]) {
        const dx = segment.b.x - segment.a.x;
        const dy = segment.b.y - segment.a.y;
        const along = (p) => (p.x - segment.a.x) * dx + (p.y - segment.a.y) * dy;
        const ordered = [segment.a, ...segment.splits, segment.b].sort((p, q) => along(p) - along(q)).map(nodeOf);
        for (let i = 0; i + 1 < ordered.length; i++) {
            const u = ordered[i];
            const v = ordered[i + 1];
            if (u === v) continue;
            const key = u < v ? u * 4194304 + v : v * 4194304 + u;
            let edge = edges.get(key);
            if (!edge) { edge = { u: Math.min(u, v), v: Math.max(u, v), countA: 0, countB: 0 }; edges.set(key, edge); }
            if (segment.source === 0) edge.countA++; else edge.countB++;
        }
    }
    const kept = [...edges.values()].filter((edge) => edge.countA % 2 || edge.countB % 2);

    const adjacency = new Map();
    const link = (u, v) => {
        if (!adjacency.has(u)) adjacency.set(u, []);
        adjacency.get(u).push(v);
    };
    for (const { u, v } of kept) { link(u, v); link(v, u); }
    for (const [u, around] of adjacency) {
        const angle = (v) => Math.atan2(nodes[v].y - nodes[u].y, nodes[v].x - nodes[u].x);
        around.sort((p, q) => angle(p) - angle(q));
    }
    const nextAround = (v, u) => {
        const around = adjacency.get(v);
        return around[(around.indexOf(u) - 1 + around.length) % around.length];
    };

    // 走面：从 u→v 到达 v，取紧挨回头边 v→u 顺时针方向的出边；面始终在半边左侧。
    const halfKey = (u, v) => u * 4194304 + v;
    const faceOf = new Map();
    const faces = [];
    for (const [start, around] of adjacency) {
        for (const first of around) {
            if (faceOf.has(halfKey(start, first))) continue;
            const id = faces.length;
            const cycle = [];
            let u = start;
            let v = first;
            while (!faceOf.has(halfKey(u, v))) {
                faceOf.set(halfKey(u, v), id);
                cycle.push([u, v]);
                const w = nextAround(v, u);
                u = v;
                v = w;
            }
            faces.push(cycle);
        }
    }

    // 按 y 把边分成若干行：奇偶判断只看样本点所在那一行，找最近的边只看附近几行，不用每个面都扫一遍全部边。
    const ROWS = 128;
    const rowTop = Math.min(boxA.minY, boxB.minY) - eps;
    const rowHeight = (Math.max(boxA.maxY, boxB.maxY) + eps - rowTop) / ROWS || 1;
    const rowOf = (y) => Math.min(ROWS - 1, Math.max(0, Math.floor((y - rowTop) / rowHeight)));
    const rows = Array.from({ length: ROWS }, () => []);
    for (const edge of kept) {
        const y0 = nodes[edge.u].y;
        const y1 = nodes[edge.v].y;
        for (let r = rowOf(Math.min(y0, y1)); r <= rowOf(Math.max(y0, y1)); r++) rows[r].push(edge);
    }

    // 面分类：在最长的那条半边中点向左偏一点取样本点，偏移量小于到其他任何边的距离，保证还在这个面里。
    const parityOf = (p, source) => {
        let inside = false;
        for (const edge of rows[rowOf(p.y)]) {
            if (!((source === 0 ? edge.countA : edge.countB) % 2)) continue;
            const a = nodes[edge.u];
            const b = nodes[edge.v];
            if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
        }
        return inside;
    };
    const sampleLeftOf = (u, v) => {
        const a = nodes[u];
        const b = nodes[v];
        const length = dist(a, b);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        let nearest = length / 2;
        // 比 nearest 更近的边，y 一定落在 mid.y ± nearest 以内，只看这几行。
        for (let r = rowOf(mid.y - nearest); r <= rowOf(mid.y + nearest); r++) {
            for (const edge of rows[r]) {
                if ((edge.u === u && edge.v === v) || (edge.u === v && edge.v === u)) continue;
                nearest = Math.min(nearest, distanceToSegment(mid, nodes[edge.u], nodes[edge.v]));
            }
        }
        const offset = nearest * 0.4;
        return { x: mid.x - (b.y - a.y) / length * offset, y: mid.y + (b.x - a.x) / length * offset };
    };
    const inResult = faces.map((cycle) => {
        let best = cycle[0];
        let bestLength = -1;
        for (const [u, v] of cycle) {
            const length = dist(nodes[u], nodes[v]);
            if (length > bestLength) { bestLength = length; best = [u, v]; }
        }
        const p = sampleLeftOf(best[0], best[1]);
        return keep(parityOf(p, 0), parityOf(p, 1));
    });

    // 结果边界：左侧面保留、右侧面不保留的半边。
    const boundary = new Set();
    const outgoing = new Map();
    for (const [key, face] of faceOf) {
        if (!inResult[face]) continue;
        const u = Math.floor(key / 4194304);
        const v = key - u * 4194304;
        if (inResult[faceOf.get(halfKey(v, u))]) continue;
        boundary.add(key);
        outgoing.set(u, (outgoing.get(u) || 0) + 1);
    }

    // 串环：到达 v 后，从回头边开始顺时针找第一条结果半边；在两块只碰一个点的地方，这样会把它们分成两个简单环。
    const rings = [];
    const used = new Set();
    for (const key of boundary) {
        if (used.has(key)) continue;
        const ring = [];
        let u = Math.floor(key / 4194304);
        let v = key - u * 4194304;
        while (!used.has(halfKey(u, v))) {
            used.add(halfKey(u, v));
            ring.push(u);
            const around = adjacency.get(v);
            const back = around.indexOf(u);
            let w = -1;
            for (let step = 1; step <= around.length; step++) {
                const candidate = around[(back - step + around.length * 2) % around.length];
                if (boundary.has(halfKey(v, candidate))) { w = candidate; break; }
            }
            if (w < 0) return null;
            u = v;
            v = w;
        }
        rings.push(ring);
    }

    // 去掉共线的中间点（只去只属于一个环的点，两个环碰在一起的点要留着）。
    const cleaned = rings.map((ring) => {
        const points = ring.slice();
        for (let changed = true; changed && points.length > 3;) {
            changed = false;
            for (let i = 0; i < points.length && points.length > 3; i++) {
                if (outgoing.get(points[i]) !== 1) continue;
                const prev = nodes[points[(i - 1 + points.length) % points.length]];
                const here = nodes[points[i]];
                const next = nodes[points[(i + 1) % points.length]];
                const base = dist(prev, next);
                if (base > 0 && Math.abs(orient(prev, here, next)) / base <= eps
                    && (here.x - prev.x) * (next.x - here.x) + (here.y - prev.y) * (next.y - here.y) > 0) {
                    points.splice(i, 1);
                    changed = true;
                    i--;
                }
            }
        }
        return points.map((index) => ({ x: nodes[index].x, y: nodes[index].y }));
    }).filter((ring) => ring.length >= 3 && Math.abs(ringArea(ring)) > eps * eps);

    const outers = cleaned.filter((ring) => ringArea(ring) > 0).map((outer) => ({ outer, holes: [], area: ringArea(outer) }));
    const resultEdges = cleaned.flatMap((ring) => ring.map((p, i) => [p, ring[(i + 1) % ring.length]]));
    for (const hole of cleaned.filter((ring) => ringArea(ring) < 0)) {
        // 洞的左侧是结果区域：在那一侧取样本点，找包含它的最小外轮廓。
        let best = 0;
        for (let i = 1; i < hole.length; i++) {
            if (dist(hole[i], hole[(i + 1) % hole.length]) > dist(hole[best], hole[(best + 1) % hole.length])) best = i;
        }
        const a = hole[best];
        const b = hole[(best + 1) % hole.length];
        const length = dist(a, b);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        let nearest = length / 2;
        for (const [p, q] of resultEdges) if (p !== a || q !== b) nearest = Math.min(nearest, distanceToSegment(mid, p, q));
        const sample = { x: mid.x - (b.y - a.y) / length * nearest * 0.4, y: mid.y + (b.x - a.x) / length * nearest * 0.4 };
        const owner = outers.filter((region) => pointInRing(sample, region.outer)).sort((p, q) => p.area - q.area)[0];
        if (!owner) return null;
        owner.holes.push(hole);
    }
    const result = outers.map(({ outer, holes }) => ({ outer, holes }));
    return isValidShape(result, eps * 1e-3) ? result : null;
}

// ---- 合法性检查 ----

function edgesConflict(p1, p2, q1, q2, tol) {
    const same = (m, n) => m.x === n.x && m.y === n.y;
    const o1 = orient(p1, p2, q1);
    const o2 = orient(p1, p2, q2);
    const o3 = orient(q1, q2, p1);
    const o4 = orient(q1, q2, p2);
    if (o1 * o2 < 0 && o3 * o4 < 0) return true;
    for (const e of [p1, p2]) if (!same(e, q1) && !same(e, q2) && distanceToSegment(e, q1, q2) <= tol) return true;
    for (const e of [q1, q2]) if (!same(e, p1) && !same(e, p2) && distanceToSegment(e, p1, p2) <= tol) return true;
    // 共享一个端点、共线且朝同一方向：两条边叠在一起（零宽的尖刺）。
    for (const [s, x] of [[p1, p2], [p2, p1]]) {
        for (const [t, other] of [[q1, q2], [q2, q1]]) {
            if (!same(s, t)) continue;
            const folded = (x.x - s.x) * (other.x - s.x) + (x.y - s.y) * (other.y - s.y) > 0;
            if (folded && Math.abs(orient(s, x, other)) <= tol * dist(x, other) + 1e-12) return true;
        }
    }
    return false;
}

/**
 * 合法的形状：外轮廓逆时针、洞顺时针、每个环至少 3 个点；
 * 所有边之间不相交，最多在共同的顶点处接触；每个洞都在它的外轮廓里面。
 */
export function isValidShape(shape, tol = 0) {
    const edges = [];
    for (const region of shape) {
        if (region.outer.length < 3 || ringArea(region.outer) <= 0) return false;
        for (const hole of region.holes) {
            if (hole.length < 3 || ringArea(hole) >= 0) return false;
            // 洞的右侧是洞内：在那里取一个点，它必须在外轮廓里。
            const a = hole[0];
            const b = hole[1];
            const length = dist(a, b);
            const probe = { x: (a.x + b.x) / 2 + (b.y - a.y) / length * length * 1e-4, y: (a.y + b.y) / 2 - (b.x - a.x) / length * length * 1e-4 };
            if (!pointInRing(probe, region.outer)) return false;
        }
        for (const ring of [region.outer, ...region.holes]) {
            for (let i = 0; i < ring.length; i++) {
                const p = ring[i];
                const q = ring[(i + 1) % ring.length];
                if (p.x === q.x && p.y === q.y) return false;
                edges.push({ p, q, minX: Math.min(p.x, q.x), maxX: Math.max(p.x, q.x), minY: Math.min(p.y, q.y), maxY: Math.max(p.y, q.y) });
            }
        }
    }
    edges.sort((e, f) => e.minX - f.minX);
    for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        for (let j = i + 1; j < edges.length && edges[j].minX <= e.maxX + tol; j++) {
            const f = edges[j];
            if (f.minY > e.maxY + tol || e.minY > f.maxY + tol) continue;
            if (edgesConflict(e.p, e.q, f.p, f.q, tol)) return false;
        }
    }
    return true;
}
