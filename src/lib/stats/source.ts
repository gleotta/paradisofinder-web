import "server-only";

import { mockStatsReport } from "./mock";
import { STATS_PERIODS, type StatsPeriodDays, type StatsReport } from "./types";

/**
 * De dónde sale el reporte de `/statistiche`.
 *
 * HOY: datos de ejemplo (`mock.ts`). DESTINO: P2, que ya registra cada
 * búsqueda y cada clic en su observabilidad. Cuando P2 exponga el reporte
 * (`GET /api/v1/stats/report?days=N`, con la forma de `StatsReport`), este es
 * el único archivo que cambia: se pide a P2 y, si `STATS_SOURCE` no es `p2`
 * o P2 no responde, se cae al ejemplo sin romper la página.
 * Pasos y lo que falta en P2: `docs/italia/STATISTICHE.md`.
 */
export async function getStatsReport(days: StatsPeriodDays): Promise<StatsReport> {
  return mockStatsReport(days);
}

export function parsePeriod(raw: string | string[] | undefined): StatsPeriodDays {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return (STATS_PERIODS as readonly number[]).includes(n) ? (n as StatsPeriodDays) : 30;
}
