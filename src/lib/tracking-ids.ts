/**
 * Identificadores de correlación de la analítica (MVP beta, 05/09 — ver
 * `docs/DECISION_2026-09-05_mvp-beta.md`). Módulo SIN "use client": lo usan
 * tanto el browser (`track.ts`) como los server components (la página de
 * detalle valida el `?s=` que hereda del listado).
 *
 *  - `search_id` = `<session_id de P2>.<turno>`: UNA corrida de búsqueda. La
 *    sesión de P2 acumula chips de clarificación, `suggestions` y cambios de
 *    vertical como turnos, así que la sesión sola no distingue consultas.
 *    Del `search_id` se recupera la sesión (para correlacionar con los eventos
 *    que P2 registra por su cuenta) sin viajar dos parámetros.
 *  - El detalle abre en pestaña nueva (decisión 05/09): el link lleva
 *    `?s=<search_id>&r=<rank>` para que la pestaña herede el contexto y el
 *    análisis pueda unir consulta → resultados → qué se abrió.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEARCH_ID_RE = /^([0-9a-f-]{36})\.(\d{1,4})$/i;

export type CardOrigin = "list" | "related" | "map" | "comparable";

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function isSearchId(v: unknown): v is string {
  return typeof v === "string" && SEARCH_ID_RE.test(v);
}

export function searchIdFor(sessionId: string, turn: number): string {
  return `${sessionId}.${turn}`;
}

/** Sesión de P2 embebida en el `search_id`; null si no es un id válido. */
export function sessionFromSearchId(searchId: string | null | undefined): string | null {
  if (!searchId) return null;
  const m = SEARCH_ID_RE.exec(searchId);
  return m && isUuid(m[1]) ? m[1] : null;
}

export function isCardOrigin(v: unknown): v is CardOrigin {
  return v === "list" || v === "related" || v === "map" || v === "comparable";
}

/** URL del detalle con el contexto de búsqueda que la pestaña nueva hereda. */
export function detailHref(
  id: string,
  ctx?: { searchId?: string | null; rank?: number | null; from?: CardOrigin },
): string {
  const params = new URLSearchParams();
  if (ctx?.searchId) params.set("s", ctx.searchId);
  if (ctx?.rank != null) params.set("r", String(ctx.rank));
  if (ctx?.from && ctx.from !== "list") params.set("from", ctx.from);
  const qs = params.toString();
  return `/propiedad/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`;
}
