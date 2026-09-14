import "server-only";

import { unstable_cache } from "next/cache";
import catalog from "@/data/seo-catalog.json";
import { searchStructured } from "./p2/client";
import type { Card, StructuredParams } from "./p2/types";
import { ZONES, zoneBySlug, type Zone } from "./zones";

/**
 * SEO técnico (T6, 14/09 — `docs/DECISION_2026-09-14_qa-produccion.md`):
 * páginas por combinación zona × tipo × operación, p. ej.
 * `/departamentos-en-alquiler-en-capital-san-juan`.
 *
 * Qué combinaciones existen lo dice `src/data/seo-catalog.json`, generado
 * OFFLINE por `scripts/seo-catalog.mjs` contra P2 (una consulta estructurada
 * por combinación, al ritmo que permite el rate limit de búsqueda de P2:
 * 30/min). Solo entran las que tienen ≥ MIN_LISTINGS avisos vivos al momento
 * de generarlo. Cada página, al servirse, pide a P2 sus 12 cards y el conteo
 * REAL (`total_matches`), cacheados 1 h (`unstable_cache`): la lista de páginas
 * es estable (sitemap), el contenido se refresca solo.
 */

export const MIN_LISTINGS = 5;
export const LANDING_CARDS = 12;

export interface LandingType {
  slug: "departamentos" | "casas" | "lotes" | "propiedades";
  label: string;
  singular: string;
  property_type: "apartment" | "house" | null;
  /** Los lotes son una vertical propia de P2 (`land`), no un tipo dentro de venta. */
  vertical?: "land";
}

export interface LandingOp {
  slug: "venta" | "alquiler";
  vertical: "sale" | "rent";
  label: string;
  /** Cómo lo dice un usuario (para el buscador precargado). */
  phrase: string;
}

export const LANDING_TYPES: LandingType[] = [
  { slug: "departamentos", label: "Departamentos", singular: "departamento", property_type: "apartment" },
  { slug: "casas", label: "Casas", singular: "casa", property_type: "house" },
  { slug: "lotes", label: "Lotes", singular: "lote", property_type: null, vertical: "land" },
  // Todas las tipologías de vivienda de la vertical (sin `property_type`).
  { slug: "propiedades", label: "Propiedades", singular: "propiedad", property_type: null },
];

export const LANDING_OPS: LandingOp[] = [
  { slug: "venta", vertical: "sale", label: "en venta", phrase: "en venta" },
  { slug: "alquiler", vertical: "rent", label: "en alquiler", phrase: "para alquilar" },
];

export interface LandingCombo {
  type: LandingType;
  op: LandingOp;
  zone: Zone;
}

export function comboSlug(c: LandingCombo): string {
  return `${c.type.slug}-en-${c.op.slug}-en-${c.zone.slug}-san-juan`;
}

const SLUG_RE = /^(departamentos|casas|lotes|propiedades)-en-(venta|alquiler)-en-([a-z0-9-]+)-san-juan$/;

export function parseSlug(slug: string): LandingCombo | null {
  const m = SLUG_RE.exec(slug);
  if (!m) return null;
  const type = LANDING_TYPES.find((t) => t.slug === m[1]);
  const op = LANDING_OPS.find((o) => o.slug === m[2]);
  const zone = zoneBySlug(m[3]);
  if (!type || !op || !zone) return null;
  // Lotes: solo venta.
  if (type.vertical === "land" && op.slug !== "venta") return null;
  return { type, op, zone };
}

/** Todas las combinaciones candidatas (los lotes solo en venta). */
export function allCombos(): LandingCombo[] {
  const out: LandingCombo[] = [];
  for (const type of LANDING_TYPES) {
    for (const op of LANDING_OPS) {
      if (type.vertical === "land" && op.slug !== "venta") continue;
      for (const zone of ZONES) out.push({ type, op, zone });
    }
  }
  return out;
}

export interface CatalogEntry {
  slug: string;
  count: number;
}

interface CatalogFile {
  generated_at: string;
  base: string;
  min_listings: number;
  entries: CatalogEntry[];
}

/** Combinaciones publicadas: las del catálogo con ≥ MIN_LISTINGS avisos. */
export function catalogEntries(): CatalogEntry[] {
  const file = catalog as CatalogFile;
  return file.entries.filter((e) => e.count >= MIN_LISTINGS && parseSlug(e.slug) !== null);
}

export function catalogGeneratedAt(): string {
  return (catalog as CatalogFile).generated_at;
}

export function isPublishedSlug(slug: string): boolean {
  return catalogEntries().some((e) => e.slug === slug);
}

/** Título humano: "Departamentos en alquiler en Capital, San Juan". */
export function comboTitle(c: LandingCombo): string {
  return `${c.type.label} ${c.op.label} en ${c.zone.name}, San Juan`;
}

/** Consulta con la que se precarga el buscador (lenguaje del usuario, P2 la entiende). */
export function comboQuery(c: LandingCombo): string {
  if (c.type.vertical === "land") return `lotes en ${c.zone.name}`;
  if (c.type.slug === "propiedades") return `${c.op.phrase} en ${c.zone.name}`.replace(/^para /, "para ").replace(/^en venta/, "propiedades en venta");
  return `${c.type.slug} ${c.op.phrase} en ${c.zone.name}`;
}

export function comboParams(c: LandingCombo, limit = LANDING_CARDS): StructuredParams {
  if (c.type.vertical === "land") {
    return { vertical: "land", zones: [c.zone.code], order: "opportunity_score", limit, offset: 0 };
  }
  return {
    vertical: c.op.vertical,
    zones: [c.zone.code],
    ...(c.type.property_type ? { property_type: c.type.property_type } : {}),
    order: "opportunity_score",
    limit,
    offset: 0,
  };
}

export interface LandingData {
  total: number;
  cards: Card[];
  fetched_at: string;
}

async function fetchLanding(slug: string): Promise<LandingData | null> {
  const combo = parseSlug(slug);
  if (!combo) return null;
  const res = await searchStructured(comboParams(combo));
  return { total: res.total_matches, cards: res.cards, fetched_at: new Date().toISOString() };
}

/**
 * Cards + conteo real de una combinación, cacheados 6 h por slug (después,
 * revalidación en segundo plano). Un fallo de P2 (429 del rate limit de
 * 30/min si un crawler pide muchas landings frías, 5xx) NO se cachea ni tira
 * la página: `getLandingSafe` devuelve null y la página cae al conteo del
 * catálogo. Después de un deploy conviene precalentar: `npm run seo:warm`.
 */
const cachedLanding = unstable_cache(fetchLanding, ["seo-landing-v1"], { revalidate: 21600, tags: ["seo"] });

export async function getLanding(slug: string): Promise<LandingData | null> {
  try {
    return await cachedLanding(slug);
  } catch (err) {
    console.warn(`[seo] landing ${slug}: P2 no respondió (${err instanceof Error ? err.message : String(err)}); se sirve con el conteo del catálogo`);
    return null;
  }
}

/** Otras páginas para enlazar desde una landing: misma búsqueda en otras zonas, otros tipos en la misma zona. */
export function relatedCombos(c: LandingCombo): { sameSearch: LandingCombo[]; sameZone: LandingCombo[] } {
  const published = new Set(catalogEntries().map((e) => e.slug));
  const all = allCombos().filter((x) => published.has(comboSlug(x)));
  return {
    sameSearch: all.filter((x) => x.type.slug === c.type.slug && x.op.slug === c.op.slug && x.zone.code !== c.zone.code),
    sameZone: all.filter((x) => x.zone.code === c.zone.code && !(x.type.slug === c.type.slug && x.op.slug === c.op.slug)),
  };
}
