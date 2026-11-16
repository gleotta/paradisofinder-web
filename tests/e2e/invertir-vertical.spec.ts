import { expect, test, type Page } from "@playwright/test";
import { cards, collectEvents, eventsOf, p2Mode, search } from "./helpers";

/**
 * Invertir = la vertical de inversión de P2 (German, 02/11 —
 * `docs/DECISION_2026-11-02_analisis-inversion.md` §6). Con Invertir elegido,
 * P1 pide `vertical_override: "investment"`: en sesión nueva el server siembra
 * el criterio del texto con `POST /search` sync y manda el override por el
 * stream (`prepareTurn`); con resultados en pantalla, el override directo.
 * El texto manda igual (alquilar/lotes/otra ciudad). Contra P2 real.
 */

const TEXT = "departamentos en Capital hasta 80 mil dólares";
const interp = (page: Page) => page.getByTestId("interpretation");
const chipInversion = (page: Page) => interp(page).getByText("Compra para inversión", { exact: true });
const selectorBtn = (page: Page, name: string) => page.locator(".vseg--bar").getByRole("button", { name });

async function expectCriterioIntacto(page: Page) {
  await expect(interp(page)).toContainText("Departamento");
  await expect(interp(page)).toContainText("Capital");
  await expect(interp(page)).toContainText("hasta US$ 80.000");
}

test.describe("Invertir · vertical de inversión", () => {
  test("búsqueda nueva con Invertir elegido: vertical de inversión, criterio del texto intacto y cards rápidas", async ({ page }) => {
    test.skip((await p2Mode(page)) !== "live", "solo contra P2 real");
    await search(page, TEXT, "invertir");
    await expect(cards(page).first()).toBeVisible({ timeout: 45_000 });
    await expect(chipInversion(page)).toBeVisible();
    await expectCriterioIntacto(page);
    await expect(selectorBtn(page, "Invertir")).toHaveAttribute("aria-pressed", "true");
    await expect(cards(page).first()).toHaveAttribute("data-vertical", "invertir");
    // Sin la frase lenta ("ordenadas por renta" pasaba por el extractor LLM, ~2 s):
    // siembra sync (~0,2 s) + override (cards a ~10 ms).
    const ms = Number(await page.getByTestId("results").getAttribute("data-first-cards-ms"));
    expect(ms, "primeras cards antes de 2,5 s").toBeLessThan(2500);
  });

  test("Comprar con resultados → click en Invertir: mismo criterio, vertical de inversión; y vuelta a Comprar", async ({ page }) => {
    test.skip((await p2Mode(page)) !== "live", "solo contra P2 real");
    await search(page, TEXT, "comprar");
    await expect(cards(page).first()).toBeVisible({ timeout: 45_000 });
    await expect(interp(page).getByText("Compra", { exact: true })).toBeVisible();
    const total = await page.getByTestId("results-count").innerText();

    await selectorBtn(page, "Invertir").click();
    await expect(chipInversion(page)).toBeVisible({ timeout: 30_000 });
    await expectCriterioIntacto(page);
    await expect(selectorBtn(page, "Invertir")).toHaveAttribute("aria-pressed", "true");
    await expect(cards(page).first()).toHaveAttribute("data-vertical", "invertir");
    // Mismo universo: la vertical de inversión cambia el orden, no el filtro.
    await expect(page.getByTestId("results-count")).toHaveText(total);

    await selectorBtn(page, "Comprar").click();
    await expect(interp(page).getByText("Compra", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(chipInversion(page)).toHaveCount(0);
    await expect(cards(page).first()).toHaveAttribute("data-vertical", "comprar");
  });

  test("el texto manda: 'para alquilar' con Invertir elegido queda en Alquiler, sin análisis", async ({ page }) => {
    test.skip((await p2Mode(page)) !== "live", "solo contra P2 real");
    const events = collectEvents(page);
    await search(page, "departamento para alquilar en Capital", "invertir");
    await expect(cards(page).first()).toBeVisible({ timeout: 45_000 });
    await expect(interp(page).getByText("Alquiler", { exact: true })).toBeVisible();
    await expect(selectorBtn(page, "Alquilar")).toHaveAttribute("aria-pressed", "true");
    await expect(selectorBtn(page, "Invertir")).toHaveAttribute("aria-pressed", "false");
    await expect(cards(page).first()).toHaveAttribute("data-vertical", "alquilar");
    // El análisis que se disparó al enviar se cerró al re-sincronizar a Alquilar.
    await page.waitForTimeout(2000);
    await expect(page.getByTestId("invest-panel")).toHaveCount(0);
    expect(eventsOf(events, "invest_analysis_started").length).toBe(0);
  });

  test("otra ciudad con Invertir elegido: la aclaración llega como siempre", async ({ page }) => {
    test.skip((await p2Mode(page)) !== "live", "solo contra P2 real");
    await search(page, "departamentos en Mendoza", "invertir");
    await expect(page.getByTestId("results")).toHaveAttribute("data-state", "clarification");
    await expect(page.getByTestId("clarification")).toBeVisible();
  });

  test("en Comprar, 'ordenadas por renta' sigue siendo Comprar (no salta a Invertir)", async ({ page }) => {
    test.skip((await p2Mode(page)) !== "live", "solo contra P2 real");
    await search(page, `${TEXT}, ordenadas por renta`, "comprar");
    await expect(cards(page).first()).toBeVisible({ timeout: 45_000 });
    await expect(interp(page).getByText("Compra", { exact: true })).toBeVisible();
    await expect(selectorBtn(page, "Comprar")).toHaveAttribute("aria-pressed", "true");
    await expect(cards(page).first()).toHaveAttribute("data-vertical", "comprar");
  });
});
