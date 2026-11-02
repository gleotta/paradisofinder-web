import { NextResponse } from "next/server";
import { P2Error, readError, searchInvest } from "@/lib/p2/client";
import type { InvestDoneEvent, InvestSkipEvent } from "@/lib/p2/types";
import { badRequest, errorResponse, readJsonBody } from "@/lib/api-helpers";
import { logEvent } from "@/lib/server/event-log";
import {
  clientIp,
  firstSseEvent,
  investCacheGet,
  investCacheKey,
  investCacheSet,
  investEnabled,
  investQuota,
  lastSseBlock,
} from "@/lib/server/invest";
import { isUuid } from "@/lib/tracking-ids";

/**
 * Análisis de inversión (02/11 — `docs/DECISION_2026-11-02_analisis-inversion.md`;
 * contrato de P2 en `docs/HANDOFF_P2_INVEST_2026-11-01.md` §3): reenvía el SSE
 * de `POST /search/invest` de P2 al browser sin tocarlo, como /api/search/stream.
 * Topología A: el browser jamás habla con P2.
 *
 * Solo lo llama la vista de resultados en Invertir, en PARALELO al stream de
 * siempre (regla del flujo, German 01/11): el análisis nunca bloquea cards,
 * mapa, chips ni scroll. P2 decide si tiene algo que agregar (`skip` en ~1,5 s
 * para una pregunta simple).
 *
 * Lo que agrega P1 acá:
 *  - interruptor `INVEST_ANALYSIS_ENABLED` (apagado → 204: Invertir como siempre);
 *  - cupos por visitante/IP y tope diario (`src/lib/server/invest-quota.ts`):
 *    superados → 429 con `code` y `Retry-After`, sin tocar a P2; un `skip` se
 *    devuelve al cupo;
 *  - caché por consulta normalizada (`INVEST_CACHE_TTL_MIN`, 15 min): la misma
 *    pregunta recargada o compartida no vuelve a pagar;
 *  - `X-Visitor-Id` a P2 para que su freno por minuto sea por visitante;
 *  - desconexión: el body de la respuesta es el de P2 pasado por un transform;
 *    si el browser cierra, el pipe cancela el fetch y P2 cancela búsquedas y
 *    LLM (verificado 02/11 con el log de P2: `cancelled: true`, `write_called:
 *    false`);
 *  - una línea en el log de eventos de P1 por análisis terminado (costo y
 *    `usage` de P2): el libro de gastos no depende de que el browser mande su
 *    evento.
 *
 * Respuestas: 200 SSE (incluye `skip` y los `error` de negocio de P2, como el
 * stream) · 204 canal apagado o P2 sin el endpoint (Railway hasta el deploy
 * de P2) · 429 cupo (P1 o P2) · 4xx/5xx de transporte como el resto.
 */

const MAX_QUERY = 500;
const VISITOR_ID = /^[A-Za-z0-9_-]{1,64}$/;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

let warnedMissing = false;

interface Body {
  query?: string;
  session_id?: string | null;
  visitor_id?: string | null;
}

function quota429(code: string, message: string, retryAfterS: number | null): NextResponse {
  return NextResponse.json(
    { error: message, code, retry_after: retryAfterS },
    { status: 429, headers: retryAfterS != null ? { "Retry-After": String(retryAfterS) } : undefined },
  );
}

/** 429 de P2: por minuto (`{error}`), concurrencia (`busy`) o tope diario (`daily_cap`), con `Retry-After`. */
async function forwardP2Quota(res: Response): Promise<NextResponse> {
  let code = "p2_rate_limit";
  let message = "El análisis de inversión no está disponible ahora. Probá de nuevo en un minuto.";
  try {
    const body = (await res.json()) as { error?: string; detail?: { code?: string; message?: string } | string };
    const detailCode = typeof body.detail === "object" && body.detail ? body.detail.code : undefined;
    if (detailCode === "busy") {
      code = "p2_busy";
      message = "Hay varios análisis en curso. Probá de nuevo en unos segundos.";
    } else if (detailCode === "daily_cap") {
      code = "p2_daily_cap";
      message = "Se alcanzó el máximo de análisis de inversión por hoy. Mañana vuelve a estar disponible.";
    }
  } catch {
    /* cuerpo no JSON: mensaje genérico */
  }
  const retryHeader = res.headers.get("retry-after");
  const retryAfterS = retryHeader && /^\d+$/.test(retryHeader) ? Number(retryHeader) : code === "p2_rate_limit" ? 60 : null;
  return quota429(code, message, retryAfterS);
}

export async function POST(req: Request) {
  if (!investEnabled()) return new Response(null, { status: 204, headers: { "X-Invest": "disabled" } });

  const body = await readJsonBody<Body>(req);
  const query = body?.query?.trim().slice(0, MAX_QUERY);
  if (!query) return badRequest("Falta query.");
  const sessionId = isUuid(body?.session_id) ? body!.session_id! : null;
  const visitorId = typeof body?.visitor_id === "string" && VISITOR_ID.test(body.visitor_id) ? body.visitor_id : null;
  const ip = clientIp(req);
  const key = investCacheKey(query);

  const cached = investCacheGet(key);
  if (cached) {
    return new Response(cached, { status: 200, headers: { ...SSE_HEADERS, "X-Invest-Cache": "hit" } });
  }

  const quota = investQuota.take([visitorId ? `v:${visitorId}` : null, `ip:${ip}`].filter((k): k is string => !!k));
  if (!quota.ok) {
    return quota429(
      quota.code,
      quota.code === "quota_daily"
        ? "Se alcanzó el máximo de análisis de inversión por hoy. Mañana vuelve a estar disponible."
        : "Alcanzaste el máximo de análisis por ahora. Probá de nuevo en unos minutos.",
      quota.retryAfterS,
    );
  }
  const refund = () => investQuota.refund(quota.token);

  let upstream: Response;
  try {
    upstream = await searchInvest(
      { query, vertical: "invertir", session_id: sessionId },
      // Sin id de visitante, la IP: que el freno de P2 nunca caiga al balde global.
      { visitorId: visitorId ?? `ip-${ip.replace(/[^A-Za-z0-9]/g, "-")}`, signal: req.signal },
    );
  } catch (err) {
    refund();
    if (req.signal.aborted) return new Response(null, { status: 499 });
    return errorResponse(err);
  }

  if (upstream.status === 429) {
    refund();
    return forwardP2Quota(upstream);
  }
  if (upstream.status === 404) {
    // El P2 de este entorno todavía no tiene el endpoint (Railway hasta su
    // próximo deploy): sin panel, sin error visible. Se avisa una vez.
    refund();
    await upstream.body?.cancel().catch(() => {});
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn("[invest] P2 respondió 404 a /search/invest: el análisis de inversión queda apagado hasta que P2 lo despliegue.");
    }
    return new Response(null, { status: 204, headers: { "X-Invest": "unavailable" } });
  }
  if (!upstream.ok || !upstream.body) {
    refund();
    return errorResponse(upstream.ok ? new P2Error(502, "P2 respondió sin cuerpo") : await readError(upstream));
  }

  // Tee de lectura: lo que pasa al browser se acumula para (a) devolver el cupo
  // si fue `skip`, (b) cachear la respuesta completa y (c) asentar el costo.
  // Si el browser se va, el pipe se cancela y `flush` no corre: nada se cachea.
  const chunks: Uint8Array[] = [];
  const t0 = Date.now();
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      chunks.push(chunk);
      controller.enqueue(chunk);
    },
    flush() {
      const raw = new TextDecoder().decode(concat(chunks)).replace(/\r\n/g, "\n");
      const first = firstSseEvent(raw);
      if (first === "skip") refund();
      investCacheSet(key, raw);
      void ledger(raw, { query, sessionId, visitorId, ip, ms: Date.now() - t0 });
    },
  });

  return new Response(upstream.body.pipeThrough(transform), {
    status: 200,
    headers: { ...SSE_HEADERS, "X-Invest-Cache": "miss" },
  });
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Línea `invest_analysis_server` en el log de P1: el libro de gastos del análisis, del lado del server. */
async function ledger(
  raw: string,
  ctx: { query: string; sessionId: string | null; visitorId: string | null; ip: string; ms: number },
): Promise<void> {
  const last = lastSseBlock(raw);
  if (!last) return;
  let payload: Record<string, unknown> = { outcome: last.event, ms: ctx.ms };
  try {
    if (last.event === "done") {
      const d = JSON.parse(last.data) as InvestDoneEvent;
      payload = {
        ...payload,
        analysis_id: d.analysis_id,
        question_type: d.question_type,
        partial: d.partial,
        latency_ms: d.latency_ms,
        latency_detail_ms: d.latency_detail_ms ?? null,
        model: d.model,
        usage: d.usage,
        cost_usd: d.cost_usd,
        narrative: d.narrative,
        steps: d.steps?.map((s) => ({ index: s.index, label: s.label, status: s.status, total_matches: s.total_matches, with_yield: s.with_yield ?? null })),
      };
    } else if (last.event === "skip") {
      const s = JSON.parse(last.data) as InvestSkipEvent;
      payload = { ...payload, analysis_id: s.analysis_id, reason: s.reason };
    } else if (last.event === "error") {
      payload = { ...payload, error: JSON.parse(last.data) as unknown };
    }
  } catch {
    /* un bloque ilegible no tumba el log */
  }
  await logEvent({
    ts: new Date().toISOString(),
    event: "invest_analysis_server",
    visitor_id: ctx.visitorId,
    tab_id: null,
    session_id: ctx.sessionId,
    search_id: null,
    vertical: "invertir",
    query: ctx.query.slice(0, 300),
    page: "/api/invest/analysis",
    payload: { ...payload, ip: ctx.ip },
    client_ts: null,
    ua: null,
  });
}
