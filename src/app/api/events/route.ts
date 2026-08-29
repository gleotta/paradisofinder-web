import { NextResponse } from "next/server";
import { postEvent } from "@/lib/p2/client";
import type { TrackEventBody } from "@/lib/p2/types";
import { readJsonBody } from "@/lib/api-helpers";

/**
 * Observabilidad (spec §4): reenvía a POST /events de P2, fire-and-forget.
 * Siempre responde 202: la analítica jamás rompe la experiencia.
 */
export async function POST(req: Request) {
  const body = await readJsonBody<TrackEventBody>(req);
  if (body?.event_type) {
    postEvent({
      session_id: body.session_id ?? "p1-anon",
      event_type: body.event_type,
      payload: body.payload ?? {},
    });
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}
