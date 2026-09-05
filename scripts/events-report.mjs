#!/usr/bin/env node
/**
 * Reporte rápido del log de eventos de P1 (MVP beta, 05/09):
 *   node scripts/events-report.mjs [logs/ | archivo.jsonl ...]
 *
 * Une consulta → resultados → navegación por `search_id`, y lista al final
 * los eventos sin búsqueda (home, detalle abierto por URL directa, etc.).
 * Es un primer análisis a mano; para más, el JSONL se abre con jq/DuckDB/pandas.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const inputs = args.length ? args : ["logs"];
const files = inputs.flatMap((p) => {
  try {
    if (statSync(p).isDirectory()) {
      return readdirSync(p)
        .filter((f) => f.endsWith(".jsonl"))
        .sort()
        .map((f) => path.join(p, f));
    }
    return [p];
  } catch {
    console.error(`No encuentro ${p}`);
    return [];
  }
});
if (!files.length) {
  console.error("Sin archivos de log. ¿Corriste el server con EVENTS_LOG_DIR (default logs/)?");
  process.exit(1);
}

const events = files.flatMap((f) =>
  readFileSync(f, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean),
);

const searches = new Map();
const orphans = [];
for (const ev of events) {
  if (!ev.search_id) {
    orphans.push(ev);
    continue;
  }
  let s = searches.get(ev.search_id);
  if (!s) {
    s = { id: ev.search_id, visitor: ev.visitor_id, ts: ev.ts, query: null, mode: null, vertical: null, total: null, scores: null, pages: 0, shown: 0, clicks: [], opened: [], contacts: 0, sources: 0, zero: false, clarification: false, error: null };
    searches.set(ev.search_id, s);
  }
  const p = ev.payload ?? {};
  switch (ev.event) {
    case "search_performed":
      s.query = p.query ?? s.query;
      s.mode = p.mode ?? s.mode;
      s.vertical = p.vertical ?? p.vertical_override ?? s.vertical;
      break;
    case "search_results":
      s.total = p.total_matches;
      s.scores = p.scores;
      s.shown += p.received ?? 0;
      s.latency = p.latency_ms;
      break;
    case "results_page_loaded":
      s.pages += 1;
      s.shown += p.results?.length ?? 0;
      break;
    case "zero_results":
      s.zero = true;
      break;
    case "clarification_shown":
      s.clarification = true;
      break;
    case "search_error":
      s.error = p.message ?? p.stage ?? "error";
      break;
    case "card_clicked":
      s.clicks.push(`#${p.rank ?? "?"}${p.from && p.from !== "list" ? `(${p.from})` : ""}${p.score != null ? `·${p.score}` : ""}`);
      break;
    case "property_detail_opened":
      s.opened.push(p.property_id);
      break;
    case "contact_click":
      s.contacts += 1;
      break;
    case "source_click":
      s.sources += 1;
      break;
  }
}

const fmt = (v) => (v == null ? "—" : String(v));
console.log(`${events.length} eventos · ${searches.size} búsquedas · ${new Set(events.map((e) => e.visitor_id)).size} visitantes\n`);
for (const s of [...searches.values()].sort((a, b) => (a.ts < b.ts ? -1 : 1))) {
  const state = s.error ? `ERROR ${s.error}` : s.clarification ? "clarificación" : s.zero ? "0 resultados" : `${fmt(s.total)} resultados`;
  const sc = s.scores ? `score top ${s.scores.top} · prom ${s.scores.avg}` : "sin score";
  console.log(`${s.ts.slice(0, 19).replace("T", " ")}  «${fmt(s.query)}»  [${fmt(s.vertical)} · ${fmt(s.mode)}]`);
  console.log(`   ${state} · ${sc} · vistas ${s.shown} (+${s.pages} páginas)${s.latency != null ? ` · ${s.latency} ms` : ""}`);
  if (s.clicks.length || s.opened.length || s.contacts || s.sources) {
    console.log(`   clicks: ${s.clicks.join(" ") || "—"} · detalles abiertos: ${s.opened.length} · contacto: ${s.contacts} · aviso original: ${s.sources}`);
  }
}
if (orphans.length) {
  const byType = {};
  for (const o of orphans) byType[o.event] = (byType[o.event] ?? 0) + 1;
  console.log(`\nSin búsqueda asociada: ${Object.entries(byType).map(([k, v]) => `${k} ×${v}`).join(", ")}`);
}
