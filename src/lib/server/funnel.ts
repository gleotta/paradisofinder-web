import "server-only";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Embudo por día sobre el log propio de eventos (T7, 14/09):
 * búsquedas → cards → card abierta → consulta. Lee los JSONL de
 * `EVENTS_LOG_DIR` (default `logs/`), agrupa por día UTC y por vertical, y
 * calcula p50/p95 de `t_first_cards` (medido en el cliente). Es un análisis a
 * mano para el tablero interno; para más, DuckDB/pandas sobre el mismo JSONL.
 */

export interface DayFunnel {
  day: string;
  searches: number;
  cards: number;
  opened: number;
  contact: number;
  source: number;
  contact_clicks: number;
  zero: number;
  errors: number;
  slow: number;
  fallback: number;
  chips: number;
  clarifications: number;
  t_first_cards: number[];
}

export interface FunnelReport {
  days: DayFunnel[];
  byVertical: Record<string, { searches: number; cards: number; opened: number; contact: number }>;
  totals: DayFunnel;
  files: number;
  events: number;
  from: string | null;
  to: string | null;
}

interface Ev {
  ts: string;
  event: string;
  search_id?: string | null;
  vertical?: string | null;
  payload?: Record<string, unknown>;
}

function logDir(): string | null {
  const raw = process.env.EVENTS_LOG_DIR;
  if (raw === undefined) return path.join(process.cwd(), "logs");
  const dir = raw.trim();
  // Ruta absoluta bajo el cwd del server (o la que diga el env): Turbopack no
  // debe trazar este acceso como parte del bundle (`turbopackIgnore`).
  return dir ? path.resolve(/* turbopackIgnore: true */ process.cwd(), dir) : null;
}

function empty(day: string): DayFunnel {
  return { day, searches: 0, cards: 0, opened: 0, contact: 0, source: 0, contact_clicks: 0, zero: 0, errors: 0, slow: 0, fallback: 0, chips: 0, clarifications: 0, t_first_cards: [] };
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export async function buildFunnel(days = 30): Promise<FunnelReport> {
  const dir = logDir();
  const report: FunnelReport = { days: [], byVertical: {}, totals: empty("total"), files: 0, events: 0, from: null, to: null };
  if (!dir) return report;
  let files: string[] = [];
  try {
    files = (await readdir(/* turbopackIgnore: true */ dir)).filter((f) => /^events-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
  } catch {
    return report;
  }
  files = files.slice(-days);
  report.files = files.length;

  const byDay = new Map<string, DayFunnel>();
  // Un search_id cuenta una vez por etapa: la corrida llegó a cards / abrió / consultó.
  const stage = new Map<string, Set<string>>();
  const mark = (key: string, id: string | null | undefined): boolean => {
    if (!id) return true;
    let set = stage.get(key);
    if (!set) {
      set = new Set();
      stage.set(key, set);
    }
    if (set.has(id)) return false;
    set.add(id);
    return true;
  };
  // Días con `search_submitted` no suman el legado (evita contar doble).
  const legacy = new Map<string, number>();
  const legacyCounted = new Set<string>();
  const vert = (v: string | null | undefined) => {
    const key = v || "(sin vertical)";
    if (!report.byVertical[key]) report.byVertical[key] = { searches: 0, cards: 0, opened: 0, contact: 0 };
    return report.byVertical[key];
  };

  for (const f of files) {
    let raw = "";
    try {
      raw = await readFile(path.join(/* turbopackIgnore: true */ dir, f), "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      if (!line) continue;
      let ev: Ev;
      try {
        ev = JSON.parse(line) as Ev;
      } catch {
        continue;
      }
      report.events++;
      const day = (ev.ts ?? "").slice(0, 10) || f.slice(7, 17);
      if (!report.from || day < report.from) report.from = day;
      if (!report.to || day > report.to) report.to = day;
      let d = byDay.get(day);
      if (!d) {
        d = empty(day);
        byDay.set(day, d);
      }
      const p = ev.payload ?? {};
      const v = ev.vertical ?? (typeof p.vertical === "string" ? p.vertical : null);
      switch (ev.event) {
        case "search_submitted":
          d.searches++;
          vert(v).searches++;
          legacyCounted.add(day);
          break;
        // Logs anteriores al 14/09 (sin `search_submitted`): la búsqueda nueva
        // era `search_performed` con mode search; se cuenta una vez por corrida.
        case "search_performed":
          if (p.mode === "search" && mark("legacy-search", ev.search_id) && !legacyCounted.has(day)) {
            legacy.set(day, (legacy.get(day) ?? 0) + 1);
          }
          break;
        case "cards_rendered":
          if (mark("cards", ev.search_id)) {
            d.cards++;
            vert(v).cards++;
          }
          if (typeof p.t_first_cards === "number") d.t_first_cards.push(p.t_first_cards);
          break;
        case "search_results":
          // Logs viejos sin cards_rendered: la latencia venía acá.
          if (!("t_first_cards" in p) && typeof p.latency_ms === "number" && mark("cards-legacy", ev.search_id)) {
            d.t_first_cards.push(p.latency_ms);
          }
          break;
        case "card_opened":
        case "card_clicked":
          if (mark("opened", ev.search_id)) {
            d.opened++;
            vert(v).opened++;
          }
          break;
        case "contact_click":
          d.contact_clicks++;
          if (mark("contact", ev.search_id)) {
            d.contact++;
            vert(v).contact++;
          }
          break;
        case "source_click":
          d.source++;
          break;
        case "zero_results":
          d.zero++;
          break;
        case "search_error":
          d.errors++;
          break;
        case "search_slow_wait":
          d.slow++;
          break;
        case "search_fallback_sync":
          d.fallback++;
          break;
        case "chip_removed":
        case "chip_edited":
        case "order_changed":
        case "assumption_flipped":
          d.chips++;
          break;
        case "clarification_choice":
        case "clarification_chip_selected":
          d.clarifications++;
          break;
      }
    }
  }

  for (const [day, n] of legacy) {
    const d = byDay.get(day);
    if (d && !legacyCounted.has(day)) d.searches += n;
  }
  report.days = [...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
  for (const d of report.days) {
    const t = report.totals;
    t.searches += d.searches;
    t.cards += d.cards;
    t.opened += d.opened;
    t.contact += d.contact;
    t.source += d.source;
    t.contact_clicks += d.contact_clicks;
    t.zero += d.zero;
    t.errors += d.errors;
    t.slow += d.slow;
    t.fallback += d.fallback;
    t.chips += d.chips;
    t.clarifications += d.clarifications;
    t.t_first_cards.push(...d.t_first_cards);
  }
  return report;
}
