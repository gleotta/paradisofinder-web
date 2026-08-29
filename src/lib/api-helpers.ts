import "server-only";

import { NextResponse } from "next/server";
import { P2Error } from "./p2/client";

/**
 * Mapeo de errores de P2 → respuesta al browser, según spec §6.
 * 502/503 traen mensaje EXPLÍCITO de P2 y se muestran tal cual;
 * 500 llega sanitizado y se presenta genérico; 422 es un bug y se loguea.
 */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof P2Error) {
    switch (err.status) {
      case 401:
        console.error("[p2] 401 — API key faltante o inválida: revisar P2_API_KEY");
        return NextResponse.json(
          { error: "Error de configuración del servidor. Avisale al equipo." },
          { status: 500 },
        );
      case 404:
        return NextResponse.json({ error: err.message }, { status: 404 });
      case 422:
        console.error(`[p2] 422 — params inválidos (bug de P1): ${err.message}`);
        return NextResponse.json(
          { error: "No pude procesar esa consulta. Probá reformularla." },
          { status: 422 },
        );
      case 429:
        return NextResponse.json(
          { error: "Estamos recibiendo muchas consultas. Esperá unos segundos y probá de nuevo." },
          { status: 429 },
        );
      case 502:
      case 503:
        // Mensajes explícitos de P2 ("LLM no disponible: …"): mostrar + invitar retry.
        return NextResponse.json({ error: err.message }, { status: err.status });
      default:
        console.error(`[p2] ${err.status} — ${err.message}`);
        return NextResponse.json(
          { error: "Error interno. Probá de nuevo en un momento." },
          { status: err.status >= 400 && err.status < 600 ? err.status : 500 },
        );
    }
  }
  console.error("[api] error inesperado:", err);
  return NextResponse.json({ error: "Error interno. Probá de nuevo en un momento." }, { status: 500 });
}

export async function readJsonBody<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}
