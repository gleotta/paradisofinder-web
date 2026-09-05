import { NextResponse } from "next/server";
import { postEvent } from "@/lib/p2/client";
import type { P2EventType } from "@/lib/p2/types";
import { readJsonBody } from "@/lib/api-helpers";
import { logEvent } from "@/lib/server/event-log";
import type { ClientEvent } from "@/lib/track";
import { isUuid } from "@/lib/tracking-ids";

/**
 * Observabilidad (MVP beta, 05/09 — `docs/DECISION_2026-09-05_mvp-beta.md`):
 *  1. TODO evento queda en el log propio de P1 (`logs/events-YYYY-MM-DD.jsonl`).
 *  2. Se reenvía a POST /events de P2 (spec §4) solo lo que entra en su
 *     contrato: `event_type` de su enum cerrado y `session_id` UUID de una
 *     sesión real. Verificado 05/09 contra el Swagger vivo: cualquier otra
 *     cosa da 422 — y el fire-and-forget lo tapaba, así que hasta ese día no
 *     entraba ningún evento de P1.
 * Siempre responde 202: la analítica jamás rompe la experiencia.
 */

/** Evento de P1 → `EventType` de P2. Lo que no está acá queda solo en el log de P1. */
const P2_EVENT: Partial<Record<ClientEvent["event_type"], P2EventType>> = {
  zero_results: "empty_results",
  clarification_shown: "nivel1_shown",
  clarification_chip_selected: "refinement_applied",
  card_clicked: "card_clicked",
  property_detail_opened: "detail_viewed",
  contact_click: "outbound_click",
  source_click: "outbound_click",
};

function p2EventFor(ev: ClientEvent): P2EventType | null {
  // El turno de búsqueda ya lo registra P2 por su cuenta (`search_executed`);
  // lo que P2 no ve es que un chip/suggestion/vertical refinó DENTRO de la sesión.
  if (ev.event_type === "search_performed") {
    return ev.payload.mode === "search" ? null : "refinement_applied";
  }
  return P2_EVENT[ev.event_type] ?? null;
}

const MAX_PAYLOAD_BYTES = 8_000;

export async function POST(req: Request) {
  const body = await readJsonBody<Partial<ClientEvent>>(req);
  if (!body?.event_type || typeof body.event_type !== "string") {
    return NextResponse.json({ ok: false }, { status: 202 });
  }
  const ev: ClientEvent = {
    event_type: body.event_type,
    payload: body.payload && typeof body.payload === "object" ? body.payload : {},
    visitor_id: typeof body.visitor_id === "string" ? body.visitor_id : "anon",
    tab_id: typeof body.tab_id === "string" ? body.tab_id : "anon",
    session_id: isUuid(body.session_id) ? body.session_id : null,
    search_id: typeof body.search_id === "string" ? body.search_id.slice(0, 48) : null,
    page: typeof body.page === "string" ? body.page.slice(0, 200) : "",
    ts: typeof body.ts === "string" ? body.ts : "",
  };
  if (JSON.stringify(ev.payload).length > MAX_PAYLOAD_BYTES) {
    ev.payload = { truncated: true };
  }

  await logEvent({
    ts: new Date().toISOString(),
    event: ev.event_type,
    visitor_id: ev.visitor_id,
    tab_id: ev.tab_id,
    session_id: ev.session_id,
    search_id: ev.search_id,
    page: ev.page || null,
    payload: ev.payload,
    client_ts: ev.ts || null,
    ua: req.headers.get("user-agent")?.slice(0, 200) ?? null,
  });

  const p2Type = p2EventFor(ev);
  if (p2Type && ev.session_id) {
    postEvent({
      session_id: ev.session_id,
      event_type: p2Type,
      payload: { ...ev.payload, p1_event: ev.event_type, search_id: ev.search_id, visitor_id: ev.visitor_id },
    });
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}
