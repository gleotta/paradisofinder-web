/**
 * Catálogo de zonas del mercado San Juan (los 19 departamentos), espejo de
 * `master.zones` de P3 (fuente: P2 la lee de ahí; P1 no tiene endpoint de
 * catálogo — pedido en `docs/PEDIDO_P1_A_P2_2026-09-14.md`). Los datos viven
 * en `src/data/zones.json` porque también los lee `scripts/seo-catalog.mjs`.
 * Sirve para:
 *  - mostrar nombres ("santa_lucia" → "Santa Lucía": P2 manda el CÓDIGO),
 *  - el selector de zona del chip editable (T2),
 *  - los slugs de las páginas SEO zona × tipo × operación (T6).
 * Los códigos son los que acepta `zones[]` de /search/structured y /search/map.
 */

import zonesData from "@/data/zones.json";

export interface Zone {
  /** Código de `master.zones.name` — el que viaja en el contrato. */
  code: string;
  /** Nombre para mostrar (`display_name` de P3). */
  name: string;
  /** Slug de URL (sin acentos ni guiones bajos). */
  slug: string;
  /** Gran San Juan primero en los selectores. */
  macro: "gran_san_juan" | "periferia" | "alejado";
}

export const ZONES: Zone[] = zonesData as Zone[];

const BY_CODE = new Map(ZONES.map((z) => [z.code, z]));
const BY_SLUG = new Map(ZONES.map((z) => [z.slug, z]));

export function zoneByCode(code: string | null | undefined): Zone | null {
  if (!code) return null;
  return BY_CODE.get(code.trim().toLowerCase().replace(/\s+/g, "_")) ?? null;
}

export function zoneBySlug(slug: string | null | undefined): Zone | null {
  if (!slug) return null;
  return BY_SLUG.get(slug.toLowerCase()) ?? null;
}

/** Nombre visible de un código de zona; si no está en el catálogo, se capitaliza. */
export function zoneDisplay(code: string | null | undefined): string | null {
  if (!code) return null;
  const z = zoneByCode(code);
  if (z) return z.name;
  return code
    .replace(/_/g, " ")
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w.charAt(0).toLocaleUpperCase("es-AR") + w.slice(1) : w))
    .join(" ");
}
