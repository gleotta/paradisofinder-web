import { expect, test } from "@playwright/test";
import { cards, collectEvents, eventsOf, search } from "./helpers";

/**
 * T4 — Botón "Consultar" propio y medido; "Ver aviso original" secundario.
 */
test.describe("T4 consultar", () => {
  test("Consultar abre WhatsApp (o tel) con mensaje precargado y registra contact_click", async ({ page, context }) => {
    const events = collectEvents(page);
    // Los destinos externos no se navegan de verdad.
    await context.route(/https:\/\/(wa\.me|api\.whatsapp\.com|ejemplo\.com|www\.)/, (route) => route.fulfill({ status: 200, body: "" }));
    await search(page, "casa con pileta en Rivadavia hasta 120 mil dólares");
    const card = cards(page).first();
    const btn = card.locator("a.btn-consult");
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText(/Consultar|Llamar/);
    const href = (await btn.getAttribute("href")) ?? "";
    expect(href).toMatch(/^(https:\/\/wa\.me\/\d+\?text=|tel:|https?:)/);
    if (href.startsWith("https://wa.me/")) {
      const text = decodeURIComponent(href.split("text=")[1] ?? "");
      expect(text).toContain("paradisofinder.com");
      expect(text).toMatch(/US\$|\$/);
      expect(text).toContain("/propiedad/");
    }
    const popup = context.waitForEvent("page").catch(() => null);
    await btn.click();
    const p = await popup;
    if (p) await p.close();
    await expect.poll(() => eventsOf(events, "contact_click").length).toBe(1);
    const ev = eventsOf(events, "contact_click")[0];
    expect(ev.payload.property_id).toBeTruthy();
    expect(ev.payload.rank).toBe(1);
    expect(ev.payload.channel).toBeTruthy();
    expect(ev.query).toContain("casa");
    expect(ev.vertical).toBeTruthy();
    expect(ev.session_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("'Ver aviso original' es secundario y también se mide", async ({ page, context }) => {
    const events = collectEvents(page);
    await context.route(/https?:\/\/(www\.)?(compraensanjuan|ejemplo|inmoavisos)\./, (route) => route.fulfill({ status: 200, body: "" }));
    await search(page, "casa en rawson");
    const card = cards(page).first();
    const link = card.locator("a.source-link");
    await expect(link).toHaveText(/Ver aviso original/);
    // Está después del botón Consultar en el DOM (secundario).
    const order = await card.evaluate((el) => {
      const a = el.querySelector("a.btn-consult");
      const b = el.querySelector("a.source-link");
      return a && b ? (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? "after" : "before") : "missing";
    });
    expect(order).toBe("after");
    const popup = context.waitForEvent("page").catch(() => null);
    await link.click();
    const p = await popup;
    if (p) await p.close();
    await expect.poll(() => eventsOf(events, "source_click").length).toBe(1);
    expect(eventsOf(events, "source_click")[0].payload.rank).toBe(1);
  });
});
