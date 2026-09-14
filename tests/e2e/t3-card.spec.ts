import { expect, test } from "@playwright/test";
import { cards, FORBIDDEN, search } from "./helpers";

/**
 * T3 — Card honesta: cero "None"/"null"/"unknown" en 200 cards, fechas,
 * etiquetas, moneda, lotes, score con razón, Consultar en el 100 %.
 */
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
  "casa en venta en Caucete",
  "lote urbano en Pocito",
];

test.describe("T3 card", () => {
  test("cero None/null/unknown en 200 cards, y Consultar en todas", async ({ page }) => {
    test.setTimeout(20 * 60_000);
    let seen = 0;
    const offenders: string[] = [];
    let withoutContact = 0;
    for (const [i, q] of QUERIES.entries()) {
      // Rate limit de búsqueda de P2: 30/min por IP.
      if (i > 0) await page.waitForTimeout(2200);
      await search(page, q);
      const list = cards(page);
      // Segunda página del buffer (sin red): hasta 20 cards por consulta.
      if ((await list.count()) >= 10) {
        await page.mouse.wheel(0, 20000);
        await page.waitForTimeout(400);
      }
      const n = Math.min(await list.count(), 20);
      for (let i = 0; i < n; i++) {
        const card = list.nth(i);
        const text = await card.innerText();
        if (FORBIDDEN.test(text)) offenders.push(`${q} #${i + 1}: ${text.match(FORBIDDEN)?.[0]}`);
        if ((await card.locator("a.btn-consult").count()) === 0) withoutContact++;
        seen++;
      }
    }
    expect(seen, "cards vistas").toBeGreaterThanOrEqual(150);
    expect(offenders, "textos prohibidos").toEqual([]);
    expect(withoutContact, "cards sin Consultar").toBe(0);
  });

  test("precio en la moneda del aviso con conversión, dos fechas y score con su razón", async ({ page }) => {
    await search(page, "casa en rawson");
    const card = cards(page).first();
    await expect(card.locator(".pcard-price")).toContainText(/\$/);
    // Fechas relativas (las que P2 informa).
    await expect(card.locator(".pcard-dates")).toContainText(/publicado|actualizado/);
    // Score nunca solo: la primera razón visible al lado.
    const score = card.locator("details.score");
    if (await score.count()) {
      await expect(score.locator(".score-reason")).not.toBeEmpty();
      await score.locator("summary").click();
      await expect(score.locator(".score-comp").first()).toBeVisible();
    }
    // Conversión entre paréntesis cuando P2 la manda.
    const refs = await card.locator(".pcard-price-refs").innerText();
    if (refs.includes("≈")) expect(refs).toMatch(/\(≈ (US\$|\$) [\d.]+\)/);
  });

  test("lotes: m² de lote, precio por m², sin campos de vivienda", async ({ page }) => {
    await search(page, "lotes en Santa Lucía");
    const card = cards(page).first();
    await expect(card.locator(".pbadge--land")).toHaveText("Lote");
    await expect(card.locator(".pcard-specs")).toContainText(/m² de lote|ha/);
    await expect(card.locator(".pcard-specs")).not.toContainText(/dorm|baño/);
    // Las etiquetas PROPIAS de P1 nunca dicen "sin servicios" (null ≠ no tiene);
    // los textos de P3 (razones del score) se muestran tal cual y quedan fuera.
    const chips = await card.locator(".attr").allInnerTexts();
    expect(chips.join(" | ")).not.toMatch(/sin servicios/i);
    expect(await card.innerText()).not.toMatch(FORBIDDEN);
  });

  test("condición 'unknown' y calefacción no informada no aparecen en el detalle", async ({ page, context }) => {
    await search(page, "casa en rawson");
    const href = await cards(page).first().locator(".pcard-title a").getAttribute("href");
    expect(href).toBeTruthy();
    const detail = await context.newPage();
    await detail.goto(href!);
    await expect(detail.locator("h1")).toBeVisible();
    const text = await detail.locator("main").innerText();
    expect(text).not.toMatch(FORBIDDEN);
    await expect(detail.locator("a.btn-consult")).toBeVisible();
    await detail.close();
  });
});
