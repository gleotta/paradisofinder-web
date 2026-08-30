import { searchStream } from "@/lib/p2/client";
import type { StreamRequest } from "@/lib/p2/types";
import { badRequest, errorResponse, readJsonBody } from "@/lib/api-helpers";

/**
 * Canal de búsqueda con streaming (spec §3): reenvía el SSE de
 * `POST /search/stream` de P2 al browser sin tocarlo.
 *
 * Orden de eventos: cards → response_chunk(×N) → done | clarification | error.
 * Las cards llegan primero (~20 ms), así que el listado se pinta al instante y
 * el resumen en prosa se escribe encima mientras tanto.
 *
 * Paginación (2026-08-29): `{session_id, offset, limit?}` SIN `query` re-consulta
 * el criterio acumulado de la sesión — no es un turno, no pasa por el LLM, y el
 * SSE emite cards → done sin response_chunk. La última página trae `related`.
 *
 * NO es un chat: P1 abre una sesión NUEVA por búsqueda, así cada consulta es
 * independiente (ver `docs/DECISION_2026-08-29_busqueda-simple.md`). La sesión
 * solo vive para resolver esa búsqueda: chips de clarificación
 * (`vertical_override`), `suggestions` y el scroll se responden dentro de ella.
 *
 * Los errores de negocio viajan DENTRO del stream (HTTP 200); un HTTP != 200
 * acá es transporte o sesión expirada (404 → el cliente abre otra y reintenta).
 */
export async function POST(req: Request) {
  const body = await readJsonBody<StreamRequest>(req);
  const query = body?.query?.trim();
  if (!body?.session_id || (!query && typeof body.offset !== "number")) {
    return badRequest("Faltan session_id y query (turno) u offset (paginación).");
  }

  try {
    const upstream = await searchStream({
      session_id: body.session_id,
      ...(query ? { query } : {}),
      ...(body.vertical_override ? { vertical_override: body.vertical_override } : {}),
      ...(typeof body.limit === "number" ? { limit: body.limit } : {}),
      ...(typeof body.offset === "number" ? { offset: body.offset } : {}),
    });

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // Evita buffering de proxies intermedios sobre el stream.
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
