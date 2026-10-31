#!/usr/bin/env node
/**
 * Graba el video demo de FINDER contra un P1 vivo (producción), en un iPhone
 * emulado (390 × 844), y deja en <salida>/ los cuadros de pantalla y la línea
 * de tiempo (textos del guion y toques) para que `compose.mjs` arme el mp4.
 * Handoff: docs/HANDOFF_VIDEO_2026-10-02.md. Antes de grabar, el gate:
 *
 *   node scripts/video-gate.mjs https://paradisofinder.com "casas en venta hasta 100 mil dólares"
 *   node scripts/video/record.mjs https://paradisofinder.com "casas en venta hasta 100 mil dólares" .ci/video/toma
 *   node scripts/video/compose.mjs .ci/video/toma .ci/video/finder-demo.mp4
 *
 * No toca el DOM de la página: los textos y los círculos de los toques se
 * dibujan después, en la composición. Los valores del guion (cantidad de
 * resultados, porcentaje, zona, etc.) se leen de la pantalla en el momento,
 * así que el texto siempre dice lo que se ve. Si la #1 no trae el bloque de
 * posición, o es un aviso de datos incompletos, la toma se corta con un error.
 * Una sola búsqueda por toma (más tres páginas y el mapa): esperar un minuto
 * entre el gate y la toma por el límite de 30 búsquedas por minuto de P2.
 */
import { startTake, readFirstCard, waitThumbs, sleep, oneLine, docY, scrollNow, scrollTo, scrollY, waitStable } from "./lib.mjs";

const BASE = (process.argv[2] ?? "https://paradisofinder.com").replace(/\/$/, "");
const QUERY = process.argv[3] ?? "casas en venta hasta 100 mil dólares";
const OUT = process.argv[4] ?? ".ci/video/toma";

/* ---------- la toma ---------- */
const take = await startTake({ out: OUT, vw: 390, vh: 844, dsf: 2, layout: "demo" });
const { ctx, mark, activate, cutTo, cap, tap } = take;
const values = { base: BASE, query: QUERY, recordedAt: new Date().toISOString() };
let failed = null;

try {
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await sleep(600);

  // 1 · Home: se escribe la consulta
  await activate(page);
  await sleep(350);
  mark("home");
  cap("Buscar", "Escribís lo que buscás, como lo dirías.");
  await sleep(1500);
  await tap(page, page.getByRole("button", { name: "Comprar", exact: true }));
  await sleep(550);
  await tap(page, page.getByLabel("Qué propiedad buscás"));
  await sleep(400);
  for (const ch of QUERY) { await page.keyboard.type(ch); await sleep(50 + Math.random() * 75); }
  await sleep(800);
  await tap(page, page.getByRole("button", { name: "Buscar", exact: true }));

  // 2 · Resultados
  const cards = page.getByTestId("property-card");
  await cards.first().waitFor({ timeout: 20_000 });
  mark("cards");
  const tCards = Date.now();
  values.total = (await page.getByTestId("results-count").innerText()).match(/[\d.]+/)?.[0];
  const understood = (await page.locator('[data-testid="interpretation"] .ichip:not(.ichip--order):not(.ichip--note) .ichip-main').allInnerTexts())
    .map((s) => s.replace(/[▾×]/g, "").trim()).filter(Boolean);
  values.understood = understood;
  const understoodTxt = understood.map((s) => (/^[A-ZÁÉÍÓÚ][a-záéíóúñ]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s)).join(", ");
  await sleep(500);
  cap("Entender", `FINDER entendió el pedido: ${understoodTxt}. Y encontró ${values.total}.`);
  await waitStable(page.getByTestId("narrative"), 900, 9000);
  await sleep(Math.max(600, 6000 - (Date.now() - tCards)));

  // 3 · La card #1
  const c1 = cards.first();
  Object.assign(values, await readFirstCard(c1));
  mark("card #1");
  cap("Comparar", `Cada casa viene con su comparación: esta se ofrece ${values.pct} % por debajo de ${values.pool} ${values.unit} similares de ${values.zone}.`);
  await scrollTo(page, (await docY(c1)) - 186, 1400);
  await sleep(5300);
  const zoneLine = values.hasZone ? `Al lado, la referencia de la zona: el m² en ${values.zone}.` : "";
  const negLine = values.published ? `${values.hasZone ? "Y un" : "Un"} dato para negociar: lleva ${values.published} publicada.` : "";
  if (zoneLine || negLine) cap("Comparar", `${zoneLine} ${negLine}`.trim());
  await scrollTo(page, (await docY(c1.locator(".pcard-price"))) - 200, 1200);
  await sleep(5200);

  // 4 · "ver similares": el detalle abre en pestaña nueva (corte)
  cap("Similares", "Un toque en “ver similares” abre la comparación.");
  await sleep(1700);
  const popupP = ctx.waitForEvent("page", { timeout: 15_000 });
  await tap(page, c1.getByTestId("similars-link"), { after: 500 });
  const det = await popupP;
  await cutTo(det, async () => {
    await det.waitForLoadState("domcontentloaded");
    await det.getByTestId("similar-row").first().waitFor({ timeout: 25_000 });
    await scrollNow(det, (await docY(det.locator("section#comparables"))) - 62);
    await waitThumbs(det);
    await sleep(700);
  });
  mark("detalle: similares");
  values.poolHeader = oneLine(await det.getByTestId("comparables-pool").innerText());
  values.rows = await det.getByTestId("similar-row").count();
  values.selfLabel = oneLine(await det.getByTestId("similar-self").innerText()).match(/ESTA [A-ZÁÉÍÓÚÑ]+|Esta \S+/i)?.[0] ?? "Esta casa";
  await sleep(500);
  cap("Similares", `Estos son los avisos con los que se comparó. Primero, los ${values.rows === 5 ? "cinco" : values.rows} de superficie más parecida, con su foto.`);
  await sleep(6200);
  cap("Similares", `Esta casa va intercalada según su precio, y arriba se ve dónde queda entre los ${values.pool}.`);
  await sleep(5200);
  const more = det.getByTestId("comparables-more");
  if (await more.count()) {
    values.moreLabel = oneLine(await more.innerText());
    await scrollTo(det, (await docY(more)) - 610, 900);
    await sleep(300);
    cap("Similares", `Con un toque, se ven los ${values.pool}.`);
    await tap(det, more, { after: 700 });
    values.rowsExpanded = await det.getByTestId("similar-row").count();
    await scrollTo(det, (await scrollY(det)) + 820, 3000);
    await sleep(700);
  }

  // 5 · Lectura de FINDER, ubicación y Consultar
  mark("detalle: lectura");
  cap("El detalle", "Más arriba, la lectura de FINDER: cada señal viene con su explicación.");
  const lectura = det.locator("h2", { hasText: "Lectura de FINDER" });
  await scrollTo(det, (await docY(lectura)) - 78, 2000);
  await sleep(2400);
  await scrollTo(det, (await scrollY(det)) + 340, 2800);
  await sleep(900);
  const ubic = det.locator("h2", { hasText: "Ubicación" });
  const consult = det.locator("a.btn-consult--detail").first();
  if (await ubic.count()) {
    mark("detalle: ubicación");
    cap("El detalle", "Abajo, la ubicación que publicó el aviso.");
    await scrollTo(det, (await docY(ubic)) - 78, 2700);
    await sleep(3300);
  }
  if (await consult.count()) {
    mark("detalle: consultar");
    cap("Consultar", "Y en un toque, la consulta por WhatsApp a quien vende, con el mensaje ya escrito.");
    await scrollTo(det, (await docY(consult)) - 430, 1100);
    await sleep(900);
    if ((await consult.getAttribute("target")) === "_blank") {
      const waP = ctx.waitForEvent("page", { timeout: 6000 }).catch(() => null);
      await tap(det, consult);
      const wa = await waP;
      await wa?.close().catch(() => {});
      values.consultTapped = true;
    }
    await sleep(3400);
  }

  // 6 · De vuelta en la lista: lo verde (corte; se cargan más páginas fuera de cámara)
  let target = null;
  await cutTo(page, async () => {
    for (let i = 0; i < 8 && (await cards.count()) < 40; i++) { await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })); await sleep(1300); }
    const n = await cards.count();
    const found = [];
    for (let i = 0; i < n; i++) {
      const c = cards.nth(i);
      const tr = c.getByTestId("price-trend");
      if (!(await tr.count())) continue;
      const txt = oneLine(await tr.innerText());
      if (!/En baja/i.test(txt)) continue;
      found.push({ i, txt, muted: ((await c.getAttribute("class")) ?? "").includes("pcard--muted") });
    }
    values.trendCards = found.map((f) => `#${f.i + 1}${f.muted ? " (datos incompletos)" : ""}: ${f.txt}`);
    const pick = found.find((f) => !f.muted) ?? found[0] ?? null;
    if (pick) {
      target = { card: cards.nth(pick.i), rank: pick.i + 1, txt: pick.txt, pct: pick.txt.match(/(\d+)\s*%/)?.[1] };
      await scrollNow(page, (await docY(target.card)) - 186 - 560);
    } else {
      target = { card: cards.nth(Math.min(n - 1, 4)), rank: null };
      await scrollNow(page, (await docY(target.card)) - 186 - 560);
    }
    await sleep(1500);
  });
  mark(`lista: ${target.rank ? `#${target.rank} ${target.txt}` : "sin flecha en baja"}`);
  values.trendShown = target.rank ? `#${target.rank}: ${target.txt}` : null;
  cap("En verde", target.pct
    ? `En la lista, solo se pinta de verde lo que le sirve al que compra. Como esta baja de precio: ${target.pct} % menos.`
    : "En la lista, solo se pinta de verde lo que le sirve al que compra.");
  await sleep(500);
  await scrollTo(page, (await docY(target.card)) - 186, 1700);
  await sleep(5600);

  // 7 · El mapa
  const fab = page.locator(".map-fab");
  if (await fab.count()) {
    mark("mapa");
    await tap(page, fab);
    await page.locator(".leaflet-container").first().waitFor({ timeout: 10_000 });
    await sleep(1600);
    const note = oneLine(await page.getByText(/con ubicación publicada/).first().innerText().catch(() => ""));
    const nm = note.match(/([\d.]+)\s+de\s+([\d.]+)/);
    values.mapNote = note;
    cap("El mapa", nm ? `Y todo en el mapa: ${nm[1]} de las ${nm[2]} publican su ubicación.` : "Y todo en el mapa.");
    await sleep(2600);
    const pickMarker = () => page.evaluate(() => {
      const ok = [...document.querySelectorAll(".price-marker")].map((el) => el.getBoundingClientRect()).filter((r) => r.top > 200 && r.bottom < 720 && r.left > 20 && r.right < 370);
      return ok.length ? { x: ok[0].left + ok[0].width / 2, y: ok[0].top + ok[0].height / 2 } : null;
    });
    const m = await pickMarker();
    if (m) {
      await tap(page, m, { after: 400 });
      values.mapPopup = oneLine(await page.locator(".map-pop").first().innerText({ timeout: 3000 }).catch(() => ""));
      await sleep(2800);
    } else await sleep(1500);
    await tap(page, fab, { after: 500 });
    await sleep(500);
  }

  // 8 · Cierre: el aviso de estimación
  mark("cierre");
  const notice = target.card.getByTestId("estimate-notice");
  values.notice = oneLine(await notice.innerText());
  cap("Para tener en cuenta", values.notice);
  await scrollTo(page, (await docY(notice)) - 520, 1600);
  await sleep(5600);
  cap("", "paradisofinder.com", { end_card: true, sub: "San Juan · versión beta" });
  await sleep(3400);
  cap(null, null);
  mark("fin");
} catch (e) {
  failed = e;
  console.error("\nTOMA FALLIDA:", e.message);
}

await take.finish(values, failed);
process.exit(failed ? 1 : 0);
