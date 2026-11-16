/**
 * Motor de captura de las tomas del video demo (lo usan `record.mjs`, la
 * versión larga, y `record-reel.mjs`, la de Instagram). Recorre un P1 vivo en
 * un iPhone emulado con el Chrome del sistema, guarda los cuadros de pantalla
 * y anota la línea de tiempo: textos del guion y toques. No toca el DOM de la
 * página; los textos y los círculos se dibujan después, en `compose.mjs`.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const oneLine = (s) => s.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
export const docY = (loc) => loc.first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
export const scrollY = (page) => page.evaluate(() => window.scrollY);
export const scrollNow = (page, y) => page.evaluate((yy) => window.scrollTo({ top: yy, behavior: "instant" }), y);
/** Scroll suave hasta `y`, en `ms`. */
export const scrollTo = (page, y, ms) => page.evaluate(([yy, dur]) => new Promise((res) => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const y0 = window.scrollY, dy = Math.max(0, Math.min(yy, max)) - y0, t0 = performance.now();
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const step = (t) => { const k = Math.min(1, (t - t0) / dur); window.scrollTo({ top: y0 + dy * ease(k), behavior: "instant" }); if (k < 1) requestAnimationFrame(step); else res(); };
  requestAnimationFrame(step);
}), [y, ms]);
/** Scroll suave hasta dejar el elemento a `offset` px del borde de arriba; sigue al elemento si la página se mueve (el resumen que llega por partes). */
export const scrollToEl = (page, loc, offset, ms) => loc.first().evaluate((el, [off, dur]) => new Promise((res) => {
  const y0 = window.scrollY, t0 = performance.now();
  const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const target = Math.max(0, Math.min(el.getBoundingClientRect().top + window.scrollY - off, max));
    window.scrollTo({ top: y0 + (target - y0) * ease(k), behavior: "instant" });
    if (k < 1) requestAnimationFrame(step); else res();
  };
  requestAnimationFrame(step);
}), [offset, ms]);
/** Espera a que el texto del elemento deje de cambiar (`quietMs`), como mucho `maxMs`. */
export async function waitStable(loc, quietMs, maxMs) {
  const t0 = Date.now(); let last = null, since = Date.now();
  while (Date.now() - t0 < maxMs) {
    const txt = (await loc.count()) ? await loc.first().innerText().catch(() => "") : "";
    if (txt !== last) { last = txt; since = Date.now(); }
    else if (txt && Date.now() - since >= quietMs) return true;
    await sleep(200);
  }
  return false;
}

/**
 * Arranca una toma. `layout` le dice a `compose.mjs` cómo armar el cuadro:
 * "demo" (pantalla entera, texto arriba) o "reel" (Instagram).
 */
export async function startTake({ out, vw = 390, vh = 844, dsf = 2, layout = "demo" }) {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, "frames"), { recursive: true });
  // El flag fuerza la densidad REAL de la ventana: sin él la captura sale a 390 px aunque se emule otra.
  const browser = await chromium.launch({ channel: "chrome", args: [`--force-device-scale-factor=${dsf}`] });
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dsf, isMobile: true, hasTouch: true, userAgent: UA, locale: "es-AR", timezoneId: "America/Argentina/San_Juan" });

  const st = { t0: null, paused: 0, pauseAt: null, lastT: -1, force: false, frames: [], caps: [], taps: [], marks: [], active: null, sessions: new Map() };
  const wall = () => Date.now() / 1000;
  /** Segundos de VIDEO transcurridos (los cortes no cuentan). */
  const vt = () => (st.t0 == null ? 0 : wall() - st.t0 - st.paused);
  const mark = (name) => { st.marks.push({ name, t: +vt().toFixed(2) }); console.log(`[${vt().toFixed(1).padStart(5)} s] ${name}`); };

  async function sessionFor(page) {
    let s = st.sessions.get(page);
    if (s) return s;
    s = await ctx.newCDPSession(page);
    s.on("Page.screencastFrame", (f) => {
      s.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
      if (st.active !== s || st.pauseAt != null) return;
      // Al abrirse otra pestaña (WhatsApp) la pantalla se redimensiona un instante: esos cuadros no van.
      if (Math.round(f.metadata.deviceWidth) !== vw || Math.round(f.metadata.deviceHeight) !== vh) return;
      const w = f.metadata.timestamp;
      if (st.t0 == null) st.t0 = w;
      let t = w - st.t0 - st.paused;
      if (st.force) { t = Math.max(t, st.lastT + 0.034); st.force = false; }
      else if (t < st.lastT + 0.028) return; // ~35 cuadros por segundo como mucho
      const file = `f${String(st.frames.length).padStart(6, "0")}.jpg`;
      fs.writeFileSync(path.join(out, "frames", file), Buffer.from(f.data, "base64"));
      st.frames.push({ t, file });
      st.lastT = t;
    });
    st.sessions.set(page, s);
    return s;
  }
  /** Pone a `page` en cámara. Un solo screencast activo por vez: al arrancar emite un cuadro al instante. */
  async function activate(page) {
    if (st.active) await st.active.send("Page.stopScreencast").catch(() => {});
    const s = await sessionFor(page);
    st.active = s;
    st.force = true;
    await s.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: vw * dsf, maxHeight: vh * dsf, everyNthFrame: 1 });
  }
  /** Corte: lo que pase dentro de `prep` no entra en el video. */
  async function cutTo(page, prep) {
    st.pauseAt = wall();
    if (st.active) await st.active.send("Page.stopScreencast").catch(() => {});
    st.active = null;
    await prep?.();
    st.paused += wall() - st.pauseAt;
    st.pauseAt = null;
    await activate(page);
    await sleep(150);
  }
  /** Texto del guion: cierra el anterior y abre este. `*así*` resalta. `cap(null, null)` cierra el último. */
  function cap(kicker, text, extra = {}) {
    const t = vt();
    const prev = st.caps.at(-1);
    if (prev && prev.end == null) prev.end = t;
    if (text) { st.caps.push({ kicker, text, start: t + (prev ? 0.15 : 0), end: null, ...extra }); console.log(`[${t.toFixed(1).padStart(5)} s]   «${extra.lead ? extra.lead + " " : ""}${text}»`); }
  }
  /** Toque con el dedo: el círculo aparece `lead` ms antes, para que se vea qué se toca. */
  async function tap(page, target, { lead = 420, after = 260 } = {}) {
    let x, y;
    if (typeof target.x === "number") ({ x, y } = target);
    else { const b = await target.first().boundingBox(); if (!b) throw new Error("no se ve el elemento a tocar"); x = b.x + b.width / 2; y = b.y + b.height / 2; }
    if (y < 0 || y > vh || x < 0 || x > vw) throw new Error(`toque fuera de pantalla (${Math.round(x)}, ${Math.round(y)})`);
    st.taps.push({ t: vt() + lead / 1000, x, y });
    await sleep(lead);
    await page.touchscreen.tap(x, y);
    await sleep(after);
  }
  /** Cierra la toma y escribe `timeline.json`. Devuelve la duración. */
  async function finish(values, failed) {
    const duration = vt();
    if (st.active) await st.active.send("Page.stopScreencast").catch(() => {});
    await browser.close();
    for (const c of st.caps) if (c.end == null) c.end = duration;
    fs.writeFileSync(path.join(out, "timeline.json"), JSON.stringify({ layout, duration, viewport: { w: vw, h: vh, dsf }, values, marks: st.marks, caps: st.caps, taps: st.taps, frames: st.frames }, null, 1));
    console.log(`\n${failed ? "INCOMPLETA" : "OK"} · ${duration.toFixed(1)} s · ${st.frames.length} cuadros · ${st.caps.length} textos · ${st.taps.length} toques`);
    console.log(JSON.stringify(values, null, 1));
    return duration;
  }
  return { ctx, vt, mark, activate, cutTo, cap, tap, finish };
}

/**
 * Espera, fuera de cámara, a que estén cargadas las miniaturas de "Avisos similares" que van a entrar en cuadro.
 * Las fotos vienen del portal de origen y alguna pesa más de 600 KB: si una no llega, la toma se corta en vez de
 * grabar una foto a medio cargar.
 */
export async function waitThumbs(det, maxMs = 45_000) {
  const pending = () => det.evaluate(() => [...document.querySelectorAll("#comparables li.simrow")]
    .filter((li) => li.getBoundingClientRect().top < window.innerHeight + 400)
    .map((li) => li.querySelector("img.simrow-thumb"))
    .filter((img) => img && !(img.complete && img.naturalWidth > 0)).length);
  const t0 = Date.now();
  while ((await pending()) > 0) {
    if (Date.now() - t0 > maxMs) throw new Error(`una miniatura de los similares no terminó de cargar en ${Math.round(maxMs / 1000)} s`);
    await sleep(300);
  }
  await sleep(400); // el decodificado y el pintado
}

/** Lo que se lee de la card #1 para escribir el guion. Corta si la card no sirve para el plano. */
export async function readFirstCard(c1) {
  if ((await c1.getAttribute("class"))?.includes("pcard--muted")) throw new Error("la #1 es una card de datos incompletos: su detalle no tiene mapa");
  const posTxt = oneLine(await c1.getByTestId("position").innerText().catch(() => ""));
  const pm = posTxt.match(/(\d+)\s*%\+?\s*por debajo de similares\s+(\d+)\s+(\S+)\s+en\s+(.+?)\s+·/);
  if (!pm) throw new Error(`la #1 no trae el bloque de posición esperado: "${posTxt}"`);
  const datesTxt = oneLine(await c1.locator(".pcard-dates").innerText().catch(() => ""));
  return {
    id: await c1.getAttribute("data-id"),
    pct: pm[1], pool: pm[2], unit: pm[3], zone: pm[4],
    published: datesTxt.match(/publicado hace ([^·]+?)\s*·\s*margen para negociar/)?.[1] ?? null,
    hasZone: (await c1.getByTestId("zone-ref").count()) > 0,
    notice: oneLine(await c1.getByTestId("estimate-notice").innerText().catch(() => "")),
  };
}
