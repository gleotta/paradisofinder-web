import { NextResponse } from "next/server";
import { searchStructured } from "@/lib/p2/client";
import type { StructuredParams } from "@/lib/p2/types";
import { badRequest, errorResponse, readJsonBody } from "@/lib/api-helpers";

/**
 * Scroll infinito (spec §2): páginas 2 y 3 con los `extraction.params` guardados
 * de /search/text + offset/limit. Orden determinístico en P2 → sin solapes.
 */
export async function POST(req: Request) {
  const params = await readJsonBody<StructuredParams>(req);
  if (!params || typeof params !== "object") return badRequest("Faltan los parámetros de búsqueda.");

  try {
    const data = await searchStructured(params);
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
