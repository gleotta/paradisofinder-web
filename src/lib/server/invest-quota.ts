/**
 * Cupos de P1 para el análisis de inversión (plan 01/11 §4.3, #14; decisión
 * de German del 01/11: la seguridad es la API key del portal, el cupo por
 * visitante y el tope diario los pone P1). En memoria, por proceso: alcanza
 * para una réplica (Railway hoy) y para frenar un visitante o una IP que
 * insista; el techo de gasto real compartido entre réplicas es
 * `INVEST_DAILY_MAX` de P2 (500/día UTC).
 *
 *  - ventana deslizante por clave (`v:<visitor>` y `ip:<ip>`): N análisis cada
 *    M minutos — propuesta D4: 5 cada 10 min;
 *  - tope diario global (día UTC): propuesta D4: 300.
 *
 * Un `skip` de P2 (pregunta simple, solo paga el plan) se DEVUELVE al cupo
 * (`refund`): el cupo cuida el paso 3, que es lo caro; si no, seis búsquedas
 * simples en Invertir dejaban sin análisis a la séptima, que sí lo necesitaba.
 *
 * Sin `server-only` a propósito: es puro, para poder probarlo con node a mano.
 */

export interface QuotaConfig {
  /** Análisis por clave en la ventana. 0 = sin cupo por clave. */
  perKey: number;
  windowMs: number;
  /** Análisis por día UTC en total. 0 = sin tope. */
  dailyMax: number;
}

export type QuotaResult =
  | { ok: true; token: QuotaToken }
  | { ok: false; code: "quota_visitor" | "quota_daily"; retryAfterS: number };

export interface QuotaToken {
  keys: string[];
  at: number;
  day: string;
}

const MINUTE = 60_000;

function envInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export function quotaConfig(env: NodeJS.ProcessEnv = process.env): QuotaConfig {
  return {
    perKey: envInt(env, "INVEST_QUOTA_PER_VISITOR", 5),
    windowMs: envInt(env, "INVEST_QUOTA_WINDOW_MIN", 10) * MINUTE,
    dailyMax: envInt(env, "INVEST_DAILY_MAX", 300),
  };
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Segundos hasta las 00:00 UTC siguientes (mínimo 1). */
function secondsToNextUtcDay(now: number): number {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now) / 1000));
}

export class InvestQuota {
  private readonly windows = new Map<string, number[]>();
  private daily = { day: "", count: 0 };
  private readonly cfg: QuotaConfig;

  // Campo explícito (no "parameter property"): así el módulo corre también con
  // el loader de TypeScript de Node (`node script.mjs` importando el .ts) para probarlo a mano.
  constructor(cfg: QuotaConfig) {
    this.cfg = cfg;
  }

  /** Intenta consumir un análisis para TODAS las claves (visitante e IP); si una no puede, no consume ninguna. */
  take(keys: string[], now = Date.now()): QuotaResult {
    const day = utcDay(now);
    if (this.daily.day !== day) this.daily = { day, count: 0 };
    if (this.cfg.dailyMax > 0 && this.daily.count >= this.cfg.dailyMax) {
      return { ok: false, code: "quota_daily", retryAfterS: secondsToNextUtcDay(now) };
    }
    if (this.cfg.perKey > 0) {
      for (const key of keys) {
        const hits = this.prune(key, now);
        if (hits.length >= this.cfg.perKey) {
          const retryAfterS = Math.max(1, Math.ceil((hits[0] + this.cfg.windowMs - now) / 1000));
          return { ok: false, code: "quota_visitor", retryAfterS };
        }
      }
      for (const key of keys) this.prune(key, now).push(now);
    }
    this.daily.count += 1;
    return { ok: true, token: { keys, at: now, day } };
  }

  /** Devuelve lo consumido por `take` (un `skip` de P2 no cuenta). */
  refund(token: QuotaToken): void {
    for (const key of token.keys) {
      const hits = this.windows.get(key);
      if (!hits) continue;
      const i = hits.indexOf(token.at);
      if (i !== -1) hits.splice(i, 1);
      if (hits.length === 0) this.windows.delete(key);
    }
    if (this.daily.day === token.day && this.daily.count > 0) this.daily.count -= 1;
  }

  /** Para el health y los tests: lo consumido hoy. */
  todayCount(now = Date.now()): number {
    return this.daily.day === utcDay(now) ? this.daily.count : 0;
  }

  private prune(key: string, now: number): number[] {
    const since = now - this.cfg.windowMs;
    let hits = this.windows.get(key);
    if (!hits) {
      hits = [];
      this.windows.set(key, hits);
    } else {
      while (hits.length && hits[0] <= since) hits.shift();
    }
    // Claves viejas sin uso: limpieza oportunista para que el Map no crezca sin fin.
    if (this.windows.size > 5000) {
      for (const [k, v] of this.windows) {
        if (!v.length || v[v.length - 1] <= since) this.windows.delete(k);
      }
    }
    return hits;
  }
}
