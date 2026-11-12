// 生成站点图标（蜂字印 D6：六边形白文印，外圈蜂巢边栏）。
//
//   node tools/site-icons/make-icons.mjs
//
// 写出 static/favicon.svg，并用 rsvg-convert 与 ImageMagick（magick）栅格化出
// favicon.ico（16/32/48）、favicon-96x96.png、apple-touch-icon.png（180）和
// manifest 用的 web-app-manifest-192x192.png / 512x512.png。
// 只在本机运行，CI 不调用；改了这里就重新运行一次，把产物一起提交。
//
// 尺寸分档（细节在小尺寸下只会变成噪点，所以越小越简单）：
//   - 16px：只有印身和放大的字；
//   - 32px：印身、内框和字，不画蜂巢格；
//   - 48px 起：正式版，外圈加蜂巢边栏；
//   - 180px 起（主屏、安装图标）：再加钤印质感，边缘轻微抖动和少量纸白斑点。
// favicon.svg 自己用 @media (max-width: …) 按渲染尺寸在三档之间切换。

import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, readdirSync, copyFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const { glyphs } = JSON.parse(readFileSync(join(here, "glyphs.json"), "utf8"));

const C = { terra: "#b25634", paper: "#f6f1e6", ground: "#f0eee6" };

function hexPts(cx, cy, r, flat = false) {
  const p = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i + (flat ? 0 : -90));
    p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return p;
}
const pts = (a) => a.map(([x, y]) => `${+x.toFixed(2)},${+y.toFixed(2)}`).join(" ");

// 字形路径以外框中心为原点、长边 100 单位，放到印面中心 (32,32) 并缩放到 size。
const glyph = (font, size) =>
  `<path d="${glyphs[font].d}" transform="translate(32 32) scale(${size / 100})" fill="${C.paper}"/>`;

// 印身：尖顶六边形，同色圆角描边让角变圆。
const body = (R) =>
  `<polygon points="${pts(hexPts(32, 32, R))}" fill="${C.terra}" stroke="${C.terra}" stroke-width="4" stroke-linejoin="round"/>`;

// 正式版：外圈蜂巢格（只画落在边栏环带里的格子）、内框、宋体字。
function fullSeal() {
  const Ro = 30, Ri = 21.6, r = 3.1, dx = r * 1.5, dy = r * Math.sqrt(3);
  let cells = "";
  for (let i = -1; i <= Math.ceil(64 / dx); i++) {
    for (let j = -1; j <= Math.ceil(64 / dy); j++) {
      const cx = i * dx, cy = j * dy + (i % 2 ? dy / 2 : 0);
      const d = Math.hypot(cx - 32, cy - 32);
      if (d < Ri * 0.86 - r || d > Ro + r) continue;
      cells += `<polygon points="${pts(hexPts(cx, cy, r, true))}"/>`;
    }
  }
  return `<clipPath id="ring"><path clip-rule="evenodd" d="M${pts(hexPts(32, 32, Ro))}Z M${pts(hexPts(32, 32, Ri))}Z"/></clipPath>
${body(28)}
<g clip-path="url(#ring)" fill="none" stroke="${C.paper}" stroke-width=".75" opacity=".85">${cells}</g>
<polygon points="${pts(hexPts(32, 32, Ri))}" fill="none" stroke="${C.paper}" stroke-width="1.2" stroke-linejoin="round"/>
${glyph("NotoSerifSC", 25)}`;
}

const frame = (R) =>
  `<polygon points="${pts(hexPts(32, 32, R))}" fill="none" stroke="${C.paper}" stroke-width="1.6" stroke-linejoin="round"/>`;

// 32px 版：内框和字。
const midSeal = () => `${body(28.5)}${frame(24.5)}${glyph("NotoSerifSC", 31)}`;

// 16px 版：字尽量大，没有纹饰。
const smallSeal = () => `${body(29.5)}${glyph("NotoSerifSC", 36)}`;

const stampFilter = `<filter id="stamp" x="-6%" y="-6%" width="112%" height="112%" color-interpolation-filters="sRGB">
<feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="2" seed="11" result="n"/>
<feDisplacementMap in="SourceGraphic" in2="n" scale="1" xChannelSelector="R" yChannelSelector="G" result="d"/>
<feTurbulence type="fractalNoise" baseFrequency="0.3" numOctaves="3" seed="4" result="n2"/>
<feColorMatrix in="n2" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -30 0 0 0 22.8" result="speck"/>
<feComposite in="d" in2="speck" operator="in"/>
</filter>`;

const doc = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n${inner}\n</svg>\n`;

// 有底色的方形图标：seal 占边长的 scale，居中。
// maskable 图标的安全区是中间直径 80% 的圆，印的外接圆半径约 30/64，scale 0.72 时约占 34%，在安全区内。
const onGround = (scale, stamped) => {
  const o = 32 - 32 * scale;
  const seal = stamped ? `${stampFilter}<g filter="url(#stamp)">${fullSeal()}</g>` : fullSeal();
  return doc(`<rect width="64" height="64" fill="${C.ground}"/>
<g transform="translate(${+o.toFixed(3)} ${+o.toFixed(3)}) scale(${scale})">${seal}</g>`);
};

const favicon = doc(`<style>.m,.s{display:none}@media (max-width:40px){.f{display:none}.m{display:inline}}@media (max-width:24px){.m{display:none}.s{display:inline}}</style>
<g class="f">${fullSeal()}</g>
<g class="m">${midSeal()}</g>
<g class="s">${smallSeal()}</g>`);

// 全部先生成到临时目录，都成功了再复制进 static/，中途失败不会留下新旧混杂的一套图标。
const tmp = mkdtempSync(join(tmpdir(), "site-icons-"));
try {
  const src = {
    full: doc(fullSeal()),
    mid: doc(midSeal()),
    small: doc(smallSeal()),
    touch: onGround(0.8, true),
    maskable: onGround(0.72, true),
  };
  for (const [k, v] of Object.entries(src)) writeFileSync(join(tmp, `${k}.svg`), v);

  const out = join(tmp, "out");
  mkdirSync(out);
  const png = (name, size, file) =>
    execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), "-o", file, join(tmp, `${name}.svg`)]);

  writeFileSync(join(out, "favicon.svg"), favicon);
  png("small", 16, join(tmp, "16.png"));
  png("mid", 32, join(tmp, "32.png"));
  png("full", 48, join(tmp, "48.png"));
  execFileSync("magick", [join(tmp, "16.png"), join(tmp, "32.png"), join(tmp, "48.png"), join(out, "favicon.ico")]);
  png("full", 96, join(out, "favicon-96x96.png"));
  png("touch", 180, join(out, "apple-touch-icon.png"));
  png("maskable", 192, join(out, "web-app-manifest-192x192.png"));
  png("maskable", 512, join(out, "web-app-manifest-512x512.png"));

  for (const f of readdirSync(out)) copyFileSync(join(out, f), join(root, "static", f));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log("wrote static/favicon.svg, favicon.ico, favicon-96x96.png, apple-touch-icon.png, web-app-manifest-{192,512}.png");
