import { expect, test } from "@playwright/test";
import { cards } from "./helpers";

/**
 * T5 — Vertical de lotes: acceso rápido, sugerencias, resultados y capa del mapa.
 */
test.describe("T5 lotes", () => {
  test("Lotes junto a Alquilar · Comprar · Invertir, con sugerencias y resultados", async ({ page }, testInfo) => {
    await page.goto("/");
    const lotes = page.getByRole("button", { name: "Lotes", exact: true });
    await expect(lotes).toBeVisible();
    await lotes.click();
    await expect(lotes).toHaveAttribute("aria-pressed", "true");
    const example = page.getByRole("button", { name: /lotes en Santa Lucía/ });
    await expect(example).toBeVisible();
    await expect(page.getByRole("button", { name: /terrenos hasta 30 mil dólares/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /lotes en loteo con servicios/ })).toBeVisible();
    await example.click();
    await expect(page).toHaveURL(/v=lotes/);
    await expect(cards(page).first()).toBeVisible({ timeout: 45_000 });
    await expect(cards(page).first().locator(".pbadge--land")).toHaveText("Lote");
    await expect(page.getByTestId("interpretation").locator('.ichip[data-field="vertical"]')).toContainText(/Lote/);
    await expect(page.getByRole("button", { name: "Lotes", exact: true }).last()).toHaveAttribute("aria-pressed", "true");

    // Mapa con la capa de lotes (en mobile se abre con el FAB).
    if (testInfo.project.name === "mobile") await page.getByRole("button", { name: /Ver mapa/ }).click();
    const map = page.locator(".leaflet-host");
    await expect(map).toHaveAttribute("data-layer", "land");
    await expect(page.locator(".price-marker--land").first()).toBeVisible({ timeout: 30_000 });
  });

  test("con resultados de vivienda, tocar Lotes cambia a lotes en la misma sesión", async ({ page }) => {
    await page.goto("/buscar?q=algo%20en%20Pocito");
    await expect(cards(page).first()).toBeVisible({ timeout: 45_000 });
    await page.getByRole("button", { name: "Lotes", exact: true }).click();
    await expect(page.getByTestId("interpretation").locator('.ichip[data-field="vertical"]')).toContainText(/Lote/, { timeout: 45_000 });
    await expect(page.getByTestId("interpretation").locator('.ichip[data-field="zones"]')).toContainText("Pocito");
  });
});
