#!/usr/bin/env node
/**
 * QA de bajas en la fuente (16/09): ningún aviso dado de baja en
 * compraensanjuan.com puede aparecer como activo en FINDER. Mide y reporta.
 *
 * 1. Muestra: las 12 consultas A1-A10 de la batería FINDER-QA (top 20 de cada
 *    una) + offset 20/40/60 (limit 20) de A9a y A9b en la MISMA sesión.
 *    Deduplica por id y guarda cada aparición (consulta, posición, score).
 * 2. Abre `listing_url` en la fuente (User-Agent de navegador, 1-2 s entre
 *    requests, tope 400 por corrida) y clasifica delisted / contact_missing /
 *    gone / alive. Guarda el HTML de delisted y gone como evidencia.
 * 3. Abre /propiedad/<id> de los cuatro ids conocidos.
 * 4. Reporta aparte el top 10 de cada consulta.
 *
 * Calibrado contra la fuente el 16/09: "Características" llega con un guion
 * blando (U+00AD) en medio; la baja vive en `div.info-extra` como
 * `<b>Suspendido: dd/mm/aaaa</b>` / `<b>Baja: …</b>` (la fecha puede ser
 * relativa: "Ayer", "Hace 4 días"); el anunciante vacío es
 * `<p class="anunciante info">-</p>` + "Teléfono: No informa"; un aviso que
 * ya no existe redirige a `error.php?e=1`.
 *
 *   node scripts/qa-bajas-fuente.mjs http://localhost:3000 [--prev tests/reports/qa_bajas_<ts>/sample.json] [--source-used N]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const base = (args.find((a) => !a.startsWith("--") && /^https?:/.test(a)) ?? "http://localhost:3000").replace(/\/$/, "");
const prevPath = flag("--prev");
// Requests a la fuente ya gastados en esta corrida fuera del script (sondeo).
const sourceUsedBefore = Number(flag("--source-used") ?? 0);
const SOURCE_BUDGET = 400;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const QUERIES = [
  ["A1", "departamento 2 dormitorios en capital para alquilar"],
  ["A2", "casa en Rivadavia con mucho tiempo publicada, para negociar precio"],
  ["A3", "depto para alquilar cerca de la universidad por menos de 400 mil"],
  ["A4", "casa con pileta en Rivadavia hasta 120 mil dólares"],
  ["A5", "casas al menos 20% por debajo del precio de su zona"],
  ["A6", "lote en Santa Lucía para construir"],
  ["A7", "monoambiente amoblado en capital"],
  ["A8", "casa apta crédito hasta 100 mil dólares"],
  ["A9a", "casas en venta en San Juan"],
  ["A9b", "departamentos en alquiler en San Juan"],
  ["A10a", "dpto 1 dorm en trinidad barato"],
  ["A10b", "kasa en chimbas con cochera"],
];
const PAGINATED = ["A9a", "A9b"];
const OFFSETS = [20, 40, 60];
const KNOWN_IDS = [
  "6539909f-e20d-43d3-86c4-3fe137ce1506",
  "cd20b4c0-4ae2-4a0a-ad14-4933ce862050",
  "1ba57819-4ccf-48a5-ac23-188aa1b8537e",
  "37130b11-8ee1-41e1-b06b-bec08191fe06",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => sleep(1000 + Math.random() * 1000);
const started = new Date();
const stamp = started.toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "_");
const outDir = `tests/reports/qa_bajas_${stamp}`;
const htmlDir = `${outDir}/html`;
const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);

/* ------------------------------------------------------------------ */
/* 1. Muestra desde FINDER                                             */
/* ------------------------------------------------------------------ */

/** SSE de P2 (CRLF) → lista de {event, data}. */
function parseSse(raw) {
  const out = [];
  for (const block of raw.replace(/\r\n/g, "\n").split("\n\n")) {
    let event = null;
    const data = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (!event) continue;
    try {
      out.push({ event, data: JSON.parse(data.join("\n")) });
    } catch {
      out.push({ event, data: data.join("\n") });
    }
  }
  return out;
}

async function finderJson(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

async function stream(body) {
  const res = await finderJson("/api/search/stream", body);
  const events = parseSse(await res.text());
  const cards = events.find((e) => e.event === "cards")?.data ?? null;
  const terminal = events.find((e) => e.event === "clarification" || e.event === "error");
  return { cards, events: events.map((e) => e.event), terminal: terminal ? { event: terminal.event, data: terminal.data } : null };
}

// Modo offline: clasifica HTML ya descargados y sale (sin tocar FINDER ni la fuente).
//   node scripts/qa-bajas-fuente.mjs --classify-file a.html [b.html …]
if (args.includes("--classify-file")) {
  for (const file of args.filter((a) => a.endsWith(".html"))) {
    const buf = readFileSync(file);
    console.log(file, JSON.stringify(analyzeHtml(decode(buf, "text/html; charset=iso-8859-1"))));
  }
  process.exit(0);
}
mkdirSync(htmlDir, { recursive: true });

const sample = new Map(); // id → { card fields, appearances[] }
const queryRuns = [];

function addCards(qid, query, cards, offset) {
  cards.forEach((c, i) => {
    const position = offset + i + 1;
    const entry = sample.get(c.id) ?? {
      id: c.id,
      listing_url: c.listing_url,
      listing_status: c.listing_status,
      zone: c.zone,
      price: c.price,
      currency: c.currency,
      rental_period: c.rental_period,
      operation: c.operation,
      property_type: c.property_type,
      days_on_market: c.days_on_market,
      appearances: [],
    };
    entry.appearances.push({ qid, query, position, score: c.opportunity_score ?? null });
    sample.set(c.id, entry);
  });
}

for (const [qid, query] of QUERIES) {
  const { session_id } = await (await finderJson("/api/sessions")).json();
  await jitter();
  const r = await stream({ session_id, query });
  const cards = (r.cards?.cards ?? []).slice(0, 20);
  addCards(qid, query, cards, 0);
  queryRuns.push({
    qid,
    query,
    session_id,
    offset: 0,
    got: cards.length,
    total_matches: r.cards?.total_matches ?? null,
    events: r.events,
    terminal: r.terminal,
  });
  log(`${qid} "${query}": ${cards.length} cards, total_matches=${r.cards?.total_matches ?? "—"}${r.terminal ? `, ${r.terminal.event}` : ""}`);
  await jitter();

  if (PAGINATED.includes(qid)) {
    for (const offset of OFFSETS) {
      const p = await stream({ session_id, offset, limit: 20 });
      const pc = p.cards?.cards ?? [];
      addCards(qid, query, pc, offset);
      queryRuns.push({ qid, query, session_id, offset, got: pc.length, total_matches: p.cards?.total_matches ?? null, events: p.events, terminal: p.terminal });
      log(`${qid} offset ${offset}: ${pc.length} cards`);
      await jitter();
    }
  }
}

/* ------------------------------------------------------------------ */
/* 2. Clasificación en la fuente                                       */
/* ------------------------------------------------------------------ */

let sourceRequests = sourceUsedBefore;

function decode(buf, contentType) {
  const cs = /charset=([\w-]+)/i.exec(contentType ?? "")?.[1]?.toLowerCase() ?? "utf-8";
  try {
    return new TextDecoder(cs === "iso-8859-1" ? "latin1" : cs).decode(buf);
  } catch {
    return new TextDecoder("latin1").decode(buf);
  }
}

function pageText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&shy;/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&iacute;/gi, "í")
    .replace(/&eacute;/gi, "é")
    .replace(/­/g, "")
    .replace(/\s+/g, " ");
}

/** Una GET a la fuente, sin seguir redirecciones. Reintenta una vez si no carga. */
async function sourceGet(url) {
  const attempts = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (sourceRequests >= SOURCE_BUDGET) return { budget: true, attempts };
    sourceRequests++;
    try {
      const res = await fetch(url, {
        redirect: "manual",
        headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml", "accept-language": "es-AR,es;q=0.9" },
        signal: AbortSignal.timeout(30000),
      });
      const buf = Buffer.from(await res.arrayBuffer());
      const out = { status: res.status, location: res.headers.get("location"), contentType: res.headers.get("content-type"), buf, attempts };
      if (res.status >= 500 || res.status === 429) {
        attempts.push(`intento ${attempt}: HTTP ${res.status}`);
        if (attempt === 1) {
          await sleep(3000);
          continue;
        }
      }
      return out;
    } catch (err) {
      attempts.push(`intento ${attempt}: ${err.name}: ${err.message}`);
      if (attempt === 1) {
        await sleep(3000);
        continue;
      }
      return { error: true, attempts };
    } finally {
      await jitter();
    }
  }
}

const listingNumber = (url) => /\/anuncio_in\/(\d+)/.exec(url ?? "")?.[1] ?? null;

async function classify(entry) {
  const r = { fetched_at: new Date().toISOString() };
  let res = await sourceGet(entry.listing_url);
  if (res.budget) return { ...r, class: "not_checked", note: "tope de 400 requests alcanzado" };
  r.attempts = res.attempts;
  if (res.error) return { ...r, class: "not_checked", note: `no cargó tras reintentar: ${res.attempts.join(" | ")}` };
  r.http = res.status;
  let finalUrl = entry.listing_url;

  if (res.status >= 300 && res.status < 400) {
    const target = new URL(res.location ?? "/", entry.listing_url).toString();
    r.redirect_to = target;
    const follow = await sourceGet(target);
    const sameListing = listingNumber(target) && listingNumber(target) === listingNumber(entry.listing_url);
    if (follow.budget || follow.error) {
      if (!sameListing) return { ...r, class: "gone", reason: `HTTP ${res.status} → ${target} (destino no descargado)` };
      return { ...r, class: "not_checked", note: `redirección al mismo aviso sin poder descargar el destino` };
    }
    r.final_http = follow.status;
    if (!sameListing) {
      return { ...r, class: "gone", reason: `HTTP ${res.status} → ${target}`, html: follow.buf, contentType: follow.contentType };
    }
    res = follow; // mismo aviso con otro slug: se evalúa la página final
    finalUrl = target;
  }

  if (res.status !== 200) {
    return { ...r, class: "gone", reason: `HTTP ${res.status}`, html: res.buf, contentType: res.contentType };
  }

  const a = analyzeHtml(decode(res.buf, res.contentType));
  const keep = a.class === "delisted" || a.class === "gone" ? { html: res.buf, contentType: res.contentType } : {};
  return { ...r, final_url: finalUrl, ...a, ...resolveMarks(a, r.fetched_at), ...keep };
}

/** Día calendario en San Juan (UTC-3, sin horario de verano) de un instante ISO. */
function sanJuanDay(iso) {
  return new Date(Date.parse(iso) - 3 * 3600e3).toISOString().slice(0, 10);
}

/** "24/08/2026" | "Hoy" | "Ayer" | "Hace N días" → aaaa-mm-dd, contado desde el día del fetch. */
function resolveDay(value, fetchDay) {
  const v = (value ?? "").trim();
  if (!v) return null;
  const abs = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (abs) return `${abs[3]}-${abs[2]}-${abs[1]}`;
  const back = /^hoy$/i.test(v) ? 0 : /^ayer$/i.test(v) ? 1 : Number(/^hace\s+(\d+)\s+d[ií]as?$/i.exec(v)?.[1] ?? NaN);
  if (Number.isNaN(back)) return null;
  const d = new Date(`${fetchDay}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/**
 * Fecha real de la baja y su antigüedad en días (la marca más vieja manda).
 * Ventana del pedido a P3 (≤ 24 h de latencia): baja de hoy o de ayer. Con
 * granularidad de día, "ayer" puede tener más o menos de 24 h, así que se
 * tolera; lo anterior a ayer ya excede la ventana con seguridad.
 */
function resolveMarks(a, fetchedAt) {
  if (a.class !== "delisted") return {};
  const fetchDay = sanJuanDay(fetchedAt);
  const suspendido_dia = resolveDay(a.suspendido, fetchDay);
  const baja_dia = resolveDay(a.baja, fetchDay);
  const days = [suspendido_dia, baja_dia].filter(Boolean).sort();
  const dias_de_baja = days.length
    ? Math.round((Date.parse(`${fetchDay}T12:00:00Z`) - Date.parse(`${days[0]}T12:00:00Z`)) / 86400e3)
    : null;
  return { suspendido_dia, baja_dia, dias_de_baja, en_ventana_24h: dias_de_baja !== null && dias_de_baja <= 1 };
}

/** Clasifica una detail page ya descargada (HTTP 200). Pura: sin red. */
function analyzeHtml(html) {
  const text = pageText(html);

  // Baja: texto "Suspendido:"/"Baja:" + dd/mm/aaaa en cualquier parte, o la
  // línea del bloque de fechas (div.info-extra) aunque la fecha sea relativa.
  const marks = [];
  for (const m of text.matchAll(/\b(Suspendido|Baja):\s*(\d{2}\/\d{2}\/\d{4})/g)) {
    marks.push({ kind: m[1], date: m[2], where: "texto" });
  }
  const infoExtra = /class="info-extra"[\s\S]*?<\/div>/i.exec(html)?.[0] ?? "";
  for (const m of infoExtra.matchAll(/<b>\s*(Suspendido|Baja)\s*:\s*([^<]*?)\s*<\/b>/gi)) {
    const kind = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    if (!marks.some((x) => x.kind === kind && x.date === m[2])) marks.push({ kind, date: m[2], where: "info-extra" });
  }

  const hasCaracteristicas = /Características/i.test(text);
  const anuncianteVacio =
    /<p class="anunciante info[^"]*">\s*-\s*<\/p>/i.test(html) || /\bAnunciante\s+-\s/.test(text);
  const telefonoNoInforma = /Teléfono:\s*No informa/i.test(text);
  const whatsapp = /api\.whatsapp\.com\/send\?phone=\d/i.test(html);
  const tel = /href="tel:\+?\d/i.test(html);

  const r = {
    suspendido: marks.find((x) => x.kind === "Suspendido")?.date ?? null,
    baja: marks.find((x) => x.kind === "Baja")?.date ?? null,
    fecha_relativa: marks.some((x) => !/^\d{2}\/\d{2}\/\d{4}$/.test(x.date)),
    has_caracteristicas: hasCaracteristicas,
    anunciante_vacio: anuncianteVacio,
    telefono_no_informa: telefonoNoInforma,
    whatsapp,
    tel,
  };
  if (marks.length) return { ...r, class: "delisted", reason: marks.map((x) => `${x.kind}: ${x.date}`).join(" · ") };
  if (!hasCaracteristicas) return { ...r, class: "gone", reason: "página sin el bloque «Características»" };
  if (anuncianteVacio || telefonoNoInforma) {
    const why = [
      anuncianteVacio && "Anunciante -",
      telefonoNoInforma && "Teléfono: No informa",
      whatsapp && "(tiene link de WhatsApp)",
      tel && "(tiene link tel:)",
    ].filter(Boolean).join(" + ");
    return { ...r, class: "contact_missing", reason: why };
  }
  return { ...r, class: "alive" };
}

const bestPos = (e) => Math.min(...e.appearances.map((a) => a.position));
const inTop10 = (e) => e.appearances.some((a) => a.position <= 10);
// El top 10 primero: si el tope corta, que corte en la cola.
const ordered = [...sample.values()].sort((a, b) => Number(inTop10(b)) - Number(inTop10(a)) || bestPos(a) - bestPos(b));
log(`muestra: ${ordered.length} ids únicos (${ordered.filter(inTop10).length} en algún top 10); fuente: ${sourceRequests} requests previos`);

for (const [i, entry] of ordered.entries()) {
  const c = await classify(entry);
  const { html, contentType, ...rest } = c;
  entry.source = rest;
  if (html) {
    const file = `${htmlDir}/${entry.id}_${c.class}.html`;
    writeFileSync(file, html);
    entry.source.evidence = file;
  }
  log(`[${i + 1}/${ordered.length}] ${c.class.padEnd(15)} ${entry.id} ${c.reason ?? c.note ?? ""}`);
}

/* ------------------------------------------------------------------ */
/* 3. Los cuatro ids conocidos                                         */
/* ------------------------------------------------------------------ */

const known = [];
for (const id of KNOWN_IDS) {
  const res = await fetch(`${base}/propiedad/${id}`, { headers: { "user-agent": UA }, redirect: "manual" });
  const body = await res.text();
  let state;
  if (res.status === 404) state = "no existe (404)";
  else if (res.status === 200 && /data-testid="detail|detail-page/.test(body)) {
    state = /Aviso dado de baja|removido|removed/i.test(body) ? "removido (la página lo marca)" : "ACTIVO (la página lo muestra como vigente)";
  } else state = `HTTP ${res.status}`;
  known.push({ id, http: res.status, state, in_sample: sample.has(id) });
  await sleep(500);
}

/* ------------------------------------------------------------------ */
/* 6. Corrida anterior: cada delisted/gone de entonces, verificado hoy  */
/* ------------------------------------------------------------------ */

const prev = prevPath ? JSON.parse(readFileSync(prevPath, "utf8")) : null;
const prevChecks = [];
if (prev) {
  for (const old of prev.sample.filter((e) => ["delisted", "gone"].includes(e.source?.class))) {
    const row = { id: old.id, prev_class: old.source.class, prev_url: old.listing_url, prev_apps: old.appearances };
    const now = sample.get(old.id);
    if (now) {
      row.in_sample = true;
      row.url = now.listing_url;
      row.now_class = now.source.class;
    } else {
      const res = await fetch(`${base}/propiedad/${old.id}`, { headers: { "user-agent": UA }, redirect: "manual" });
      const body = await res.text();
      row.detail_http = res.status;
      if (res.status === 200) {
        row.url =
          /href="(https:\/\/www\.compraensanjuan\.com\/anuncio_in\/[^"]+)"[^>]*>\s*Ver aviso original/.exec(body)?.[1] ?? null;
        if (row.url && row.url !== old.listing_url) {
          const c = await classify({ listing_url: row.url });
          const { html, contentType, ...rest } = c;
          row.now_class = c.class;
          row.now_source = rest;
          if (html) writeFileSync(`${htmlDir}/${old.id}_anterior_${c.class}.html`, html);
        } else if (row.url) {
          row.now_class = "mismo aviso, sin re-clasificar";
        }
      }
      await sleep(500);
    }
    prevChecks.push(row);
  }
}

/* ------------------------------------------------------------------ */
/* Informe                                                             */
/* ------------------------------------------------------------------ */

const all = [...sample.values()];
const checked = all.filter((e) => e.source.class !== "not_checked");
const top10 = checked.filter(inTop10);
const CLASSES = ["alive", "delisted", "contact_missing", "gone"];
const count = (set, k) => set.filter((e) => e.source.class === k).length;
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : "—");
const bad = (e) => e.source.class === "delisted" || e.source.class === "gone";

const fmtPrice = (e) =>
  e.price == null ? "—" : `${e.currency ?? ""} ${Number(e.price).toLocaleString("es-AR")}${e.rental_period ? ` /${e.rental_period}` : ""}`.trim();
const fmtApps = (e, onlyTop10 = false) =>
  e.appearances
    .filter((a) => !onlyTop10 || a.position <= 10)
    .map((a) => `${a.qid} #${a.position} (score ${a.score ?? "—"})`)
    .join("<br>");

const badAll = checked.filter(bad);
const cmList = checked.filter((e) => e.source.class === "contact_missing");
const badTop10 = top10.filter(bad);
const badRate = checked.length ? badAll.length / checked.length : 0;
const cmRate = checked.length ? count(checked, "contact_missing") / checked.length : 0;
const knownActive = known.filter((k) => k.state.startsWith("ACTIVO") || k.in_sample);

const failReasons = [];
if (badTop10.length) failReasons.push(`${badTop10.length} delisted/gone en algún top 10`);
if (badRate > 0.01) failReasons.push(`${(badRate * 100).toFixed(1)}% delisted+gone en la muestra (> 1%)`);
if (knownActive.length) failReasons.push(`${knownActive.length} de los cuatro ids conocidos sigue activo`);
if (checked.length < 200) failReasons.push(`muestra clasificada de ${checked.length} (< 200 pedidas)`);
const warn = cmRate > 0.03;
const verdict = failReasons.length ? "FAIL" : warn ? "WARN" : "PASS";
const justification = failReasons.length
  ? failReasons.join("; ") + (warn ? `; además contact_missing = ${(cmRate * 100).toFixed(1)}% (> 3%)` : "")
  : warn
    ? `0 delisted/gone en top 10, ${(badRate * 100).toFixed(1)}% en la muestra y los cuatro ids fuera; pero contact_missing = ${(cmRate * 100).toFixed(1)}% (> 3%)`
    : `0 delisted/gone en top 10, ${(badRate * 100).toFixed(1)}% en la muestra, ids conocidos fuera y contact_missing ${(cmRate * 100).toFixed(1)}% (≤ 3%)`;

const L = [];
L.push(`# QA bajas en la fuente — ${started.toISOString().slice(0, 16).replace("T", " ")} UTC`);
L.push("");
L.push("## 1. Corrida");
L.push("");
L.push(`- **Inicio / fin:** ${started.toISOString()} / ${new Date().toISOString()}`);
L.push(`- **FINDER:** \`${base}\` (\`/api/sessions\` + \`/api/search/stream\`)`);
L.push(`- **Fuente:** compraensanjuan.com — ${sourceRequests} requests usados de ${SOURCE_BUDGET}${sourceUsedBefore ? ` (incluye ${sourceUsedBefore} de sondeo previo)` : ""}, 1-2 s entre requests, User-Agent de navegador`);
L.push(`- **Muestra:** ${all.length} ids únicos · ${checked.length} clasificados · ${all.length - checked.length} sin clasificar · ${all.filter(inTop10).length} en algún top 10`);
const statuses = Object.entries(all.reduce((acc, e) => ((acc[e.listing_status ?? "null"] = (acc[e.listing_status ?? "null"] ?? 0) + 1), acc), {}));
L.push(`- **\`listing_status\` en FINDER:** ${statuses.map(([k, v]) => `${k} ${v}`).join(" · ")}`);
L.push(`- **Evidencia:** \`${outDir}/\` (\`html/\` con los HTML de delisted y gone, \`sample.json\` con todo)`);
L.push("");
L.push("| Consulta | Texto | Offset | Cards tomadas | total_matches | Eventos |");
L.push("|---|---|---|---|---|---|");
for (const q of queryRuns) {
  L.push(`| ${q.qid} | ${q.query} | ${q.offset} | ${q.got} | ${q.total_matches ?? "—"} | ${q.events.join(" → ")} |`);
}
L.push("");
L.push("## 2. Resumen");
L.push("");
L.push("| Clase | Muestra completa | % | Top 10 | % |");
L.push("|---|---|---|---|---|");
for (const k of CLASSES) L.push(`| ${k} | ${count(checked, k)} | ${pct(count(checked, k), checked.length)} | ${count(top10, k)} | ${pct(count(top10, k), top10.length)} |`);
L.push(`| **total clasificado** | **${checked.length}** | | **${top10.length}** | |`);
L.push("");
L.push("Top 10 por consulta (ids en el puesto 1-10 de cada una de las 12 consultas):");
L.push("");
L.push("| Consulta | Cards top 10 | alive | delisted | contact_missing | gone | sin clasificar |");
L.push("|---|---|---|---|---|---|---|");
for (const [qid] of QUERIES) {
  const ids = all.filter((e) => e.appearances.some((a) => a.qid === qid && a.position <= 10));
  const nc = ids.filter((e) => e.source.class === "not_checked").length;
  L.push(`| ${qid} | ${ids.length} | ${count(ids, "alive")} | ${count(ids, "delisted")} | ${count(ids, "contact_missing")} | ${count(ids, "gone")} | ${nc} |`);
}
L.push("");
L.push("## 3. delisted y gone");
L.push("");
if (!badAll.length) L.push("Ninguno.");
else {
  L.push("| Clase | id FINDER | Zona | Precio | Consulta · posición (score) | listing_url | Fecha de baja / motivo |");
  L.push("|---|---|---|---|---|---|---|");
  for (const e of badAll.sort((a, b) => bestPos(a) - bestPos(b))) {
    const fecha =
      e.source.class === "delisted"
        ? [
            e.source.suspendido && `Suspendido: ${e.source.suspendido}${e.source.suspendido_dia ? ` (${e.source.suspendido_dia})` : ""}`,
            e.source.baja && `Baja: ${e.source.baja}${e.source.baja_dia ? ` (${e.source.baja_dia})` : ""}`,
            e.source.dias_de_baja != null ? `hace ${e.source.dias_de_baja} d` : "fecha no interpretada",
          ].filter(Boolean).join("<br>")
        : e.source.reason;
    L.push(`| ${e.source.class}${inTop10(e) ? " **(top 10)**" : ""} | \`${e.id}\` | ${e.zone ?? "—"} | ${fmtPrice(e)} | ${fmtApps(e)} | ${e.listing_url} | ${fecha} |`);
  }
}
L.push("");
L.push(`<details><summary>contact_missing (${cmList.length})</summary>`);
L.push("");
if (cmList.length) {
  L.push("| id FINDER | Zona | Precio | Consulta · posición (score) | listing_url | Señal |");
  L.push("|---|---|---|---|---|---|");
  for (const e of cmList.sort((a, b) => bestPos(a) - bestPos(b))) L.push(`| \`${e.id}\` | ${e.zone ?? "—"} | ${fmtPrice(e)} | ${fmtApps(e)} | ${e.listing_url} | ${e.source.reason} |`);
} else L.push("Ninguno.");
L.push("");
L.push("</details>");
L.push("");
const nc = all.filter((e) => e.source.class === "not_checked");
if (nc.length) {
  L.push(`**Sin clasificar (${nc.length}):**`);
  for (const e of nc) L.push(`- \`${e.id}\` ${e.listing_url} — ${e.source.note}`);
  L.push("");
}
L.push("## 4. Los cuatro ids conocidos");
L.push("");
L.push(`| id | \`GET ${base}/propiedad/<id>\` | Estado | ¿Apareció en la muestra? |`);
L.push("|---|---|---|---|");
for (const k of known) L.push(`| \`${k.id}\` | HTTP ${k.http} | ${k.state} | ${k.in_sample ? "**sí**" : "no"} |`);
L.push("");
L.push("## 5. Veredicto");
L.push("");
L.push(`**${verdict}** — ${justification}.`);
L.push("");
const outside = badAll.filter((e) => e.source.class === "gone" || !e.source.en_ventana_24h);
const inside = badAll.filter((e) => e.source.class === "delisted" && e.source.en_ventana_24h);
L.push(
  `**Criterio del pedido a P3** (\`docs/PEDIDO_P1_A_P3_2026-09-16.md\`, latencia ≤ 24 h; no cambia el veredicto de arriba): ` +
    `${outside.length} delisted/gone con baja anterior a ayer, sin fecha interpretable o gone` +
    `${outside.filter(inTop10).length ? ` (${outside.filter(inTop10).length} en top 10)` : ""} · ` +
    `${inside.length} con baja de hoy o ayer (dentro de la ventana)` +
    ` → **${outside.length ? "NO CUMPLE" : "CUMPLE"}**.`,
);
const cmWithChannel = cmList.filter((e) => e.source.whatsapp || e.source.tel).length;
L.push("");
L.push(
  `**contact_missing con la definición de P3** (sin anunciante ni teléfono/WhatsApp): ${cmList.length - cmWithChannel} ` +
    `(${pct(cmList.length - cmWithChannel, checked.length)}); los otros ${cmWithChannel} dicen "Teléfono: No informa" pero tienen link de WhatsApp o tel:.`,
);
L.push("");
L.push("## 6. Comparación con la corrida anterior");
L.push("");
if (!prev) L.push("No se pasó informe de una corrida anterior.");
else {
  const prevBadIds = new Set(prevChecks.map((r) => r.id));
  const verdictOf = (r) => {
    if (r.detail_http === 404) return "**corregido** — FINDER ya no lo muestra (detalle 404)";
    if (r.in_sample && ["alive", "contact_missing"].includes(r.now_class))
      return r.url !== r.prev_url ? `**corregido** — sigue en la muestra con otro aviso, ${r.now_class}` : `**corregido** — mismo aviso, hoy ${r.now_class}`;
    if (r.in_sample) return `**persiste** — en la muestra, ${r.now_class}`;
    if (r.detail_http === 200 && r.url !== r.prev_url && ["alive", "contact_missing"].includes(r.now_class))
      return `**corregido** — activo con otro aviso (${r.now_class})`;
    if (r.detail_http === 200) return `**persiste** — detalle activo, ${r.now_class ?? "sin link al aviso"}`;
    return `sin verificar (detalle HTTP ${r.detail_http})`;
  };
  L.push(`Anterior: \`${prevPath}\` (${prev.started}, veredicto ${prev.verdict}). Cada delisted/gone de esa corrida se volvió a verificar hoy.`);
  L.push("");
  L.push("| id | Antes | Dónde apareció antes | Hoy | listing_url hoy |");
  L.push("|---|---|---|---|---|");
  for (const r of prevChecks) {
    const apps = r.prev_apps.map((a) => `${a.qid} #${a.position}`).join(", ");
    L.push(`| \`${r.id}\` | ${r.prev_class} | ${apps} | ${verdictOf(r)} | ${r.url && r.url !== r.prev_url ? r.url : r.url ? "igual" : "—"} |`);
  }
  L.push("");
  const fresh = badAll.filter((e) => !prevBadIds.has(e.id));
  L.push(`**Nuevos delisted/gone en esta corrida:** ${fresh.length ? fresh.map((e) => `\`${e.id}\` (${e.source.class}, ${e.appearances.map((a) => `${a.qid} #${a.position}`).join(", ")})`).join(" · ") : "ninguno"}`);
}
L.push("");

writeFileSync(`${outDir}/sample.json`, JSON.stringify({ started: started.toISOString(), base, verdict, queryRuns, known, sourceRequests, prevChecks, sample: all }, null, 2));
const reportPath = `tests/reports/qa_bajas_${stamp}.md`;
writeFileSync(reportPath, L.join("\n"));
log(`veredicto ${verdict}: ${justification}`);
log(`informe: ${reportPath}`);
