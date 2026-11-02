import "server-only";

import { InvestQuota, quotaConfig } from "./invest-quota";

/**
 * Lado servidor del análisis de inversión (02/11 —
 * `docs/DECISION_2026-11-02_analisis-inversion.md`): interruptor, cupos y
 * caché de respuestas. Todo en memoria del proceso.
 */

/** `INVEST_ANALYSIS_ENABLED=0|false|off` apaga el canal: Invertir funciona como hasta ahora. */
export function investEnabled(): boolean {
  const raw = process.env.INVEST_ANALYSIS_ENABLED?.trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "off" || raw === "no");
}

/* ---------------- cupos ---------------- */

declare global {
  // Un solo cupo y una sola caché por proceso: en dev, Turbopack recompila el
  // módulo y perdería el estado; en producción el global es inocuo.
  var __pfInvestQuota: InvestQuota | undefined;
  var __pfInvestCache: Map<string, CacheEntry> | undefined;
}

export const investQuota: InvestQuota = globalThis.__pfInvestQuota ?? (globalThis.__pfInvestQuota = new InvestQuota(quotaConfig()));

/** IP del cliente detrás del edge (Railway/Cloudflare mandan `x-forwarded-for`). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0].trim();
  return fwd || req.headers.get("x-real-ip")?.trim() || "local";
}

/* ---------------- caché por consulta ---------------- */

interface CacheEntry {
  text: string;
  at: number;
}

const cache: Map<string, CacheEntry> = globalThis.__pfInvestCache ?? (globalThis.__pfInvestCache = new Map());
const CACHE_MAX = 200;

function cacheTtlMs(): number {
  const raw = process.env.INVEST_CACHE_TTL_MIN?.trim();
  const n = raw === undefined || raw === "" ? 15 : Number(raw);
  return Number.isFinite(n) && n > 0 ? n * 60_000 : 0;
}

/** Consulta normalizada: recargas, back/forward y links compartidos no vuelven a pagar. */
export function investCacheKey(query: string): string {
  return query
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/[\s.,;:!?¿¡]+$/g, "")
    .trim();
}

export function investCacheGet(key: string, now = Date.now()): string | null {
  const ttl = cacheTtlMs();
  if (!ttl) return null;
  const hit = cache.get(key);
  if (!hit) return null;
  if (now - hit.at > ttl) {
    cache.delete(key);
    return null;
  }
  return hit.text;
}

/**
 * Guarda SOLO respuestas completas: `skip`, o `done` con `partial: false`. Un
 * error, un corte o un parcial se vuelven a pedir la próxima vez.
 */
export function investCacheSet(key: string, text: string, now = Date.now()): void {
  if (!cacheTtlMs() || !isCacheable(text)) return;
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { text, at: now });
}

/** Último bloque del SSE (ya normalizado a LF): `{event, data}`. */
export function lastSseBlock(text: string): { event: string; data: string } | null {
  const blocks = text.split("\n\n").filter((b) => b.trim());
  const block = blocks[blocks.length - 1];
  if (!block) return null;
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  return { event, data: data.join("\n") };
}

export function firstSseEvent(text: string): string | null {
  const m = /^event:\s*(\S+)/m.exec(text);
  return m ? m[1] : null;
}

function isCacheable(text: string): boolean {
  const last = lastSseBlock(text);
  if (!last) return false;
  if (last.event === "skip") return true;
  if (last.event !== "done") return false;
  try {
    return (JSON.parse(last.data) as { partial?: boolean }).partial !== true;
  } catch {
    return false;
  }
}
