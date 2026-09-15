import { expect, test, type Page } from "@playwright/test";
import { cards, collectEvents, eventsOf, noHorizontalScroll, search } from "./helpers";

/**
 * Mapa en el detalle (15/09): con coordenadas de P2 la sección "Ubicación"
 * muestra la propiedad (pin con `location_confidence: high`, círculo aproximado
 * si no) y el link a Google Maps, medido; sin coordenadas (tier 1, o solo la
 * zona) no hay mapa.
 */
async function detailHrefs(page: Page, lowTier: boolean): Promise<string[]> {
  const card = lowTier ? '[data-testid="property-card"].pcard--muted' : '[data-testid="property-card"]:not(.pcard--muted)';
  return page.locator(`${card} .pcard-title a`).evaluateAll((els) => els.map((a) => a.getAttribute("href") ?? ""));
}

test.describe("Mapa en el detalle", () => {
  test("con coordenadas: mapa con la propiedad y link a Google Maps", async ({ page }) => {
    await page.context().route("https://www.google.com/maps/**", (route) => route.fulfill({ body: "ok" }));
    const events = collectEvents(page);
    await search(page, "casas en rawson");
    await expect(cards(page).first()).toBeVisible();
    const hrefs = await detailHrefs(page, false);
    test.skip(hrefs.length === 0, "sin avisos con datos completos en esta búsqueda");
    await page.goto(hrefs[0]);

    const map = page.getByTestId("detail-map");
    await expect(map).toBeVisible();
    await expect(map.locator(".detail-map.leaflet-container")).toBeVisible();
    if ((await map.getAttribute("data-confidence")) === "high") {
      await expect(map.locator(".detail-map-pin")).toBeVisible();
    } else {
      await expect(map.locator("path.leaflet-interactive")).toHaveCount(1);
    }
    await noHorizontalScroll(page);

    const gmaps = map.getByRole("link", { name: /Google Maps/ });
    expect(await gmaps.getAttribute("href")).toMatch(/query=-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
    const [tab] = await Promise.all([page.context().waitForEvent("page"), gmaps.click()]);
    await tab.close();
    await expect.poll(() => eventsOf(events, "detail_map_external_click").length).toBe(1);
  });

  test("sin datos completos (tier bajo, sin coordenadas): no hay mapa", async ({ page }) => {
    await search(page, "casas en rawson");
    await expect(cards(page).first()).toBeVisible();
    const hrefs = await detailHrefs(page, true);
    test.skip(hrefs.length === 0, "sin avisos de tier bajo en la primera página");
    await page.goto(hrefs[0]);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByTestId("detail-map")).toHaveCount(0);
  });
});
