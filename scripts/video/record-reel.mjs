#!/usr/bin/env node
/**
 * Reel para Instagram (40 a 45 segundos) del demo de FINDER, contra un P1 vivo.
 * Estructura: gancho (la pregunta y la respuesta en pantalla desde el primer
 * cuadro), desarrollo (cómo se busca, la comparación abierta, la consulta) y
 * cierre (el aviso de estimación y el llamado a paradisofinder.com).
 *
 *   node scripts/video-gate.mjs https://paradisofinder.com "casas en venta hasta 100 mil dólares"
 *   node scripts/video/record-reel.mjs https://paradisofinder.com "casas en venta hasta 100 mil dólares" .ci/video/reel
 *   node scripts/video/compose.mjs .ci/video/reel .ci/video/finder-reel.mp4
 *
 * Se graba la pantalla entera de un celular (390 × 844): en el cuadro va
 * completa, debajo de una cabecera compacta. Por eso cada texto del guion es de
 * UNA línea (35 caracteres como mucho) y lo importante de cada plano se encuadra
 * en los 620 px de arriba de la pantalla, que Instagram no tapa. Los valores se
 * leen de la pantalla. Dos búsquedas por toma (la del gancho y la que se escribe).
 */
import { startTake, readFirstCard, waitThumbs, sleep, oneLine, docY, scrollNow, scrollTo, scrollToEl, scrollY, waitStable } from "./lib.mjs";

const BASE = (process.argv[2] ?? "https://paradisofinder.com").replace(/\/$/, "");
const QUERY = process.argv[3] ?? "casas en venta hasta 100 mil dólares";
const OUT = process.argv[4] ?? ".ci/video/reel";
const TARGET = 42.5; // segundos
const STICKY = 196; // la barra de búsqueda fija termina en 174 px

const take = await startTake({ out: OUT, vw: 390, vh: 844, dsf: 2, layout: "reel" });
const { ctx, vt, mark, activate, cutTo, cap, tap } = take;
const values = { base: BASE, query: QUERY, recordedAt: new Date().toISOString() };
let failed = null;

try {
  const page = await ctx.newPage();

  // Fuera de cámara: los resultados ya cargados, para abrir con el gancho.
  await page.goto(`${BASE}/buscar?${new URLSearchParams({ q: QUERY, v: "comprar" })}`);
  const cards = page.getByTestId("property-card");
  await cards.first().waitFor({ timeout: 25_000 });
  await waitStable(page.getByTestId("narrative"), 900, 9000);
  const c1 = cards.first();
  Object.assign(values, await readFirstCard(c1));
  // La card desde arriba: la foto entera, el precio y el título, todo en la zona que Instagram no tapa.
  await scrollNow(page, (await docY(c1)) - STICKY + 10);
  await c1.locator("img").first().evaluate((img) => img.complete || new Promise((r) => { img.onload = img.onerror = r; })).catch(() => {});
  await sleep(800);

  // 1 · GANCHO: la pregunta sobre la foto y el precio; la respuesta sobre el bloque verde
  await activate(page);
  await sleep(120);
  mark("gancho");
  cap(null, "¿Esa casa está *cara o barata*?");
  await sleep(1500);
  // El precio arriba y el bloque verde debajo: la respuesta completa en la zona que Instagram no tapa, y la foto
  // del aviso siguiente (a veces un volante con teléfonos) queda casi toda fuera de la pantalla.
  await scrollToEl(page, c1.locator(".pcard-price"), STICKY, 1600);
  await sleep(100);
  cap(null, `*${values.pct} % por debajo* de ${values.pool} similares`);
  await sleep(3800);

  // 2 · DESARROLLO: cómo se busca (corte a la home)
  await cutTo(page, async () => {
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    const comprar = page.getByRole("button", { name: "Comprar", exact: true });
    if ((await comprar.getAttribute("aria-pressed")) !== "true") { await comprar.tap(); await sleep(300); }
    await sleep(500);
  });
  mark("home");
  cap(null, "Buscás *como hablás*, sin filtros");
  await sleep(700);
  await tap(page, page.getByLabel("Qué propiedad buscás"));
  await sleep(250);
  for (const ch of QUERY) { await page.keyboard.type(ch); await sleep(28 + Math.random() * 34); }
  await sleep(450);
  await tap(page, page.getByRole("button", { name: "Buscar", exact: true }));
  await cards.first().waitFor({ timeout: 20_000 });
  mark("resultados");
  values.total = (await page.getByTestId("results-count").innerText()).match(/[\d.]+/)?.[0];
  const first = cards.first();
  values.sameCard = (await first.getAttribute("data-id")) === values.id;
  await sleep(350);
  cap(null, `Entiende el pedido: *${values.total} ${values.unit}*`);
  await sleep(2300);
  await scrollToEl(page, first.locator(".pcard-price"), STICKY, 1400);
  cap(null, "Cada comparación *se puede abrir*");
  const tOpen = Date.now();
  await waitStable(page.getByTestId("narrative"), 500, 2500);
  await sleep(Math.max(0, 1200 - (Date.now() - tOpen)));

  // 3 · La comparación abierta: el detalle abre en pestaña nueva (corte)
  const popupP = ctx.waitForEvent("page", { timeout: 15_000 });
  await tap(page, first.getByTestId("similars-link"), { after: 450 });
  const det = await popupP;
  await cutTo(det, async () => {
    await det.waitForLoadState("domcontentloaded");
    await det.getByTestId("similar-row").first().waitFor({ timeout: 25_000 });
    await scrollNow(det, (await docY(det.locator("section#comparables"))) - 62);
    await waitThumbs(det);
    await sleep(600);
  });
  mark("similares");
  values.poolHeader = oneLine(await det.getByTestId("comparables-pool").innerText());
  const selfLabel = (oneLine(await det.getByTestId("similar-self").innerText()).match(/ESTA [A-ZÁÉÍÓÚÑ]+|ESTE [A-ZÁÉÍÓÚÑ]+/)?.[0] ?? "ESTA PROPIEDAD").toLowerCase();
  await sleep(250);
  cap(null, "Los avisos comparados, *con su foto*");
  await sleep(1300);
  await scrollTo(det, (await scrollY(det)) + 60, 2500); // la tira y la fila propia siguen en la zona segura
  await sleep(100);
  cap(null, `Y *${selfLabel}*, entre los ${values.pool}`);
  await sleep(3400);

  // 4 · La consulta
  const consult = det.locator("a.btn-consult--detail").first();
  if (await consult.count()) {
    mark("consultar");
    cap(null, "*Un toque* y le escribís a quien vende");
    await scrollToEl(det, consult, 150, 1700); // la descripción del aviso queda arriba, fuera de cuadro
    await sleep(750);
    if ((await consult.getAttribute("target")) === "_blank") {
      const waP = ctx.waitForEvent("page", { timeout: 6000 }).catch(() => null);
      await tap(det, consult);
      const wa = await waP;
      await wa?.close().catch(() => {});
      values.consultTapped = true;
    }
    await sleep(2300);
  }

  // 5 · CIERRE: el aviso de estimación (texto exacto del producto) y el llamado
  await cutTo(page, async () => { await sleep(200); });
  mark("cierre");
  const notice = values.notice || "Valores estimados a partir de avisos publicados, no de operaciones concretadas. Son orientativos.";
  cap(null, notice.replace(/Son orientativos\.?$/, "*Son orientativos.*"), { small: true });
  await scrollTo(page, (await scrollY(page)) + 60, 4700);
  await sleep(200);
  await cutTo(page, async () => { await page.goto(BASE + "/", { waitUntil: "networkidle" }); await sleep(500); });
  cap(null, "paradisofinder.com", { end_card: true, lead: "Buscá la tuya en", sub: "San Juan · versión beta" });
  await sleep(Math.min(5200, Math.max(3600, (TARGET - vt()) * 1000)));
  cap(null, null);
  mark("fin");
} catch (e) {
  failed = e;
  console.error("\nTOMA FALLIDA:", e.message);
}

const duration = await take.finish(values, failed);
if (!failed && (duration < 40 || duration > 45)) console.log(`OJO: la toma dura ${duration.toFixed(1)} s, fuera de los 40 a 45 buscados.`);
process.exit(failed ? 1 : 0);
