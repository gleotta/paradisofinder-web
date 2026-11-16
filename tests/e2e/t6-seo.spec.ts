import { expect, test } from "@playwright/test";
import { cards, FORBIDDEN, noHorizontalScroll } from "./helpers";

/**
 * T6 — SEO técnico: robots, sitemap, páginas zona × tipo × operación, Open Graph.
 */
test.describe("T6 SEO", () => {
  test("robots.txt y sitemap.xml responden 200 y son válidos", async ({ request }) => {
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    const rtxt = await robots.text();
    expect(rtxt).toMatch(/User-Agent: \*/i);
    expect(rtxt).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
    expect(rtxt).toMatch(/Disallow: \/api\//);

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect(sitemap.headers()["content-type"]).toMatch(/xml/);
    const xml = await sitemap.text();
    expect(xml).toContain("<urlset");
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length, "páginas en el sitemap").toBeGreaterThanOrEqual(51);
    expect(locs.filter((l) => /-en-(venta|alquiler)-en-.+-san-juan$/.test(l)).length).toBeGreaterThanOrEqual(50);
  });

  test("las páginas del sitemap existen, con título, conteo real y cards", async ({ page, request }) => {
    test.setTimeout(10 * 60_000);
    const xml = await (await request.get("/sitemap.xml")).text();
    const paths = [...xml.matchAll(/<loc>[^<]*?(\/[a-z0-9-]+-san-juan)<\/loc>/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThanOrEqual(50);
    // Tres se validan a fondo primero (frías, antes de gastar el rate limit
    // de P2 con el barrido); después todas tienen que dar 200.
    for (const p of [paths[0], paths[Math.floor(paths.length / 2)], paths[paths.length - 1]]) {
      await page.goto(p);
      await expect(page.locator("h1")).toContainText(/en (venta|alquiler) en .+, San Juan/);
      await expect(page).toHaveTitle(/avisos/);
      await expect(page.getByTestId("landing-count")).toContainText(/\d+ avisos? publicados?/);
      expect(await cards(page).count()).toBeGreaterThanOrEqual(1);
      expect(await page.locator("main").innerText()).not.toMatch(FORBIDDEN);
      const input = page.locator(".landing-search input[name=q]");
      await expect(input).not.toHaveValue("");
      await noHorizontalScroll(page);
    }
    let ok = 0;
    for (const [i, p] of paths.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, 2200));
      const r = await request.get(p, { maxRedirects: 0 });
      if (r.status() === 200) ok++;
    }
    expect(ok, "landings con 200").toBe(paths.length);
    // Una combinación que no está en el catálogo es 404.
    expect((await request.get("/casas-en-alquiler-en-narnia-san-juan")).status()).toBe(404);
  });

  test("Open Graph de una propiedad: título con precio y zona, imagen", async ({ page }) => {
    await page.goto("/buscar?q=casa%20en%20rawson");
    await expect(cards(page).first()).toBeVisible({ timeout: 45_000 });
    const href = await cards(page).first().locator(".pcard-title a").getAttribute("href");
    await page.goto(href!);
    const og = async (p: string) => page.locator(`meta[property="${p}"]`).first().getAttribute("content");
    expect(await og("og:title")).toMatch(/(US\$|\$) [\d.]+/);
    expect(await og("og:title")).toMatch(/ en /);
    expect(await og("og:url")).toMatch(/\/propiedad\//);
    expect(await og("og:locale")).toBe("es_AR");
    const image = await og("og:image");
    const photo = await page.locator(".gallery-main img").count();
    if (photo) expect(image).toMatch(/^https?:\/\//);
  });
});
