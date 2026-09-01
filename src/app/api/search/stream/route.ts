import { searchStream, searchText } from "@/lib/p2/client";
import type { StreamRequest } from "@/lib/p2/types";
import { badRequest, errorResponse, readJsonBody } from "@/lib/api-helpers";
import { isVerticalId, VERTICAL_PHRASE, type VerticalId } from "@/lib/vertical";

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
 *
 * Selector de vertical (01/09 — `docs/DECISION_2026-09-01_selector-vertical.md`):
 * el cliente manda `vertical` ("alquilar"|"comprar"|"invertir") junto a la
 * query CRUDA, y acá se decide si se anexa la frase canónica. Jamás se traduce
 * a `vertical_override`: con `query` en sesión nueva el override pisa el texto
 * entero (verificado 01/09 contra P2 real — pierde zona y tipo).
 */

/**
 * "Lo que escribe el usuario predomina" (regla de producto 2): antes de
 * componer se sondea la extracción determinística del texto crudo (mismo
 * extractor `fast` del turno, ~2 ms de extracción). Si el texto ya fija
 * alquiler o temporario, va crudo y el botón se re-sincroniza en el cliente.
 * Con `sale` no se distingue "lo dijo" de "lo asumió" (verificado: el meta no
 * lo trae), pero anexar es igual seguro: el extractor prioriza compra sobre
 * alquiler sin importar la posición, así que un texto con comprar/venta nunca
 * pierde contra la frase anexada. Ante cualquier fallo de la sonda, crudo.
 */
async function composeQuery(query: string, vertical: VerticalId): Promise<string> {
  try {
    const probe = await searchText(query, 1);
    const extracted = probe.extraction?.params?.vertical;
    if (extracted && extracted !== "sale") return query;
  } catch {
    return query;
  }
  return `${query}, ${VERTICAL_PHRASE[vertical]}`;
}

export async function POST(req: Request) {
  const body = await readJsonBody<StreamRequest & { vertical?: string }>(req);
  let query = body?.query?.trim();
  if (!body?.session_id || (!query && typeof body.offset !== "number")) {
    return badRequest("Faltan session_id y query (turno) u offset (paginación).");
  }

  // El override (chips de clarificación) excluye la composición: ya es una
  // respuesta explícita del usuario dentro de la sesión.
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
