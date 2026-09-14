import { searchStream } from "@/lib/p2/client";
import type { StreamRequest } from "@/lib/p2/types";
import { badRequest, errorResponse, readJsonBody } from "@/lib/api-helpers";
import { composeQuery } from "@/lib/server/compose-query";
import { isVerticalId } from "@/lib/vertical";

/**
 * Canal de búsqueda con streaming (spec §3; contrato 13/09 §3): reenvía el SSE
 * de `POST /search/stream` de P2 al browser sin tocarlo.
 *
 * Orden de eventos: cards → [clarification NO terminal] → response_chunk(×N)
 * → done | clarification terminal | error. Las cards llegan primero (~100 ms
 * en el fast-path), así que el listado se pinta al instante y el resumen en
 * prosa se escribe encima mientras tanto.
 *
 * Paginación (2026-08-29): `{session_id, offset, limit?}` SIN `query` re-consulta
 * el criterio acumulado de la sesión — no es un turno, no pasa por el LLM, y el
 * SSE emite cards → done sin response_chunk. La última página trae `related`.
 *
 * NO es un chat: P1 abre una sesión NUEVA por búsqueda, así cada consulta es
 * independiente (ver `docs/DECISION_2026-08-29_busqueda-simple.md`). La sesión
 * solo vive para resolver esa búsqueda: chips de clarificación
 * (`vertical_override`), `suggestions`, los chips de interpretación (T2:
 * "Quitar X", "en Zona", "hasta …") y el scroll se responden dentro de ella.
 *
 * Los errores de negocio viajan DENTRO del stream (HTTP 200); un HTTP != 200
 * acá es transporte o sesión expirada (404 → el cliente abre otra y reintenta).
 *
 * Selector de vertical (01/09 — `docs/DECISION_2026-09-01_selector-vertical.md`):
 * el cliente manda `vertical` ("alquilar"|"comprar"|"invertir"|"lotes") junto
 * a la query CRUDA, y acá se decide si se anexa la frase canónica. Jamás se
 * traduce a `vertical_override`: con `query` en sesión nueva el override pisa
 * el texto entero (verificado 01/09 contra P2 real — pierde zona y tipo).
 */
export async function POST(req: Request) {
  const body = await readJsonBody<StreamRequest & { vertical?: string }>(req);
  let query = body?.query?.trim();
  if (!body?.session_id || (!query && typeof body.offset !== "number" && !body.vertical_override)) {
    return badRequest("Faltan session_id y query (turno) u offset (paginación).");
  }

  // El override (chips de clarificación / selector en sesión) excluye la
  // composición: ya es una respuesta explícita del usuario dentro de la sesión.
  if (query && isVerticalId(body.vertical) && !body.vertical_override) {
    query = await composeQuery(query, body.vertical);
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
