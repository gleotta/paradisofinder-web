"use client";

/**
 * Análisis de inversión en el browser (02/11 —
 * `docs/DECISION_2026-11-02_analisis-inversion.md`; contrato de P2 en
 * `docs/HANDOFF_P2_INVEST_2026-11-01.md` §3). Es el segundo canal de Invertir:
 * corre en PARALELO al stream de siempre y nunca lo bloquea. Lee el SSE de
 * `/api/invest/analysis` (P1 → P2 `/search/invest`) y lo reduce a un estado
 * que el panel dibuja:
 *
 *   waiting ─ plan ─▸ running ─ picks ─▸ writing ─ done ─▸ done
 *      │                │                                ├─ partial (P2 cortó a los 45 s)
 *      ├─ skip ─▸ idle  ├─ error/corte ─▸ error          └─ 60 s sin done ─▸ timeout
 *      ├─ 204 ─▸ idle   └─ búsqueda nueva ─▸ idle (cancelado, P2 deja de pagar)
 *      └─ 429 ─▸ quota
 *
 * El panel aparece al enviar, con el cartel de espera (German, 02/11: la
 * persona tiene que ver que FINDER está analizando); con `plan` se llena de
 * pasos y con `skip` (~1,5 s en una pregunta simple) se va. Todo lo que llega
 * se muestra tal cual (textos de P2/P3, regla dura: no reescribir); P1 pone
 * solo el cartel de espera y el aviso de estimación al pie.
 */

import type {
  InvestAnswerChunkEvent,
  InvestComparisonEvent,
  InvestDoneEvent,
  InvestErrorEvent,
  InvestPick,
  InvestPicksEvent,
  InvestPlanEvent,
  InvestSkipEvent,
  InvestStepEvent,
} from "./p2/types";
import { readSSE } from "./sse";
import { EVENTS, getVisitorId, trackEvent } from "./track";

export type InvestPhase = "idle" | "waiting" | "running" | "writing" | "done" | "error" | "timeout" | "quota";

export interface InvestStepState {
  index: number;
  label: string;
  status: "pending" | "running" | "done" | "failed";
  total_matches: number | null;
  with_yield: number | null;
  ms: number | null;
  error: string | null;
}

export interface InvestState {
  phase: InvestPhase;
  /** La pregunta tal cual la escribió el usuario. */
  query: string;
  analysisId: string | null;
  questionType: string | null;
  note: string | null;
  steps: InvestStepState[];
  picks: InvestPick[] | null;
  comparison: InvestComparisonEvent | null;
  /** La prosa, concatenada tal cual (cada chunk termina en espacio). */
  answer: string;
  done: InvestDoneEvent | null;
  /** `error`, `timeout` y `quota`: lo que se le dice al usuario (+ el detalle de P2 si lo hay). */
  notice: { message: string; detail: string | null; retryAfterS: number | null } | null;
  startedAt: number;
}

export const INVEST_IDLE: InvestState = {
  phase: "idle",
  query: "",
  analysisId: null,
  questionType: null,
  note: null,
  steps: [],
  picks: null,
  comparison: null,
  answer: "",
  done: null,
  notice: null,
  startedAt: 0,
};

/** 60 s del cliente sin `done` (plan 01/11 §4.2, #7): lo que llegó queda, y se dice. */
export const INVEST_CLIENT_TIMEOUT_MS = 60_000;

const UNAVAILABLE = "El análisis de inversión no está disponible ahora. El listado de abajo está completo.";
const UNFINISHED = "No alcancé a terminar el análisis. El listado de abajo está completo.";

/** ¿Hay algo que mostrar? (solo `idle` no dibuja panel: `waiting` muestra el cartel de espera.) */
export function investPanelVisible(s: InvestState): boolean {
  return s.phase !== "idle";
}

/** ¿Sigue en curso? (para el reloj del panel y para cancelar con motivo). */
export function investInProgress(s: InvestState): boolean {
  return s.phase === "waiting" || s.phase === "running" || s.phase === "writing";
}

type Updater = (prev: InvestState) => InvestState;

/* ---------------- reducción pura de eventos del SSE ---------------- */

function applyStep(steps: InvestStepState[], ev: InvestStepEvent): InvestStepState[] {
  const next: InvestStepState = {
    index: ev.index,
    label: ev.label,
    status: ev.status,
    total_matches: ev.total_matches ?? null,
    with_yield: ev.with_yield ?? null,
    ms: ev.status === "running" ? null : ev.ms,
    error: ev.error ?? null,
  };
  // Los `done` pueden llegar en otro orden que los `running`: se pinta por índice.
  const i = steps.findIndex((s) => s.index === ev.index);
  if (i === -1) return [...steps, next].sort((a, b) => a.index - b.index);
  const out = steps.slice();
  // Un `done` nunca vuelve a `running` aunque el evento llegue tarde.
  out[i] = steps[i].status === "done" && ev.status === "running" ? steps[i] : next;
  return out;
}

/** Después de un fallo: aviso en el panel si ya había plan; si no, nada que mostrar. */
function failed(prev: InvestState, phase: "error" | "timeout", message: string, detail: string | null = null): InvestState {
  if (!prev.steps.length) return { ...prev, phase: "idle" };
  return { ...prev, phase, notice: { message, detail, retryAfterS: null } };
}

/**
 * Reduce un evento del SSE ya parseado (JSON válido). Es puro y no lanza con
 * formas raras: corre dentro del updater de React. null = evento desconocido.
 */
export function reduceInvestEvent(prev: InvestState, event: string, payload: unknown): InvestState | null {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  switch (event) {
    case "plan": {
      const ev = p as unknown as InvestPlanEvent;
      const steps = Array.isArray(ev.steps) ? ev.steps : [];
      return {
        ...prev,
        phase: "running",
        analysisId: typeof ev.analysis_id === "string" ? ev.analysis_id : prev.analysisId,
        questionType: typeof ev.question_type === "string" ? ev.question_type : null,
        note: typeof ev.note === "string" && ev.note.trim() ? ev.note.trim() : null,
        steps: steps.map((s) => ({
          index: Number(s.index),
          label: String(s.label ?? ""),
          status: "pending",
          total_matches: null,
          with_yield: null,
          ms: null,
          error: null,
        })),
      };
    }
    case "step":
      return { ...prev, steps: applyStep(prev.steps, p as unknown as InvestStepEvent) };
    case "picks": {
      const ev = p as unknown as InvestPicksEvent;
      return { ...prev, phase: prev.phase === "running" ? "writing" : prev.phase, picks: Array.isArray(ev.cards) ? ev.cards : [] };
    }
    case "comparison": {
      const ev = p as unknown as InvestComparisonEvent;
      const ok = Array.isArray(ev.columns) && ev.columns.length > 0 && Array.isArray(ev.rows) && ev.rows.length > 0;
      return { ...prev, comparison: ok ? ev : null };
    }
    case "answer_chunk": {
      const ev = p as unknown as InvestAnswerChunkEvent;
      const text = typeof ev.text === "string" ? ev.text : "";
      return { ...prev, phase: prev.phase === "running" ? "writing" : prev.phase, answer: prev.answer + text };
    }
    case "done": {
      const ev = p as unknown as InvestDoneEvent;
      return { ...prev, phase: "done", done: ev, analysisId: typeof ev.analysis_id === "string" ? ev.analysis_id : prev.analysisId };
    }
    case "skip":
      return { ...prev, phase: "idle" };
    case "error": {
      const ev = p as unknown as InvestErrorEvent;
      // Antes de `plan` no hay panel que avisar: queda en la analítica.
      return failed(prev, "error", UNAVAILABLE, typeof ev.message === "string" ? ev.message : null);
    }
    default:
      return null;
  }
}

/* ---------------- corrida ---------------- */

export interface InvestRunOpts {
  query: string;
  /** Sesión de P2 de la búsqueda (correlación). null si todavía no existe. */
  sessionId: string | null;
  signal: AbortSignal;
  /** Aplica un cambio de estado; el llamador descarta los de corridas viejas. */
  update: (fn: Updater) => void;
  timeoutMs?: number;
}

/**
 * Una corrida del análisis. Devuelve cuando el SSE cierra, se aborta o vence el
 * tiempo. Jamás lanza: todo fallo termina en un estado del panel y un evento.
 */
export async function runInvestAnalysis(opts: InvestRunOpts): Promise<void> {
  const { query, sessionId, signal, update } = opts;
  const t0 = performance.now();
  const elapsed = () => Math.round(performance.now() - t0);
  const meta = { query };
  // Fase según lo recibido (para los eventos): el estado de React se actualiza aparte.
  let phase: InvestPhase = "waiting";
  let analysisId: string | null = null;
  let planAt: number | null = null;
  let picksCount = 0;
  let answerChars = 0;
  let terminal = false;
  let timedOut = false;

  const abortLocal = new AbortController();
  const onOuterAbort = () => abortLocal.abort();
  signal.addEventListener("abort", onOuterAbort, { once: true });

  update(() => ({ ...INVEST_IDLE, phase: "waiting", query, startedAt: Date.now() }));
  trackEvent(EVENTS.INVEST_REQUESTED, meta);

  // Tiempo máximo del cliente: aborta el SSE (P2 cancela lo que quede) y deja lo que llegó.
  const timer = window.setTimeout(() => {
    if (terminal || abortLocal.signal.aborted) return;
    timedOut = true;
    terminal = true;
    trackEvent(EVENTS.INVEST_TIMEOUT, { ...meta, analysis_id: analysisId, phase, after_ms: elapsed(), picks: picksCount });
    update((prev) => failed(prev, "timeout", UNFINISHED));
    abortLocal.abort();
  }, opts.timeoutMs ?? INVEST_CLIENT_TIMEOUT_MS);

  try {
    const res = await fetch("/api/invest/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      signal: abortLocal.signal,
      body: JSON.stringify({ query, session_id: sessionId, visitor_id: getVisitorId() }),
    });

    if (res.status === 204) {
      // Canal apagado en este entorno, o P2 sin el endpoint todavía: como un skip.
      terminal = true;
      trackEvent(EVENTS.INVEST_SKIPPED, { ...meta, reason: res.headers.get("x-invest") ?? "disabled", after_ms: elapsed() });
      update((prev) => ({ ...prev, phase: "idle" }));
      return;
    }
    if (res.status === 429) {
      terminal = true;
      const body = (await res.json().catch(() => null)) as { error?: string; code?: string; retry_after?: number | null } | null;
      const retryAfterS = typeof body?.retry_after === "number" ? body.retry_after : null;
      trackEvent(EVENTS.INVEST_QUOTA, { ...meta, code: body?.code ?? null, retry_after: retryAfterS, after_ms: elapsed() });
      update((prev) => ({ ...prev, phase: "quota", notice: { message: body?.error ?? UNAVAILABLE, detail: null, retryAfterS } }));
      return;
    }
    if (!res.ok || !res.body) {
      terminal = true;
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      trackEvent(EVENTS.INVEST_FAILED, { ...meta, stage: "http", status: res.status, message: body?.error ?? null, after_ms: elapsed() });
      update((prev) => ({ ...prev, phase: "idle" }));
      return;
    }

    await readSSE(res.body, ({ event, data }) => {
      if (terminal) return;
      let payload: unknown;
      try {
        payload = JSON.parse(data);
      } catch {
        trackEvent(EVENTS.INVEST_FAILED, { ...meta, analysis_id: analysisId, stage: "parse", event, after_ms: elapsed() });
        return;
      }
      update((prev) => reduceInvestEvent(prev, event, payload) ?? prev);

      switch (event) {
        case "plan": {
          const ev = payload as InvestPlanEvent;
          phase = "running";
          analysisId = ev.analysis_id ?? null;
          planAt = elapsed();
          trackEvent(EVENTS.INVEST_STARTED, {
            ...meta,
            analysis_id: ev.analysis_id,
            question_type: ev.question_type,
            steps: (Array.isArray(ev.steps) ? ev.steps : []).map((s) => s.label),
            note: ev.note ?? null,
            adjustments: ev.adjustments ?? null,
            t_plan: planAt,
          });
          break;
        }
        case "step": {
          const ev = payload as InvestStepEvent;
          if (ev.status !== "running") {
            trackEvent(EVENTS.INVEST_STEP, {
              analysis_id: analysisId,
              index: ev.index,
              label: ev.label,
              status: ev.status,
              total_matches: ev.total_matches,
              with_yield: ev.with_yield ?? null,
              ms: ev.ms,
              params: ev.params ?? null,
              error: ev.error ?? null,
            });
          }
          break;
        }
        case "picks": {
          const ev = payload as InvestPicksEvent;
          phase = "writing";
          picksCount = Array.isArray(ev.cards) ? ev.cards.length : 0;
          break;
        }
        case "answer_chunk": {
          phase = "writing";
          answerChars += (payload as InvestAnswerChunkEvent).text?.length ?? 0;
          break;
        }
        case "done": {
          const ev = payload as InvestDoneEvent;
          phase = "done";
          terminal = true;
          trackEvent(EVENTS.INVEST_ANSWERED, {
            ...meta,
            analysis_id: ev.analysis_id,
            question_type: ev.question_type,
            partial: ev.partial,
            narrative: ev.narrative,
            latency_ms: ev.latency_ms,
            latency_detail_ms: ev.latency_detail_ms ?? null,
            model: ev.model,
            usage: ev.usage,
            cost_usd: ev.cost_usd,
            candidates: ev.candidates ?? null,
            steps: Array.isArray(ev.steps) ? ev.steps.length : 0,
            picks: picksCount,
            answer_chars: answerChars,
            t_plan: planAt,
            t_done: elapsed(),
          });
          break;
        }
        case "skip": {
          const ev = payload as InvestSkipEvent;
          phase = "idle";
          terminal = true;
          trackEvent(EVENTS.INVEST_SKIPPED, { ...meta, analysis_id: ev.analysis_id, reason: ev.reason, after_ms: elapsed() });
          break;
        }
        case "error": {
          const ev = payload as InvestErrorEvent;
          phase = "error";
          terminal = true;
          trackEvent(EVENTS.INVEST_FAILED, { ...meta, analysis_id: analysisId, stage: "sse", code: ev.code, status: ev.status ?? null, message: ev.message, after_ms: elapsed() });
          break;
        }
      }
    });

    if (!terminal && !abortLocal.signal.aborted) {
      // El stream cerró sin done/skip/error: se cortó del lado de P2.
      terminal = true;
      trackEvent(EVENTS.INVEST_FAILED, { ...meta, analysis_id: analysisId, stage: "cut", phase, after_ms: elapsed() });
      update((prev) => failed(prev, "error", UNAVAILABLE));
    }
  } catch {
    if (terminal || timedOut) return;
    terminal = true;
    if (abortLocal.signal.aborted) {
      // Cancelado por una búsqueda nueva o por navegar: P2 deja de pagar. No es un error.
      trackEvent(EVENTS.INVEST_CANCELLED, { ...meta, analysis_id: analysisId, phase, after_ms: elapsed(), picks: picksCount });
      return;
    }
    trackEvent(EVENTS.INVEST_FAILED, { ...meta, analysis_id: analysisId, stage: "network", phase, after_ms: elapsed() });
    update((prev) => failed(prev, "error", UNAVAILABLE));
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener("abort", onOuterAbort);
  }
}
