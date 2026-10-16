"""Generate the SVG figures for the HeirCut blog series.

Usage: python3 make_figs.py <lab_dir> <lines_csv> <out_dir>
"""
import datetime as dt
import json
import math
import os
import sys

LAB, LINES_CSV, OUT = sys.argv[1:4]
os.makedirs(OUT, exist_ok=True)

FONT = "'PingFang SC','Hiragino Sans GB','Noto Sans SC','Microsoft YaHei',sans-serif"
SURFACE = "#fcfcfb"
BORDER = "#e6e5e0"
INK = "#0b0b0b"
INK2 = "#52514e"
MUTED = "#8a897f"
GRID = "#ebeae5"
S1, S2, S3, S4 = "#2a78d6", "#eb6834", "#1baf7a", "#eda100"
RED, VIOLET = "#e34948", "#4a3aa7"


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def svg_open(w, h, title):
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
        f'font-family="{FONT}" role="img" aria-label="{esc(title)}">',
        f"<title>{esc(title)}</title>",
        f'<rect x="0.5" y="0.5" width="{w-1}" height="{h-1}" rx="12" fill="{SURFACE}" stroke="{BORDER}"/>',
    ]


def text(x, y, s, size=14, fill=INK, anchor="start", weight="normal", extra=""):
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" fill="{fill}" text-anchor="{anchor}" '
            f'font-weight="{weight}" {extra}>{esc(s)}</text>')


def write(name, parts):
    parts.append("</svg>")
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write("\n".join(parts))


# ---------------------------------------------------------------- 1a: Lab curves
def fig_lab_curves():
    runs = [
        ("D1 公主", "D1 Princess-20260623-075756-884.json", S1),
        ("D1 国王", "D1 King-20260623-082258-760.json", S2),
        ("D2 骑士", "D2 Knight-20260623-082716-053.json", S3),
        ("D3 二公主", "D3 Princess Second-20260623-085828-338.json", S4),
    ]
    W, H = 760, 460
    L, R, T, B = 64, 120, 70, 360
    xmax = 300.0

    def X(t):
        return L + (W - R - L) * t / xmax

    def Y(v):
        return B - (B - T) * v

    p = svg_open(W, H, "四次 Lab 校准记录的满意度曲线")
    p.append(text(24, 32, "达到高分线之后，还在继续剪", 17, INK, weight="600"))
    p.append(text(24, 53, "2026 年 6 月的 Haircut Lab 校准记录：满意度随时间变化（我们自己剪的，当时还没有提交提示）", 12.5, INK2))
    for v in (0, 0.25, 0.5, 0.75, 1.0):
        p.append(f'<line x1="{L}" x2="{W-R}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="{GRID}" stroke-width="1"/>')
        p.append(text(L - 10, Y(v) + 4, f"{v:.2f}", 12, MUTED, "end"))
    for t in range(0, 301, 60):
        p.append(text(X(t), B + 20, f"{t}", 12, MUTED, "middle"))
    p.append(text((L + W - R) / 2, B + 42, "开始理发后的秒数", 12.5, INK2, "middle"))
    p.append(f'<line x1="{L}" x2="{W-R}" y1="{Y(0.75):.1f}" y2="{Y(0.75):.1f}" stroke="{INK2}" stroke-width="1.2" stroke-dasharray="5 4"/>')
    p.append(text(W - R + 6, Y(0.75) + 4, "高分线 0.75", 12, INK2))

    ends = []
    for name, f, color in runs:
        d = json.load(open(os.path.join(LAB, f), encoding="utf-8"))
        cs = [c for c in d["conformitySamples"] if c.get("hasScore")]
        pts = [(c["elapsedSeconds"], c["satisfaction"]) for c in cs]
        pts = [(0.0, pts[0][1])] + pts if pts[0][0] > 0 else pts
        poly = " ".join(f"{X(t):.1f},{Y(v):.1f}" for t, v in pts)
        p.append(f'<polyline points="{poly}" fill="none" stroke="{color}" stroke-width="2" stroke-linejoin="round"/>')
        first = next(i for i, (_, v) in enumerate(pts) if v >= 0.75)
        ft, fv = pts[first]
        p.append(f'<circle cx="{X(ft):.1f}" cy="{Y(0.75):.1f}" r="5" fill="{color}" stroke="{SURFACE}" stroke-width="2"/>')
        ends.append((name, color, pts[-1], ft))

    # direct labels at line ends, nudged apart vertically
    ends.sort(key=lambda e: -e[2][1])
    used = []
    for name, color, (t, v), ft in ends:
        y = Y(v) + 4
        for u in used:
            if abs(y - u) < 15:
                y = u + 15
        used.append(y)
        p.append(f'<circle cx="{X(t):.1f}" cy="{Y(v):.1f}" r="3" fill="{color}"/>')
        p.append(text(X(t) + 7, y, f"{name}  +{t-ft:.0f}s", 12.5, INK))

    # annotation for the princess run
    _, _, (pt, pv), pft = [e for e in ends if e[0] == "D1 公主"][0]
    ay = Y(0.2)
    p.append(f'<line x1="{X(pft):.1f}" x2="{X(pt):.1f}" y1="{ay:.1f}" y2="{ay:.1f}" stroke="{INK2}" stroke-width="1"/>')
    for xx in (X(pft), X(pt)):
        p.append(f'<line x1="{xx:.1f}" x2="{xx:.1f}" y1="{ay-5:.1f}" y2="{ay+5:.1f}" stroke="{INK2}" stroke-width="1"/>')
    p.append(text((X(pft) + X(pt)) / 2, ay - 9, f"D1 公主：{pft:.0f} 秒就过了线，之后又剪了 {pt-pft:.0f} 秒", 12.5, INK, "middle"))

    # legend
    lx = L
    for name, _, color in runs:
        p.append(f'<rect x="{lx}" y="{H-30}" width="12" height="12" rx="3" fill="{color}"/>')
        p.append(text(lx + 18, H - 20, name, 12.5, INK2))
        lx += 92
    p.append(text(W - 24, H - 20, "圆点：首次达到 0.75　标签：达标后继续操作的时长", 12, MUTED, "end"))
    write("lab-curves.svg", p)


# ---------------------------------------------------------------- 1b: four versions
def fig_versions():
    W, H = 800, 210
    cards = [
        ("项目第一个月", "一直在", ["进入理发就出现", "之后一直可以点"]),
        ("一年多以后", "够好时闪一下", ["每次掉发算一次分", "≥ 0.75 时闪烁"]),
        ("两个月后", "按有效笔划出现", ["每剪完一刀判断一次", "高分·极低·回落·20 秒"]),
        ("又过一个月", "与结算统一", ["按钮和结算调用", "同一个判定函数"]),
    ]
    p = svg_open(W, H, "提交按钮的四个版本")
    cw, gap, top = 170, 26, 28
    x = 24
    colors = [MUTED, S4, S1, S3]
    for i, (date, title, lines) in enumerate(cards):
        p.append(f'<rect x="{x}" y="{top}" width="{cw}" height="150" rx="10" fill="#ffffff" stroke="{BORDER}"/>')
        p.append(f'<rect x="{x}" y="{top}" width="{cw}" height="6" rx="3" fill="{colors[i]}"/>')
        p.append(text(x + 14, top + 30, f"第 {i+1} 版 · {date}", 12, INK2))
        p.append(text(x + 14, top + 58, title, 17, INK, weight="600"))
        for j, ln in enumerate(lines):
            p.append(text(x + 14, top + 90 + j * 22, ln, 13, INK2))
        if i < len(cards) - 1:
            ax = x + cw + 4
            p.append(f'<path d="M{ax} {top+75} l{gap-10} 0 m-6 -5 l6 5 l-6 5" fill="none" stroke="{MUTED}" stroke-width="1.6"/>')
        x += cw + gap
    write("button-versions.svg", p)


# ---------------------------------------------------------------- 2a: cut pipeline
HAIR = ("M20 20 Q20 0 60 0 L120 0 Q160 0 160 20 L162 200 Q150 214 136 204 Q122 220 106 206 "
        "Q90 222 76 206 Q60 220 46 204 Q30 214 18 200 Z")
CUT = [(-6, 120), (30, 108), (70, 122), (110, 110), (150, 124), (186, 112)]


def cut_path_d(dy=0):
    pts = CUT
    d = f"M{pts[0][0]} {pts[0][1]+dy}"
    for i in range(1, len(pts)):
        x0, y0 = pts[i - 1]
        x1, y1 = pts[i]
        d += f" Q{x0 + (x1-x0)/2:.0f} {(y0+y1)/2 + (8 if i % 2 else -8) + dy:.0f} {x1} {y1+dy}"
    return d


def fig_pipeline():
    W, H = 800, 380
    p = svg_open(W, H, "一刀是怎么剪开的：轨迹、带子、差集、分离")
    p.append(text(24, 32, "一刀是怎么剪开的", 17, INK, weight="600"))
    hair_fill, hair_edge = "#f2c46b", "#c99a3c"
    band = 16
    panels = [
        ("① 剪刀轨迹", "鼠标划过的折线，没有面积"),
        ("② 膨胀成带子", "ClipperOffset，圆角，宽 0.06"),
        ("③ 头发 − 带子", "Clipper 差集，结果按层级重建"),
        ("④ 判断去留", "碰到生根区域的留下，其余掉落"),
    ]
    defs = ['<defs>',
            f'<mask id="cutmask" maskUnits="userSpaceOnUse" x="-20" y="-20" width="230" height="280">'
            f'<rect x="-20" y="-20" width="230" height="280" fill="#fff"/>'
            f'<path d="{cut_path_d()}" fill="none" stroke="#000" stroke-width="{band}" stroke-linecap="round" stroke-linejoin="round"/></mask>',
            f'<clipPath id="above"><path d="{cut_path_d()} L186 -40 L-6 -40 Z"/></clipPath>',
            f'<clipPath id="below"><path d="{cut_path_d()} L186 260 L-6 260 Z"/></clipPath>',
            '</defs>']
    p.extend(defs)
    for i, (title, sub) in enumerate(panels):
        ox, oy = 30 + i * 192, 70
        g = [f'<g transform="translate({ox} {oy})">']
        if i < 2:
            g.append(f'<path d="{HAIR}" fill="{hair_fill}" stroke="{hair_edge}" stroke-width="1.5"/>')
        if i == 0:
            g.append(f'<path d="{cut_path_d()}" fill="none" stroke="{INK}" stroke-width="2" stroke-dasharray="1 0"/>')
            g.append(f'<circle cx="{CUT[0][0]}" cy="{CUT[0][1]}" r="3.5" fill="{INK}"/>')
            g.append(f'<path d="M{CUT[-1][0]-8} {CUT[-1][1]-6} l8 6 l-8 6" fill="none" stroke="{INK}" stroke-width="2"/>')
        if i == 1:
            g.append(f'<path d="{cut_path_d()}" fill="none" stroke="{S1}" stroke-opacity="0.45" stroke-width="{band}" stroke-linecap="round" stroke-linejoin="round"/>')
            g.append(f'<path d="{cut_path_d()}" fill="none" stroke="{S1}" stroke-width="1.5"/>')
        if i == 2:
            g.append(f'<path d="{HAIR}" fill="{hair_fill}" stroke="{hair_edge}" stroke-width="1.5" mask="url(#cutmask)"/>')
        if i == 3:
            g.append(f'<g clip-path="url(#above)"><path d="{HAIR}" fill="{hair_fill}" stroke="{hair_edge}" stroke-width="1.5" mask="url(#cutmask)"/></g>')
            g.append(f'<g transform="translate(10 30) rotate(6 90 160)" opacity="0.9"><g clip-path="url(#below)">'
                     f'<path d="{HAIR}" fill="{hair_fill}" stroke="{hair_edge}" stroke-width="1.5" mask="url(#cutmask)"/></g></g>')
            g.append(f'<rect x="30" y="-6" width="120" height="30" rx="4" fill="none" stroke="{S3}" stroke-width="2" stroke-dasharray="5 3"/>')
            g.append(text(90, -12, "生根区域", 12, S3 if False else INK2, "middle"))
            g.append(text(186, 176, "掉落 ↓", 12.5, INK2, "end"))
        g.append("</g>")
        p.extend(g)
        p.append(text(ox + 90, 344, title, 14, INK, "middle", "600"))
        p.append(text(ox + 90, 363, sub, 12, INK2, "middle"))
    write("cut-pipeline.svg", p)


# ---------------------------------------------------------------- 2b: score sets
def fig_sets():
    W, H = 800, 450
    p = svg_open(W, H, "满意度公式里的几个集合")
    p.append(text(24, 32, "满意度在比较什么", 17, INK, weight="600"))
    h0 = "M30 20 Q30 0 60 0 L150 0 Q180 0 180 20 L180 300 L30 300 Z"
    g = "M44 10 Q44 -6 74 -6 L160 -6 Q194 -6 194 14 L194 150 Q176 180 119 180 Q62 180 44 150 Z"
    cutline = "M10 130 Q60 112 105 140 Q150 168 200 172"
    p.append('<defs>'
             f'<clipPath id="h0"><path d="{h0}"/></clipPath>'
             f'<clipPath id="g"><path d="{g}"/></clipPath>'
             f'<mask id="notg" maskUnits="userSpaceOnUse" x="-20" y="-20" width="260" height="360"><rect x="-20" y="-20" width="260" height="360" fill="#fff"/><path d="{g}" fill="#000"/></mask>'
             f'<mask id="noth0" maskUnits="userSpaceOnUse" x="-20" y="-20" width="260" height="360"><rect x="-20" y="-20" width="260" height="360" fill="#fff"/><path d="{h0}" fill="#000"/></mask>'
             f'<clipPath id="above"><path d="{cutline} L200 -40 L10 -40 Z"/></clipPath>'
             f'<clipPath id="below"><path d="{cutline} L200 340 L10 340 Z"/></clipPath>'
             f'<pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#fbecc7"/><line x1="0" y1="0" x2="0" y2="7" stroke="{S4}" stroke-width="2.4"/></pattern>'
             '</defs>')
    R_FILL, K_FILL = "#f6c3ad", "#b9d3f2"

    def base(ox, oy, cut):
        q = [f'<g transform="translate({ox} {oy})">']
        if not cut:
            q.append(f'<path d="{h0}" fill="{R_FILL}" mask="url(#notg)"/>')
            q.append(f'<g clip-path="url(#h0)"><path d="{g}" fill="{K_FILL}"/></g>')
        else:
            # kept part (above the cut)
            q.append(f'<g clip-path="url(#above)"><path d="{h0}" fill="{R_FILL}" mask="url(#notg)"/>'
                     f'<g clip-path="url(#h0)"><path d="{g}" fill="{K_FILL}"/></g></g>')
            # removed part (below the cut): correct cut = ghost, wrong cut = red
            q.append(f'<g clip-path="url(#below)"><path d="{h0}" fill="none" stroke="{MUTED}" stroke-dasharray="4 3" mask="url(#notg)"/>'
                     f'<g clip-path="url(#h0)"><path d="{g}" fill="{RED}" fill-opacity="0.85"/></g></g>')
            q.append(f'<path d="{cutline}" fill="none" stroke="{INK}" stroke-width="1.6"/>')
        q.append(f'<path d="{g}" fill="url(#hatch)" mask="url(#noth0)"/>')
        q.append(f'<path d="{h0}" fill="none" stroke="{INK2}" stroke-width="1.4"/>')
        q.append(f'<path d="{g}" fill="none" stroke="{VIOLET}" stroke-width="1.6" stroke-dasharray="6 3"/>')
        q.append("</g>")
        return q

    p.extend(base(40, 70, False))
    p.extend(base(330, 70, True))
    p.append(text(145, 395, "剪之前：记下基线", 14, INK, "middle", "600"))
    p.append(text(435, 395, "剪了一刀之后", 14, INK, "middle", "600"))

    # legend / definitions
    lx, ly = 560, 82
    items = [
        ("swatch", R_FILL, "R = H₀ − G", "应该剪掉的部分"),
        ("swatch", K_FILL, "K = H₀ ∩ G", "应该保留的部分"),
        ("hatch", None, "G − H₀", "理想形超出头发的部分，不计分"),
        ("swatch", RED, "X ∩ K", "剪掉了不该剪的：误剪"),
        ("ghost", None, "X ∩ R", "剪对了的部分（已掉落）"),
        ("line", INK2, "H₀", "初始头发轮廓"),
        ("dash", VIOLET, "G", "美术画的理想形状"),
    ]
    for kind, col, sym, desc in items:
        if kind == "swatch":
            p.append(f'<rect x="{lx}" y="{ly-11}" width="16" height="14" rx="3" fill="{col}"/>')
        elif kind == "hatch":
            p.append(f'<rect x="{lx}" y="{ly-11}" width="16" height="14" rx="3" fill="url(#hatch)"/>')
        elif kind == "ghost":
            p.append(f'<rect x="{lx+0.5}" y="{ly-10.5}" width="15" height="13" rx="3" fill="none" stroke="{MUTED}" stroke-dasharray="3 2"/>')
        elif kind == "line":
            p.append(f'<line x1="{lx}" x2="{lx+16}" y1="{ly-4}" y2="{ly-4}" stroke="{col}" stroke-width="1.6"/>')
        else:
            p.append(f'<line x1="{lx}" x2="{lx+16}" y1="{ly-4}" y2="{ly-4}" stroke="{col}" stroke-width="1.8" stroke-dasharray="5 2"/>')
        p.append(text(lx + 24, ly + 1, sym, 13, INK, weight="600"))
        p.append(text(lx + 24, ly + 19, desc, 12, INK2))
        ly += 44
    p.append(text(40, 430, "C：当前头发；X = H₀ − C：已经剪掉的部分", 12, MUTED))
    write("score-sets.svg", p)


# ---------------------------------------------------------------- 3a: architecture
def box(x, y, w, h, title, lines=(), fill="#ffffff", stroke=BORDER, tsize=14, accent=None):
    q = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill}" stroke="{stroke}"/>']
    if accent:
        q.append(f'<rect x="{x}" y="{y}" width="4" height="{h}" rx="2" fill="{accent}"/>')
    q.append(text(x + 14, y + 22, title, tsize, INK, weight="600"))
    for i, ln in enumerate(lines):
        q.append(text(x + 14, y + 42 + i * 18, ln, 12, INK2))
    return q


def arrow(x1, y1, x2, y2, color=MUTED, label=None, dash=False):
    ang = math.atan2(y2 - y1, x2 - x1)
    ax1 = x2 - 8 * math.cos(ang - 0.45)
    ay1 = y2 - 8 * math.sin(ang - 0.45)
    ax2 = x2 - 8 * math.cos(ang + 0.45)
    ay2 = y2 - 8 * math.sin(ang + 0.45)
    da = ' stroke-dasharray="4 3"' if dash else ""
    q = [f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="1.5"{da}/>',
         f'<path d="M{ax1:.1f} {ay1:.1f} L{x2} {y2} L{ax2:.1f} {ay2:.1f}" fill="none" stroke="{color}" stroke-width="1.5"/>']
    if label:
        q.append(text((x1 + x2) / 2 + 6, (y1 + y2) / 2 - 4, label, 11.5, INK2))
    return q


def fig_arch():
    W, H = 840, 520
    p = svg_open(W, H, "重构前后的剧情架构")
    p.append(text(24, 32, "剧情系统：重构之前与之后", 17, INK, weight="600"))
    p.append(f'<line x1="300" x2="300" y1="56" y2="{H-24}" stroke="{BORDER}" stroke-width="1"/>')
    # ---- before
    p.append(text(28, 70, "之前：每个客人一台状态机", 14, INK2, weight="600"))
    p.extend(box(28, 86, 248, 60, "策划表格", ["程序照着表格改代码"], accent=MUTED))
    p.extend(arrow(152, 146, 152, 176))
    p.extend(box(28, 176, 248, 92, "GuestManager", ["OnD1WitchSatTimeToDawn(…)", "OnKingChooseLeave(…)", "if (guestName == King) …"], accent=S2))
    p.extend(arrow(152, 268, 152, 296, label="new 专属状态"))
    p.extend(box(28, 296, 248, 150, "Guest.Fsm（每个客人一台）",
                 ["Entering → Pleasantries → …", "→ Haircutting → Chatting → Exiting", "", "+ D1WitchDawn", "+ D1KingReceivePainting", "+ D2KnightCatchTraitor …（共 14 个）"], accent=S2))
    p.append(text(152, 476, "推进、对话、事件、单例调用", 12, MUTED, "middle"))
    p.append(text(152, 494, "混在同一个状态类里", 12, MUTED, "middle"))
    # ---- after
    p.append(text(324, 70, "之后：内容驱动的 Encounter", 14, INK2, weight="600"))
    p.extend(box(324, 86, 196, 78, "剧情内容（JSON）", ["规则 · 序列 · 条件", "策划编辑器直接编辑"], accent=S3))
    p.extend(arrow(522, 125, 588, 125))
    p.append(text(555, 145, "编译+校验", 11.5, INK2, "middle"))
    p.extend(box(590, 86, 222, 78, "内容数据库", ["引用 · 冲突 · 可达性检查", "离线推演 5 个结局"], accent=S3))
    p.append(f'<rect x="324" y="196" width="488" height="150" rx="10" fill="#f3f7fd" stroke="#cfe0f5"/>')
    p.append(text(338, 216, "纯逻辑层（noEngineReferences，不引用 UnityEngine）", 12, S1, weight="600"))
    p.extend(box(338, 228, 240, 104, "EncounterSession", ["命令 → 匹配规则 → 播放序列", "CompleteSequence 时统一提交", "里程碑 · 事实 · 快照"], accent=S1))
    p.extend(box(590, 228, 208, 104, "NarrativeRunner", ["19 种通用步骤", "Say / SetFact / Branch …", "可在任意步骤存档恢复"], accent=S1))
    p.extend(arrow(700, 164, 700, 196))
    p.extend(box(324, 382, 488, 62, "LegacyEncounterBridge（桥）", ["视图操作 → 命令；步骤 → 端口调用；单例引用 81 → 0"], accent=VIOLET))
    p.extend(arrow(470, 382, 470, 346, color=S1, label="命令"))
    p.extend(arrow(640, 346, 640, 382, color=S1, label="步骤"))
    p.extend(box(324, 462, 488, 40, "旧视图：对话框 · 笔记本 · 需求板 · 理发（经端口注入）", [], tsize=12.5, accent=MUTED))
    p.extend(arrow(568, 444, 568, 462))
    write("architecture.svg", p)


# ---------------------------------------------------------------- 3b: lines over time
def fig_lines():
    rows = []
    for ln in open(LINES_CSV, encoding="utf-8"):
        d, h, gs, br = ln.strip().split(",")
        t = dt.datetime.fromisoformat(d).astimezone(dt.timezone(dt.timedelta(hours=8)))
        rows.append((t, int(gs), int(br)))
    rows.sort()
    t0 = dt.datetime(2026, 8, 1, tzinfo=dt.timezone(dt.timedelta(hours=8)))
    t1 = dt.datetime(2026, 10, 12, tzinfo=dt.timezone(dt.timedelta(hours=8)))
    W, H = 760, 400
    L, R, T, B = 70, 150, 70, 330
    ymax = 4500

    def X(t):
        return L + (W - R - L) * (t - t0).total_seconds() / (t1 - t0).total_seconds()

    def Y(v):
        return B - (B - T) * v / ymax

    p = svg_open(W, H, "旧状态机与桥的代码行数变化")
    p.append(text(24, 32, "代码从状态机里搬出来，桥替旧视图承担了翻译", 17, INK, weight="600"))
    p.append(text(24, 53, "两个文件的行数，按每次改动它们的提交取样（2026-08 至 10 月）", 12.5, INK2))
    for v in range(0, ymax + 1, 1000):
        p.append(f'<line x1="{L}" x2="{W-R}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="{GRID}"/>')
        p.append(text(L - 10, Y(v) + 4, f"{v:,}", 12, MUTED, "end"))
    for m, d in ((8, 1), (8, 15), (9, 1), (9, 15), (10, 1)):
        t = dt.datetime(2026, m, d, tzinfo=t0.tzinfo)
        p.append(text(X(t), B + 20, f"{m}/{d}", 12, MUTED, "middle"))
    for label, when in (("阶段 3 开始", (8, 11)), ("九组迁完", (8, 23))):
        t = dt.datetime(2026, *when, 12, tzinfo=t0.tzinfo)
        p.append(f'<line x1="{X(t):.1f}" x2="{X(t):.1f}" y1="{T}" y2="{B}" stroke="{MUTED}" stroke-dasharray="3 3"/>')
        p.append(text(X(t) + 4, T + 12, label, 11.5, INK2))

    def step_series(idx):
        pts = []
        prev = None
        for r in rows:
            v = r[idx]
            if prev is None and v == 0:
                continue
            if prev is not None:
                pts.append((r[0], prev))
            pts.append((r[0], v))
            prev = v
        pts.append((t1, prev))
        return pts

    for idx, color, name in ((1, S2, "GuestStates.cs（旧状态机）"), (2, S1, "LegacyEncounterBridge.cs（桥）")):
        pts = step_series(idx)
        poly = " ".join(f"{X(t):.1f},{Y(v):.1f}" for t, v in pts)
        p.append(f'<polyline points="{poly}" fill="none" stroke="{color}" stroke-width="2" stroke-linejoin="round"/>')
        last = pts[-1][1]
        p.append(text(W - R + 8, Y(last) + 4, f"{last:,} 行", 12.5, INK, weight="600"))
        p.append(text(W - R + 8, Y(last) + 20, name.split("（")[1].rstrip("）"), 12, INK2))
    peak = max(r[1] for r in rows)
    pt = next(r[0] for r in rows if r[1] == peak)
    p.append(f'<circle cx="{X(pt):.1f}" cy="{Y(peak):.1f}" r="4.5" fill="{S2}" stroke="{SURFACE}" stroke-width="2"/>')
    p.append(text(X(pt) - 6, Y(peak) - 10, f"{peak:,} 行", 12, INK, "end"))
    lx = L
    for color, name in ((S2, "GuestStates.cs（旧状态机）"), (S1, "LegacyEncounterBridge.cs（桥，原 Stage3EncounterRuntimeHost）")):
        p.append(f'<rect x="{lx}" y="{H-30}" width="12" height="12" rx="3" fill="{color}"/>')
        p.append(text(lx + 18, H - 20, name, 12.5, INK2))
        lx += 220
    write("lines-over-time.svg", p)



# ---------------------------------------------------------------- 3c: story states over time
# Count of `public class D[123]* : IState` in GuestStates.cs. 2025 points come from the Plastic SCM
# repository (2025Q2GJ, changesets 10/13/24/54/94/132); 2026 points from git (9436b1b adds the 14th,
# 467981d removes all of them when stage 4 closes).
STORY_STATES = [
    ((2025, 3, 18), 0, None),
    ((2025, 3, 27), 3, "第一天的女巫：3 个"),
    ((2025, 4, 10), 6, None),
    ((2025, 4, 24), 8, None),
    ((2025, 5, 13), 12, None),
    ((2025, 5, 20), 13, "BOOOM 终版 Demo：13 个"),
    ((2026, 8, 9), 14, None),
    ((2026, 8, 23), 0, "阶段 4 收尾，一次删光"),
]


def fig_story_states():
    tz = dt.timezone(dt.timedelta(hours=8))
    t0 = dt.datetime(2025, 3, 1, tzinfo=tz)
    t1 = dt.datetime(2026, 10, 15, tzinfo=tz)
    W, H = 760, 380
    L, R, T, B = 56, 40, 74, 310
    ymax = 16

    def X(t):
        return L + (W - R - L) * (t - t0).total_seconds() / (t1 - t0).total_seconds()

    def Y(v):
        return B - (B - T) * v / ymax

    p = svg_open(W, H, "剧情专属状态的数量随时间的变化")
    p.append(text(24, 32, "剧情专属状态：一个月就开始长，重构时一次删光", 17, INK, weight="600"))
    p.append(text(24, 53, "GuestStates.cs 里 D1/D2/D3 开头的状态类个数（2025 年取自 Plastic SCM，2026 年取自 git）", 12.5, INK2))
    for v in range(0, ymax + 1, 4):
        p.append(f'<line x1="{L}" x2="{W-R}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="{GRID}"/>')
        p.append(text(L - 10, Y(v) + 4, str(v), 12, MUTED, "end"))
    for (y, m) in ((2025, 3), (2025, 7), (2025, 11), (2026, 3), (2026, 7), (2026, 10)):
        t = dt.datetime(y, m, 1, tzinfo=tz)
        p.append(text(X(t), B + 20, f"{y}-{m:02d}", 12, MUTED, "middle"))
    for label, when in (("CUSGA 终版", (2025, 7, 31)), ("迁到 git", (2025, 11, 26))):
        t = dt.datetime(*when, tzinfo=tz)
        p.append(f'<line x1="{X(t):.1f}" x2="{X(t):.1f}" y1="{T}" y2="{B}" stroke="{MUTED}" stroke-dasharray="3 3"/>')
        p.append(text(X(t) + 4, T + 12, label, 11.5, INK2))
    pts = []
    prev = None
    for (y, m, d), v, _ in STORY_STATES:
        t = dt.datetime(y, m, d, tzinfo=tz)
        if prev is not None:
            pts.append((t, prev))
        pts.append((t, v))
        prev = v
    pts.append((t1, prev))
    poly = " ".join(f"{X(t):.1f},{Y(v):.1f}" for t, v in pts)
    p.append(f'<polyline points="{poly}" fill="none" stroke="{S2}" stroke-width="2" stroke-linejoin="round"/>')
    for (y, m, d), v, label in STORY_STATES:
        if not label:
            continue
        t = dt.datetime(y, m, d, tzinfo=tz)
        p.append(f'<circle cx="{X(t):.1f}" cy="{Y(v):.1f}" r="4.5" fill="{S2}" stroke="{SURFACE}" stroke-width="2"/>')
        anchor = "end" if v == 0 else "start"
        dx = -8 if v == 0 else 8
        dy = 20 if v == 3 else (-10 if v > 0 else -8)
        p.append(text(X(t) + dx, Y(v) + dy, label, 12, INK, anchor))
    t = dt.datetime(2026, 8, 9, tzinfo=tz)
    p.append(text(X(t) - 8, Y(14) - 10, "14 个", 12, INK, "end"))
    p.append(text(W - R, H - 22, "最后一个（D1KingChooseLeave）加在重构开始前两天", 12, MUTED, "end"))
    write("story-states.svg", p)


# ---------------------------------------------------------------- 4a: word swap to ending
def fig_word_to_ending():
    W, H = 820, 330
    p = svg_open(W, H, "换进去的词如何影响结局")
    p.append(text(24, 32, "换进去的词，只有一条路通向结局", 17, INK, weight="600"))
    steps = [
        ("换词", ["「把婚约撕个粉碎」", "换进国王的「誓词」槽"], S3),
        ("打勾", ["这个候选在表里", "标成「会打勾」"], S1),
        ("账本 → 故事事实", ["账本投影成故事事实：", "「要撕毁婚约」"], S1),
        ("当天结算", ["只读故事事实，", "决定下一天或结局"], VIOLET),
    ]
    bw, bh, top, gap = 170, 92, 62, 26
    x = 24
    for i, (title, lines, accent) in enumerate(steps):
        p.extend(box(x, top, bw, bh, title, lines, accent=accent))
        if i < len(steps) - 1:
            p.extend(arrow(x + bw + 2, top + bh / 2, x + bw + gap - 2, top + bh / 2))
        x += bw + gap
    # dead end: facts set inside an encounter
    p.extend(box(220, 210, 330, 76, "会面里的「设置事实」",
                 ["只在这次会面里有效，会面结束就丢了"], fill="#fbfaf7", stroke=BORDER, accent=MUTED))
    p.append(f'<line x1="550" y1="248" x2="700" y2="248" stroke="{MUTED}" stroke-width="1.5" stroke-dasharray="4 3"/>')
    p.append(f'<line x1="700" y1="248" x2="700" y2="160" stroke="{MUTED}" stroke-width="1.5" stroke-dasharray="4 3"/>')
    p.append(f'<path d="M692 172 L708 156 M692 156 L708 172" stroke="{RED}" stroke-width="2.2"/>')
    p.append(text(712, 214, "结算看不到", 12.5, INK2))
    p.append(text(24, 312, "换词还能影响客人接下来说什么、播哪段演出，但这些都留在会面内部。", 12, MUTED))
    write("word-to-ending.svg", p)


# ---------------------------------------------------------------- 10a: commits per month by AI co-author
def fig_ai_monthly():
    rows = []
    for ln in open(os.path.join(os.path.dirname(LINES_CSV), "ai-monthly.csv"), encoding="utf-8"):
        if ln.startswith("month"):
            continue
        m, t, c, u = ln.strip().split(",")
        rows.append((m, int(t), int(c), int(u)))
    W, H = 760, 420
    L, R, T, B = 56, 24, 84, 320
    ymax = 400
    n = len(rows)
    slot = (W - L - R) / n
    bw = slot * 0.62
    NONE = "#c9c7bf"

    def Y(v):
        return B - (B - T) * v / ymax

    p = svg_open(W, H, "每月提交数与 AI 署名")
    p.append(text(24, 32, "每月提交数：重构开始后，AI 参与的提交占了八成以上", 17, INK, weight="600"))
    p.append(text(24, 53, "按提交说明里的 Co-Authored-By 署名统计（署名是自报的，没有署名不代表没用 AI）", 12.5, INK2))
    for v in range(0, ymax + 1, 100):
        p.append(f'<line x1="{L}" x2="{W-R}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="{GRID}"/>')
        p.append(text(L - 10, Y(v) + 4, str(v), 12, MUTED, "end"))
    for i, (m, t, c, u) in enumerate(rows):
        x = L + i * slot + (slot - bw) / 2
        y0 = B
        for val, col in ((c, S1), (u, S2), (t - c - u, NONE)):
            if val <= 0:
                continue
            h = (B - T) * val / ymax
            p.append(f'<rect x="{x:.1f}" y="{y0-h:.1f}" width="{bw:.1f}" height="{max(h-2,0.5):.1f}" rx="2" fill="{col}"/>')
            y0 -= h
        p.append(text(x + bw / 2, B + 18, m[2:].replace("-", "."), 11.5, MUTED, "middle"))
        if t >= 50:
            share = round(100 * (c + u) / t)
            p.append(text(x + bw / 2, Y(t) - 8, f"{t}（{share}%）", 12, INK, "middle"))
        elif t > 0:
            p.append(text(x + bw / 2, Y(t) - 6, str(t), 11.5, INK2, "middle"))
    lx = L
    for col, name in ((S1, "Claude 署名"), (S2, "Cursor 署名"), (NONE, "无署名")):
        p.append(f'<rect x="{lx}" y="{H-54}" width="12" height="12" rx="3" fill="{col}"/>')
        p.append(text(lx + 18, H - 44, name, 12.5, INK2))
        lx += 120
    p.append(text(L, H - 18, "括号内为带 AI 署名的比例；2025 年 3–10 月在 Plastic SCM，没有署名信息，未计入", 11.5, MUTED))
    write("ai-monthly.svg", p)


# ---------------------------------------------------------------- 7a: continue vs rewind on the save timeline
def fig_save_timeline():
    W, H = 820, 390
    p = svg_open(W, H, "继续与回溯在存档时间线上的区别")
    p.append(text(24, 32, "继续是恢复，回溯是重玩", 17, INK, weight="600"))
    p.append(text(24, 53, "存档时间线上每个节点是一组客人入场的时刻；玩家正停在第 2 天第 2 组的对话中间", 12.5, INK2))
    groups = [f"D{d}·{g}" for d in (1, 2, 3) for g in (1, 2, 3)]
    L, step = 60, 82
    cur = 4  # D2·2

    def node_row(y, cleared_from=None, mark_mid=True):
        q = [f'<line x1="{L}" x2="{L + step * 8}" y1="{y}" y2="{y}" stroke="{BORDER}" stroke-width="2"/>']
        for i, gname in enumerate(groups):
            x = L + step * i
            cleared = cleared_from is not None and i >= cleared_from
            if cleared:
                q.append(f'<rect x="{x-24}" y="{y-16}" width="48" height="32" rx="6" fill="#f8e5e2" stroke="{RED}" stroke-dasharray="3 2"/>')
            fill = SURFACE if i > cur else ("#e9f1fb" if not cleared else "#fbefed")
            q.append(f'<circle cx="{x}" cy="{y}" r="7" fill="{fill}" stroke="{INK2 if i <= cur else MUTED}" stroke-width="1.5"/>')
            q.append(text(x, y + 30, gname, 11.5, INK2 if i <= cur else MUTED, "middle"))
        if mark_mid:
            mx = L + step * cur + 34
            q.append(f'<circle cx="{mx}" cy="{y}" r="5" fill="{S1}" stroke="{SURFACE}" stroke-width="2"/>')
        return q

    # row 1: continue
    y1 = 130
    p.append(text(24, y1 - 34, "继续游戏（恢复）", 14, INK, weight="600"))
    p.append(text(190, y1 - 34, "回到同一组的同一句；什么都不清除", 12, INK2))
    p.extend(node_row(y1))
    mx = L + step * cur + 34
    p.append(f'<path d="M{mx} {y1-12} q0 -22 0 -2" fill="none"/>')
    p.append(text(mx + 8, y1 - 14, "中途快照：阶段、演出第几步、事实、最后一句", 11.5, S1))
    # row 2: rewind to D1·3
    y2 = 300
    target = 2
    p.append(text(24, y2 - 62, "笔记本回溯到第 1 天第 3 组（重玩）", 14, INK, weight="600"))
    p.append(text(300, y2 - 62, "从目标那组（含）往后的中途状态和剪过的发型全部清掉", 12, INK2))
    p.extend(node_row(y2, cleared_from=target, mark_mid=False))
    tx = L + step * target
    cx_ = L + step * cur
    p.append(f'<path d="M{cx_} {y2-22} C{cx_} {y2-52} {tx} {y2-52} {tx} {y2-24}" fill="none" stroke="{VIOLET}" stroke-width="1.6"/>')
    p.append(f'<path d="M{tx-5} {y2-31} L{tx} {y2-23} L{tx+5} {y2-31}" fill="none" stroke="{VIOLET}" stroke-width="1.6"/>')
    p.append(f'<rect x="{L + step * 8 - 150}" y="{H-36}" width="12" height="12" rx="3" fill="#f8e5e2" stroke="{RED}" stroke-dasharray="3 2"/>')
    p.append(text(L + step * 8 - 132, H - 26, "被清除的状态", 12, INK2))
    return write("save-timeline.svg", p)


# ---------------------------------------------------------------- 8a: bot coverage cost curve
def fig_bot_coverage():
    rows = []
    for ln in open(os.path.join(os.path.dirname(LINES_CSV), "bot-coverage.csv"), encoding="utf-8"):
        if ln.startswith("route"):
            continue
        r, sec, cum, lines = ln.strip().split(",")
        rows.append((int(r), int(sec), int(cum), int(lines)))
    W, H = 760, 400
    L, R, T, B = 64, 40, 74, 320
    xmax, ymax = 3.75, 320

    def X(h):
        return L + (W - R - L) * h / xmax

    def Y(v):
        return B - (B - T) * v / ymax

    p = svg_open(W, H, "机器人覆盖路线的成本曲线")
    p.append(text(24, 32, "前几条路线就看到了几乎所有台词", 17, INK, weight="600"))
    p.append(text(24, 53, "一次跑满 19 条覆盖路线的机器人批次：累计用时与累计见到的不同台词", 12.5, INK2))
    for v in range(0, 321, 80):
        p.append(f'<line x1="{L}" x2="{W-R}" y1="{Y(v):.1f}" y2="{Y(v):.1f}" stroke="{GRID}"/>')
        p.append(text(L - 10, Y(v) + 4, str(v), 12, MUTED, "end"))
    for h in (0, 1, 2, 3):
        p.append(text(X(h), B + 20, f"{h} 小时", 12, MUTED, "middle"))
    pts = [(0.0, 0)] + [(c / 3600, l) for _, _, c, l in rows]
    poly = " ".join(f"{X(h):.1f},{Y(v):.1f}" for h, v in pts)
    p.append(f'<polyline points="{poly}" fill="none" stroke="{S1}" stroke-width="2" stroke-linejoin="round"/>')
    for (r, _, c, l) in rows:
        p.append(f'<circle cx="{X(c/3600):.1f}" cy="{Y(l):.1f}" r="4" fill="{S1}" stroke="{SURFACE}" stroke-width="1.5"/>')
    r4 = rows[3]
    p.append(text(X(r4[2]/3600) + 6, Y(r4[3]) + 28, f"第 4 条：{r4[2]/60:.0f} 分钟，{r4[3]}/314 句", 12.5, INK))
    r9 = rows[8]
    p.append(text(X(r9[2]/3600) + 6, Y(r9[3]) + 62, "第 9 条之后不再出现新台词", 12.5, INK))
    p.append(f'<line x1="{X(r9[2]/3600):.1f}" x2="{X(r9[2]/3600):.1f}" y1="{Y(r9[3])+6:.1f}" y2="{Y(r9[3])+50:.1f}" stroke="{MUTED}" stroke-dasharray="3 3"/>')
    p.append(text(X(rows[-1][2]/3600) - 4, Y(rows[-1][3]) + 22, f"第 19 条：{rows[-1][2]/3600:.1f} 小时", 12.5, INK, "end"))
    p.append(text(24, H - 20, "后 10 条路线补的是规则覆盖，不是新台词；只统计台词，不含规则。", 12, MUTED))
    write("bot-coverage.svg", p)


# ---------------------------------------------------------------- 9a: shapes of verification traps
def fig_trap_shapes():
    W, H = 820, 400
    p = svg_open(W, H, "验证陷阱的八种形状")
    p.append(text(24, 32, "检查是对的，只是它在看别的东西", 17, INK, weight="600"))
    cards = [
        ("同一样东西比了两遍", ["压缩没生效，", "比的是同一张图"]),
        ("验的是旧版本", ["运行时读的是", "烘进去的旧默认值"]),
        ("根本没跑", ["过滤条件漏掉新测试，", "总数看起来照常"]),
        ("中途换了被测对象", ["测试在回归中途", "重建了数据库"]),
        ("断言比意图弱", ["「是个物体」", "被一片胡子满足"]),
        ("量错了东西", ["排版前量到", "10 × 20 的词框"]),
        ("绿，是因为没人测", ["整文件覆盖，", "丢了 250 行"]),
        ("数对了，成分不对", ["两轮都是 22 个失败，", "失败的成员不同"]),
    ]
    cw, ch, gx, gy = 182, 132, 14, 16
    for i, (title, ex) in enumerate(cards):
        col, row = i % 4, i // 4
        x = 24 + col * (cw + gx)
        y = 56 + row * (ch + gy)
        p.append(f'<rect x="{x}" y="{y}" width="{cw}" height="{ch}" rx="10" fill="#ffffff" stroke="{BORDER}"/>')
        p.append(text(x + 14, y + 26, f"{i+1:02d}", 12, MUTED))
        p.append(text(x + 14, y + 52, title, 15, INK, weight="600"))
        for j, ln in enumerate(ex):
            p.append(text(x + 14, y + 80 + j * 19, ln, 12.5, INK2))
    p.append(text(24, H - 16, "防住它们的办法：先把被检查的东西改坏，确认检查会变红（反向探针）。", 12.5, INK2))
    write("trap-shapes.svg", p)


# ---------------------------------------------------------------- 10a: build size steps
# Sizes from commit messages: a77a9ad/e13b996 (2.2 GB -> 1.6 GB), 7e8ed5d (-> 879 MB),
# e43648d (full macOS build 859.6 MB).
SIZE_STEPS = [
    ("初始打包", 2200, "贴图占 97.5%"),
    ("界面贴图并入图集", 1600, "透明画布不再计价"),
    ("角色贴图并入图集", 879, "头发图不能进图集，被排除"),
    ("之后一次完整构建", 860, "macOS"),
]


def fig_size_steps():
    W, H = 760, 300
    L, R = 190, 140
    p = svg_open(W, H, "安装包体积的变化")
    p.append(text(24, 32, "安装包体积：主要靠图集把透明画布挤掉", 17, INK, weight="600"))
    top, bh, gap = 62, 34, 20
    xmax = 2200

    def X(v):
        return L + (W - L - R) * v / xmax

    for i, (label, mb, note) in enumerate(SIZE_STEPS):
        y = top + i * (bh + gap)
        p.append(text(L - 12, y + bh / 2 + 5, label, 13, INK, "end"))
        p.append(f'<rect x="{L}" y="{y}" width="{X(mb)-L:.1f}" height="{bh}" rx="4" fill="{S1 if i else MUTED}"/>')
        val = f"{mb/1000:.1f} GB" if mb >= 1000 else f"{mb} MB"
        p.append(text(X(mb) + 8, y + bh / 2 - 1, val, 13, INK, weight="600"))
        p.append(text(X(mb) + 8, y + bh / 2 + 15, note, 11.5, INK2))
    write("size-steps.svg", p)


# ---------------------------------------------------------------- 10b: CloseShot worst frame
def fig_closeshot_frame():
    W, H = 760, 260
    L, R = 190, 120
    p = svg_open(W, H, "第一次进近景时帷幕拉开后的最差一帧")
    p.append(text(24, 32, "第一次进近景：帷幕拉开后最差的一帧", 17, INK, weight="600"))
    p.append(text(24, 53, "近景背景音乐从「加载时解压」改成「流式 + 后台加载」前后，编辑器内实测", 12.5, INK2))
    xmax = 1800

    def X(v):
        return L + (W - L - R) * v / xmax

    bars = [("改之前", 1744, S2, "其中播放背景音乐 1682 ms"), ("改之后", 121, S1, "")]
    for i, (label, ms, col, note) in enumerate(bars):
        y = 82 + i * 62
        p.append(text(L - 12, y + 22, label, 13, INK, "end"))
        p.append(f'<rect x="{L}" y="{y}" width="{max(X(ms)-L,2):.1f}" height="34" rx="4" fill="{col}"/>')
        p.append(text(X(ms) + 8, y + 22, f"{ms} ms", 13, INK, weight="600"))
        if note:
            p.append(text(L + 8, y + 52, note, 11.5, INK2))
    nx = X(85)
    p.append(f'<line x1="{nx:.1f}" x2="{nx:.1f}" y1="72" y2="{H-40}" stroke="{INK2}" stroke-dasharray="4 3"/>')
    p.append(text(nx + 6, H - 24, "编辑器帧时间噪声本底 ≈ 85 ms", 12, INK2))
    write("closeshot-frame.svg", p)


# ---------------------------------------------------------------- 11: letterbox / pillarbox
def viewport(aspect, target=16 / 9):
    """与游戏里 DisplayViewportUtility.CalculateViewport 同一个公式：返回 (x, y, w, h)，单位是屏幕的比例。"""
    if abs(aspect - target) < 1e-6:
        return 0.0, 0.0, 1.0, 1.0
    if aspect > target:
        w = target / aspect
        return (1 - w) / 2, 0.0, w, 1.0
    h = aspect / target
    return 0.0, (1 - h) / 2, 1.0, h


def fig_letterbox():
    W, H = 760, 290
    p = svg_open(W, H, "不同宽高比的屏幕上，画面保持 16:9，多出来的部分留黑边")
    p.append(text(24, 32, "画面锁定 16:9，多出来的部分留黑边", 17, INK, weight="600"))
    p.append(text(24, 53, "黑边宽度按游戏里同一个公式算出；UI 放在同样大小的安全框里，超出部分被裁掉", 12.5, INK2))
    screens = [("16:9", 16 / 9, "1920×1080"), ("21:9 超宽屏", 21 / 9, "左右各留黑边"), ("16:10", 16 / 10, "上下各留黑边")]
    sh = 108  # 屏幕高度
    x = 30
    for label, aspect, note in screens:
        sw = sh * aspect
        y = 80
        p.append(f'<rect x="{x:.1f}" y="{y}" width="{sw:.1f}" height="{sh}" rx="3" fill="#1d1d1b"/>')
        vx, vy, vw, vh = viewport(aspect)
        cx, cy, cw, ch = x + vx * sw, y + vy * sh, vw * sw, vh * sh
        p.append(f'<rect x="{cx:.1f}" y="{cy:.1f}" width="{cw:.1f}" height="{ch:.1f}" fill="#f2c46b"/>')
        p.append(f'<rect x="{cx+6:.1f}" y="{cy+6:.1f}" width="{cw-12:.1f}" height="{ch-12:.1f}" fill="none" '
                 f'stroke="{S1}" stroke-width="1.5" stroke-dasharray="5 3"/>')
        p.append(text(cx + cw / 2, cy + ch / 2 + 5, "游戏画面 16:9", 12.5, INK, "middle", "600"))
        p.append(text(x + sw / 2, y + sh + 24, label, 14, INK, "middle", "600"))
        share = vw * vh * 100
        p.append(text(x + sw / 2, y + sh + 44, f"{note}，画面占屏幕 {share:.0f}%", 12, INK2, "middle"))
        x += sw + 26
    p.append(f'<rect x="34" y="{H-38}" width="14" height="10" fill="none" stroke="{S1}" stroke-dasharray="4 2"/>')
    p.append(text(54, H - 29, "UI 安全框", 12, INK2))
    p.append(f'<rect x="140" y="{H-38}" width="14" height="10" fill="#1d1d1b"/>')
    p.append(text(160, H - 29, "黑边：不渲染，也不接受输入", 12, INK2))
    write("letterbox.svg", p)

fig_lab_curves()
fig_versions()
fig_pipeline()
fig_sets()
fig_arch()
fig_lines()
fig_story_states()
fig_word_to_ending()
fig_ai_monthly()
fig_save_timeline()
fig_bot_coverage()
fig_trap_shapes()
fig_size_steps()
fig_closeshot_frame()
fig_letterbox()
print("ok", sorted(os.listdir(OUT)))
