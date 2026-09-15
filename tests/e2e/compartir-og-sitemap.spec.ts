import { expect, test } from "@playwright/test";
import { cards, collectEvents, eventsOf, search } from "./helpers";

/**
 * Compartir, og:image propia y propiedades en el sitemap (15/09):
 *  - cada card y el detalle tienen "Compartir" con `data-share-url` =
 *    `<SITE_URL>/propiedad/<id>`, y comparten esa URL (se mide `share_click`);
 *  - la og:image del detalle se sirve desde el dominio (`/og/propiedad/<id>.jpg`);
 *  - el sitemap lista `/propiedad/<id>` con lastmod (snapshot en segundo plano:
 *    si todavía no se generó, esa prueba se saltea).
 */
test.describe("Compartir, og:image y sitemap de propiedades", () => {
  test("la card comparte la URL pública del detalle y lo mide", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __shared: ShareData[] };
      w.__shared = [];
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: ShareData) => {
          w.__shared.push(data);
        },
      });
    });
    const events = collectEvents(page);
    await search(page, "casas en rawson");
    const card = cards(page).first();
    await expect(card).toBeVisible();

    const detailPath = new URL((await card.locator(".pcard-title a").getAttribute("href"))!, "http://x").pathname;
    const share = card.getByRole("button", { name: "Compartir" });
    const shareUrl = await share.getAttribute("data-share-url");
    expect(shareUrl).toMatch(/^https?:\/\/[^/]+\/propiedad\/[^/?#]+$/);
    expect(new URL(shareUrl!).pathname).toBe(detailPath);

    await share.click();
    const shared = await page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared);
    expect(shared).toHaveLength(1);
    expect(shared[0].url).toBe(shareUrl);
    await expect.poll(() => eventsOf(events, "share_click").length).toBe(1);
    expect(eventsOf(events, "share_click")[0].payload.method).toBe("native");
  });

  test("detalle: botón Compartir y og:image servida desde el dominio", async ({ page, request }) => {
    await search(page, "casas en rawson");
    const href = await cards(page).first().locator(".pcard-title a").getAttribute("href");
    await page.goto(href!);

    const share = page.getByRole("button", { name: "Compartir" });
    await expect(share).toBeVisible();
    const id = new URL(href!, "http://x").pathname.split("/").pop()!;
    expect(await share.getAttribute("data-share-url")).toMatch(new RegExp(`/propiedad/${id}$`));

    const ogImage = await page.locator('meta[property="og:image"]').first().getAttribute("content");
    expect(ogImage).toMatch(new RegExp(`/og/propiedad/${id}\\.jpg$`));
    const img = await request.get(new URL(ogImage!).pathname);
    expect(img.status()).toBe(200);
    expect(img.headers()["content-type"]).toBe("image/jpeg");
    expect(img.headers()["cache-control"]).toMatch(/public/);
    expect((await img.body()).length, "liviana para WhatsApp").toBeLessThan(300_000);
    expect(await page.locator('meta[property="og:image:width"]').first().getAttribute("content")).toBe("1200");

    expect((await request.get("/og/propiedad/no-existe-000.jpg")).status()).toBe(404);
    expect((await request.get("/og/propiedad/../../etc/passwd")).status()).toBe(404);
  });

  test("sitemap: propiedades con lastmod y páginas que existen", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)]
      .map((m) => ({ loc: m[1].match(/<loc>([^<]+)<\/loc>/)?.[1] ?? "", lastmod: m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] }))
      .filter((e) => /\/propiedad\/[^/]+$/.test(e.loc));
    test.skip(entries.length === 0, "el snapshot de propiedades todavía no se generó (se arma en segundo plano)");
    expect(entries.filter((e) => e.lastmod).length / entries.length, "casi todas con lastmod").toBeGreaterThan(0.9);
    for (const e of [entries[0], entries[Math.floor(entries.length / 2)], entries[entries.length - 1]]) {
      const res = await request.get(new URL(e.loc).pathname, { maxRedirects: 0 });
      expect(res.status(), e.loc).toBe(200);
    }
  });
});
