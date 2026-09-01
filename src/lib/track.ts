"use client";

/**
 * Observabilidad (CLAUDE.md / prompt-inicial): TODA interacción emite eventos a
 * POST /events de P2, fire-and-forget, vía el proxy /api/events (topología A).
 * Nada de esto puede romper ni demorar la UI.
 */

export const EVENTS = {
  SEARCH: "search_performed",
  ZERO_RESULTS: "zero_results",
  CLARIFICATION_SHOWN: "clarification_shown",
  CLARIFICATION_CHIP: "clarification_chip_selected",
  OPPORTUNITY_CHIP: "opportunity_chip_toggled",
  VERTICAL_SELECTED: "vertical_selected",
  VERTICAL_RESYNC: "vertical_resynced",
  EXAMPLE_CLICK: "example_query_clicked",
  PAGE_LOADED: "results_page_loaded",
  RELATED_SHOWN: "related_shown",
  DETAIL_OPENED: "property_detail_opened",
  CONTACT_CLICK: "contact_click",
  SOURCE_CLICK: "source_click",
  MAP_TOGGLED: "map_toggled",
  MAP_MARKER_CLICK: "map_marker_click",
  MAP_FEED: "map_feed_loaded",
} as const;

export type EventType = (typeof EVENTS)[keyof typeof EVENTS];

let chatSessionId: string | null = null;

/** Cuando existe sesión conversacional real, los eventos se correlacionan con ella. */
export function setTrackingSession(sessionId: string | null) {
  chatSessionId = sessionId;
}

function anonymousId(): string {
  try {
    const KEY = "pf_track_sid";
    let id = window.sessionStorage.getItem(KEY);
    if (!id) {
      id = `p1-${crypto.randomUUID()}`;
      window.sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "p1-anon";
  }
}

export function trackEvent(eventType: EventType, payload: Record<string, unknown> = {}): void {
  try {
    const body = JSON.stringify({
      session_id: chatSessionId ?? anonymousId(),
      event_type: eventType,
      payload,
    });
    // keepalive: sobrevive a la navegación (p. ej. apertura de detalle, click en source).
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* jamás romper la UI por analítica */
  }
}
