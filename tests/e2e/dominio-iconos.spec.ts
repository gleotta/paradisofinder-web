import { createHash } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Dominio e íconos (15/09):
 *  - `finder.paradisoestate.com` redirige con 301 a `https://paradisofinder.com`
 *    desde `src/proxy.ts`, en TODAS las rutas. Detrás del edge de Railway el
 *    host llega en `x-forwarded-host`; acá se simula con ese header.
 *  - Ningún otro host se redirige, y las páginas conservan la CSP con nonce.
 *  - Íconos de marca por las convenciones de archivo de Next (favicon.ico,
 *    icon.svg, apple-icon.png, manifest) y sus tags en el <head>.
 */
const OLD_HOST = "finder.paradisoestate.com";
const NEW_ORIGIN = "https://paradisofinder.com";
/** md5 del favicon genérico de create-next-app que había antes. */
const GENERIC_FAVICON_MD5 = "c30c7d42707a47a3f4591831641e50dc";

const noFollow = (request: APIRequestContext, path: string, headers: Record<string, string> = {}) =>
  request.get(path, { headers, maxRedirects: 0 });

/** Ancho, alto y tipo de color de un PNG (IHDR). */
function pngInfo(buf: Buffer) {
  expect(buf.subarray(1, 4).toString("ascii"), "firma PNG").toBe("PNG");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}

async function staticAssetPath(request: APIRequestContext): Promise<string> {
  const html = await (await request.get("/")).text();
  const asset = html.match(/\/_next\/static\/[^"'\s?]+\.(?:js|css)/)?.[0];
  expect(asset, "la home referencia un asset de /_next/static").toBeTruthy();
  return asset!;
}

test.describe("Dominio viejo → paradisofinder.com", () => {
  test("301 con el mismo path y query en páginas, API, íconos y assets", async ({ request }) => {
    const paths = [
      "/buscar?q=casas%20en%20rivadavia",
      "/",
      "/api/health",
      "/favicon.ico",
      "/icon.svg",
      "/apple-icon.png",
      "/manifest.webmanifest",
      await staticAssetPath(request),
    ];
    for (const path of paths) {
      const res = await noFollow(request, path, { "x-forwarded-host": OLD_HOST });
      expect(res.status(), path).toBe(301);
      expect(res.headers()["location"], path).toBe(`${NEW_ORIGIN}${path}`);
      // Ningún caché compartido (Cloudflare) puede guardar el 301.
      expect(res.headers()["cache-control"], path).toMatch(/\bprivate\b/);
    }
  });

  test("el host se normaliza: primer valor, minúsculas, sin puerto; prefetch incluido", async ({ request }) => {
    const variants = [`${OLD_HOST.toUpperCase()}:443`, `${OLD_HOST}, otro-proxy.interno`, ` ${OLD_HOST}:8080 `];
    for (const host of variants) {
      const res = await noFollow(request, "/buscar?q=lotes", { "x-forwarded-host": host });
      expect(res.status(), host).toBe(301);
      expect(res.headers()["location"]).toBe(`${NEW_ORIGIN}/buscar?q=lotes`);
    }
    const prefetch = await noFollow(request, "/", { "x-forwarded-host": OLD_HOST, "next-router-prefetch": "1" });
    expect(prefetch.status()).toBe(301);
  });

  test("ningún otro host se redirige", async ({ request }) => {
    for (const path of ["/", "/api/health", "/favicon.ico"]) {
      expect((await noFollow(request, path)).status(), `${path} sin header`).toBe(200);
    }
    const others = [
      "paradisofinder.com",
      "paradisofinder-web-stage.up.railway.app",
      `sub.${OLD_HOST}`,
      `${OLD_HOST}.otro.com`,
      "healthcheck.railway.app",
    ];
    for (const host of others) {
      const res = await noFollow(request, "/api/health", { "x-forwarded-host": host });
      expect(res.status(), host).toBe(200);
    }
  });

  test("las páginas conservan la CSP con nonce; API, íconos y prefetch salen sin CSP", async ({ request }) => {
    const csp = (await noFollow(request, "/")).headers()["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    for (const path of ["/api/health", "/favicon.ico", "/icon.svg", "/apple-icon.png", "/manifest.webmanifest"]) {
      const res = await noFollow(request, path);
      expect(res.status(), path).toBe(200);
      expect(res.headers()["content-security-policy"], path).toBeUndefined();
    }
    const prefetch = await noFollow(request, "/", { purpose: "prefetch" });
    expect(prefetch.headers()["content-security-policy"]).toBeUndefined();
  });
});

test.describe("Íconos de marca", () => {
  test("favicon.ico propio con 16, 32 y 48 px", async ({ request }) => {
    const res = await request.get("/favicon.ico");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/x-icon");
    const ico = await res.body();
    expect(createHash("md5").update(ico).digest("hex")).not.toBe(GENERIC_FAVICON_MD5);
    expect(ico.readUInt16LE(2), "tipo ícono").toBe(1);
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => ico[6 + i * 16]).sort((a, b) => a - b);
    expect(sizes).toEqual([16, 32, 48]);
  });

  test("icon.svg vectorial con la letra en path, apple-icon opaco de 180 px", async ({ request }) => {
    const svg = await request.get("/icon.svg");
    expect(svg.status()).toBe(200);
    expect(svg.headers()["content-type"]).toMatch(/^image\/svg\+xml/);
    const body = await svg.text();
    expect(body).toContain("<path");
    expect(body).not.toContain("<text");

    const apple = await request.get("/apple-icon.png");
    expect(apple.status()).toBe(200);
    expect(apple.headers()["content-type"]).toBe("image/png");
    const info = pngInfo(await apple.body());
    expect([info.width, info.height]).toEqual([180, 180]);
    expect(info.colorType, "sin canal alfa (2 = RGB)").toBe(2);
  });

  test("manifest con nombre, colores e íconos 192/512 que existen", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    const manifest = (await res.json()) as {
      name: string;
      short_name: string;
      theme_color: string;
      background_color: string;
      icons: { src: string; sizes: string; type: string; purpose?: string }[];
    };
    expect(manifest.name).toBe("FINDER · San Juan");
    expect(manifest.short_name).toBe("FINDER");
    expect(manifest.theme_color).toBe("#4D1480");
    expect(manifest.background_color).toBe("#F4EDF7");
    expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    for (const icon of manifest.icons) {
      const img = await request.get(icon.src);
      expect(img.status(), icon.src).toBe(200);
      expect(img.headers()["content-type"], icon.src).toBe("image/png");
      const { width, height } = pngInfo(await img.body());
      expect(`${width}x${height}`, icon.src).toBe(icon.sizes);
    }
  });

  test("el <head> enlaza ícono, apple-touch-icon y manifest, sin duplicados", async ({ page }) => {
    await page.goto("/");
    const hrefs = async (rel: string) =>
      page.locator(`head link[rel="${rel}"]`).evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    const icons = await hrefs("icon");
    expect(icons.some((h) => h?.startsWith("/favicon.ico"))).toBe(true);
    expect(icons.some((h) => h?.startsWith("/icon.svg"))).toBe(true);
    expect(new Set(icons).size, "rel=icon sin duplicados").toBe(icons.length);
    expect(await hrefs("apple-touch-icon")).toHaveLength(1);
    expect(await hrefs("manifest")).toEqual(["/manifest.webmanifest"]);
  });
});
