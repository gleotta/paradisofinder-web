#!/usr/bin/env node
/**
 * Gate del video (guía de cards por vertical, §6) + top 20 de la consulta, contra
 * un P1 vivo. Se corre el día de la grabación, antes de grabar:
 *
 *   node scripts/video-gate.mjs https://paradisofinder.com "casas en venta hasta 100 mil dólares en Rivadavia"
 *
 * Imprime, por consulta: el top 20 (precio, posición, tendencia, zona, fechas,
 * chips), el resumen del gate y el detalle de la primera card. Usa el Chrome del
 * sistema vía Playwright (el mismo de las pruebas). Entre consultas espera 6 s:
 * el rate limit de búsqueda de P2 es 30/min por IP y cada búsqueda con
 * vertical son dos llamadas.
 */
import { chromium } from "@playwright/test";

const [base, ...queries] = process.argv.slice(2);
if (!base || queries.length === 0) {
  console.error('Uso: node scripts/video-gate.mjs <BASE_URL> "<consulta>" ["<consulta>" ...]');
  process.exit(2);
}

/** Lo que la card no puede decir (misma lista que `tests/e2e/cards-vertical.ts`). */
const FORBIDDEN = /\b(Score|Reventa|Datos completos|P1|P2|P3|cap|gap|None|null|unknown|undefined|NaN)\b|Renta est\./;
/** Fondos permitidos en los bloques de la card: verde, lila, blanco (las etiquetas de antigüedad van en blanco al 94 %), transparente. */
const ALLOWED_BG = /^(rgb\(226, 242, 234\)|rgb\(244, 237, 247\)|rgb\(255, 255, 255\)|rgba\(255, 255, 255, 0\.\d+\)|rgba\(0, 0, 0, 0\))$/;

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "es-AR" });
const page = await ctx.newPage();
let failures = 0;

const text = async (locator) => ((await locator.count()) ? (await locator.first().innerText()).replace(/\s*\n\s*/g, " ").trim() : "-");

for (const [qi, q] of queries.entries()) {
  if (qi > 0) await page.waitForTimeout(6000);
  await page.goto(`${base}/buscar?${new URLSearchParams({ q, v: "comprar" })}`);
  await page.waitForFunction(
    () => /results|clarification|error/.test(document.querySelector('[data-testid="results"]')?.getAttribute("data-state") ?? ""),
    null,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(2500);
  const cards = page.getByTestId("property-card");
  for (let i = 0; i < 4 && (await cards.count()) < 20; i++) {
    await page.mouse.wheel(0, 20_000);
    await page.waitForTimeout(900);
  }
  const n = Math.min(await cards.count(), 20);
  const state = await page.getByTestId("results").getAttribute("data-state");
  console.log(`\n### ${q}  (${state}, ${n} cards en el top)`);

  const s = { forbidden: [], notice: 0, position: 0, greenPos: 0, verify: 0, zone: 0, zoneOwn: 0, zoneUp: 0, down: 0, up: 0, alarmBg: 0 };
  for (let i = 0; i < n; i++) {
    const c = cards.nth(i);
    const raw = await c.innerText();
    const bad = raw.match(FORBIDDEN);
    if (bad) s.forbidden.push(`#${i + 1}: ${bad[0]}`);
    if (await c.getByTestId("estimate-notice").count()) s.notice++;
    const pos = c.getByTestId("position");
    let posText = "-";
    if (await pos.count()) {
      s.position++;
      if ((await pos.getAttribute("data-tone")) === "green") s.greenPos++;
      posText = `${await text(pos.locator(".posblock-pct"))} ${await text(pos.locator(".posblock-text"))} [${await pos.getAttribute("data-tone")}] · ${await text(pos.locator(".posblock-sub"))}`;
      if (posText.includes("verificar el aviso")) s.verify++;
    }
    const zone = c.getByTestId("zone-ref");
    let zoneText = "-";
    if (await zone.count()) {
      s.zone++;
      zoneText = `${await text(zone)} [${await zone.getAttribute("data-tone")}]`;
      if (!zoneText.includes("zona ampliada")) s.zoneOwn++;
      if ((await zone.getAttribute("data-tone")) === "green") s.zoneUp++;
    }
    const trend = c.getByTestId("price-trend");
    const trendText = await text(trend);
    if (await trend.count()) {
      if ((await trend.getAttribute("data-trend")) === "down") s.down++;
      else s.up++;
    }
    s.alarmBg += await c.evaluate(
      (el, allowed) =>
        [...el.querySelectorAll(".posblock, .zoneblock, .estblock, .pflag")]
          .map((x) => getComputedStyle(x).backgroundColor)
          .filter((bg) => !new RegExp(allowed).test(bg)).length,
      ALLOWED_BG.source,
    );
    // Tier bajo (`pcard--muted`): sin ubicación exacta → el detalle no tiene mapa y el
    // puntaje muestra el tope "Datos incompletos". Para el plano del detalle, elegir una sin esta marca.
    const muted = (await c.getAttribute("class"))?.includes("pcard--muted") ? " [DATOS INCOMPLETOS]" : "";
    console.log(
      `#${i + 1} ${await c.getAttribute("data-id")}${muted} | ${await text(c.locator(".pcard-price"))} ${await text(c.locator(".pcard-price-refs"))} | ${await text(c.locator(".pcard-title"))} | ${await text(c.locator(".pcard-specs"))} | TENDENCIA: ${trendText} | POSICIÓN: ${posText} | ZONA: ${zoneText} | ${await text(c.locator(".pcard-dates"))} | CHIPS: ${(await c.locator(".attr").allInnerTexts()).join(", ")}`,
    );
  }

  // Detalle de la primera card CON datos completos (las de tier bajo no tienen mapa): similares, mapa y Consultar.
  let pick = 0;
  for (let i = 0; i < n; i++) {
    if (!(await cards.nth(i).getAttribute("class"))?.includes("pcard--muted")) {
      pick = i;
      break;
    }
  }
  const href = await cards.nth(pick).locator(".pcard-title a").getAttribute("href");
  const d = await ctx.newPage();
  await d.goto(`${base}${href}`);
  await d.locator("h1").waitFor();
  const main = await d.locator("main").innerText();
  const detail = {
    card: `#${pick + 1}`,
    similares: await d.locator("section#comparables .minicard").count(),
    cabecera: await text(d.getByTestId("comparables-pool")),
    mapa: (await d.locator("h2", { hasText: "Ubicación" }).count()) > 0,
    consultar: (await d.locator("a.btn-consult").count()) > 0,
    jerga: main.match(/Percentil|Opportunity Score|Comparables considerados|Renta bruta|\b(None|null|unknown|NaN)\b/)?.[0] ?? null,
  };
  await d.close();

  const checks = [
    ["sin texto prohibido en el top 20", s.forbidden.length === 0, s.forbidden.join("; ") || "ok"],
    ["ningún fondo de alarma (rojo/amarillo) en los bloques", s.alarmBg === 0, String(s.alarmBg)],
    ["aviso de estimación en toda card", s.notice === n, `${s.notice}/${n}`],
    ["bloque de posición en toda card", s.position === n, `${s.position}/${n} (verdes ${s.greenPos}, a verificar ${s.verify})`],
    ["ningún 'verificar el aviso' en el top 10", s.verify === 0, String(s.verify)],
    ["Zona visible en toda card", s.zone === n, `${s.zone}/${n} (celda propia ${s.zoneOwn}, en suba ${s.zoneUp})`],
    ["al menos una flecha 'En baja' en el top 20", s.down >= 1, `en baja ${s.down}, en alta ${s.up}`],
    ["detalle: similares, mapa y Consultar", detail.similares > 0 && detail.mapa && detail.consultar && !detail.jerga, JSON.stringify(detail)],
  ];
  console.log("\nGATE:");
  for (const [label, ok, info] of checks) {
    if (!ok) failures++;
    console.log(`  ${ok ? "✓" : "✗"} ${label} — ${info}`);
  }
}

await browser.close();
console.log(failures === 0 ? "\nGATE OK: se puede grabar." : `\nGATE FALLA (${failures}): no grabar con esta consulta.`);
process.exit(failures === 0 ? 0 : 1);
