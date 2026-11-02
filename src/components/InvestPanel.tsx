"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  INVEST_IDLE,
  investInProgress,
  investPanelVisible,
  runInvestAnalysis,
  type InvestState,
  type InvestStepState,
} from "@/lib/invest-analysis";
import { fmtInt } from "@/lib/format";
import { EVENTS, trackEvent } from "@/lib/track";
import PropertyCard from "./PropertyCard";
import { EstimateNotice } from "./signals";

/**
 * Panel "Lectura de FINDER · inversión" (02/11 —
 * `docs/DECISION_2026-11-02_analisis-inversion.md`, plan 01/11 §4.2). Va
 * arriba del listado, solo en Invertir. Aparece al enviar con el cartel de
 * espera (German, 02/11) y se llena cuando P2 manda `plan`; con `skip` se va:
 *
 *   ▍Lectura de FINDER · inversión                 Analizando · 1 s   ▾
 *   ◌ Estoy leyendo el mercado para tu consulta: zonas, precios y rentabilidad
 *     estimada. Si hay algo que sumarle al listado, lo vas a ver acá en unos segundos.
 *
 *   ▍Lectura de FINDER · inversión                 Analizando · 12 s  ▾
 *   ✓ Departamentos en Capital hasta US$ 80.000 — 214 avisos · 150 con rentabilidad · ver avisos
 *   ✓ Casas en Rivadavia hasta US$ 80.000 — 54 avisos · 3 con rentabilidad · ver avisos
 *   [tabla de comparación, si llega]
 *   «En departamentos en Capital hasta US$ 80.000 encontré 214 avisos… (prosa por oraciones)»
 *   Selección de FINDER  [card + Por qué][card + Por qué][…]
 *   Valores estimados a partir de avisos publicados… (ESTIMATE_NOTICE)
 *
 * Todo texto es de P2/P3 y se muestra tal cual; el aviso de estimación lo pone
 * P1, siempre. Plegable con estado recordado (`pf_invest_panel`); mobile 380 px
 * primero (la tabla se apila por fila); `aria-live="polite"`.
 */

const OPEN_KEY = "pf_invest_panel";

/** Cartel de espera (texto de P1): desde el envío hasta `plan`/`skip`. Explica
 *  qué se está mirando y por qué puede desaparecer sin más. */
export const WAITING =
  "Estoy leyendo el mercado para tu consulta: zonas, precios y rentabilidad estimada. Si hay algo que sumarle al listado, lo vas a ver acá en unos segundos.";

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== "closed";
  } catch {
    return true;
  }
}

function storeOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? "open" : "closed");
  } catch {
    /* preferencia perdida: nada que romper */
  }
}

/* ------------------------------------------------------------------ */
/* Hook: una corrida por pregunta; la siguiente cancela a la anterior. */
/* ------------------------------------------------------------------ */

export function useInvestAnalysis() {
  const [state, setState] = useState<InvestState>(INVEST_IDLE);
  const stateRef = useRef<InvestState>(INVEST_IDLE);
  const seq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /** Cierra el SSE en curso (P2 cancela y deja de pagar) y saca el panel. */
  const cancel = useCallback(() => {
    seq.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    if (stateRef.current.phase !== "idle") {
      stateRef.current = INVEST_IDLE;
      setState(INVEST_IDLE);
    }
  }, []);

  const start = useCallback(
    (query: string, sessionId: string | null) => {
      cancel();
      const q = query.trim();
      if (!q) return;
      const myRun = seq.current;
      const ac = new AbortController();
      abortRef.current = ac;
      void runInvestAnalysis({
        query: q,
        sessionId,
        signal: ac.signal,
        update: (fn) => {
          if (seq.current !== myRun) return;
          setState((prev) => {
            const next = fn(prev);
            stateRef.current = next;
            return next;
          });
        },
      });
    },
    [cancel],
  );

  // Navegar fuera de la vista cierra el SSE: P2 cancela lo que quede. El abort
  // va diferido un tick: en dev, StrictMode desmonta y vuelve a montar en el
  // mismo tick, y un abort directo mataba el análisis recién disparado (visto
  // 02/11: `requested` sin `skip` ni `plan`).
  const pendingAbort = useRef<number | null>(null);
  useEffect(() => {
    if (pendingAbort.current != null) {
      window.clearTimeout(pendingAbort.current);
      pendingAbort.current = null;
    }
    return () => {
      pendingAbort.current = window.setTimeout(() => {
        pendingAbort.current = null;
        abortRef.current?.abort();
      }, 0);
    };
  }, []);

  return { state, start, cancel };
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

function useElapsedSeconds(active: boolean, since: number): number {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setS(Math.max(0, Math.round((Date.now() - since) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [active, since]);
  return s;
}

function StepRow({ step, onOpen }: { step: InvestStepState; onOpen: (s: InvestStepState) => void }) {
  const total = step.total_matches;
  const parts: string[] = [];
  if (step.status === "done" && total != null) parts.push(`${fmtInt(total)} ${total === 1 ? "aviso" : "avisos"}`);
  if (step.status === "done" && step.with_yield != null && total != null && total > 0) parts.push(`${fmtInt(step.with_yield)} con rentabilidad estimada`);
  if (step.status === "failed") parts.push(step.error?.trim() || "no se pudo consultar");
  // El rótulo del paso es una consulta válida del buscador (verificado 02/11:
  // "Departamento en Capital hasta US$ 80.000" → Capital · departamento · US$ 80.000).
  const href = `/buscar?${new URLSearchParams({ q: step.label, v: "invertir" }).toString()}`;
  return (
    <li className={`invest-step invest-step--${step.status}`} data-testid="invest-step" data-status={step.status} data-index={step.index}>
      <span className="invest-step-mark" aria-hidden>
        {step.status === "running" ? <span className="spinner spinner--inline" /> : step.status === "done" ? "✓" : step.status === "failed" ? "✕" : "·"}
      </span>
      <span className="invest-step-text">
        <span className="invest-step-label">{step.label}</span>
        {parts.length > 0 && <span className="invest-step-meta"> — {parts.join(" · ")}</span>}
        {step.status === "done" && total != null && total > 0 && (
          <>
            {" · "}
            <a href={href} target="_blank" rel="noopener" className="invest-step-link" onClick={() => onOpen(step)}>
              ver avisos
            </a>
          </>
        )}
      </span>
    </li>
  );
}

export default function InvestPanel({ state, searchId = null }: { state: InvestState; searchId?: string | null }) {
  const [open, setOpen] = useState<boolean>(readOpen);
  const inProgress = investInProgress(state);
  const seconds = useElapsedSeconds(inProgress, state.startedAt);

  if (!investPanelVisible(state)) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    storeOpen(next);
    trackEvent(EVENTS.INVEST_PANEL_TOGGLED, { open: next, analysis_id: state.analysisId, phase: state.phase });
  };

  let status: string;
  switch (state.phase) {
    case "waiting":
    case "running":
      status = `Analizando · ${seconds} s`;
      break;
    case "writing":
      status = `Escribiendo la lectura · ${seconds} s`;
      break;
    case "done":
      status = state.done?.partial ? "Análisis parcial" : `Listo en ${Math.round((state.done?.latency_ms ?? 0) / 1000)} s`;
      break;
    case "timeout":
      status = "Sin terminar";
      break;
    default:
      status = "No disponible ahora";
  }

  const streaming = state.phase === "writing" || state.phase === "running";
  const retryMin = state.notice?.retryAfterS != null ? Math.max(1, Math.ceil(state.notice.retryAfterS / 60)) : null;

  return (
    <section
      className={`invest-panel invest-panel--${state.phase}${open ? "" : " invest-panel--closed"}`}
      data-testid="invest-panel"
      data-phase={state.phase}
      data-analysis-id={state.analysisId ?? undefined}
      aria-live="polite"
    >
      <button type="button" className="invest-head" onClick={toggle} aria-expanded={open} data-testid="invest-toggle">
        <span className="invest-title">Lectura de FINDER · inversión</span>
        <span className="invest-status" data-testid="invest-status">
          {status}
        </span>
        <span className="invest-chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <div className="invest-body">
          {state.phase === "quota" && state.notice && (
            <p className="invest-notice" role="status" data-testid="invest-notice">
              {state.notice.message}
              {retryMin != null && state.notice.message.indexOf("Mañana") === -1 ? ` Podés volver a intentarlo en ${retryMin} ${retryMin === 1 ? "minuto" : "minutos"}.` : ""}
            </p>
          )}

          {state.note && (
            <p className="invest-note" data-testid="invest-note">
              {state.note}
            </p>
          )}

          {state.steps.length > 0 && (
            <ol className="invest-steps" data-testid="invest-steps">
              {state.steps.map((s) => (
                <StepRow
                  key={s.index}
                  step={s}
                  onOpen={(step) => trackEvent(EVENTS.INVEST_STEP_CLICK, { analysis_id: state.analysisId, index: step.index, label: step.label })}
                />
              ))}
            </ol>
          )}

          {state.phase === "waiting" && (
            <p className="invest-wait invest-waiting" data-testid="invest-waiting">
              <span className="spinner spinner--inline" aria-hidden /> {WAITING}
            </p>
          )}

          {state.phase === "running" && (
            <p className="invest-wait" data-testid="invest-wait">
              <span className="spinner spinner--inline" aria-hidden /> Puede tardar hasta un minuto. El listado de abajo ya está completo.
            </p>
          )}

          {state.comparison && (
            <div className="invest-compare-wrap">
              <table className="invest-compare" data-testid="invest-comparison">
                <thead>
                  <tr>
                    {state.comparison.columns.map((c, i) => (
                      <th key={i} scope="col">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.comparison.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) =>
                        c === 0 ? (
                          <th key={c} scope="row">
                            {cell}
                          </th>
                        ) : (
                          <td key={c} data-label={state.comparison!.columns[c] ?? ""}>
                            {cell}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {state.answer && (
            <p className="invest-answer" data-testid="invest-answer">
              {state.answer}
              {streaming && <span className="caret" aria-hidden />}
            </p>
          )}

          {state.phase === "done" && state.done?.partial && (
            <p className="invest-notice" role="status" data-testid="invest-partial">
              El análisis se cortó por tiempo: lo que ves es lo que alcanzó a leer.
            </p>
          )}

          {(state.phase === "timeout" || state.phase === "error") && state.notice && (
            <p className="invest-notice" role="status" data-testid="invest-notice">
              {state.notice.message}
              {state.notice.detail && <small> ({state.notice.detail})</small>}
            </p>
          )}

          {state.picks && state.picks.length > 0 && (
            <>
              <h3 className="invest-picks-title">Selección de FINDER</h3>
              <div className="cards-grid invest-picks" data-testid="invest-picks">
                {state.picks.map((card, i) => (
                  <PropertyCard key={card.id} card={card} searchId={searchId} rank={i + 1} vertical="invertir" origin="invest_pick" reason={card.reason} />
                ))}
              </div>
            </>
          )}

          {state.phase !== "waiting" && <EstimateNotice />}
        </div>
      )}
    </section>
  );
}
