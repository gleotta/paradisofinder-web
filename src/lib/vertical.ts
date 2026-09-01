/**
 * Selector de vertical (Alquilar · Comprar · Invertir) — decisión de German
 * del 01/09, ver `docs/DECISION_2026-09-01_selector-vertical.md`.
 *
 * La regla de producto 2 manda: **lo que escribe el usuario predomina** sobre
 * el botón. Cómo se aplica sin violarla (todo verificado contra P2 real):
 *  - La selección viaja como FRASE CANÓNICA anexada a la query, nunca como
 *    `vertical_override` (con `query` en sesión nueva el override PISA el
 *    texto entero: pierde zona y tipo). La composición vive en el route
 *    handler de /api/search/stream, que primero sondea la extracción
 *    determinística del texto crudo: si el texto ya fija alquiler/temporario,
 *    va crudo y el texto gana.
 *  - Después de cada búsqueda el botón se RE-SINCRONIZA con lo que P2
 *    realmente buscó (`summary` del evento `cards`), y esa re-sincronización
 *    actualiza la preferencia guardada.
 *
 * "Invertir" hoy es Compra ordenada por rentabilidad (la frase del chip
 * "Para renta"): el vertical `investment` de la spec no es alcanzable ni por
 * texto ni por override (sondeado 01/09; reportado a P2).
 */

import type { Summary } from "./p2/types";

export type VerticalId = "alquilar" | "comprar" | "invertir";

export const VERTICALS: { id: VerticalId; label: string }[] = [
  { id: "alquilar", label: "Alquilar" },
  { id: "comprar", label: "Comprar" },
  { id: "invertir", label: "Invertir" },
];

export function isVerticalId(v: unknown): v is VerticalId {
  return v === "alquilar" || v === "comprar" || v === "invertir";
}

/**
 * Frase canónica que el server anexa AL FINAL de la query cuando corresponde.
 * El final es seguro: el extractor de P2 prioriza compra sobre alquiler sin
 * importar la posición ("casa en venta…, para alquilar" → Compra), así que un
 * texto que dice comprar/venta nunca pierde contra la frase de Alquilar.
 */
export const VERTICAL_PHRASE: Record<VerticalId, string> = {
  alquilar: "para alquilar",
  comprar: "para comprar",
  // La frase del chip "Para renta": único camino real a "invertir" hoy
  // (compra + orden por rentabilidad).
  invertir: "para invertir y alquilar, ordenadas por renta",
};

/**
 * Mapea lo que P2 buscó (etiquetas del `summary`, contrato público spec §3)
 * al id del selector. null = sin equivalente (p. ej. "Alquiler temporario"):
 * el selector queda sin selección para no mentir, y la preferencia guardada
 * no se toca.
 */
export function verticalFromSummary(
  s: Pick<Summary, "vertical" | "order"> | null | undefined,
): VerticalId | null {
  const label = s?.vertical?.trim().toLowerCase();
  if (label === "alquiler") return "alquilar";
  if (label === "compra") {
    return s?.order?.trim().toLowerCase() === "rentabilidad" ? "invertir" : "comprar";
  }
  return null;
}

/* ------------------- preferencia (solo browser) ------------------- */

const STORAGE_KEY = "pf_vertical";

/** Preferencia guardada; null = nunca eligió (o storage inaccesible). */
export function readStoredVertical(): VerticalId | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isVerticalId(v) ? v : null;
  } catch {
    return null;
  }
}

export function storeVertical(v: VerticalId | null): void {
  try {
    if (v) window.localStorage.setItem(STORAGE_KEY, v);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* preferencia perdida, jamás romper la búsqueda */
  }
}

/**
 * Para `useSyncExternalStore`: la preferencia es estado externo (localStorage)
 * y así se lee sin mismatch de hidratación ni setState en efectos. El evento
 * `storage` solo dispara en OTRAS pestañas — en la propia, el estado local
 * del componente pisa el snapshot.
 */
export function subscribeVertical(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
