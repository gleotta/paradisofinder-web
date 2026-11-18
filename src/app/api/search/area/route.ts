import { NextResponse } from "next/server";
import { searchArea } from "@/lib/p2/client";
import type { Bbox } from "@/lib/p2/types";
import { badRequest, errorResponse, readJsonBody } from "@/lib/api-helpers";
import { clientIp } from "@/lib/server/invest";
import { isUuid } from "@/lib/tracking-ids";

/**
 * Búsqueda por área (German, 18/11): el listado sigue al mapa. El navegador
 * manda la sesión y el rectángulo visible; P2 (`POST /search/area`) resuelve el
 * criterio de la sesión SIN el lugar y devuelve las cards de ese rectángulo.
 *
 * `visitor_id` viaja a P2 como `X-Visitor-Id`: es la clave de su cupo para esta
 * ruta (P2 solo ve la IP de este server). Sin id, se arma uno con la IP.
 */

const VISITOR_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_LIMIT = 30;

interface Body {
  session_id?: string;
  bbox?: unknown;
  offset?: number;
  limit?: number;
  visitor_id?: string | null;
}

/** [sur, oeste, norte, este] en grados, con sur < norte y oeste < este. */
function parseBbox(v: unknown): Bbox | null {
  if (!Array.isArray(v) || v.length !== 4 || !v.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const [south, west, north, east] = v as number[];
  if (south < -90 || north > 90 || west < -180 || east > 180 || south >= north || west >= east) return null;
  return [south, west, north, east];
}

export async function POST(req: Request) {
  const body = await readJsonBody<Body>(req);
  if (!isUuid(body?.session_id)) return badRequest("Manca la sessione della ricerca.");
  const bbox = parseBbox(body?.bbox);
  if (!bbox) return badRequest("Il riquadro della mappa non è valido.");
  const offset = Number.isInteger(body?.offset) && body!.offset! >= 0 ? body!.offset! : 0;
  const limit = Number.isInteger(body?.limit) && body!.limit! >= 1 ? Math.min(body!.limit!, MAX_LIMIT) : 10;
  const visitorId =
    typeof body?.visitor_id === "string" && VISITOR_ID.test(body.visitor_id)
      ? body.visitor_id
      : `ip-${clientIp(req).replace(/[^A-Za-z0-9]/g, "-")}`.slice(0, 64);

  try {
    const data = await searchArea({ session_id: body!.session_id!, bbox, offset, limit }, { visitorId, signal: req.signal });
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
