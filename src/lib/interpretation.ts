/**
 * Chips de interpretación (T2, 14/09 — `docs/DECISION_2026-09-14_qa-produccion.md`).
 *
 * P2 manda en `summary.hard_filters` cada filtro DURO aplicado con su `label`
 * es-AR (se muestra tal cual). Acá vive SOLO la traducción de la acción del
 * usuario a la FRASE que P2 entiende como refinamiento dentro de la misma
 * sesión — P1 no interpreta lenguaje ni recompone la consulta:
 *  - quitar: "Quitar X" (retracción; P2 responde `assumption_note: "Quité X"`),
 *  - editar zona: "en Rawson" (reemplaza la zona),
 *  - editar presupuesto: "hasta US$ 90.000" / "desde …",
 *  - editar dormitorios: "de 3 dormitorios",
 *  - editar tipo: "departamento" / "casa" / "lote",
 *  - cambiar orden: frases validadas (ver ORDER_OPTIONS).
 * Todo verificado contra P2 real el 14/09 (sondas en la decisión). Lo que no
 * tiene frase validada no se ofrece como editable, solo como quitar.
 */

import type { HardFilter, Summary } from "./p2/types";
import { ZONES, zoneDisplay } from "./zones";

/** Acción que dispara el chip; la vista la manda a `runSearch(phrase, {keepSession})`. */
export interface ChipModel {
  key: string;
  field: string;
  label: string;
  value: unknown;
  /** Frase de retracción; null = no se puede quitar (la operación). */
  removePhrase: string | null;
  /** Editor inline disponible. */
  edit: "zone" | "budget" | "bedrooms" | "type" | "land_class" | null;
}

/** "Quitar X": vocabulario de retracción que el motor de P2 entiende (sondado 14/09). */
const REMOVE_PHRASE: Record<string, string> = {
  property_type: "Quitar el tipo",
  zones: "Quitar la zona",
  place: "Quitar el lugar",
  budget_max: "Quitar el presupuesto",
  budget_min: "Quitar el presupuesto",
  budget: "Quitar el presupuesto",
  bedrooms: "Quitar los dormitorios",
  bathrooms: "Quitar los baños",
  rooms: "Quitar los ambientes",
  pool: "Quitar pileta",
  bbq_area: "Quitar quincho",
  patio: "Quitar patio",
  furnished: "Quitar amoblado",
  parking: "Quitar cochera",
  gated_community: "Quitar barrio cerrado",
  mortgage_eligible: "Quitar apto crédito",
  elevator: "Quitar ascensor",
  area_min_sqm: "Quitar la superficie",
  is_duplex: "Quitar dúplex",
  land_class: "Quitar la clase de lote",
  land_services: "Quitar servicios",
  in_subdivision: "Quitar loteo",
  buildable: "Quitar apto construcción",
  condition: "Quitar el estado",
  near: "Quitar la cercanía",
  days_on_market: "Quitar la antigüedad",
};

function editKind(field: string): ChipModel["edit"] {
  switch (field) {
    case "zones":
      return "zone";
    case "budget_max":
    case "budget_min":
    case "budget":
      return "budget";
    case "bedrooms":
      return "bedrooms";
    case "property_type":
      return "type";
    case "land_class":
      return "land_class";
    default:
      return null;
  }
}

/**
 * Chips a partir del summary. Sin `hard_filters` (mock viejo / instancia
 * anterior al 13/09) se reconstruyen desde las etiquetas planas del summary,
 * sin acciones de edición.
 */
export function chipsFromSummary(s: Summary | null | undefined): ChipModel[] {
  if (!s) return [];
  const hard = s.hard_filters;
  if (hard && hard.length > 0) {
    // La clase "both" en lotes es "sin restricción": no es un filtro que se pueda quitar.
    return hard
      .filter((f) => !(f.field === "land_class" && f.value === "both"))
      .map((f, i) => chipFromFilter(f, i));
  }
  const out: ChipModel[] = [];
  if (s.vertical) out.push({ key: "vertical", field: "vertical", label: s.vertical, value: null, removePhrase: null, edit: null });
  if (s.property_type)
    out.push({ key: "property_type", field: "property_type", label: s.property_type, value: null, removePhrase: REMOVE_PHRASE.property_type, edit: "type" });
  if (s.zone) out.push({ key: "zones", field: "zones", label: s.zone, value: null, removePhrase: REMOVE_PHRASE.zones, edit: "zone" });
  if (s.budget) out.push({ key: "budget", field: "budget_max", label: s.budget, value: null, removePhrase: REMOVE_PHRASE.budget_max, edit: "budget" });
  return out;
}

function chipFromFilter(f: HardFilter, i: number): ChipModel {
  const field = f.field;
  return {
    key: `${field}:${i}`,
    field,
    label: f.label,
    value: f.value,
    removePhrase: field === "vertical" ? null : (REMOVE_PHRASE[field] ?? null),
    edit: editKind(field),
  };
}

/* ---------------- Editores: frase de refinamiento ---------------- */

export const ZONE_OPTIONS = ZONES.map((z) => ({ code: z.code, name: z.name, macro: z.macro }));

export function zonePhrase(code: string): string {
  return `en ${zoneDisplay(code) ?? code}`;
}

const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

export function budgetPhrase(amount: number, currency: "USD" | "ARS", kind: "max" | "min" = "max"): string {
  const money = currency === "USD" ? `US$ ${nf.format(amount)}` : `$ ${nf.format(amount)}`;
  return `${kind === "max" ? "hasta" : "desde"} ${money}`;
}

export function bedroomsPhrase(n: number): string {
  return `de ${n} dormitorios`;
}

export const TYPE_OPTIONS: { value: string; label: string; phrase: string }[] = [
  { value: "house", label: "Casa", phrase: "casa" },
  { value: "apartment", label: "Departamento", phrase: "departamento" },
  { value: "land", label: "Lote", phrase: "lote" },
];

export const LAND_CLASS_OPTIONS: { value: string; label: string; phrase: string }[] = [
  { value: "urban", label: "Urbano", phrase: "lote urbano" },
  { value: "rural", label: "Rural", phrase: "lote rural" },
];

/** Moneda y monto actuales del chip de presupuesto, para precargar el editor. */
export function budgetFromChip(chip: ChipModel): { amount: number; currency: "USD" | "ARS"; kind: "max" | "min" } {
  const kind = chip.field === "budget_min" ? "min" : "max";
  const currency: "USD" | "ARS" = /US\$|d[óo]lar/i.test(chip.label) ? "USD" : /\$|peso/i.test(chip.label) ? "ARS" : "USD";
  let amount = 0;
  if (typeof chip.value === "number") amount = chip.value;
  else if (Array.isArray(chip.value) && typeof chip.value[kind === "min" ? 0 : 1] === "number") {
    amount = chip.value[kind === "min" ? 0 : 1] as number;
  }
  return { amount, currency, kind };
}

/* ---------------- Nota de asunción ---------------- */

export interface AssumptionModel {
  text: string;
  /** Vertical al que invierte la asunción; null = nota informativa (p. ej. "Quité pileta"). */
  flipTo: "alquilar" | "comprar" | null;
  flipLabel: string | null;
}

/**
 * "Asumí compra — decime si buscás alquilar" → chip "Asumí compra · cambiar a
 * alquiler". Las notas que no son asunciones ("Quité pileta", "interpreté por
 * reglas") se muestran como nota, sin acción.
 */
export function assumptionModel(note: string | null | undefined): AssumptionModel | null {
  if (!note) return null;
  const n = note.toLowerCase();
  if (/asum/.test(n)) {
    if (/compra|venta/.test(n)) return { text: "Asumí compra", flipTo: "alquilar", flipLabel: "cambiar a alquiler" };
    if (/alquil/.test(n)) return { text: "Asumí alquiler", flipTo: "comprar", flipLabel: "cambiar a compra" };
  }
  return { text: note, flipTo: null, flipLabel: null };
}

/* ---------------- Orden ---------------- */

export interface OrderOption {
  code: string;
  label: string;
  /** Frase de refinamiento validada contra P2 (14/09). */
  phrase: string | null;
  /** Solo compra/lotes (no aplica a alquiler). */
  saleOnly?: boolean;
}

export const ORDER_OPTIONS: OrderOption[] = [
  { code: "opportunity_score", label: "Oportunidad (score)", phrase: "ordenar por score" },
  { code: "price_asc", label: "Precio: menor a mayor", phrase: "las más baratas primero" },
  { code: "price_desc", label: "Precio: mayor a menor", phrase: "de mayor a menor precio" },
  { code: "days_on_market_desc", label: "Más tiempo publicadas (para negociar)", phrase: "mucho tiempo publicada, para negociar precio" },
  { code: "valuation_gap_desc", label: "Más por debajo del precio de su zona", phrase: "las que están más por debajo del precio de su zona", saleOnly: true },
  { code: "gross_yield_desc", label: "Mayor renta estimada", phrase: "ordenadas por renta", saleOnly: true },
  // La cercanía necesita un lugar: la vista pide el texto y arma "cerca de X".
  { code: "distance_asc", label: "Cercanía a un lugar…", phrase: null },
];

export function nearPhrase(place: string): string {
  return `cerca de ${place.trim()}`;
}
