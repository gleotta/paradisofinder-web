import { NextResponse } from "next/server";
import { createSession } from "@/lib/p2/client";
import { errorResponse } from "@/lib/api-helpers";

/** Crea la sesión conversacional (TTL 24 h) para el canal SSE — spec §3. */
export async function POST() {
  try {
    const data = await createSession();
    return NextResponse.json(data);
  } catch (err) {
    return errorResponse(err);
  }
}
