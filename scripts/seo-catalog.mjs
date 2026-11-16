#!/usr/bin/env node
/**
 * Genera `src/data/seo-catalog.json` (T6): qué combinaciones zona × tipo ×
 * operación tienen ≥ MIN avisos vivos en P2, con su conteo. Corre OFFLINE
 * (no en el request) porque son ~95 consultas estructuradas y el rate limit
 * de búsqueda de P2 es 30/min por IP.
 *
 *   node scripts/seo-catalog.mjs                      # P2 local (:8000)
 *   P2_BASE_URL=https://… P2_API_KEY=… node scripts/seo-catalog.mjs
 *
 * Entorno: P2_BASE_URL (sin /api/v1; default http://localhost:8000),
 * P2_API_KEY, SEO_RPM (consultas por minuto, default 25), SEO_MIN (default 5),
 * SEO_OUT (default src/data/seo-catalog.json).
 * Repetirlo cuando cambie el stock de forma apreciable (semanal alcanza): la
 * página muestra igual el conteo real al servirse; el catálogo solo decide
 * qué URLs existen y van al sitemap.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const base = (process.env.P2_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
const apiKey = process.env.P2_API_KEY || "";
const rpm = Number(process.env.SEO_RPM || 25);
const min = Number(process.env.SEO_MIN || 5);
const out = path.resolve(root, process.env.SEO_OUT || "src/data/seo-catalog.json");

const zones = JSON.parse(readFileSync(path.join(root, "src/data/zones.json"), "utf8"));
const TYPES = [
  { slug: "departamentos", property_type: "apartment" },
  { slug: "casas", property_type: "house" },
  { slug: "lotes", property_type: null, vertical: "land" },
  // Todas las tipologías de vivienda de la vertical.
  { slug: "propiedades", property_type: null },
];
const OPS = [
  { slug: "venta", vertical: "sale" },
  { slug: "alquiler", vertical: "rent" },
];

const combos = [];
for (const t of TYPES) {
  for (const o of OPS) {
    if (t.vertical === "land" && o.slug !== "venta") continue;
    for (const z of zones) {
      const body = t.vertical === "land"
        ? { vertical: "land", zones: [z.code], limit: 1, offset: 0 }
        : { vertical: o.vertical, zones: [z.code], ...(t.property_type ? { property_type: t.property_type } : {}), limit: 1, offset: 0 };
      combos.push({ slug: `${t.slug}-en-${o.slug}-en-${z.slug}-san-juan`, body });
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gap = Math.ceil(60000 / rpm);
const entries = [];
let fails = 0;
console.log(`P2 ${base} · ${combos.length} combinaciones · ${rpm}/min · mínimo ${min}`);
for (let i = 0; i < combos.length; i++) {
  const c = combos[i];
  const t0 = Date.now();
  let count = null;
  for (let attempt = 0; attempt < 3 && count === null; attempt++) {
    try {
      const r = await fetch(`${base}/api/v1/search/structured`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(apiKey ? { "X-API-Key": apiKey } : {}) },
        body: JSON.stringify(c.body),
        signal: AbortSignal.timeout(20000),
      });
      if (r.status === 429) {
        console.log(`  429 en ${c.slug}: espero 60 s`);
        await sleep(60000);
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      count = typeof j.total_matches === "number" ? j.total_matches : 0;
    } catch (e) {
      console.log(`  error en ${c.slug} (${attempt + 1}/3): ${e.message}`);
      await sleep(2000);
    }
  }
  if (count === null) {
    fails++;
    continue;
  }
  entries.push({ slug: c.slug, count });
  process.stdout.write(`  ${String(i + 1).padStart(3)}/${combos.length} ${c.slug} → ${count}${count >= min ? "" : " (bajo el mínimo)"}\n`);
  const wait = gap - (Date.now() - t0);
  if (wait > 0 && i < combos.length - 1) await sleep(wait);
}

const published = entries.filter((e) => e.count >= min);
const file = {
  generated_at: new Date().toISOString(),
  base,
  min_listings: min,
  total_candidates: combos.length,
  published: published.length,
  entries: entries.sort((a, b) => b.count - a.count),
};
writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`, "utf8");
console.log(`\n${published.length} páginas con ≥ ${min} avisos (de ${entries.length} contadas, ${fails} fallidas) → ${path.relative(root, out)}`);
process.exit(fails ? 1 : 0);
