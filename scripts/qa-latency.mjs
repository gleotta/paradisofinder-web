#!/usr/bin/env node
/**
 * Criterio de aceptación T1 (14/09): en 20 consultas variadas, tiempo hasta
 * el primer contenido visible < 500 ms y primeras cards = evento de la API
 * + < 200 ms. Mide desde la home como un usuario (tipear + Enter) con el
 * Chrome del sistema en viewport mobile, y deja el informe en
 * `tests/reports/latency_<fecha>.md`.
 *
 *   node scripts/qa-latency.mjs http://localhost:3000
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const QUERIES = [
  "casa en rawson",
  "departamento en capital para alquilar",
  "casa con pileta en Rivadavia hasta 120 mil dólares",
  "departamento amoblado en capital hasta 400 mil",
  "casa de 3 dormitorios con patio en Chimbas",
  "lotes en Santa Lucía",
  "terrenos hasta 30 mil dólares",
  "casas al menos 20% por debajo del precio de su zona",
  "monoambiente amueblado céntrico",
  "casa en Rivadavia con mucho tiempo publicada, para negociar precio",
  "depto para alquilar cerca de la universidad por menos de 400 mil",
  "duplex a estrenar en Villa Krause",
  "casa en Pocito",
  "departamento en Santa Lucía para alquilar",
  "lotes en loteo con servicios en Rivadavia",
  "casa apta crédito hasta 100 mil dólares",
  "casa con cochera en Chimbas",
  "departamento de 2 dormitorios en Rivadavia",
  "casa con pileta y quincho para recibir gente en Santa Lucía",
  "lote urbano en Pocito",
];

const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 380, height: 740 }, isMobile: true, hasTouch: true, locale: "es-AR" });
const page = await context.newPage();
const rows = [];
// Calentar la ruta de resultados.
await page.goto(`${base}/buscar?q=casa%20en%20rawson`);
await page.waitForSelector('[data-testid="results"][data-state="results"], [data-testid="results"][data-state="clarification"]', { timeout: 60000 });

for (const [i, q] of QUERIES.entries()) {
  if (i > 0) await page.waitForTimeout(2200); // rate limit de búsqueda de P2: 30/min
  let rendered = null;
  const onReq = (req) => {
    if (req.method() === "POST" && req.url().includes("/api/events")) {
      try {
        const b = req.postDataJSON();
        if (b?.event_type === "cards_rendered" && !rendered) rendered = b.payload;
      } catch {}
    }
  };
  page.on("request", onReq);
  await page.goto(`${base}/`);
  const input = page.getByLabel("Qué propiedad buscás");
  await input.fill(q);
  await page.evaluate(() => {
    window.__pfFirst = null;
    const check = () => {
      if (window.__pfFirst == null && document.querySelector('[data-testid="search-skeleton"],[data-testid="searching-line"]')) window.__pfFirst = performance.now();
    };
    new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  });
  const tSubmit = await page.evaluate(() => performance.now());
  await input.press("Enter");
  await page.waitForFunction(() => window.__pfFirst != null, null, { timeout: 15000 });
  const tFirst = await page.evaluate(() => window.__pfFirst);
  let state = "timeout";
  try {
    await page.waitForSelector('[data-testid="results"][data-state="results"], [data-testid="results"][data-state="clarification"], [data-testid="results"][data-state="error"]', { timeout: 60000 });
    state = await page.getAttribute('[data-testid="results"]', "data-state");
  } catch {}
  const deadline = Date.now() + 5000;
  while (!rendered && state === "results" && Date.now() < deadline) await page.waitForTimeout(100);
  page.off("request", onReq);
  const row = {
    q,
    state,
    first_visible: Math.round(tFirst - tSubmit),
    t_first_cards: rendered?.t_first_cards ?? null,
    t_first_paint: rendered?.t_first_paint ?? null,
    paint_delta: rendered ? rendered.t_first_paint - rendered.t_first_cards : null,
    total: rendered?.total_matches ?? null,
  };
  rows.push(row);
  console.log(`${String(i + 1).padStart(2)}. ${row.state.padEnd(13)} visible ${String(row.first_visible).padStart(4)} ms · cards ${String(row.t_first_cards ?? "—").padStart(5)} ms · pintar +${String(row.paint_delta ?? "—").padStart(3)} ms · ${row.total ?? "—"} res · ${q}`);
}
await browser.close();

const vis = rows.map((r) => r.first_visible);
const cardsMs = rows.map((r) => r.t_first_cards).filter((x) => x != null);
const deltas = rows.map((r) => r.paint_delta).filter((x) => x != null);
const okVis = vis.filter((v) => v < 500).length;
const okDelta = deltas.filter((d) => d < 200).length;
const stamp = new Date().toISOString().slice(0, 10);
const md = [
  `# Latencia percibida — ${stamp} — ${base}`,
  "",
  `Viewport mobile 380 px, Chrome del sistema, desde la home (tipear + Enter). ${rows.length} consultas.`,
  "",
  `| # | consulta | estado | primer contenido visible | cards (evento) | pintar − evento | resultados |`,
  `|---|---|---|---|---|---|---|`,
  ...rows.map((r, i) => `| ${i + 1} | ${r.q} | ${r.state} | ${r.first_visible} ms | ${r.t_first_cards ?? "—"} ms | ${r.paint_delta != null ? `+${r.paint_delta} ms` : "—"} | ${r.total ?? "—"} |`),
  "",
  `- Primer contenido visible: p50 ${pct(vis, 50)} ms · p95 ${pct(vis, 95)} ms · máx ${Math.max(...vis)} ms · **${okVis}/${rows.length} < 500 ms**`,
  `- Primeras cards (evento de P2 vía P1): p50 ${pct(cardsMs, 50)} ms · p95 ${pct(cardsMs, 95)} ms · máx ${Math.max(...cardsMs)} ms`,
  `- Pintar las cards después del evento: p50 +${pct(deltas, 50)} ms · p95 +${pct(deltas, 95)} ms · **${okDelta}/${deltas.length} < 200 ms**`,
  "",
].join("\n");
const out = `tests/reports/latency_${stamp.replace(/-/g, "")}.md`;
writeFileSync(out, md, "utf8");
console.log(`\n${md.split("\n").slice(-4).join("\n")}\n→ ${out}`);
process.exit(okVis === rows.length && okDelta === deltas.length ? 0 : 1);
