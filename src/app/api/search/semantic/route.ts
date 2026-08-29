import { NextResponse } from "next/server";
import { searchSemantic } from "@/lib/p2/client";
import { badRequest, errorResponse, readJsonBody } from "@/lib/api-helpers";

/**
 * Continuación "similares" (spec §2): cuando `total_matches` se agota antes del
 * tope de 30, /search/semantic aporta más cards. El dedup por ids es de P1.
 */
export async function POST(req: Request) {
  const body = await readJsonBody<{ query?: string; offset?: number; limit?: number }>(req);
  const query = body?.query?.trim();
  if (!query) return badRequest("Falta la consulta.");

  try {
    const data = await searchSemantic(query, body?.offset ?? 0, body?.limit ?? 10);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
