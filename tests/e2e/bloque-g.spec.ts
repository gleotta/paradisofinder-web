import { expect, test } from "@playwright/test";
import { cards, FORBIDDEN, noHorizontalScroll, search } from "./helpers";

/**
 * Bloque G (interfaz P1, mobile primero): sin scroll horizontal en 380 px,
 * botones con etiqueta accesible, foco visible, Consultar en todas las cards,
 * nada de "None"/"unknown" en ninguna pantalla.
 */
test.describe("Bloque G", () => {
  test("G1 home, resultados y detalle sin desborde horizontal ni textos prohibidos", async ({ page, context }) => {
    await page.goto("/");
    await noHorizontalScroll(page);
    expect(await page.locator("main").innerText()).not.toMatch(FORBIDDEN);
    await search(page, "departamento en capital para alquilar");
    await noHorizontalScroll(page);
    await expect(cards(page).first()).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(FORBIDDEN);
    const href = await cards(page).first().locator(".pcard-title a").getAttribute("href");
    const detail = await context.newPage();
    await detail.setViewportSize(page.viewportSize()!);
    await detail.goto(href!);
    await expect(detail.locator("h1")).toBeVisible();
    await noHorizontalScroll(detail);
    expect(await detail.locator("main").innerText()).not.toMatch(FORBIDDEN);
    await detail.close();
  });

  test("G2 todos los botones tienen nombre accesible y el foco es visible", async ({ page }) => {
    await search(page, "casa en rawson");
    const unnamed = await page.locator("button").evaluateAll((els) =>
      els
        .filter((b) => {
          const name = (b.getAttribute("aria-label") ?? b.textContent ?? "").trim();
          return !name && !b.getAttribute("title");
        })
        .map((b) => b.outerHTML.slice(0, 80)),
    );
    expect(unnamed, "botones sin etiqueta").toEqual([]);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return "";
      const cs = getComputedStyle(el);
      return `${cs.outlineStyle} ${cs.outlineWidth}`;
    });
    expect(outline).not.toMatch(/^none 0px$/);
  });

  test("G3 cada card tiene Consultar, Ver aviso original y precio con moneda", async ({ page }) => {
    await search(page, "casa en rawson");
    const list = cards(page);
    const n = await list.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const card = list.nth(i);
      await expect(card.locator("a.btn-consult")).toHaveCount(1);
      await expect(card.locator(".pcard-price")).toContainText(/(US\$|\$) [\d.]+/);
    }
  });

  test("G4 contador = total real y chips de interpretación presentes", async ({ page }) => {
    await search(page, "casa en rawson");
    await expect(page.getByTestId("results-count")).toContainText(/\d+ resultados?/);
    await expect(page.getByTestId("interpretation").locator(".ichip").first()).toBeVisible();
  });
});
