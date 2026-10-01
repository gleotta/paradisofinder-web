import { expect, test } from "@playwright/test";
import { cards, p2Mode, search } from "./helpers";
import { pace, verticalBattery, type VerticalCase } from "./cards-vertical";

/**
 * Card de Lotes (guía 29/09) = Comprar con clase: sello "Lote urbano" / "Lote
 * rural", m² en urbano y hectárea en rural, posición contra lotes de la MISMA
 * clase y chips solo con lo declarado.
 */
const LOTES: VerticalCase = {
  id: "lotes",
  query: "lotes en venta",
  kind: "l",
  zone: true,
  chips: ["Con servicios: agua, luz", "En loteo San Rafael", "Apto construcción", "Zonificación mixta"],
  // Corte de lotes: 90 días, como venta.
  negotiate: { yes: 0, no: 1 },
  comparables: { count: 30, listed: 30 },
};

verticalBattery(LOTES);

test.describe("cards · lotes · propias", () => {
  test("sello de clase, precio por m² o por hectárea, servicios solo si el aviso los declara", async ({ page }) => {
    const live = (await p2Mode(page)) === "live";
    await pace(page, live);
    await search(page, LOTES.query, LOTES.id);
    const n = Math.min(await cards(page).count(), 20);
    for (let i = 0; i < n; i++) {
      const card = cards(page).nth(i);
      const seal = (await card.getByTestId("land-class").innerText()).trim();
      expect(seal).toMatch(/^Lote( urbano| rural)?$/);
      await expect(card.locator(".pcard-specs")).not.toContainText(/dorm|baño|amb\./);
      const refs = await card.locator(".pcard-price-refs").innerText();
      if (seal === "Lote rural" && refs.trim()) expect(refs).toMatch(/US\$ [\d.]+\/ha/);
      if (seal === "Lote urbano" && refs.trim()) expect(refs).toMatch(/US\$ [\d.,]+\/m²/);
      const position = card.getByTestId("position");
      if (await position.count()) {
        const unit = seal === "Lote rural" ? /lotes rurales( con servicios)? en / : seal === "Lote urbano" ? /lotes urbanos en / : /lotes en /;
        await expect(position.locator(".posblock-sub")).toContainText(unit);
      }
      await expect(card.getByTestId("estimate")).toHaveCount(0);
      expect((await card.locator(".attr").allInnerTexts()).join(" | ")).not.toMatch(/sin servicios/i);
    }
    if (live) return;
    const urban = page.locator('[data-id="sj-mkl0"]');
    await expect(urban.getByTestId("land-class")).toHaveText("Lote urbano");
    await expect(urban.locator(".pcard-price-refs")).toHaveText("US$ 96/m²");
    await expect(urban.locator(".pcard-specs")).toHaveText("458 m² de lote · 10,6 × 46 m");
    await expect(urban.locator(".attr")).toHaveText(["Con servicios"]);
    const rural = page.locator('[data-id="sj-mkl2"]');
    await expect(rural.getByTestId("land-class")).toHaveText("Lote rural");
    await expect(rural.locator(".pcard-price-refs")).toHaveText("US$ 5.932/ha");
    await expect(rural.getByTestId("position").locator(".posblock-sub")).toContainText("30 lotes rurales con servicios en Pocito");
    await expect(rural.getByTestId("zone-ref").locator(".zoneblock-value")).toHaveText("ha US$ 30.000 (zona ampliada)");
    // `land_services: false` (declara que NO) y `null` (no lo dice): ningún chip de servicios.
    for (const id of ["sj-mkl4", "sj-mkl5"]) {
      await expect(page.locator(`[data-id="${id}"]`)).toBeVisible();
      await expect(page.locator(`[data-id="${id}"] .attr`, { hasText: /servicios/i })).toHaveCount(0);
    }
  });
});
