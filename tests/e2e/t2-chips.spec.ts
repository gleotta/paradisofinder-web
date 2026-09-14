import { expect, test } from "@playwright/test";
import { cards, collectEvents, eventsOf, search } from "./helpers";

/**
 * T2 — Chips de interpretación: cada filtro duro del summary, quitar/editar,
 * nota de asunción y orden.
 */
test.describe("T2 chips de interpretación", () => {
  test("cada filtro duro es un chip; quitar relanza sin ese filtro", async ({ page }) => {
    const events = collectEvents(page);
    await search(page, "casa con pileta en Rivadavia hasta 120 mil dólares");
    const interp = page.getByTestId("interpretation");
    await expect(interp).toBeVisible();
    for (const field of ["vertical", "property_type", "zones", "budget_max", "pool"]) {
      await expect(interp.locator(`.ichip[data-field="${field}"]`), `chip ${field}`).toBeVisible();
    }
    await expect(interp.locator('.ichip[data-field="order"]')).toContainText("Orden:");
    // Asunción de compra: chip aparte, tocable.
    await expect(interp.locator('.ichip[data-field="assumption"]')).toContainText("Asumí compra");

    const before = await page.getByTestId("results-count").innerText();
    await interp.locator('.ichip[data-field="pool"] .ichip-x').click();
    await expect.poll(() => eventsOf(events, "chip_removed").length).toBe(1);
    expect(eventsOf(events, "chip_removed")[0].payload.field).toBe("pool");
    await expect(page.getByTestId("results")).toHaveAttribute("data-state", "results", { timeout: 45_000 });
    await expect(interp.locator('.ichip[data-field="pool"]')).toHaveCount(0, { timeout: 45_000 });
    await expect(interp.locator('.ichip[data-field="assumption"]')).toContainText(/Quité/);
    await expect.poll(async () => page.getByTestId("results-count").innerText()).not.toBe(before);
    await expect(cards(page).first()).toBeVisible();
  });

  test("editar zona (selector) y presupuesto (numérico con moneda)", async ({ page }) => {
    const events = collectEvents(page);
    await search(page, "casa en Rivadavia hasta 120 mil dólares");
    const interp = page.getByTestId("interpretation");
    await interp.locator('.ichip[data-field="zones"] .ichip-main').click();
    await page.getByLabel("Elegir zona").selectOption("rawson");
    await expect(interp.locator('.ichip[data-field="zones"]')).toContainText("Rawson", { timeout: 45_000 });
    expect(eventsOf(events, "chip_edited")[0]?.payload.field).toBe("zones");

    await interp.locator('.ichip[data-field="budget_max"] .ichip-main').click();
    const amount = page.getByLabel("Monto");
    await amount.fill("90000");
    await page.getByLabel("Moneda").selectOption("USD");
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(interp.locator('.ichip[data-field="budget_max"]')).toContainText("90.000", { timeout: 45_000 });
  });

  test("cambiar el orden desde el chip", async ({ page }) => {
    const events = collectEvents(page);
    await search(page, "casa en Rawson hasta 90 mil dólares");
    const interp = page.getByTestId("interpretation");
    await interp.locator('.ichip[data-field="order"] .ichip-main').click();
    await page.getByRole("button", { name: "Precio: menor a mayor" }).click();
    await expect(interp.locator('.ichip[data-field="order"]')).toContainText(/Precio/, { timeout: 45_000 });
    expect(eventsOf(events, "order_changed")[0]?.payload.to).toBe("price_asc");
  });

  test("la nota de asunción invierte la operación", async ({ page }) => {
    await search(page, "casa en Rawson");
    const interp = page.getByTestId("interpretation");
    const note = interp.locator('.ichip[data-field="assumption"] button');
    await expect(note).toContainText("cambiar a alquiler");
    await note.click();
    await expect(page.getByRole("button", { name: "Alquilar" })).toHaveAttribute("aria-pressed", "true", { timeout: 45_000 });
    await expect(interp.locator('.ichip[data-field="vertical"]')).toContainText("Alquiler", { timeout: 45_000 });
  });
});
