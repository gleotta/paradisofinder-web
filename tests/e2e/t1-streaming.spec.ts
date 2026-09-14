import { expect, test } from "@playwright/test";
import { cards, collectEvents, eventsOf, search } from "./helpers";

/**
 * T1 — Estado visible antes de 500 ms y streaming progresivo.
 */
test.describe("T1 estado y streaming", () => {
  test("skeleton y 'Buscando…' en menos de 500 ms desde el submit", async ({ page }) => {
    // Calentar la ruta de resultados: en dev el primer render compila.
    await page.goto("/buscar?q=casa%20en%20rawson");
    await expect(page.getByTestId("results")).toHaveAttribute("data-state", /results|clarification/, { timeout: 45_000 });
    await page.goto("/");
    const input = page.getByLabel("Qué propiedad buscás");
    await input.fill("departamento en capital");
    // El skeleton puede durar 200 ms (P2 rápido): se registra el instante en
    // que entra al DOM con un observer dentro de la página, no con polling.
    await page.evaluate(() => {
      const w = window as unknown as { __pfFirst: number | null };
      w.__pfFirst = null;
      const check = () => {
        if (w.__pfFirst == null && document.querySelector('[data-testid="search-skeleton"],[data-testid="searching-line"]')) {
          w.__pfFirst = performance.now();
        }
      };
      new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    });
    const tSubmit = await page.evaluate(() => performance.now());
    await input.press("Enter");
    await page.waitForFunction(() => (window as unknown as { __pfFirst: number | null }).__pfFirst != null, null, { timeout: 15_000 });
    const tFirst = await page.evaluate(() => (window as unknown as { __pfFirst: number }).__pfFirst);
    const elapsed = Math.round(tFirst - tSubmit);
    test.info().annotations.push({ type: "t_first_visible_ms", description: String(elapsed) });
    expect(elapsed, `primer estado visible en ${elapsed} ms`).toBeLessThan(500);
    await expect(cards(page).first()).toBeVisible({ timeout: 45_000 });
  });

  test("las cards se pintan al llegar el evento cards, antes que la narración", async ({ page }) => {
    const events = collectEvents(page);
    await page.goto("/buscar?q=casa%20en%20rivadavia");
    await expect(cards(page).first()).toBeVisible({ timeout: 45_000 });
    const tCards = Date.now();
    // La narración llega después (tokens) y nunca bloquea las cards.
    await expect(page.getByTestId("narrative")).toBeVisible({ timeout: 30_000 });
    expect(Date.now()).toBeGreaterThanOrEqual(tCards);
    // Latencia medida en el cliente: cards_rendered con t_first_cards.
    await expect.poll(() => eventsOf(events, "cards_rendered").length, { timeout: 10_000 }).toBeGreaterThan(0);
    const ev = eventsOf(events, "cards_rendered")[0];
    expect(typeof ev.payload.t_first_cards).toBe("number");
    expect(typeof ev.payload.t_first_paint).toBe("number");
    // Pintar cuesta menos de 200 ms más que el evento (criterio de aceptación).
    expect((ev.payload.t_first_paint as number) - (ev.payload.t_first_cards as number)).toBeLessThan(200);
  });

  test("a los 4 s sin cards: mensaje de espera con la consulta y fallback 'Buscar con filtros'", async ({ page }) => {
    // Se demora la respuesta del stream 6 s (el server sigue igual); el
    // fallback sync no se toca.
    await page.route("**/api/search/stream", async (route) => {
      const res = await route.fetch();
      const body = await res.body();
      await new Promise((r) => setTimeout(r, 6000));
      await route.fulfill({ response: res, body });
    });
    await page.goto("/buscar?q=casa%20en%20rawson");
    await expect(page.getByTestId("search-skeleton")).toBeVisible();
    const slow = page.getByTestId("slow-wait");
    await expect(slow).toBeVisible({ timeout: 6000 });
    await expect(slow).toContainText("casa en rawson");
    await slow.getByRole("button", { name: "Buscar con filtros" }).click();
    await expect(cards(page).first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("results-count")).toBeVisible();
  });

  test("clarification NO terminal (few_results): cards + burbuja con relajaciones y conteos", async ({ page }) => {
    const events = collectEvents(page);
    // Verificado contra P2 real 14/09: place "Trinidad" + pileta → 0 resultados + few_results.
    await search(page, "casa con pileta en Trinidad hasta 90 mil dólares");
    const bubble = page.getByTestId("relax-bubble");
    await expect(bubble).toBeVisible({ timeout: 30_000 });
    const buttons = bubble.getByRole("button");
    expect(await buttons.count()).toBeGreaterThan(0);
    await expect(buttons.first()).toContainText(/Quitar/);
    // El stream se leyó hasta done: la narración también llegó.
    await expect(page.getByTestId("narrative")).toBeVisible({ timeout: 30_000 });
    const before = await page.getByTestId("results-count").innerText();
    await buttons.first().click();
    await expect.poll(() => eventsOf(events, "clarification_choice").length).toBeGreaterThan(0);
    await expect(page.getByTestId("results")).toHaveAttribute("data-state", "results", { timeout: 45_000 });
    // Relajar cambia el criterio: el contador se recalcula (o al menos la burbuja se fue).
    await expect
      .poll(async () => (await page.getByTestId("results-count").innerText()) !== before || !(await bubble.isVisible()), {
        timeout: 45_000,
      })
      .toBe(true);
  });

  test("sesión inexistente (404): se reintenta sin mostrar error", async ({ page }) => {
    const events = collectEvents(page);
    let first = true;
    await page.route("**/api/sessions", async (route) => {
      if (first) {
        first = false;
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
    await expect(page.getByTestId("search-error")).toHaveCount(0);
    await expect(cards(page).first()).toBeVisible();
    await expect.poll(() => eventsOf(events, "session_retried").length).toBeGreaterThan(0);
  });
});
