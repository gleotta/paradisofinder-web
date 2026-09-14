#!/usr/bin/env node
/**
 * Precalienta las páginas SEO de un P1 desplegado (T6): pide cada URL del
 * sitemap al ritmo del rate limit de búsqueda de P2 (30/min), así el cache
 * de 6 h queda lleno antes de que un crawler pida 70 landings frías de golpe.
 *
 *   node scripts/seo-warm.mjs https://paradisofinder.com
 *   SEO_RPM=20 node scripts/seo-warm.mjs http://localhost:3000
 */
const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!base) {
  console.error("uso: node scripts/seo-warm.mjs <url-base-de-P1>");
  process.exit(2);
}
const rpm = Number(process.env.SEO_RPM || 25);
const gap = Math.ceil(60000 / rpm);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const xml = await (await fetch(`${base}/sitemap.xml`)).text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => /-san-juan$/.test(u));
console.log(`${urls.length} landings · ${rpm}/min`);
let ok = 0;
for (const [i, u] of urls.entries()) {
  const t0 = Date.now();
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(30000) });
    const html = await r.text();
    const withCards = /data-testid="property-card"/.test(html);
    if (r.status === 200 && withCards) ok++;
    console.log(`  ${String(i + 1).padStart(3)}/${urls.length} ${r.status}${withCards ? "" : " (sin cards)"} ${u}`);
  } catch (e) {
    console.log(`  ${String(i + 1).padStart(3)}/${urls.length} error ${e.message} ${u}`);
  }
  const wait = gap - (Date.now() - t0);
  if (wait > 0 && i < urls.length - 1) await sleep(wait);
}
console.log(`${ok}/${urls.length} landings con cards`);
process.exit(ok === urls.length ? 0 : 1);
