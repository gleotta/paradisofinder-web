/**
 * Cliente de P2 (FINDER Core) — SOLO servidor (topología A, spec §0).
 * El browser jamás llama a P2: estas funciones se usan desde route handlers
 * y server components. `X-API-Key` sale de variables de entorno del server.
 *
 * Modos (P2_MODE): auto (default) | live | mock.
 *  - auto: usa P2 si hay P2_BASE_URL; ante fallo de CONEXIÓN cae a mocks con warning.
 *  - live: solo P2. — mock: siempre mocks.
 */
import "server-only";

import type {
  MapSearchRequest,
  MapSearchResponse,
  PropertyDetailResponse,
  SearchTextResponse,
  SessionResponse,
  StreamRequest,
  StructuredParams,
  StructuredResponse,
  TrackEventBody,
} from "./types";
import {
  mockCreateSession,
  mockGetProperty,
  mockSearchMap,
  mockSearchStream,
  mockSearchStructured,
  mockSearchText,
} from "./mocks";

export class P2Error extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "P2Error";
  }
}

type Mode = "auto" | "live" | "mock";

function mode(): Mode {
  const m = (process.env.P2_MODE ?? "auto").toLowerCase();
  if (m === "live" || m === "mock") return m;
  return "auto";
}

function baseUrl(): string | null {
  const url = process.env.P2_BASE_URL?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

function mocksEnabled(): boolean {
  const m = mode();
  if (m === "mock") return true;
  if (m === "auto" && !baseUrl()) return true;
  return false;
}

/** Errores de red (P2 apagado) — distintos de errores HTTP, que se propagan siempre. */
function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const cause = (err as { cause?: { code?: string } }).cause;
  return (
    err.name === "TypeError" ||
    cause?.code === "ECONNREFUSED" ||
    cause?.code === "ENOTFOUND" ||
    cause?.code === "ECONNRESET" ||
    cause?.code === "ETIMEDOUT"
  );
}

let warnedFallback = false;
function warnFallback(err: unknown) {
  if (!warnedFallback) {
    warnedFallback = true;
    console.warn(
      `[p2] No pude conectar con P2 en ${baseUrl()} — sirviendo mocks de /mocks. (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

async function p2Fetch(path: string, init: RequestInit): Promise<Response> {
  const url = `${baseUrl()}/api/v1${path}`;
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const apiKey = process.env.P2_API_KEY;
  if (apiKey) headers.set("X-API-Key", apiKey);
  return fetch(url, { ...init, headers, cache: "no-store" });
}

async function readError(res: Response): Promise<P2Error> {
  let message = `P2 respondió ${res.status}`;
  try {
    const body = (await res.json()) as { detail?: unknown; message?: unknown };
    const detail = body.detail ?? body.message;
    if (typeof detail === "string") message = detail;
    else if (detail) message = JSON.stringify(detail);
  } catch {
    /* cuerpo no-JSON: dejamos el mensaje genérico */
  }
  return new P2Error(res.status, message);
}

async function p2Json<T>(path: string, body: unknown, fallback: () => Promise<T>): Promise<T> {
  if (mocksEnabled()) return fallback();
  try {
    const res = await p2Fetch(path, { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) throw await readError(res);
    return (await res.json()) as T;
  } catch (err) {
    if (mode() === "auto" && isConnectionError(err)) {
      warnFallback(err);
      return fallback();
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Búsqueda del portal (stateless) — spec §2                           */
/* ------------------------------------------------------------------ */

export function searchText(query: string, limit = 10, offset = 0): Promise<SearchTextResponse> {
  return p2Json("/search/text", { query, limit, offset }, () => mockSearchText(query, limit, offset));
}

export function searchStructured(params: StructuredParams): Promise<StructuredResponse> {
  return p2Json("/search/structured", params, () => mockSearchStructured(params));
}

/**
 * Mapa (P2 2026-08-29): criterio → TODOS los pins mapeables (tier >= 2 con
 * coordenadas), sin tope ni paginación. El body va tal cual: el schema es
 * extra="forbid", así que el filtrado de campos ocurre en `toMapRequest()`.
 */
export function searchMap(body: MapSearchRequest): Promise<MapSearchResponse> {
  return p2Json("/search/map", body, () => mockSearchMap(body));
}

/* ------------------------------------------------------------------ */
/* Conversacional — spec §3                                            */
/* ------------------------------------------------------------------ */

export function createSession(): Promise<SessionResponse> {
  return p2Json("/sessions", {}, mockCreateSession);
}

/**
 * Devuelve la Response SSE de P2 (o del mock) para reenviar el body al browser.
 * Sirve para el turno (`{session_id, query}`) y para la paginación
 * (`{session_id, offset}` sin `query`: cards → done, sin narrativa).
 * En SSE los errores de negocio llegan como `event: error` (HTTP 200);
 * un HTTP != 200 acá es error de transporte/sesión (p. ej. 404 sesión expirada).
 */
export async function searchStream(body: StreamRequest): Promise<Response> {
  if (mocksEnabled()) {
    const res = mockSearchStream(body);
    if (!res.ok) throw await readError(res);
    return res;
  }
  try {
    const res = await p2Fetch("/search/stream", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { Accept: "text/event-stream" },
    });
    if (!res.ok) throw await readError(res);
    return res;
  } catch (err) {
    if (mode() === "auto" && isConnectionError(err)) {
      warnFallback(err);
      return mockSearchStream(body);
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Detalle y eventos — spec §4                                         */
/* ------------------------------------------------------------------ */

export async function getProperty(id: string): Promise<PropertyDetailResponse | null> {
  if (mocksEnabled()) return mockGetProperty(id);
  try {
    const res = await p2Fetch(`/property/${encodeURIComponent(id)}`, { method: "GET" });
    if (res.status === 404) return null;
    if (!res.ok) throw await readError(res);
    return (await res.json()) as PropertyDetailResponse;
  } catch (err) {
    if (mode() === "auto" && isConnectionError(err)) {
      warnFallback(err);
      return mockGetProperty(id);
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Health (deploy) — GET /api/health de P1                            */
/* ------------------------------------------------------------------ */

export function p2Mode(): Mode {
  return mode();
}

/** Host de P2 sin credenciales, para el diagnóstico del healthcheck. */
export function p2Target(): string | null {
  const url = baseUrl();
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Sonda corta a GET /api/v1/health de P2; jamás lanza. */
export async function p2Health(): Promise<{ status: "ok" | "down" | "mock"; http?: number; detail?: string }> {
  if (mocksEnabled()) return { status: "mock" };
  try {
    const res = await fetch(`${baseUrl()}/api/v1/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok ? { status: "ok", http: res.status } : { status: "down", http: res.status };
  } catch (err) {
    return { status: "down", detail: err instanceof Error ? err.message : String(err) };
  }
}

const warnedEvents = new Set<string>();

/** Fire-and-forget: la observabilidad jamás rompe la experiencia. */
export function postEvent(body: TrackEventBody): void {
  if (mocksEnabled()) return;
  p2Fetch("/events", { method: "POST", body: JSON.stringify(body) })
    .then((res) => {
      // Un rechazo (422 = fuera del enum o session_id no-UUID) se avisa UNA vez
      // por tipo: hasta el 05/09 P2 rechazaba todo y el silencio lo tapaba.
      if (!res.ok && !warnedEvents.has(body.event_type)) {
        warnedEvents.add(body.event_type);
        console.warn(`[p2] /events rechazó "${body.event_type}" con HTTP ${res.status}`);
      }
    })
    .catch(() => {
      /* fire-and-forget */
    });
}
