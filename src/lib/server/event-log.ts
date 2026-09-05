import "server-only";

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Log propio de eventos de P1 (MVP beta, 05/09): una línea JSON por evento en
 * `<EVENTS_LOG_DIR>/events-YYYY-MM-DD.jsonl` (default `logs/`, relativo al
 * cwd del server). Es la base del análisis consulta → resultados → navegación:
 * se lee con `node scripts/events-report.mjs`, jq, DuckDB o pandas.
 *
 * `EVENTS_LOG_DIR=` (vacío) desactiva el archivo y deja solo stdout — para
 * hostings sin disco escribible. Si el archivo falla, también cae a stdout
 * (con un warning una sola vez): la analítica jamás rompe la experiencia.
 */

export interface LoggedEvent {
  ts: string;
  event: string;
  visitor_id: string | null;
  tab_id: string | null;
  session_id: string | null;
  search_id: string | null;
  page: string | null;
  payload: Record<string, unknown>;
  client_ts: string | null;
  ua: string | null;
}

function logDir(): string | null {
  const raw = process.env.EVENTS_LOG_DIR;
  if (raw === undefined) return "logs";
  const dir = raw.trim();
  return dir ? dir : null;
}

let dirReady: Promise<void> | null = null;
let warned = false;

export async function logEvent(line: LoggedEvent): Promise<void> {
  const json = JSON.stringify(line);
  const dir = logDir();
  if (!dir) {
    console.log(`[event] ${json}`);
    return;
  }
  try {
    if (!dirReady) dirReady = mkdir(dir, { recursive: true }).then(() => undefined);
    await dirReady;
    await appendFile(path.join(dir, `events-${line.ts.slice(0, 10)}.jsonl`), `${json}\n`, "utf8");
  } catch (err) {
    if (!warned) {
      warned = true;
      console.warn(
        `[events] No pude escribir el log en "${dir}" (relativo al cwd del server; ${err instanceof Error ? err.message : String(err)}). Los eventos salen por stdout.`,
      );
    }
    console.log(`[event] ${json}`);
  }
}
