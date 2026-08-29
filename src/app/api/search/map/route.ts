import { NextResponse } from "next/server";
import { searchMap } from "@/lib/p2/client";
import type { MapSearchRequest } from "@/lib/p2/types";
import { badRequest, errorResponse, readJsonBody } from "@/lib/api-helpers";

/**
 * Mapa (spec `docs/P2_PEDIDO_SEARCH_MAP.md`, implementado por P2 el 29/08):
 * criterio → TODOS los pins mapeables. El body ya viene filtrado por
 * `toMapRequest()` del cliente; acá solo se valida que traiga algo válido,
 * porque el schema de P2 es extra="forbid" (cualquier campo de más → 422).
 */
export async function POST(req: Request) {
  const body = await readJsonBody<MapSearchRequest>(req);
  if (!body || typeof body !== "object") return badRequest("Falta el criterio del mapa.");

  try {
    const data = await searchMap(body);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
