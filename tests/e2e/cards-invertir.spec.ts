import { expect, test } from "@playwright/test";
import { cards, p2Mode, search } from "./helpers";
import { pace, verticalBattery, type VerticalCase } from "./cards-vertical";

/**
 * Card de Invertir (guía 29/09) = Comprar + dos datos de rentabilidad en
 * bloques separados: la rentabilidad promedio de la zona (bloque Zona) y "Esta
 * propiedad · estimación", siempre neutro. Sin pastillas de inversión.
 */
const INVERTIR: VerticalCase = {
  id: "invertir",
  query: "propiedades para invertir",
  kind: "i",
  zone: true,
  chips: ["Apto crédito", "A estrenar", "Cochera", "Quincho"],
  negotiate: { yes: 0, no: 1 },
  comparables: { count: 30, listed: 30 },
};

const NEUTRAL_BG = "rgb(244, 237, 247)";

verticalBattery(INVERTIR);

test.describe("cards · invertir · propias", () => {
  test("'Esta propiedad · estimación' siempre neutro; rentabilidad de la zona solo si llega", async ({ page }) => {
    const live = (await p2Mode(page)) === "live";
    await pace(page, live);
    await search(page, INVERTIR.query, INVERTIR.id);
    const n = Math.min(await cards(page).count(), 20);
    for (let i = 0; i < n; i++) {
      const card = cards(page).nth(i);
      const block = card.getByTestId("estimate");
      if ((await block.count()) === 0) continue;
      await expect(block).toHaveAttribute("data-tone", "neutral");
      expect(await block.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(NEUTRAL_BG);
      await expect(block.locator(".block-kicker")).toHaveText(/^Esta propiedad · estimación$/i);
      await expect(block.locator(".estblock-note")).toHaveText(
        "Según alquileres similares publicados en la zona. Rentabilidad = un año de ese alquiler ÷ precio de este aviso.",
      );
      const lines = await block.locator(".estblock-yield, .estblock-rent").allInnerTexts();
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).toMatch(/^(Rentabilidad anual estimada \d+(,\d)?\s%|Podría alquilarse a ≈ US\$ [\d.]+\/mes)$/);
      }
      const zoneYield = card.locator(".zoneblock-yield");
      if (await zoneYield.count()) await expect(zoneYield).toHaveText(/^Rentabilidad promedio de la zona: \d+(,\d)?\s% anual$/);
    }
    if (live) return;
    const first = page.locator('[data-id="sj-mki0"]');
    await expect(first.locator(".estblock-yield")).toHaveText(/^Rentabilidad anual estimada 7,2\s%$/);
    await expect(first.locator(".estblock-rent")).toHaveText("Podría alquilarse a ≈ US$ 906/mes");
    await expect(first.locator(".zoneblock-yield")).toHaveText(/^Rentabilidad promedio de la zona: 7,8\s% anual$/);
    // Zona sin rentabilidad promedio (`cap_pct: null`): la línea no está; la estimación del aviso sí.
    const noCap = page.locator('[data-id="sj-mki2"]');
    await expect(noCap.getByTestId("zone-ref")).toBeVisible();
    await expect(noCap.locator(".zoneblock-yield")).toHaveCount(0);
    await expect(noCap.getByTestId("estimate")).toBeVisible();
    // Sin ninguno de los dos campos, la ranura queda vacía.
    await expect(page.locator('[data-id="sj-mki5"]')).toBeVisible();
    await expect(page.locator('[data-id="sj-mki5"]').getByTestId("estimate")).toHaveCount(0);
  });
});
