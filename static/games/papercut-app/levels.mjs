// 关卡：每关一种折法和一个目标图案（只定义折好后露在外面的那一片，展开由镜像得到）。
// 坐标是纸的坐标：整张纸以原点为中心、边长 300，y 向下。纯数据，tests/papercut.test.mjs 会检查每关都合法、
// 沿着铅笔线剪就能拿到三星。

import { booleanOp } from '../engines/polygon-boolean.mjs';
import { FOLDS } from '../engines/papercut.mjs';

const shape = (outer) => [{ outer, holes: [] }];
const poly = (points) => shape(points.map(([x, y]) => ({ x, y })));
const rect = (x0, y0, x1, y1) => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
const circle = (cx, cy, r, count = 40) => shape(Array.from({ length: count }, (_, i) => {
    const a = i / count * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
}));
const polar = (count, radiusAt) => shape(Array.from({ length: count }, (_, i) => {
    const a = i / count * Math.PI * 2;
    const r = radiusAt(a, i);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}));

// 闭合的 Catmull-Rom 样条：用少量控制点画圆润的轮廓。
function smooth(points, samples = 6) {
    const out = [];
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const [p0, p1, p2, p3] = [points[(i - 1 + n) % n], points[i], points[(i + 1) % n], points[(i + 2) % n]];
        for (let s = 0; s < samples; s++) {
            const t = s / samples;
            const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
            out.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]) });
        }
    }
    return shape(out);
}

const minus = (a, ...cuts) => cuts.reduce((rest, cut) => booleanOp(rest, cut, 'difference'), a);
const onWedge = (fold, a) => booleanOp(FOLDS[fold].wedge, a, 'intersection');

const heart = shape(Array.from({ length: 72 }, (_, i) => {
    const t = i / 72 * Math.PI * 2;
    return { x: 16 * Math.sin(t) ** 3 * 8.5, y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 8.5 - 18 };
}));

const butterfly = minus(
    smooth([[-10, -40], [22, -84], [62, -126], [116, -128], [140, -86], [120, -36], [72, -6], [122, 30], [132, 80], [96, 120], [46, 106], [16, 60], [-10, 50]]),
    circle(90, -80, 17), circle(86, 66, 13)
);

export const LEVELS = [
    { id: 'heart', name: '小心心', fold: 2, tip: '对折一次。沿铅笔线剪下半颗心，展开就是一整颗。', target: onWedge(2, heart) },
    {
        id: 'diamond', name: '菱形窗', fold: 2, tip: '先修出半个圆，再在折痕上剪缺口：展开就是洞。',
        target: minus(onWedge(2, circle(0, 0, 142, 96)), poly([[-10, -50], [50, 0], [-10, 50]]), poly([[-10, -112], [26, -86], [-10, -60]]), poly([[-10, 60], [26, 86], [-10, 112]]))
    },
    { id: 'round', name: '圆窗', fold: 4, tip: '折两次。修圆外角，再在中心折角剪一刀。', target: minus(onWedge(4, circle(0, 0, 140, 96)), circle(0, 0, 36)) },
    {
        id: 'fangsheng', name: '方胜', fold: 4, tip: '绕一圈剪，中间那块掉下去就成了洞。',
        target: minus(onWedge(4, circle(0, 0, 140, 96)), poly([[72, 40], [104, 72], [72, 104], [40, 72]]))
    },
    {
        id: 'snow', name: '雪花', fold: 8, tip: '折三次，一刀顶八刀。',
        target: minus(onWedge(8, circle(0, 0, 140, 128)), circle(100, 0, 15), circle(55, 55, 14), circle(140 * Math.cos(0.38), 140 * Math.sin(0.38), 20), circle(0, 0, 22))
    },
    { id: 'star', name: '八角星', fold: 8, tip: '两刀斜线就是一颗八角星。', target: onWedge(8, polar(16, (_, i) => (i % 2 ? 72 : 146))) },
    {
        id: 'coin', name: '铜钱纹', fold: 8, tip: '外圆内方，再在圈上点几个小孔。',
        target: minus(onWedge(8, circle(0, 0, 140, 128)), rect(-1, -1, 36, 36), circle(96, 0, 13), circle(96 * Math.SQRT1_2, 96 * Math.SQRT1_2, 13), circle(96 * Math.cos(Math.PI / 8), 96 * Math.sin(Math.PI / 8), 11))
    },
    {
        id: 'lattice', name: '窗格', fold: 4, tip: '四个方孔，展开是十六扇小窗。',
        target: minus(FOLDS[4].wedge, rect(16, 16, 64, 64), rect(86, 16, 134, 64), rect(16, 86, 64, 134), rect(86, 86, 134, 134))
    },
    { id: 'butterfly', name: '蝴蝶', fold: 2, tip: '翅膀上的两个圆斑要绕着剪出来。', target: onWedge(2, butterfly) },
    {
        id: 'flower', name: '团花', fold: 8, tip: '最后一关：花瓣边、花心和花瓣上的孔都要剪。',
        target: minus(onWedge(8, polar(256, (a) => 118 + 22 * Math.cos(8 * a))), circle(0, 0, 20), circle(78, 16, 10), circle(48 * Math.SQRT1_2, 48 * Math.SQRT1_2, 9))
    }
];

export const FREE = { id: 'free', name: '自由剪纸', tip: '自己挑对称轴折，随时剪、随时展开，折之前剪的地方不会被镜像。', target: null };
