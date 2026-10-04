import { expect, test } from "@playwright/test";
import { cards, p2Mode, search } from "./helpers";
import { pace, verticalBattery, type VerticalCase } from "./cards-vertical";

/**
 * Card de Comprar (guía 29/09): precio y m², posición contra similares,
 * tendencia y Zona. Sin rentabilidad ni semáforos de inversión: eso es Invertir.
 */
const COMPRAR: VerticalCase = {
  id: "comprar",
  query: "propiedades para comprar",
  kind: "s",
  zone: true,
  chips: ["Apto crédito", "A estrenar", "Cochera", "Quincho"],
  // Corte de venta: 90 días. 1.035 lo supera; 75 no (en alquiler sí lo superaría).
  negotiate: { yes: 0, no: 1 },
  comparables: { count: 30, listed: 30 },
};

verticalBattery(COMPRAR);

test.describe("cards · comprar · propias", () => {
  test("sin rentabilidad en la card; superficie cubierta y lote; zona con el m² del tipo", async ({ page }) => {
    const live = (await p2Mode(page)) === "live";
    await pace(page, live);
    await search(page, COMPRAR.query, COMPRAR.id);
    const n = Math.min(await cards(page).count(), 20);
    for (let i = 0; i < n; i++) {
      const card = cards(page).nth(i);
      await expect(card.getByTestId("estimate")).toHaveCount(0);
      expect(await card.innerText()).not.toMatch(/Rentabilidad|Podría alquilarse/);
    }
    if (live) return;
    const first = page.locator('[data-id="sj-mks0"]');
    await expect(first.locator(".pcard-price")).toHaveText("US$ 150.000");
    await expect(first.locator(".pcard-price-refs")).toHaveText("US$ 600/m²");
    await expect(first.locator(".pcard-specs")).toHaveText("5 amb. · 3 dorm. · 3 baños · 250 m² cub. · 502 m² lote");
    await expect(first.getByTestId("position").locator(".posblock-pct")).toHaveText(/^15\s%$/);
    // Casas en venta: el conjunto de P3 no se arma por dormitorios → sin ", 3 dorm." (03/10).
    await expect(first.getByTestId("position").locator(".posblock-sub")).toContainText("30 casas en Capital ·");
    await expect(first.getByTestId("position").locator(".posblock-sub")).not.toContainText("dorm.");
    await expect(first.getByTestId("price-trend")).toHaveText(/^En baja 12\s% · antes US\$ 170\.000$/);
    await expect(first.getByTestId("zone-ref").locator(".zoneblock-value")).toHaveText("m² US$ 857");
    await expect(page.locator('[data-id="sj-mks1"]').getByTestId("position").locator(".posblock-sub")).toContainText(
      "30 departamentos en Rivadavia, 2 dorm.",
    );
    // Acotado hacia arriba: el número dice la verdad, el bloque va neutro.
    await expect(page.locator('[data-id="sj-mks2"]').getByTestId("position").locator(".posblock-text")).toHaveText(
      "por encima · verificar el aviso",
    );
  });

  // P2 04/10 (`docs/RESPUESTA_P2_A_P1_2026-10-04.md`): un departamento que no publica cubierta se
  // mide sobre la total y su m² va rotulado; sin dormitorios, el conjunto es por superficie sola.
  test("departamentos: el m² sobre la superficie total va rotulado; por superficie sola, sin dormitorios", async ({ page }) => {
    const live = (await p2Mode(page)) === "live";
    await pace(page, live);
    await search(page, "departamentos en venta en capital", COMPRAR.id);
    const n = Math.min(await cards(page).count(), 20);
    for (let i = 0; i < n; i++) {
      const card = cards(page).nth(i);
      if ((await card.getAttribute("data-vertical")) !== "comprar") continue;
      const refs = await card.locator(".pcard-price-refs").innerText();
      const specs = await card.locator(".pcard-specs").innerText();
      // Hay m² con cubierta ("m² cub." en la ficha) o, sin ella, sobre la total y dicho.
      if (refs.includes("/m²")) expect(refs.includes("/m² total"), `card #${i + 1}: "${refs}" con "${specs}"`).toBe(!specs.includes("m² cub."));
      const sub = card.getByTestId("position").locator(".posblock-sub");
      if ((await sub.count()) && (await sub.innerText()).includes("de superficie similar")) await expect(sub).not.toContainText("dorm.");
    }
  });
});
