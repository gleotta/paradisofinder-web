"use client";

/**
 * Observabilidad de P1 (MVP beta, 05/09 — `docs/DECISION_2026-09-05_mvp-beta.md`;
 * embudo del 14/09 — `docs/DECISION_2026-09-14_qa-produccion.md` T7).
 *
 * Toda interacción emite un evento a POST /api/events (server de P1), que
 *  1. lo escribe en el log propio de P1 (`logs/events-YYYY-MM-DD.jsonl`, una
 *     línea JSON por evento), y
 *  2. lo reenvía a POST /events de P2 SOLO si mapea a su enum cerrado.
 *     Verificado 05/09: P2 rechaza con 422 cualquier `event_type` fuera de su
 *     lista y cualquier `session_id` que no sea UUID — hasta ese día NINGÚN
 *     evento de P1 entraba (el fire-and-forget lo tapaba).
 *
 * Correlación (lo que vuelve analizable consulta → resultados → navegación):
 *  - visitor_id: UUID en localStorage — persiste entre pestañas y visitas.
 *  - tab_id: UUID en sessionStorage — la pestaña (el detalle abre en otra).
 *  - session_id: sesión de P2 de la búsqueda (UUID); la comparten los eventos
 *    que P2 registra por su cuenta (`search_executed`, `detail_viewed`).
 *  - search_id: `<session_id>.<turno>` — una corrida de búsqueda. Viaja en el
 *    link del detalle (`?s=`) para que la pestaña nueva herede el contexto.
 *  - vertical y query de la búsqueda vigente: van en el SOBRE de cada evento
 *    (T7: "todos con session_id, vertical y posición"), no hay que repetirlos.
 * Nada de esto puede romper ni demorar la UI.
 */

import type { Card } from "@/lib/p2/types";
import { sessionFromSearchId, type CardOrigin } from "./tracking-ids";

export { detailHref, searchIdFor, sessionFromSearchId, type CardOrigin } from "./tracking-ids";

export const EVENTS = {
  /** T7: el usuario mandó una consulta (antes de la red) — la base del embudo. */
  SEARCH_SUBMITTED: "search_submitted",
  /** Turno enviado a P2 (con sesión). */
  SEARCH: "search_performed",
  /** Las cards del turno: total, scores y ranking — el "resultado" de la consulta. */
  SEARCH_RESULTS: "search_results",
  /** T7: primeras cards pintadas, con `t_first_cards` medido en el cliente. */
  CARDS_RENDERED: "cards_rendered",
  SEARCH_ERROR: "search_error",
  SEARCH_SLOW: "search_slow_wait",
  SEARCH_FALLBACK: "search_fallback_sync",
  SESSION_RETRY: "session_retried",
  ZERO_RESULTS: "zero_results",
  CLARIFICATION_SHOWN: "clarification_shown",
  /** T7: elección en una aclaración (chip de vertical o relajación `few_results`). */
  CLARIFICATION_CHOICE: "clarification_choice",
  /** Alias histórico (05/09): mismo evento que CLARIFICATION_CHOICE. */
  CLARIFICATION_CHIP: "clarification_choice",
  /** T2/T7: chips de interpretación. */
  CHIP_REMOVED: "chip_removed",
  CHIP_EDITED: "chip_edited",
  ORDER_CHANGED: "order_changed",
  ASSUMPTION_FLIPPED: "assumption_flipped",
  OPPORTUNITY_CHIP: "opportunity_chip_toggled",
  VERTICAL_SELECTED: "vertical_selected",
  VERTICAL_RESYNC: "vertical_resynced",
  EXAMPLE_CLICK: "example_query_clicked",
  PAGE_LOADED: "results_page_loaded",
  RELATED_SHOWN: "related_shown",
  /** T7: click en una card (listado, similares, popup del mapa o comparable) — antes `card_clicked`. */
  CARD_CLICK: "card_opened",
  DETAIL_OPENED: "property_detail_opened",
  /** T4: botón "Consultar" (WhatsApp/tel de la inmobiliaria o de FINDER). */
  CONTACT_CLICK: "contact_click",
  /** Link secundario "Ver aviso original". */
  SOURCE_CLICK: "source_click",
  /** 15/09: botón "Compartir" de la card o del detalle (`method`: native | copy). */
  SHARE_CLICK: "share_click",
  /** 15/09: link "Abrir en Google Maps" del mapa del detalle. */
  DETAIL_MAP_EXTERNAL: "detail_map_external_click",
  /** Botón "Publicá tu propiedad" (WhatsApp para inmobiliarias/dueños). */
  PUBLISH_CONTACT: "publish_contact_click",
  MAP_TOGGLED: "map_toggled",
  MAP_MARKER_CLICK: "map_marker_click",
  MAP_FEED: "map_feed_loaded",
  /** Página SEO zona × tipo × operación vista. */
  LANDING_VIEWED: "landing_viewed",
} as const;

export type EventType = (typeof EVENTS)[keyof typeof EVENTS];

/** Shape que recibe /api/events (server de P1). */
export interface ClientEvent {
  event_type: EventType;
  payload: Record<string, unknown>;
  visitor_id: string;
  tab_id: string;
  session_id: string | null;
  search_id: string | null;
  /** Vertical vigente del selector/summary (T7). */
  vertical: string | null;
  /** Consulta vigente (texto tal cual lo mandó el usuario). */
  query: string | null;
  page: string;
  ts: string;
}

let sessionId: string | null = null;
let searchId: string | null = null;
let currentVertical: string | null = null;
let currentQuery: string | null = null;

/** Búsqueda en curso: sesión de P2 + id de la corrida (turno) + contexto. */
export function setTrackingSearch(
  session: string | null,
  search: string | null,
  ctx?: { vertical?: string | null; query?: string | null },
) {
  sessionId = session;
  searchId = search;
  if (ctx && "vertical" in ctx) currentVertical = ctx.vertical ?? null;
  if (ctx && "query" in ctx) currentQuery = ctx.query ?? null;
}

/** Vertical vigente (el selector cambia sin búsqueda; el summary la re-sincroniza). */
export function setTrackingVertical(vertical: string | null) {
  currentVertical = vertical;
}

/** La pestaña de detalle hereda el contexto del `?s=` (y `?v=`) del link. */
export function adoptTrackingSearch(search: string | null, vertical?: string | null) {
  setTrackingSearch(sessionFromSearchId(search), search, { vertical: vertical ?? null });
}

export function currentSearchId(): string | null {
  return searchId;
}

function stableId(storage: () => Storage, key: string): string {
  try {
    const s = storage();
    let id = s.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      s.setItem(key, id);
    }
    return id;
  } catch {
    return "anon";
  }
}

const visitorId = () => stableId(() => window.localStorage, "pf_visitor");
const tabId = () => stableId(() => window.sessionStorage, "pf_tab");

export function trackEvent(eventType: EventType, payload: Record<string, unknown> = {}): void {
  try {
    const body: ClientEvent = {
      event_type: eventType,
      payload,
      visitor_id: visitorId(),
      tab_id: tabId(),
      session_id: sessionId,
      search_id: searchId,
      vertical: currentVertical,
      query: currentQuery,
      page: window.location.pathname,
      ts: new Date().toISOString(),
    };
    // keepalive: sobrevive a la navegación (apertura de detalle, click en source).
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* jamás romper la UI por analítica */
  }
}

/* ---------------- Helpers de payload (puros) ---------------- */

type CardDigestInput = Pick<Card, "id" | "opportunity_score" | "deal_rating" | "price_usd">;

/** Ranking compacto de una página: id, posición global, score y rating. */
export function cardsDigest(cards: CardDigestInput[], offset = 0) {
  return cards.map((c, i) => ({
    id: c.id,
    rank: offset + i + 1,
    score: c.opportunity_score,
    deal: c.deal_rating,
    price_usd: c.price_usd,
  }));
}

/** Resumen de los opportunity_score de la página (null = ninguna card puntuada). */
export function scoreStats(cards: Pick<Card, "opportunity_score">[]) {
  const s = cards.map((c) => c.opportunity_score).filter((x): x is number => x != null);
  if (s.length === 0) return null;
  return {
    n: s.length,
    top: Math.max(...s),
    min: Math.min(...s),
    avg: Math.round(s.reduce((a, b) => a + b, 0) / s.length),
  };
}

export function trackCardClick(card: Pick<Card, "id" | "opportunity_score">, from: CardOrigin, rank: number | null) {
  trackEvent(EVENTS.CARD_CLICK, {
    property_id: card.id,
    rank,
    position: rank,
    score: card.opportunity_score,
    from,
  });
}
