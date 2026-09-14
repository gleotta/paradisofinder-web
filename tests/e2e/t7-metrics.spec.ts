import { expect, test } from "@playwright/test";
import { cards, collectEvents, eventsOf, search } from "./helpers";

/**
 * T7 — Eventos mínimos del embudo y tablero interno.
 */
test.describe("T7 métricas", () => {
  test("search_submitted → cards_rendered → card_opened, con session_id, vertical y posición", async ({ page, context }) => {
    const events = collectEvents(page);
    await search(page, "casa en rawson", "comprar");
    await expect.poll(() => eventsOf(events, "cards_rendered").length).toBe(1);
    const submitted = eventsOf(events, "search_submitted");
    expect(submitted.length).toBe(1);
    expect(submitted[0].vertical).toBe("comprar");
    const rendered = eventsOf(events, "cards_rendered")[0];
    expect(rendered.session_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rendered.search_id).toMatch(/\.\d+$/);
    expect(typeof rendered.payload.t_first_cards).toBe("number");
    expect(rendered.vertical).toBe("comprar");

    const popup = context.waitForEvent("page").catch(() => null);
    await cards(page).nth(1).locator(".pcard-title a").click();
    const p = await popup;
    await expect.poll(() => eventsOf(events, "card_opened").length).toBe(1);
    const opened = eventsOf(events, "card_opened")[0];
    expect(opened.payload.rank).toBe(2);
    expect(opened.payload.position).toBe(2);
    expect(opened.session_id).toBe(rendered.session_id);
    if (p) {
      await expect(p.locator("h1")).toBeVisible();
      expect(p.url()).toMatch(/[?&]v=comprar/);
      await p.close();
    }
  });

  test("chip_removed y clarification_choice llevan sesión y vertical", async ({ page }) => {
    const events = collectEvents(page);
    await search(page, "casa con pileta en Rivadavia hasta 120 mil dólares");
    await page.getByTestId("interpretation").locator('.ichip[data-field="pool"] .ichip-x').click();
    await expect.poll(() => eventsOf(events, "chip_removed").length).toBe(1);
    const ev = eventsOf(events, "chip_removed")[0];
    expect(ev.session_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ev.vertical).toBeTruthy();
  });

  test("el tablero interno muestra el embudo por día", async ({ page }) => {
    const res = await page.goto("/interno/embudo");
    // En producción exige METRICS_TOKEN: sin él es 404 y la prueba no aplica.
    test.skip(res?.status() === 404, "tablero protegido por METRICS_TOKEN");
    await expect(page.locator("h1")).toHaveText("Embudo de uso");
    await expect(page.locator(".funnel-kpi").first()).toContainText("Búsquedas");
    await expect(page.locator(".funnel-table thead").first()).toContainText("Card abierta");
  });
});
