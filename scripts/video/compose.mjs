#!/usr/bin/env node
/**
 * Arma el mp4 vertical (1080 × 1920, 30 cuadros por segundo) a partir de una
 * toma de `record.mjs` o `record-reel.mjs`. La toma dice su formato:
 *
 *   demo  pantalla entera del celular abajo, el guion como texto arriba.
 *   reel  Instagram: la pantalla del celular entera (390 × 844), la marca arriba
 *         (zona que Instagram tapa o recorta: nada que haga falta leer), el
 *         texto de una línea en la zona segura, justo arriba de la pantalla y
 *         dentro del recorte 4:5 del feed, y pista de audio en silencio.
 *
 *   node scripts/video/compose.mjs .ci/video/reel [salida.mp4] [crf]
 *
 * Los textos y el círculo de cada toque se dibujan con el Chrome del sistema.
 * Necesita ffmpeg con libx264. Lo busca en este orden: la variable FFMPEG, el
 * paquete `ffmpeg-static` (`npm i --no-save ffmpeg-static`, no entra en
 * package.json) y `ffmpeg` del PATH (`brew install ffmpeg`).
 */
import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const FFMPEG = process.env.FFMPEG || (() => { try { return require("ffmpeg-static"); } catch { return "ffmpeg"; } })();
const TAKE = process.argv[2] ?? ".ci/video/toma";
const OUTFILE = process.argv[3] ?? path.join(TAKE, "finder-demo.mp4");
const tl = JSON.parse(fs.readFileSync(path.join(TAKE, "timeline.json"), "utf8"));
const REEL = tl.layout === "reel";
const CRF = process.argv[4] ?? (REEL ? "18" : "19");

/* ---------- Lienzo ---------- */
const W = 1080, H = 1920, FPS = 30, R = 46, TAP = 136;
// Reel de Instagram. Zonas sobre 1080 × 1920: arriba ~270 px (hora, batería y barra de Reels), abajo ~420 px
// (usuario, texto del posteo, audio), íconos a la derecha desde x ≈ 940; el feed recorta a 4:5 (y = 285 a 1635).
// Reglas de composición (German, 04/10): la pantalla de la aplicación se ve COMPLETA, la de un celular entero
// (390 × 844) con sus cuatro esquinas, y la cabecera es compacta. Para que entren las dos cosas el texto del
// guion es de UNA línea, justo debajo de los 285 px, y la marca ocupa lo que queda arriba.
const REEL_TOP = 396, REEL_BOTTOM = 30; // dónde arranca la pantalla en reel y el margen de abajo
const PW = REEL ? Math.min(700, Math.floor(((H - REEL_BOTTOM - REEL_TOP) * tl.viewport.w) / tl.viewport.h / 2) * 2) : 720; // ancho de la pantalla en el lienzo
const PH = Math.round((PW * tl.viewport.h) / tl.viewport.w / 2) * 2;
const PX = (W - PW) / 2;
const PY = REEL ? REEL_TOP : H - PH - 26;
const CAP = REEL ? { y: 266, h: 116 } : { y: 0, h: PY - 8 }; // franja del texto
const BRAND_Y = 190; // línea de base de la marca en reel: centrada, lejos de los íconos de las esquinas de Instagram
if (REEL && tl.viewport.h < 800) console.log(`OJO: la toma se grabó a ${tl.viewport.w} × ${tl.viewport.h}; para el reel va la pantalla entera (390 × 844).`);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rich = (s) => esc(s).replace(/\*([^*]+)\*/g, "<b>$1</b>"); // *así* resalta

const assets = path.join(TAKE, "assets");
fs.rmSync(assets, { recursive: true, force: true });
fs.mkdirSync(assets, { recursive: true });

/* ---------- 1. Imágenes: marco, textos y círculo del toque ---------- */
const browser = await chromium.launch({ channel: "chrome" });
const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
const css = REEL
  ? `html,body{margin:0;background:transparent}
.band{width:${W}px;height:${CAP.h}px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.text{font:700 54px/1.12 Georgia,"Times New Roman",serif;color:#fff;margin:0;white-space:nowrap;letter-spacing:-.005em}
.text b{color:#FFB0D0;font-weight:700}
.text.small{font-size:33px;line-height:1.26;white-space:normal;max-width:940px;text-wrap:balance}
.sub{font:600 24px/1 -apple-system,"Helvetica Neue",Arial,sans-serif;color:#E3D3EF;margin:12px 0 0;letter-spacing:.06em}`
  : `html,body{margin:0;background:transparent}
.band{width:${W}px;height:${CAP.h}px;box-sizing:border-box;padding:34px 64px 18px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.kicker{font:600 25px/1 -apple-system,"Helvetica Neue",Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#F6A9C9;margin:0 0 20px}
.text{font:400 46px/1.24 Georgia,"Times New Roman",serif;color:#fff;max-width:950px;text-wrap:balance;margin:0}
.text b{color:#F6A9C9;font-weight:400}
.end .lead{font:400 34px/1.2 Georgia,"Times New Roman",serif;color:#fff;margin:0 0 8px}
.end .text{font-size:62px;letter-spacing:-.01em}
.end .text b{font-weight:700}
.sub{font:500 28px/1.2 -apple-system,"Helvetica Neue",Arial,sans-serif;color:#E3D3EF;margin:18px 0 0;letter-spacing:.04em}`;

// Marco: fondo violeta con el hueco redondeado de la pantalla, entera
const hole = `M${PX + R} ${PY}H${PX + PW - R}A${R} ${R} 0 0 1 ${PX + PW} ${PY + R}V${PY + PH - R}A${R} ${R} 0 0 1 ${PX + PW - R} ${PY + PH}H${PX + R}A${R} ${R} 0 0 1 ${PX} ${PY + PH - R}V${PY + R}A${R} ${R} 0 0 1 ${PX + R} ${PY}Z`;
await page.setContent(`<style>html,body{margin:0;background:transparent}</style>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3A0F62"/><stop offset="1" stop-color="#2B0A4B"/></linearGradient></defs>
  <path fill="url(#g)" fill-rule="evenodd" d="M0 0H${W}V${H}H0Z ${hole}"/>
  <rect x="${PX - 3}" y="${PY - 3}" width="${PW + 6}" height="${PH + 6}" rx="${R + 3}" fill="none" stroke="#ffffff" stroke-opacity=".30" stroke-width="3"/>
  <rect x="${PX - 9}" y="${PY - 9}" width="${PW + 18}" height="${PH + 18}" rx="${R + 9}" fill="none" stroke="#000000" stroke-opacity=".22" stroke-width="6"/>
  ${REEL ? `<text x="${W / 2}" y="${BRAND_Y}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="46" fill="#ffffff">paradiso<tspan font-weight="700" fill="#FFB0D0">finder</tspan>.com</text>
  <rect x="${W / 2 - 30}" y="${BRAND_Y + 22}" width="60" height="4" rx="2" fill="#EB4283"/>` : ""}
</svg>`);
await page.screenshot({ path: path.join(assets, "frame.png"), omitBackground: true });

// Textos del guion
await page.setViewportSize({ width: W, height: CAP.h });
const capFiles = [];
const capHtml = (c, fs1) => {
  if (!REEL) {
    return c.end_card
      ? `<div class="band end">${c.lead ? `<p class="lead">${esc(c.lead)}</p>` : ""}<p class="text">paradiso<b>finder</b>.com</p>${c.sub ? `<p class="sub">${esc(c.sub)}</p>` : ""}</div>`
      : `<div class="band">${c.kicker ? `<p class="kicker">${esc(c.kicker)}</p>` : ""}<p class="text"${c.size ? ` style="font-size:${c.size}px"` : ""}>${rich(c.text)}</p></div>`;
  }
  // Reel: una línea. El aviso de estimación (texto exacto, largo) va en dos, más chico. En el cierre la marca ya
  // está arriba: el llamado va como frase con la dirección resaltada, no como un segundo logo.
  if (c.small) return `<div class="band"><p class="text small">${rich(c.text)}</p></div>`;
  const one = c.end_card ? `${c.lead ? esc(c.lead) + " " : ""}<b>${esc(c.text)}</b>` : rich(c.text);
  return `<div class="band"><p class="text one" style="font-size:${fs1}px">${one}</p>${c.end_card && c.sub ? `<p class="sub">${esc(c.sub)}</p>` : ""}</div>`;
};
// Reel: todos los textos de una línea llevan el mismo cuerpo, el más grande con el que entra el más largo.
let FS1 = 54;
if (REEL) {
  let widest = 0;
  for (const c of tl.caps) {
    if (c.small) continue;
    await page.setContent(`<style>${css}</style>${capHtml(c, 54)}`);
    widest = Math.max(widest, await page.evaluate(() => document.querySelector(".text").getBoundingClientRect().width));
  }
  FS1 = Math.min(54, Math.floor((54 * 956) / widest));
  console.log(`  textos de una línea a ${FS1}px (el más largo mide ${Math.round((widest * FS1) / 54)} px de 1080)`);
}
for (const [i, c] of tl.caps.entries()) {
  await page.setContent(`<style>${css}</style>${capHtml(c, FS1)}`);
  // Si no entra en la franja, se achica la letra de a poco.
  const fit = await page.evaluate((band) => {
    const t = document.querySelector(".text"), box = document.querySelector(".band");
    let px = parseFloat(getComputedStyle(t).fontSize);
    const inner = () => [...box.children].reduce((a, el) => a + el.getBoundingClientRect().height + parseFloat(getComputedStyle(el).marginTop) + parseFloat(getComputedStyle(el).marginBottom), 0);
    while (inner() > band && px > 26) { px -= 1; t.style.fontSize = px + "px"; }
    const r = t.getBoundingClientRect();
    return { px, lines: Math.round(r.height / parseFloat(getComputedStyle(t).lineHeight)), w: Math.round(r.width) };
  }, CAP.h - (REEL ? 0 : 52));
  if (REEL && fit.w > W - 80) throw new Error(`el texto no entra en el ancho: "${c.text}"`);
  const file = path.join(assets, `cap${String(i).padStart(2, "0")}.png`);
  await page.screenshot({ path: file, omitBackground: true });
  capFiles.push(file);
  console.log(`  ${String(c.start.toFixed(1)).padStart(5)} s · ${(c.end - c.start).toFixed(1)} s · ${fit.lines} líneas a ${fit.px}px · ${c.lead ? c.lead + " " : ""}${c.text}`);
}

// Círculo del toque
await page.setViewportSize({ width: TAP, height: TAP });
await page.setContent(`<style>html,body{margin:0;background:transparent}</style>
<svg xmlns="http://www.w3.org/2000/svg" width="${TAP}" height="${TAP}"><circle cx="${TAP / 2}" cy="${TAP / 2}" r="46" fill="#4D1480" fill-opacity=".34"/><circle cx="${TAP / 2}" cy="${TAP / 2}" r="46" fill="none" stroke="#fff" stroke-width="5"/><circle cx="${TAP / 2}" cy="${TAP / 2}" r="51" fill="none" stroke="#4D1480" stroke-opacity=".85" stroke-width="4"/></svg>`);
await page.screenshot({ path: path.join(assets, "tap.png"), omitBackground: true });
await browser.close();

/* ---------- 2. Cuadros: lista con duraciones ---------- */
function jpegSize(file) {
  const b = fs.readFileSync(file);
  for (let i = 2; i < b.length; ) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return `${b.readUInt16BE(i + 7)}x${b.readUInt16BE(i + 5)}`;
    i += 2 + b.readUInt16BE(i + 2);
  }
  return "?";
}
// Un cuadro de otro tamaño hace que ffmpeg reinicie los filtros y se pierda el marco: no entra.
const want = `${tl.viewport.w * tl.viewport.dsf}x${tl.viewport.h * tl.viewport.dsf}`;
const fr = tl.frames.filter((f) => jpegSize(path.join(TAKE, "frames", f.file)) === want);
if (fr.length !== tl.frames.length) console.log(`  ${tl.frames.length - fr.length} cuadros de otro tamaño descartados`);
const lines = ["ffconcat version 1.0"];
for (let i = 0; i < fr.length; i++) {
  const next = i + 1 < fr.length ? fr[i + 1].t : tl.duration;
  lines.push(`file '${path.resolve(TAKE, "frames", fr[i].file)}'`, `duration ${Math.max(0.001, next - fr[i].t).toFixed(4)}`);
}
lines.push(`file '${path.resolve(TAKE, "frames", fr.at(-1).file)}'`);
fs.writeFileSync(path.join(assets, "frames.txt"), lines.join("\n") + "\n");

/* ---------- 3. ffmpeg ---------- */
const args = ["-y", "-hide_banner", "-loglevel", "warning", "-stats", "-f", "concat", "-safe", "0", "-i", path.join(assets, "frames.txt"), "-i", path.join(assets, "frame.png")];
const fc = [
  `[0:v]fps=${FPS},scale=${PW}:${PH}:flags=lanczos,setsar=1,pad=${W}:${H}:${PX}:${PY}:color=0x3A0F62[b0]`,
  `[b0][1:v]overlay=0:0:format=rgb[v0]`,
];
let idx = 2, last = "v0", n = 0;
const FADE = REEL ? 0.16 : 0.22;
for (const [i, c] of tl.caps.entries()) {
  // El primer texto está desde el primer cuadro (es la tapa del video) y el último queda hasta el final.
  const first = c.start < 0.6, lastOne = c.end >= tl.duration - 0.05;
  const start = first ? 0 : c.start - (REEL ? 0.15 : 0); // en reel los textos se funden uno en otro, sin franja vacía
  const d = Math.max(0.6, c.end - start) + (lastOne ? 0.5 : 0);
  args.push("-loop", "1", "-framerate", String(FPS), "-t", d.toFixed(3), "-i", capFiles[i]);
  const fades = [first ? null : `fade=t=in:st=0:d=${FADE}:alpha=1`, lastOne ? null : `fade=t=out:st=${(d - FADE).toFixed(3)}:d=${FADE}:alpha=1`].filter(Boolean).join(",");
  fc.push(`[${idx}:v]format=rgba${fades ? "," + fades : ""},setpts=PTS+${start.toFixed(3)}/TB[c${i}]`);
  fc.push(`[${last}][c${i}]overlay=0:${CAP.y}:format=rgb:eof_action=pass[v${++n}]`);
  last = `v${n}`; idx++;
}
const sx = PW / tl.viewport.w, sy = PH / tl.viewport.h;
for (const [i, t] of tl.taps.entries()) {
  const start = Math.max(0, t.t - 0.36), d = 0.36 + 0.34;
  const x = Math.round(PX + t.x * sx - TAP / 2), y = Math.round(PY + t.y * sy - TAP / 2);
  args.push("-loop", "1", "-framerate", String(FPS), "-t", d.toFixed(3), "-i", path.join(assets, "tap.png"));
  fc.push(`[${idx}:v]format=rgba,fade=t=in:st=0:d=0.14:alpha=1,fade=t=out:st=${(d - 0.26).toFixed(3)}:d=0.26:alpha=1,setpts=PTS+${start.toFixed(3)}/TB[t${i}]`);
  fc.push(`[${last}][t${i}]overlay=${x}:${y}:format=rgb:eof_action=pass[v${++n}]`);
  last = `v${n}`; idx++;
}
fc.push(`[${last}]scale=${W}:${H}:out_color_matrix=bt709:out_range=tv,format=yuv420p[out]`);
fs.writeFileSync(path.join(assets, "filter.txt"), fc.join(";\n"));
const audio = REEL ? ["-f", "lavfi", "-t", tl.duration.toFixed(3), "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"] : [];
args.push(...audio, "-filter_complex_script", path.join(assets, "filter.txt"), "-map", "[out]", ...(REEL ? ["-map", `${idx}:a`, "-c:a", "aac", "-b:a", "128k"] : ["-an"]),
  "-t", tl.duration.toFixed(3), "-c:v", "libx264", "-preset", "slow", "-crf", String(CRF), "-profile:v", "high", "-pix_fmt", "yuv420p",
  ...(REEL ? ["-g", String(FPS * 2), "-maxrate", "12M", "-bufsize", "24M"] : []),
  "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
  "-r", String(FPS), "-movflags", "+faststart", OUTFILE);

console.log(`componiendo (${REEL ? "reel de Instagram" : "demo"}) ${tl.duration.toFixed(1)} s · ${fr.length} cuadros · ${tl.caps.length} textos · ${tl.taps.length} toques → ${OUTFILE}`);
const r = spawnSync(FFMPEG, args, { stdio: "inherit" });
if (r.error?.code === "ENOENT") { console.error("No encuentro ffmpeg: `npm i --no-save ffmpeg-static`, `brew install ffmpeg` o FFMPEG=/ruta/a/ffmpeg."); process.exit(1); }
if (r.status !== 0) { console.error("ffmpeg falló"); process.exit(1); }
console.log(`listo: ${OUTFILE} · ${(fs.statSync(OUTFILE).size / 1e6).toFixed(1)} MB`);
