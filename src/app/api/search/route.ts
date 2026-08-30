import { NextResponse } from "next/server";
import { searchText } from "@/lib/p2/client";
import { badRequest, errorResponse, readJsonBody } from "@/lib/api-helpers";

/**
 * Consulta del portal (stateless): POST /search/text de P2. Desde el 29/08
 * también pagina (`offset`) y la última página trae `related` (spec §2).
 */
export async function POST(req: Request) {
  const body = await readJsonBody<{ query?: string; limit?: number; offset?: number }>(req);
  const query = body?.query?.trim();
  if (!query) return badRequest("Falta la consulta.");

  try {
    const data = await searchText(query, body?.limit ?? 10, body?.offset ?? 0);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
