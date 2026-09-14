import { expect, test } from "@playwright/test";
import { cards, collectEvents, eventsOf, search } from "./helpers";

/**
 * Bloque F de la batería FINDER-QA (lado P1): paginación por sesión sin
 * repetidas ni narrativa, y sesión inválida (404) reintentada en silencio.
 */
test.describe("Bloque F", () => {
  test("F1 paginación: página 2 del buffer, página 3 por sesión, sin ids repetidos", async ({ page }) => {
    const events = collectEvents(page);
    await search(page, "casa en rawson");
    const list = cards(page);
    await expect(list).toHaveCount(10);
    const ids = new Set<string>();
    const collect = async () => {
      for (const id of await list.evaluateAll((els) => els.map((e) => e.getAttribute("data-id") ?? ""))) ids.add(id);
    };
    await collect();
    // Scroll hasta el final: página 2 (buffer) y 3 (sesión).
    for (let i = 0; i < 6 && (await list.count()) < 21; i++) {
      await page.mouse.wheel(0, 20000);
      await page.waitForTimeout(700);
    }
    const n = await list.count();
    expect(n, "cards tras el scroll").toBeGreaterThanOrEqual(20);
    await collect();
    expect(ids.size, "ids únicos").toBe(n);
    const pages = eventsOf(events, "results_page_loaded");
    expect(pages.some((e) => e.payload.kind === "buffer")).toBe(true);
    if (n > 20) expect(pages.some((e) => e.payload.kind === "session")).toBe(true);
  });

  test("F2 sesión inválida: HTTP 404 antes del stream → sesión nueva, sin error visible", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/sessions", async (route) => {
      calls++;
      if (calls === 1) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ session_id: "00000000-0000-4000-8000-000000000000", created_at: "", expires_at: "" }),
        });
        return;
      }
      await route.continue();
    });
    await search(page, "casa en rawson");
    expect(calls).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId("search-error")).toHaveCount(0);
    await expect(cards(page).first()).toBeVisible();
  });
});
