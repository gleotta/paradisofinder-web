import { NextResponse } from "next/server";
import { searchSync } from "@/lib/p2/client";
import type { StreamRequest } from "@/lib/p2/types";
import { badRequest, errorResponse, readJsonBody } from "@/lib/api-helpers";
import { composeQuery } from "@/lib/server/compose-query";
import { isVerticalId } from "@/lib/vertical";

/**
 * Fallback sync de la búsqueda (T1, 14/09): cuando el stream lleva 4 s sin
 * `cards`, el botón "Buscar con filtros" manda la misma consulta por
 * `POST /search` de P2 (sin narrativa LLM, resumen template). Usa la misma
 * sesión, así el criterio queda acumulado y el scroll/mapa siguen por sesión.
 * Un 404 (sesión vencida) se devuelve tal cual: el cliente abre otra y reintenta.
 * La composición del vertical es la misma que en el canal SSE.
 */
export async function POST(req: Request) {
  const body = await readJsonBody<StreamRequest & { vertical?: string }>(req);
  let query = body?.query?.trim();
  if (!body?.session_id || !query) return badRequest("Faltan session_id y query.");
  if (isVerticalId(body.vertical) && !body.vertical_override) {
    query = await composeQuery(query, body.vertical);
  }
  try {
    const data = await searchSync({
      session_id: body.session_id,
      query,
      ...(body.vertical_override ? { vertical_override: body.vertical_override } : {}),
      limit: typeof body.limit === "number" ? body.limit : 20,
      offset: 0,
    });
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
