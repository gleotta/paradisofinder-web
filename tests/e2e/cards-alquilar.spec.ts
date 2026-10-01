import { expect, test } from "@playwright/test";
import { cards, p2Mode, search } from "./helpers";
import { pace, verticalBattery, type VerticalCase } from "./cards-vertical";

/**
 * Card de Alquilar (guía 29/09): posición contra otros alquileres y tendencia,
 * en pesos con su equivalente en dólares. Sin bloque Zona ni rentabilidad.
 */
const ALQUILAR: VerticalCase = {
  id: "alquilar",
  query: "propiedades para alquilar",
  kind: "r",
  zone: false,
  chips: ["Amoblado", "Cochera", "Patio", "Quincho"],
  // 75 días supera el corte de alquiler (60); 39 no.
  negotiate: { yes: 2, no: 1 },
  // Conjunto por dormitorios sin tope (P2 01/10): 80 similares, 42 a la vista.
  comparables: { count: 80, listed: 42 },
};

verticalBattery(ALQUILAR);

test.describe("cards · alquilar · propias", () => {
  test("precio por mes con su conversión, comparado contra alquileres; sin rentabilidad", async ({ page }) => {
    const live = (await p2Mode(page)) === "live";
    await pace(page, live);
    await search(page, ALQUILAR.query, ALQUILAR.id);
    const n = Math.min(await cards(page).count(), 20);
    for (let i = 0; i < n; i++) {
      const card = cards(page).nth(i);
      await expect(card.locator(".pcard-price")).toContainText(/\/(mes|día|semana)$/);
      await expect(card.getByTestId("estimate")).toHaveCount(0);
      expect(await card.innerText()).not.toMatch(/Rentabilidad|Podría alquilarse/);
      const position = card.getByTestId("position");
      if (await position.count()) await expect(position.locator(".posblock-sub")).toContainText(/alquileres en /);
    }
    if (live) return;
    const first = page.locator('[data-id="sj-mkr0"]');
    await expect(first.locator(".pcard-price")).toHaveText("$ 320.000 /mes");
    await expect(first.locator(".pcard-price-refs")).toHaveText("(≈ US$ 207)");
    await expect(first.getByTestId("position").locator(".posblock-sub")).toContainText("80 alquileres en Capital, 1 dorm.");
    // Alquiler caro (P2 30/09 §3.3.1): acotado a −35 con `deal_rating: red`, NO `verify_data`.
    // La card dice "35 %+ por encima de similares", en neutro (C1) y sin "verificar el aviso".
    const expensive = page.locator('[data-id="sj-mkr6"]').getByTestId("position");
    await expect(expensive.locator(".posblock-pct")).toHaveText(/^35\s%\+$/);
    await expect(expensive.locator(".posblock-text")).toHaveText("por encima de similares");
    await expect(expensive).toHaveAttribute("data-tone", "neutral");
    await expect(expensive).not.toContainText("verificar el aviso");
    await expect(first.getByTestId("price-trend")).toHaveText(/^En baja 9\s% · antes \$ 350\.000$/);
    // Sin chips duros entra UN tag del LLM (el aviso trae dos).
    await expect(first.locator(".attr")).toHaveText(["luminoso"]);
    // "Apto crédito" no es un chip de Alquilar aunque el aviso lo declare.
    await expect(page.locator('[data-id="sj-mkr2"] .attr')).toHaveText(["Cochera", "Patio"]);
  });

  test("detalle: similares de la zona en dólares con su equivalente en pesos", async ({ page, context }) => {
    const live = (await p2Mode(page)) === "live";
    await pace(page, live);
    await search(page, ALQUILAR.query, ALQUILAR.id);
    const card = live ? cards(page).first() : page.locator('[data-id="sj-mkr0"]');
    const href = await card.locator(".pcard-title a").getAttribute("href");
    const detail = await context.newPage();
    await detail.goto(href!);
    const ind = detail.locator(".ind", { hasText: "Similares en la zona" });
    if (live) {
      // P2 manda `estimated_monthly_rent_ars` desde el 30/09, a la centena: dólares primero, pesos entre paréntesis.
      if (await ind.count()) await expect(ind.locator(".v")).toHaveText(/^US\$ [\d.]+( \(≈ \$ [\d.]+\))?$/);
    } else {
      await expect(ind.locator(".v")).toHaveText("US$ 310 (≈ $ 478.000)");
    }
    await detail.close();
  });
});
