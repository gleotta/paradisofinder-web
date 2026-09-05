#!/usr/bin/env node
/**
 * paradisofinder.com — P1: smoke de un P1 desplegado. Uno solo para los tres
 * destinos — el Docker local (:3000), el artefacto en verificación (:3002) y
 * el stage de Railway —; lo que cambia va por entorno.
 *
 *   node scripts/ci/smoke.mjs http://localhost:3000
 *
 * Entorno:
 *   SMOKE_DEADLINE        segundos que se reintenta el health antes de rendirse
 *                         (Railway buildea y toma tráfico de a poco). 0 = un intento.
 *   SMOKE_EXPECT_VERSION  sha corto (7) que /api/health tiene que reportar como
 *                         `version` (Railway inyecta RAILWAY_GIT_COMMIT_SHA; el
 *                         artefacto local recibe APP_VERSION). Ata el smoke AL
 *                         COMMIT: mientras Railway sigue sirviendo el deploy
 *                         anterior, el health contesta la versión vieja y se
 *                         sigue esperando. Vacío = no se ata.
 *   SMOKE_QUERY           consulta real (default "casas en rawson").
 *   SMOKE_P2_BASE_URL     P2 contra el que cruzar total_matches (sin /api/v1).
 *                         Vacío = sin cruce (se avisa).
 *   SMOKE_P2_API_KEY      X-API-Key de ese P2 (si tiene auth).
 *
 * La vara (handoff de P2, 05/09): un smoke que solo mire HTTP 200 deja un
 * stage sirviendo mocks en verde. Acá se cae explícito si
 *   - P2_MODE no es `live` (auto = degradación silenciosa posible; mock = demo),
 *   - P1 no llega a P2 (`/api/health?deep=1`),
 *   - la búsqueda real por el canal de la UI (sesión + SSE) no trae cards, o
 *     trae las de /mocks,
 *   - total_matches de P1 ≠ total_matches de P2 para la misma consulta.
 */

const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!base) {
  console.error("uso: node scripts/ci/smoke.mjs <url-base-de-P1>");
  process.exit(2);
}

const DEADLINE_S = Number(process.env.SMOKE_DEADLINE || 0);
const EXPECT = (process.env.SMOKE_EXPECT_VERSION || "").trim();
const QUERY = process.env.SMOKE_QUERY || "casas en rawson";
const P2 = (process.env.SMOKE_P2_BASE_URL || "").replace(/\/$/, "");
const P2_KEY = process.env.SMOKE_P2_API_KEY || "";
/* ids de /mocks/search-text-response.json: si la búsqueda devuelve SOLO estos, son mocks */
const MOCK_IDS = new Set(["sj-000123", "sj-000456", "ext-7702", "ext-9911"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (msg) => console.log(`  ✓ ${msg}`);
function fail(msg) {
  console.log(`FAIL: ${msg}`);
  process.exit(1);
}
function errName(e) {
  if (e?.name === "TimeoutError") return "timeout";
  return e?.cause?.code ?? e?.name ?? String(e);
}
async function getJson(path, timeoutMs = 10_000) {
  const r = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  return { status: r.status, body: r.ok ? await r.json() : null, headers: r.headers };
}

/* ---- 1. health, con reintentos hasta el deadline (y atado a la versión) ---- */
const deadline = Date.now() + DEADLINE_S * 1000;
let health = null;
let last = "";
let lastPrinted = "";
for (;;) {
  try {
    const { status, body } = await getJson("/api/health");
    if (status === 200 && body?.ok === true) {
      if (!EXPECT || body.version === EXPECT) {
        health = body;
        break;
      }
      last = `sirve la versión ${body.version} (se espera ${EXPECT})`;
    } else {
      last = status === 200 ? `ok=${body?.ok}` : `HTTP ${status}`;
    }
  } catch (e) {
    last = errName(e);
  }
  if (last !== lastPrinted) {
    console.log(`  … /api/health: ${last}${DEADLINE_S ? " — esperando" : ""}`);
    lastPrinted = last;
  }
  if (Date.now() >= deadline) break;
  await sleep(10_000);
}
if (!health) {
  fail(
    `/api/health no contestó como se esperaba (${last}).` +
      (EXPECT && /versión/.test(last)
        ? " Si Railway no inyecta RAILWAY_GIT_COMMIT_SHA, CD_STAGE_PIN_VERSION=0."
        : ""),
  );
}
ok(`health: version=${health.version} p2_mode=${health.p2_mode} p2_target=${health.p2_target ?? "—"}`);

/* ---- 2. sin degradación silenciosa ---- */
if (health.p2_mode !== "live") {
  fail(
    `P2_MODE=${health.p2_mode}: con "auto" un fallo de red cae a mocks en silencio y con "mock" es demo. ` +
      `Tiene que ser "live" (ya viene en el Dockerfile; revisar overrides).`,
  );
}
if (!health.p2_target) fail("P2_BASE_URL vacío: P1 no tiene a quién llamar.");
ok("P2_MODE=live (sin mocks posibles)");

const deep = await getJson("/api/health?deep=1");
if (deep.body?.p2?.status !== "ok") {
  fail(`P1 no llega a P2 (${health.p2_target}): ${JSON.stringify(deep.body?.p2 ?? deep.status)}`);
}
ok(`P1 → P2 (${health.p2_target}): ok`);

/* ---- 3. la home responde con el hardening puesto (proxy.ts en standalone) ---- */
{
  const r = await fetch(`${base}/`, { signal: AbortSignal.timeout(20_000), redirect: "manual" });
  if (r.status !== 200) fail(`GET / → HTTP ${r.status}`);
  const csp = r.headers.get("content-security-policy") ?? "";
  if (!csp.includes("'nonce-")) fail(`GET / sin Content-Security-Policy con nonce (src/proxy.ts no corrió): "${csp.slice(0, 80)}"`);
  ok("GET / → 200 con CSP (nonce)");
}

/* ---- 4. búsqueda real por el canal de la UI: sesión nueva + SSE ---- */
let session;
{
  const r = await fetch(`${base}/api/sessions`, { method: "POST", signal: AbortSignal.timeout(30_000) });
  const body = r.ok ? await r.json() : null;
  session = body?.session_id;
  if (!session) fail(`POST /api/sessions → HTTP ${r.status} ${JSON.stringify(body)}`);
  if (!/^[0-9a-f-]{36}$/i.test(session)) fail(`session_id no es UUID: ${session}`);
}

const events = [];
let cards = null;
let terminal = null;
let errorMsg = null;
{
  const r = await fetch(`${base}/api/search/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ session_id: session, query: QUERY, limit: 3 }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await r.json());
    } catch {
      /* sin cuerpo JSON */
    }
    fail(`POST /api/search/stream → HTTP ${r.status} ${detail}`);
  }
  // Parser SSE tolerante a CRLF (P2 real emite \r\n; ver src/lib/sse.ts).
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const onBlock = (block) => {
    let event = "message";
    const data = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (!data.length) return;
    events.push(event);
    const raw = data.join("\n");
    if (event === "cards") {
      try {
        cards = JSON.parse(raw);
      } catch {
        fail("el evento cards no es JSON");
      }
    } else if (event === "error") {
      terminal = event;
      try {
        errorMsg = JSON.parse(raw)?.message ?? raw;
      } catch {
        errorMsg = raw;
      }
    } else if (event === "done" || event === "clarification") {
      terminal = event;
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (block.trim()) onBlock(block);
    }
  }
  if (buffer.trim()) onBlock(buffer.replace(/\r\n/g, "\n"));
}

const resumen = Object.entries(
  events.reduce((acc, e) => ((acc[e] = (acc[e] ?? 0) + 1), acc), {}),
)
  .map(([e, n]) => (n > 1 ? `${e}×${n}` : e))
  .join(", ");

if (terminal === "error") fail(`el stream terminó en error: ${errorMsg} (eventos: ${resumen})`);
if (terminal === "clarification") fail(`"${QUERY}" pidió clarificación: elegí otra SMOKE_QUERY (eventos: ${resumen})`);
if (!cards) fail(`el stream no trajo el evento cards (eventos: ${resumen || "ninguno"})`);
if (!Array.isArray(cards.cards) || cards.cards.length === 0) {
  fail(`"${QUERY}" devolvió 0 cards (total_matches=${cards.total_matches}); eventos: ${resumen}`);
}
if (!(cards.total_matches > 0)) fail(`total_matches inválido: ${cards.total_matches}`);
if (cards.cards.every((c) => MOCK_IDS.has(c.id))) {
  fail("las cards son las de /mocks: P1 está sirviendo datos de demo, no P2");
}
if (terminal !== "done") fail(`el stream no cerró con done (eventos: ${resumen})`);
ok(`"${QUERY}": ${cards.cards.length} cards de ${cards.total_matches} coincidencias · SSE: ${resumen}`);

/* ---- 5. cruce con P2: mismos números para la misma consulta ---- */
if (P2) {
  let r;
  try {
    r = await fetch(`${P2}/api/v1/search/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(P2_KEY ? { "X-API-Key": P2_KEY } : {}) },
      body: JSON.stringify({ query: QUERY, limit: 1 }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    fail(`no se pudo cruzar con P2 (${P2}): ${errName(e)}`);
  }
  if (r.status === 401) fail(`P2 (${P2}) → 401: SMOKE_P2_API_KEY no sirve para ese P2`);
  if (!r.ok) fail(`P2 (${P2}) /search/text → HTTP ${r.status}`);
  const p2Total = (await r.json())?.result?.total_matches;
  if (p2Total !== cards.total_matches) {
    fail(
      `total_matches distinto: P1 dice ${cards.total_matches}, P2 (${P2}) dice ${p2Total}. ` +
        `P1 no está hablando con ese P2 (revisar P2_BASE_URL) o sirve mocks.`,
    );
  }
  ok(`P2 (${P2}) coincide: ${p2Total} coincidencias`);
} else {
  console.log("  (sin SMOKE_P2_BASE_URL: no se cruzó total_matches con P2)");
}

console.log("smoke P1: OK");
