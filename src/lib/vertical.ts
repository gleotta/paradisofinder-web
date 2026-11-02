/**
 * Selector de vertical (Alquilar · Comprar · Invertir · Lotes) — decisión de
 * German del 01/09, ver `docs/DECISION_2026-09-01_selector-vertical.md`;
 * Lotes agregado el 14/09 (`docs/DECISION_2026-09-14_qa-produccion.md`, T5)
 * cuando P2 expuso la vertical `land`.
 *
 * La regla de producto 2 manda: **lo que escribe el usuario predomina** sobre
 * el botón. Cómo se aplica sin violarla (todo verificado contra P2 real):
 *  - La selección viaja como FRASE CANÓNICA anexada a la query, nunca como
 *    `vertical_override` (con `query` en sesión nueva el override PISA el
 *    texto entero: pierde zona y tipo). La composición vive en el route
 *    handler de /api/search/stream, que primero sondea la extracción
 *    determinística del texto crudo: si el texto ya fija alquiler/temporario/
 *    lotes, va crudo y el texto gana.
 *  - Después de cada búsqueda el botón se RE-SINCRONIZA con lo que P2
 *    realmente buscó (`summary` del evento `cards`), y esa re-sincronización
 *    actualiza la preferencia guardada.
 *
 * "Invertir" ES la vertical de inversión de P2 (German, 02/11): en sesión va
 * como `vertical_override: "investment"` (sondeado 02/11: `summary.vertical`
 * "Compra para inversión", orden por puntaje de oportunidad de inversión con
 * el componente "Rentabilidad estimada", el mismo criterio de los picks del
 * análisis y del MCP); en sesión NUEVA el server siembra el criterio del
 * texto con `POST /search` sync y recién después manda el override por el
 * stream (`prepareTurn`): con `query` en sesión nueva el override pisa el
 * texto. Ningún texto llega solo a `investment` ("para invertir" queda en
 * Compra): la vertical de inversión se elige con el selector, nunca por el texto.
 */

import type { Summary } from "./p2/types";

export type VerticalId = "alquilar" | "comprar" | "invertir" | "lotes";

export const VERTICALS: { id: VerticalId; label: string }[] = [
  { id: "alquilar", label: "Alquilar" },
  { id: "comprar", label: "Comprar" },
  { id: "invertir", label: "Invertir" },
  { id: "lotes", label: "Lotes" },
];

export function isVerticalId(v: unknown): v is VerticalId {
  return v === "alquilar" || v === "comprar" || v === "invertir" || v === "lotes";
}

/**
 * Frase canónica que el server anexa AL FINAL de la query cuando corresponde.
 * El final es seguro: el extractor de P2 prioriza compra sobre alquiler sin
 * importar la posición ("casa en venta…, para alquilar" → Compra), así que un
 * texto que dice comprar/venta nunca pierde contra la frase de Alquilar.
 * "lotes en venta" verificado 14/09: "en Santa Lucía hasta 30 mil dólares,
 * lotes en venta" → `vertical: land` con zona y presupuesto intactos.
 */
export const VERTICAL_PHRASE: Record<Exclude<VerticalId, "invertir">, string> = {
  alquilar: "para alquilar",
  comprar: "para comprar",
  // Invertir no va por frase (02/11): ver `prepareTurn` en el server.
  lotes: "lotes en venta",
};

/**
 * Valor de `vertical_override` (spec §3) para resolver el click del selector
 * DENTRO de una sesión con resultados (preserva el criterio acumulado).
 * Invertir = `investment` (02/11); `invertir` en P2 cae en compra.
 */
export const VERTICAL_OVERRIDE: Record<VerticalId, string> = {
  alquilar: "alquilar",
  comprar: "comprar",
  invertir: "investment",
  lotes: "lotes",
};

/**
 * Mapea lo que P2 buscó al id del selector. Primero por el CÓDIGO del filtro
 * duro `vertical` (`summary.hard_filters`, contrato 13/09: `sale`, `rent`,
 * `investment`, `land`, `temporary_rent`), que es estable; sin él, por la
 * etiqueta (texto de P2: "Compra", "Compra para inversión", "Alquiler",
 * "Lotes…"). null = sin equivalente (p. ej. "Alquiler temporario"): el
 * selector queda sin selección para no mentir, y la preferencia guardada no se
 * toca.
 *
 * Desde el 02/11 Invertir es la vertical `investment` de P2: una Compra
 * ordenada por rentabilidad ("ordenadas por renta" en Comprar) sigue siendo
 * Comprar (German: distinto es cuando la búsqueda es para alquilar o comprar).
 */
const VERTICAL_BY_CODE: Record<string, VerticalId | null> = {
  sale: "comprar",
  investment: "invertir",
  rent: "alquilar",
  land: "lotes",
  temporary_rent: null,
};

export function verticalFromSummary(s: Pick<Summary, "vertical" | "hard_filters"> | null | undefined): VerticalId | null {
  const code = s?.hard_filters?.find((f) => f.field === "vertical")?.value;
  if (typeof code === "string" && code in VERTICAL_BY_CODE) return VERTICAL_BY_CODE[code];
  const label = s?.vertical?.trim().toLowerCase() ?? "";
  if (/lote|terreno/.test(label)) return "lotes";
  if (label === "alquiler") return "alquilar";
  if (/^compra para inversi/.test(label)) return "invertir";
  if (label === "compra") return "comprar";
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
