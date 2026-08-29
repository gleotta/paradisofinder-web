import { NextResponse } from "next/server";
import { searchText } from "@/lib/p2/client";
import { badRequest, errorResponse, readJsonBody } from "@/lib/api-helpers";

/**
 * Primera consulta del portal (stateless): POST /search/text de P2, limit=10
 * (paginación 10 × 3, tope 30 — prompt-inicial §Flujo).
 */
export async function POST(req: Request) {
  const body = await readJsonBody<{ query?: string; limit?: number }>(req);
  const query = body?.query?.trim();
  if (!query) return badRequest("Falta la consulta.");

  try {
    const data = await searchText(query, body?.limit ?? 10);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
