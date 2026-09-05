"use client";

/**
 * Observabilidad de P1 (MVP beta, 05/09 — `docs/DECISION_2026-09-05_mvp-beta.md`).
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
 * Nada de esto puede romper ni demorar la UI.
 */

import type { Card } from "@/lib/p2/types";
import { sessionFromSearchId, type CardOrigin } from "./tracking-ids";

export { detailHref, searchIdFor, sessionFromSearchId, type CardOrigin } from "./tracking-ids";

export const EVENTS = {
  SEARCH: "search_performed",
  /** Las cards del turno: total, scores y ranking — el "resultado" de la consulta. */
  SEARCH_RESULTS: "search_results",
  SEARCH_ERROR: "search_error",
  ZERO_RESULTS: "zero_results",
  CLARIFICATION_SHOWN: "clarification_shown",
  CLARIFICATION_CHIP: "clarification_chip_selected",
  OPPORTUNITY_CHIP: "opportunity_chip_toggled",
  VERTICAL_SELECTED: "vertical_selected",
  VERTICAL_RESYNC: "vertical_resynced",
  EXAMPLE_CLICK: "example_query_clicked",
  PAGE_LOADED: "results_page_loaded",
  RELATED_SHOWN: "related_shown",
  /** Click en una card (listado, similares, popup del mapa o comparable). */
  CARD_CLICK: "card_clicked",
  DETAIL_OPENED: "property_detail_opened",
  CONTACT_CLICK: "contact_click",
  SOURCE_CLICK: "source_click",
  /** Botón "Publicá tu propiedad" (WhatsApp para inmobiliarias/dueños). */
  PUBLISH_CONTACT: "publish_contact_click",
  MAP_TOGGLED: "map_toggled",
  MAP_MARKER_CLICK: "map_marker_click",
  MAP_FEED: "map_feed_loaded",
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
  page: string;
  ts: string;
}

let sessionId: string | null = null;
let searchId: string | null = null;

/** Búsqueda en curso: sesión de P2 + id de la corrida (turno). */
export function setTrackingSearch(session: string | null, search: string | null) {
  sessionId = session;
  searchId = search;
}

/** La pestaña de detalle hereda el contexto del `?s=` del link. */
export function adoptTrackingSearch(search: string | null) {
  setTrackingSearch(sessionFromSearchId(search), search);
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
    score: card.opportunity_score,
    from,
  });
}
