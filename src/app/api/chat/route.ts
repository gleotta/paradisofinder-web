import { searchStream } from "@/lib/p2/client";
import type { StreamRequest } from "@/lib/p2/types";
import { badRequest, errorResponse, readJsonBody } from "@/lib/api-helpers";

/**
 * Canal conversacional (spec §3): reenvía el SSE de POST /search/stream de P2
 * al browser sin tocarlo. Orden de eventos: cards → response_chunk(×N) →
 * done | clarification | error. Los errores de negocio viajan DENTRO del stream
 * (HTTP 200); un HTTP != 200 acá es transporte o sesión expirada (404 → el
 * cliente crea sesión nueva y reintenta).
 */
export async function POST(req: Request) {
  const body = await readJsonBody<StreamRequest>(req);
  if (!body?.session_id || !body?.query?.trim()) {
    return badRequest("Faltan session_id o query.");
  }

  try {
    const upstream = await searchStream({
      session_id: body.session_id,
      query: body.query,
      ...(body.vertical_override ? { vertical_override: body.vertical_override } : {}),
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
