import { NextResponse } from "next/server";
import { p2Health, p2Mode, p2Target } from "@/lib/p2/client";

/**
 * Healthcheck de P1 (Railway lo consulta al deployar — `railway.json`).
 * Siempre 200 si el server responde: la salud de P2 NO tumba a P1 (si P2 cae,
 * la UI ya lo muestra como error explícito). Con `?deep=1` sondea
 * GET /api/v1/health de P2 (timeout corto) para el smoke test post-deploy.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  const body = {
    ok: true,
    service: "paradisofinder-web",
    version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.APP_VERSION ?? "dev",
    p2_mode: p2Mode(),
    p2_target: p2Target(),
    ...(deep ? { p2: await p2Health() } : {}),
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
