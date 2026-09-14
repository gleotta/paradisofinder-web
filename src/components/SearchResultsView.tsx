"use client";

/**
 * Pantalla 2 — Resultados: BÚSQUEDA SIMPLE + mapa (patrón Airbnb).
 *
 * Cambio de producto del 29/08 (German): la interfaz no es conversacional. Pero
 * la búsqueda usa el canal con streaming de P2 abriendo una **sesión nueva por
 * consulta** (opción C), porque ese canal entrega los textos de P2/P3 que el
 * canal del portal no tiene: `suggestions`, el mensaje y los chips de
 * clarificación, el `summary` con `assumption_note` y `hard_filters`, y el
 * resumen en prosa. Registro y comparación de opciones en
 * `docs/DECISION_2026-08-29_busqueda-simple.md`.
 *
 * Flujo por búsqueda (T1, 14/09 — `docs/DECISION_2026-09-14_qa-produccion.md`):
 *  0. En el MISMO tick del submit: skeleton de 3 cards + "Buscando…" (nada de
 *     red todavía: < 500 ms en cualquier celular).
 *  1. `POST /sessions` → session_id (nuevo: sin memoria de la anterior).
 *  2. `POST /search/stream` (SSE): `cards` (~100 ms – 2,5 s) → se pintan YA,
 *     con "Entendí: …" (chips de `summary.hard_filters`) → la prosa se escribe
 *     debajo con cada `response_chunk` → `done`. Nunca se espera `done`.
 *     Si a los 4 s no llegó `cards`: mensaje de espera con la consulta y el
 *     botón "Buscar con filtros" (fallback `POST /search`, sync, sin LLM).
 *     Sesión inexistente (HTTP 404 antes del stream): se abre otra y se
 *     reintenta sin que el usuario lo note.
 *  3. Aclaración: terminal (sin `cards`) → pregunta con chips; NO terminal
 *     (`few_results`, después de `cards`) → burbuja con las relajaciones y sus
 *     conteos, cards y burbuja juntas, el stream se sigue leyendo hasta `done`.
 *  4. Mapa: `POST /search/map {session_id}` — forma (b), P2 resuelve el criterio.
 *  5. Scroll: páginas siguientes por el MISMO `/search/stream` con
 *     `{session_id, offset}` sin `query` — de a 10 hasta agotar
 *     `total_matches`, SIN tope (`docs/DECISION_2026-08-30_scroll-completo.md`).
 *
 * La sesión vive SOLO para esa búsqueda: los chips de clarificación
 * (`vertical_override`), las relajaciones, los chips de interpretación (T2:
 * "Quitar X", "en Zona", "hasta …", orden), las `suggestions` y el scroll se
 * resuelven dentro de ella, porque necesitan el criterio que P2 ya tiene.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Card,
  CardsEvent,
  ClarificationEvent,
  MapPin,
  MapSearchResponse,
  Related,
  RelaxOption,
  StreamErrorEvent,
  Summary,
  SyncSearchResponse,
} from "@/lib/p2/types";
import { readSSE } from "@/lib/sse";
import {
  cardsDigest,
  EVENTS,
  scoreStats,
  searchIdFor,
  setTrackingSearch,
  setTrackingVertical,
  trackEvent,
} from "@/lib/track";
import { fmtInt } from "@/lib/format";
import {
  isVerticalId,
  storeVertical,
  VERTICAL_OVERRIDE,
  VERTICAL_PHRASE,
  verticalFromSummary,
  type VerticalId,
} from "@/lib/vertical";
import InterpretationChips, { type RefineMeta } from "./InterpretationChips";
import PropertyCard from "./PropertyCard";
import ResultsMap from "./ResultsMap";
import SearchSkeleton from "./SearchSkeleton";
import VerticalSelector from "./VerticalSelector";

const PAGE_SIZE = 10;
/** Sin `cards` después de esto: mensaje de espera + botón de fallback (T1). */
const SLOW_MS = 4000;
const DEFAULT_CHIPS = ["Comprar", "Alquilar", "Invertir", "Lotes"];
/** Valores que acepta `vertical_override` (spec §3; "lotes" desde el 13/09). */
const OVERRIDE_BY_CHIP: Record<string, string> = {
  comprar: "comprar",
  alquilar: "alquilar",
  invertir: "invertir",
  lotes: "lotes",
};
/** Salida del bucle cuando ya eligió operación y P2 sigue sin señal. */
const REPEAT_EXAMPLES = [
  "casa en Rawson",
  "departamento en Capital hasta 60 mil dólares",
  "casa de 3 dormitorios con patio",
  "lotes en Santa Lucía",
];

/**
 * Clave de "búsqueda ya disparada" (query + vertical de la URL). ÚNICA
 * definición: el efecto la compara y `changeVertical` la pre-marca para
 * actualizar la URL sin relanzar la búsqueda — si divergen, el efecto pisa
 * el turno en-sesión con una búsqueda nueva y el selector rebota.
 */
function runKey(q: string, v: VerticalId | null): string {
  return `${q}|${v ?? ""}`;
}

interface ResultsState {
  query: string;
  /** Id de la corrida (`<session>.<turno>`) — viaja a las cards para la analítica. */
  searchId: string;
  /**
   * Todo lo recibido: el turno manda 20 de una, así que las 10 que sobran
   * quedan de buffer para la página 2 (sin red).
   */
  cards: Card[];
  /** Cuántas de `cards` se están mostrando: la página 1 son 10. */
  visibleCards: number;
  totalMatches: number;
  summary: Summary | null;
  /** Llega SOLO con la última página del criterio (máx 10, ya deduplicado). */
  related: Related | null;
  suggestions: string[] | null;
  /** Cómo llegaron: stream o fallback sync. */
  via: "stream" | "sync";
}

interface Clarification {
  message: string;
  chips: string[];
  /** true = ya eligió operación y P2 sigue sin señal: no repetir los chips. */
  repeat: boolean;
  /** true = un refinamiento en sesión no se entendió: se avisa y los resultados quedan. */
  soft: boolean;
}

/** Aclaración NO terminal (`few_results`): relajar UN filtro, con conteos. */
interface Relax {
  message: string;
  options: RelaxOption[];
}

interface Pending {
  query: string;
  /** true = pasaron SLOW_MS sin `cards`. */
  slow: boolean;
}

interface RunOpts {
  override?: string;
  keepSession?: boolean;
  vertical?: VerticalId | null;
  /** Origen de la corrida (analítica). */
  mode?: "search" | "chip" | "suggestion" | "vertical" | "relax" | "refine" | "assumption" | "order";
}

interface Timing {
  t0: number;
  tCards: number | null;
  reportedFor: string | null;
  mode: string;
}

const MOBILE_QUERY = "(max-width: 760px)";

/** ¿Layout mobile? (null en SSR → se asume desktop hasta hidratar). */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return mobile;
}

export default function SearchResultsView() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const rawUrlVertical = searchParams.get("v");
  const urlVertical = isVerticalId(rawUrlVertical) ? rawUrlVertical : null;

  const [input, setInput] = useState(urlQuery);
  /**
   * Selector de vertical (01/09): refleja lo que la búsqueda EN CURSO hizo,
   * no la preferencia guardada — arranca del `v` de la URL y después se
   * re-sincroniza con el `summary` de P2 (regla 2: el texto manda).
   */
  const [vertical, setVertical] = useState<VerticalId | null>(urlVertical);
  const [results, setResults] = useState<ResultsState | null>(null);
  const [narrative, setNarrative] = useState<{ text: string; streaming: boolean } | null>(null);
  const [clarification, setClarification] = useState<Clarification | null>(null);
  const [relax, setRelax] = useState<Relax | null>(null);
  const [error, setError] = useState<{ text: string; canRetry: boolean } | null>(null);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [mapPins, setMapPins] = useState<MapPin[] | null>(null);
  const [mapTotalMatches, setMapTotalMatches] = useState<number | null>(null);
  const [showMap, setShowMap] = useState(true);
  const [mapMobileOpen, setMapMobileOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Sube en cada turno con resultados: invalida los pins del mapa. */
  const [turn, setTurn] = useState(0);
  /** Latencia hasta las primeras cards del último turno (ms) — visible para las pruebas. */
  const [firstCardsMs, setFirstCardsMs] = useState<number | null>(null);

  const processedQuery = useRef<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  /** Turno dentro de la sesión de P2: cada corrida tiene su `search_id`. */
  const turnRef = useRef(0);
  const seenIds = useRef<Set<string>>(new Set());
  const mapKey = useRef<string | null>(null);
  const busyRef = useRef(false);
  /** Última corrida completa (query + opts) para el botón Reintentar. */
  const lastRun = useRef<{ query: string; opts?: RunOpts } | null>(null);
  /** Espejo del selector para comparar en el handler del SSE sin closures viejos. */
  const verticalRef = useRef<VerticalId | null>(urlVertical);
  const resultsRef = useRef<ResultsState | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const pendingNarrative = useRef("");
  const flushHandle = useRef<number | null>(null);
  /** Token de corrida: una búsqueda nueva invalida el stream anterior. */
  const runSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const slowTimer = useRef<number | null>(null);
  const timingRef = useRef<Timing | null>(null);
  /** true mientras la pestaña se descarga: un stream cortado por navegar no es un error. */
  const unloadingRef = useRef(false);

  useEffect(() => {
    const onHide = () => {
      unloadingRef.current = true;
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }, []);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    setTrackingVertical(vertical);
  }, [vertical]);

  /* ---------------- Búsqueda (sesión nueva + SSE) ---------------- */

  const clearSlowTimer = () => {
    if (slowTimer.current != null) {
      window.clearTimeout(slowTimer.current);
      slowTimer.current = null;
    }
  };

  /** Aplica una aclaración NO terminal (`few_results`), venga por evento o dentro de `cards`. */
  const applyRelax = useCallback((info: { message: string; options?: RelaxOption[] | null; chips?: string[] }, query: string) => {
    const options =
      info.options && info.options.length
        ? info.options
        : (info.chips ?? []).map((label) => ({ relax: label, label, count: -1 }));
    if (!options.length) return;
    setRelax({ message: info.message, options });
    trackEvent(EVENTS.CLARIFICATION_SHOWN, {
      query,
      reason: "few_results",
      terminal: false,
      chips: options.map((o) => o.label),
      counts: options.map((o) => o.count),
    });
  }, []);

  const runSearch = useCallback(
    async (query: string, opts?: RunOpts) => {
      // Una búsqueda nueva aborta el stream anterior (puede seguir escribiendo
      // el resumen) en vez de rebotar contra el guard.
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const myRun = ++runSeq.current;
      const isCurrent = () => runSeq.current === myRun;
      const mode = opts?.mode ?? "search";

      busyRef.current = true;
      setSearching(true);
      setError(null);
      setClarification(null);
      setRelax(null);
      setNarrative(null);
      setSelectedId(null);
      pendingNarrative.current = "";
      if (flushHandle.current != null) {
        cancelAnimationFrame(flushHandle.current);
        flushHandle.current = null;
      }
      lastRun.current = { query, opts };
      const searchMeta = {
        mode,
        query,
        vertical: opts?.vertical ?? verticalRef.current ?? null,
        vertical_override: opts?.override ?? null,
      };
      // T7: la base del embudo, antes de cualquier red.
      setTrackingSearch(sessionRef.current, null, { query, vertical: searchMeta.vertical });
      trackEvent(EVENTS.SEARCH_SUBMITTED, searchMeta);

      if (!opts?.keepSession) {
        // Búsqueda nueva = sesión nueva: sin memoria de la anterior.
        setResults(null);
        setMapPins(null);
        setMapTotalMatches(null);
        mapKey.current = null;
        sessionRef.current = null;
      }

      // Estado visible en el mismo tick (T1): skeleton + "Buscando…"; a los
      // 4 s sin cards, el mensaje de espera con el botón de fallback.
      const t0 = performance.now();
      timingRef.current = { t0, tCards: null, reportedFor: null, mode };
      setFirstCardsMs(null);
      setPending({ query, slow: false });
      clearSlowTimer();
      slowTimer.current = window.setTimeout(() => {
        if (!isCurrent()) return;
        setPending((p) => (p && !p.slow ? { ...p, slow: true } : p));
        trackEvent(EVENTS.SEARCH_SLOW, { ...searchMeta, after_ms: SLOW_MS });
      }, SLOW_MS);

      try {
        const openSession = async (): Promise<string | null> => {
          let sres = await fetch("/api/sessions", { method: "POST", signal: ac.signal });
          // 429 = rate limit de sesiones de P2: backoff corto y un reintento.
          if (sres.status === 429) {
            trackEvent(EVENTS.SEARCH_ERROR, { ...searchMeta, stage: "session", status: 429, retry: true });
            await new Promise((r) => setTimeout(r, 2500));
            if (!isCurrent()) return null;
            sres = await fetch("/api/sessions", { method: "POST", signal: ac.signal });
          }
          if (!sres.ok) return null;
          const sdata = (await sres.json()) as { session_id: string };
          sessionRef.current = sdata.session_id;
          turnRef.current = 0;
          return sdata.session_id;
        };
        /**
         * Cada corrida es un turno de la sesión y tiene su `search_id`
         * (`<session>.<turno>`): es la clave que une consulta → resultados →
         * qué se abrió en la analítica (`docs/DECISION_2026-09-05_mvp-beta.md`).
         */
        const beginTurn = (sessionId: string, extra: Record<string, unknown> = {}) => {
          turnRef.current += 1;
          const id = searchIdFor(sessionId, turnRef.current);
          setTrackingSearch(sessionId, id, { query, vertical: searchMeta.vertical });
          trackEvent(EVENTS.SEARCH, { ...searchMeta, ...extra });
          return id;
        };

        let sessionId = sessionRef.current ?? (await openSession());
        if (!sessionId) {
          trackEvent(EVENTS.SEARCH_ERROR, { ...searchMeta, stage: "session" });
          setError({ text: "No pude iniciar la búsqueda. Probá de nuevo en unos segundos.", canRetry: true });
          return;
        }
        let searchId = beginTurn(sessionId);

        const send = (sessionId: string) =>
          fetch("/api/search/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: ac.signal,
            body: JSON.stringify({
              session_id: sessionId,
              ...(query ? { query } : {}),
              ...(opts?.override ? { vertical_override: opts.override } : {}),
              // La selección viaja aparte y CRUDA: el server decide si compone
              // la frase canónica (sonda de extracción — el texto predomina).
              ...(opts?.vertical && !opts?.override ? { vertical: opts.vertical } : {}),
            }),
          });

        let res = await send(sessionId);
        // 429 = rate limit de búsqueda de P2 (30/min por IP): backoff corto y
        // un reintento antes de mostrar nada (contrato §6).
        if (res.status === 429) {
          trackEvent(EVENTS.SEARCH_ERROR, { ...searchMeta, stage: "stream", status: 429, retry: true });
          await new Promise((r) => setTimeout(r, 2500));
          if (!isCurrent()) return;
          res = await send(sessionId);
        }
        // 404 = sesión inexistente/expirada → abrir otra y reintentar, sin que
        // el usuario lo note (contrato 13/09 §6). Error solo si el reintento falla.
        if (res.status === 404) {
          trackEvent(EVENTS.SESSION_RETRY, { ...searchMeta, stage: "turn" });
          const fresh = await openSession();
          if (fresh) {
            sessionId = fresh;
            searchId = beginTurn(fresh, { retry: "session_expired" });
            res = await send(fresh);
          }
        }

        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          trackEvent(EVENTS.SEARCH_ERROR, {
            ...searchMeta,
            stage: "stream",
            status: res.status,
            message: body?.error ?? null,
          });
          setError({
            text:
              res.status === 404
                ? "La sesión de búsqueda venció y no pude abrir otra. Volvé a buscar."
                : (body?.error ?? "No pude completar la búsqueda. Probá de nuevo en un momento."),
            canRetry: res.status !== 422,
          });
          return;
        }

        let gotCards = false;
        await readSSE(res.body, ({ event, data }) => {
          if (!isCurrent()) return;
          switch (event) {
            case "cards": {
              const ev = JSON.parse(data) as CardsEvent;
              gotCards = true;
              clearSlowTimer();
              setPending(null);
              const tCards = performance.now();
              if (timingRef.current) timingRef.current.tCards = tCards;
              setFirstCardsMs(Math.round(tCards - t0));
              seenIds.current = new Set(ev.cards.map((c) => c.id));
              for (const c of ev.related?.cards ?? []) seenIds.current.add(c.id);
              setResults({
                query,
                searchId,
                cards: ev.cards,
                visibleCards: Math.min(PAGE_SIZE, ev.cards.length),
                totalMatches: ev.total_matches,
                summary: ev.summary,
                related: ev.related,
                suggestions: ev.suggestions,
                via: "stream",
              });
              setTurn((t) => t + 1);
              // Re-sincronización del selector (regla 2: el texto manda): el
              // botón refleja lo que P2 REALMENTE buscó. Si el summary no
              // mapea (p. ej. temporario), queda sin selección y la
              // preferencia guardada no se toca.
              const detected = verticalFromSummary(ev.summary);
              if (detected !== verticalRef.current) {
                trackEvent(EVENTS.VERTICAL_RESYNC, {
                  from: verticalRef.current,
                  to: detected,
                  query,
                });
                verticalRef.current = detected;
                setVertical(detected);
                if (detected) storeVertical(detected);
              }
              // Los resultados YA están en pantalla: la búsqueda terminó para el
              // usuario. Esperar a que cierre el stream dejaba el spinner y el
              // botón bloqueados ~2 s de más mientras se escribía el resumen.
              setSearching(false);
              busyRef.current = false;
              // El "resultado" de la consulta para la analítica: total real,
              // scores y ranking de la página (ids + score), latencia hasta las cards.
              trackEvent(EVENTS.SEARCH_RESULTS, {
                query,
                total_matches: ev.total_matches,
                received: ev.cards.length,
                summary: ev.summary
                  ? {
                      vertical: ev.summary.vertical,
                      zone: ev.summary.zone,
                      property_type: ev.summary.property_type,
                      budget: ev.summary.budget,
                      order: ev.summary.order,
                      order_code: ev.summary.order_code ?? null,
                      assumption_note: ev.summary.assumption_note,
                      hard_filters: (ev.summary.hard_filters ?? []).map((f) => f.field),
                      near: ev.summary.near ?? null,
                    }
                  : null,
                scores: scoreStats(ev.cards),
                results: cardsDigest(ev.cards),
                related_count: ev.related?.count ?? 0,
                suggestions: ev.suggestions ?? null,
                latency_ms: Math.round(tCards - t0),
              });
              if (ev.total_matches === 0) {
                trackEvent(EVENTS.ZERO_RESULTS, { query, suggestions: ev.suggestions ?? null });
              }
              if (ev.related) {
                trackEvent(EVENTS.RELATED_SHOWN, {
                  reason: ev.related.reason,
                  count: ev.related.count,
                  results: cardsDigest(ev.related.cards),
                });
              }
              // Copia de la aclaración NO terminal dentro de `cards` (§3.1): si
              // el evento aparte no llegara, la burbuja igual se muestra.
              if (ev.clarification && ev.clarification.reason === "few_results") {
                applyRelax(ev.clarification, query);
              }
              break;
            }
            case "response_chunk": {
              const { token } = JSON.parse(data) as { token: string };
              // Los tokens se acumulan y se vuelcan por frame: un setState por
              // token re-renderizaba la lista entera decenas de veces.
              pendingNarrative.current += token;
              if (flushHandle.current == null) {
                flushHandle.current = requestAnimationFrame(() => {
                  flushHandle.current = null;
                  const text = pendingNarrative.current;
                  setNarrative({ text, streaming: true });
                });
              }
              break;
            }
            case "clarification": {
              const ev = JSON.parse(data) as ClarificationEvent;
              const nonTerminal = ev.terminal === false || ev.clarification_reason === "few_results";
              if (nonTerminal) {
                // Las cards que cumplen ya salieron; se ofrece relajar UN filtro
                // y el stream sigue (narrativa → done). Cards + burbuja juntas.
                applyRelax({ message: ev.message, options: ev.options, chips: ev.chips }, query);
                break;
              }
              const repeat = !!opts?.override && ev.nivel1_required;
              // Un refinamiento en sesión que P2 no entiende (visto 14/09: "ordenar
              // por precio de menor a mayor" → sin_senal) no borra lo que hay en
              // pantalla: el criterio de la sesión sigue intacto.
              const soft = !!opts?.keepSession && !!resultsRef.current && !opts?.override;
              trackEvent(EVENTS.CLARIFICATION_SHOWN, {
                query,
                repeat,
                soft,
                terminal: true,
                reason: ev.clarification_reason,
                chips: ev.chips,
              });
              if (!soft) setResults(null);
              clearSlowTimer();
              setPending(null);
              setClarification({
                message: ev.message,
                chips: ev.chips.length ? ev.chips : ev.nivel1_required ? DEFAULT_CHIPS : [],
                repeat,
                soft,
              });
              break;
            }
            case "error": {
              const ev = JSON.parse(data) as StreamErrorEvent;
              trackEvent(EVENTS.SEARCH_ERROR, { ...searchMeta, stage: "sse", message: ev.message, status: ev.status ?? null });
              setError({ text: ev.message, canRetry: true });
              break;
            }
          }
        });

        if (!gotCards && !clarification) {
          // Stream sin cards ni clarificación: no dejar la pantalla muda.
          setNarrative((prev) => (prev?.text ? { text: prev.text, streaming: false } : null));
        }
      } catch {
        // Un abort es una búsqueda nueva pisando a la anterior, no un fallo; y
        // navegar a otra página a mitad del stream tampoco.
        if (isCurrent() && !ac.signal.aborted && !unloadingRef.current) {
          trackEvent(EVENTS.SEARCH_ERROR, { ...searchMeta, stage: "network" });
          setError({ text: "Se cortó la conexión con el buscador. Probá de nuevo.", canRetry: true });
        }
      } finally {
        // Volcado final: el último frame puede quedar pendiente al cerrar el stream.
        if (flushHandle.current != null) {
          cancelAnimationFrame(flushHandle.current);
          flushHandle.current = null;
        }
        if (isCurrent()) {
          clearSlowTimer();
          setPending(null);
          const text = pendingNarrative.current;
          setNarrative(text ? { text, streaming: false } : null);
          busyRef.current = false;
          setSearching(false);
        }
      }
    },
    // `clarification` se lee solo para el guard final; no debe recrear el callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyRelax],
  );

  /**
   * "Buscar con filtros" (T1): la misma consulta por el canal sync de P2
   * (`POST /search`, sin narrativa LLM), en la MISMA sesión. Aborta el stream
   * lento; si la sesión venció (404), abre otra y reintenta una vez.
   */
  const runFallback = useCallback(async () => {
    const last = lastRun.current;
    if (!last) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const myRun = ++runSeq.current;
    const isCurrent = () => runSeq.current === myRun;
    clearSlowTimer();
    setPending({ query: last.query, slow: false });
    setSearching(true);
    setError(null);
    const t0 = timingRef.current?.t0 ?? performance.now();
    timingRef.current = { t0, tCards: null, reportedFor: null, mode: "fallback" };
    trackEvent(EVENTS.SEARCH_FALLBACK, { query: last.query, mode: last.opts?.mode ?? "search" });

    const openSession = async (): Promise<string | null> => {
      const sres = await fetch("/api/sessions", { method: "POST", signal: ac.signal });
      if (!sres.ok) return null;
      const sdata = (await sres.json()) as { session_id: string };
      sessionRef.current = sdata.session_id;
      turnRef.current = 0;
      return sdata.session_id;
    };
    const send = (sessionId: string) =>
      fetch("/api/search/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          session_id: sessionId,
          query: last.query,
          ...(last.opts?.override ? { vertical_override: last.opts.override } : {}),
          ...(last.opts?.vertical && !last.opts?.override ? { vertical: last.opts.vertical } : {}),
        }),
      });

    try {
      let sessionId = sessionRef.current ?? (await openSession());
      if (!sessionId) throw new Error("session");
      let res = await send(sessionId);
      if (res.status === 404) {
        trackEvent(EVENTS.SESSION_RETRY, { query: last.query, stage: "fallback" });
        const fresh = await openSession();
        if (!fresh) throw new Error("session");
        sessionId = fresh;
        res = await send(fresh);
      }
      if (!isCurrent()) return;
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError({ text: body?.error ?? "No pude completar la búsqueda. Probá de nuevo en un momento.", canRetry: true });
        return;
      }
      const data = (await res.json()) as SyncSearchResponse;
      if (!isCurrent()) return;
      turnRef.current += 1;
      const searchId = searchIdFor(sessionId, turnRef.current);
      setTrackingSearch(sessionId, searchId, { query: last.query, vertical: verticalRef.current });
      const tCards = performance.now();
      if (timingRef.current) timingRef.current.tCards = tCards;
      setFirstCardsMs(Math.round(tCards - t0));
      const total = data.summary?.total_results ?? data.cards.length;
      seenIds.current = new Set(data.cards.map((c) => c.id));
      for (const c of data.related?.cards ?? []) seenIds.current.add(c.id);
      setResults({
        query: last.query,
        searchId,
        cards: data.cards,
        visibleCards: Math.min(PAGE_SIZE, data.cards.length),
        totalMatches: total,
        summary: data.summary,
        related: data.related,
        suggestions: data.suggestions,
        via: "sync",
      });
      setTurn((t) => t + 1);
      setNarrative(data.llm_response ? { text: data.llm_response, streaming: false } : null);
      if (data.clarification && data.clarification.reason === "few_results") {
        applyRelax(data.clarification, last.query);
      }
      const detected = verticalFromSummary(data.summary);
      if (detected !== verticalRef.current) {
        verticalRef.current = detected;
        setVertical(detected);
        if (detected) storeVertical(detected);
      }
      trackEvent(EVENTS.SEARCH_RESULTS, {
        query: last.query,
        via: "sync",
        total_matches: total,
        received: data.cards.length,
        scores: scoreStats(data.cards),
        results: cardsDigest(data.cards),
        latency_ms: Math.round(tCards - t0),
      });
      if (total === 0) trackEvent(EVENTS.ZERO_RESULTS, { query: last.query, suggestions: data.suggestions ?? null });
    } catch {
      if (isCurrent() && !ac.signal.aborted) {
        trackEvent(EVENTS.SEARCH_ERROR, { query: last.query, stage: "fallback" });
        setError({ text: "Tampoco pude buscar por el canal directo. Probá de nuevo en un momento.", canRetry: true });
      }
    } finally {
      if (isCurrent()) {
        setPending(null);
        setSearching(false);
        busyRef.current = false;
      }
    }
  }, [applyRelax]);

  /** T7: `cards_rendered` con la latencia medida en el cliente, después de pintar. */
  useEffect(() => {
    const t = timingRef.current;
    if (!results || !t || t.tCards == null || t.reportedFor === results.searchId) return;
    t.reportedFor = results.searchId;
    const tPaint = performance.now();
    trackEvent(EVENTS.CARDS_RENDERED, {
      t_first_cards: Math.round(t.tCards - t.t0),
      t_first_paint: Math.round(tPaint - t.t0),
      received: results.cards.length,
      shown: results.visibleCards,
      total_matches: results.totalMatches,
      via: results.via,
      mode: t.mode,
    });
  }, [results]);

  /** Navegar cambia `?q=` (y `v`), y el efecto dispara la búsqueda (sesión nueva). */
  const submitQuery = useCallback(
    (query: string, v?: VerticalId | null) => {
      const q = query.trim();
      if (!q) return;
      const vert = v === undefined ? verticalRef.current : v;
      setInput(q);
      if (q === urlQuery && vert === urlVertical) {
        processedQuery.current = null;
        void runSearch(q, { vertical: vert });
      } else {
        const params = new URLSearchParams({ q });
        if (vert) params.set("v", vert);
        router.push(`/buscar?${params.toString()}`);
      }
    },
    [router, runSearch, urlQuery, urlVertical],
  );

  useEffect(() => {
    // La clave incluye el vertical: cambiar solo el botón (misma query)
    // también es una búsqueda nueva.
    const key = runKey(urlQuery, urlVertical);
    if (urlQuery && processedQuery.current !== key) {
      processedQuery.current = key;
      setInput(urlQuery);
      verticalRef.current = urlVertical;
      setVertical(urlVertical);
      void runSearch(urlQuery, { vertical: urlVertical });
    }
  }, [urlQuery, urlVertical, runSearch]);

  /**
   * Click en el selector: queda como preferencia y cambia la búsqueda vigente.
   *
   * Con resultados en pantalla el click es la intención MÁS reciente y le
   * gana al texto YA buscado — si no, con un texto tipo "depto para alquilar"
   * el botón rebotaba a Alquilar y parecía roto (reporte de German 01/09).
   * Se resuelve DENTRO de la misma sesión para no perder el criterio
   * acumulado (zona, tipo, presupuesto — verificado contra P2 real):
   * `vertical_override` para alquilar/comprar/lotes; para invertir, la frase
   * como refinamiento (el override `invertir` de P2 cae en compra sin orden).
   * Lo tipeado sigue mandando al momento de buscar texto NUEVO.
   *
   * Sin resultados (o toggle-off del activo): búsqueda nueva — sin selección
   * P2 infiere del texto, como siempre.
   */
  const changeVertical = useCallback(
    (v: VerticalId | null) => {
      verticalRef.current = v;
      setVertical(v);
      storeVertical(v);
      trackEvent(EVENTS.VERTICAL_SELECTED, { vertical: v, screen: "results" });
      if (!urlQuery) return;

      if (v && results && sessionRef.current) {
        if (v === "invertir") {
          void runSearch(VERTICAL_PHRASE.invertir, { keepSession: true, mode: "vertical" });
        } else {
          void runSearch(urlQuery, { override: VERTICAL_OVERRIDE[v], keepSession: true, mode: "vertical" });
        }
        // La URL acompaña (link compartible / back reproducible) sin relanzar
        // el efecto: la clave ya se marca como procesada.
        processedQuery.current = runKey(urlQuery, v);
        const params = new URLSearchParams({ q: urlQuery, v });
        router.replace(`/buscar?${params.toString()}`, { scroll: false });
        return;
      }

      submitQuery(urlQuery, v);
    },
    [results, router, runSearch, submitQuery, urlQuery],
  );

  /* ------- Scroll infinito (de a 10 hasta agotar el criterio, sin tope) ------- */

  const loadMore = useCallback(async () => {
    const r = results;
    if (!r || busyRef.current) return;
    if (r.visibleCards === 0) return;

    // Página 2: ya está en memoria (el turno mandó 20). Sin red, sin spinner.
    if (r.visibleCards < r.cards.length) {
      const next = Math.min(r.cards.length, r.visibleCards + PAGE_SIZE);
      trackEvent(EVENTS.PAGE_LOADED, {
        offset: r.visibleCards,
        kind: "buffer",
        total_matches: r.totalMatches,
        results: cardsDigest(r.cards.slice(r.visibleCards, next), r.visibleCards),
      });
      setResults((prev) => (prev ? { ...prev, visibleCards: next } : prev));
      return;
    }

    // Criterio agotado: si había "relacionadas", ya llegaron con la última página.
    if (r.cards.length >= r.totalMatches) return;

    const sessionId = sessionRef.current;
    if (!sessionId) return;

    // Páginas siguientes: paginación de la sesión (`{session_id, offset}` sin
    // query) — no es un turno, no toca el estado de P2 y responde en ~100 ms
    // con SSE cards → done sin narrativa. El criterio completo vive en P2:
    // nada que reenviar ni que poder perder (`is_duplex` y `place` incluidos).
    const myRun = runSeq.current;
    busyRef.current = true;
    setLoadingMore(true);
    try {
      const res = await fetch("/api/search/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          offset: r.cards.length,
          limit: PAGE_SIZE,
        }),
      });
      if (res.status === 404) {
        // La sesión venció a mitad del scroll (TTL 24 h): la corrida se rehace
        // en una sesión nueva, sin mensaje de error (el usuario ve la lista
        // recargarse desde la primera página).
        trackEvent(EVENTS.SESSION_RETRY, { stage: "pagination", offset: r.cards.length });
        const last = lastRun.current;
        busyRef.current = false;
        setLoadingMore(false);
        if (last) void runSearch(last.query, { ...last.opts, keepSession: false });
        return;
      }
      if (!res.ok || !res.body) return;
      await readSSE(res.body, ({ event, data }) => {
        if (runSeq.current !== myRun || event !== "cards") return;
        const ev = JSON.parse(data) as CardsEvent;
        const fresh = ev.cards.filter((c) => !seenIds.current.has(c.id));
        for (const c of fresh) seenIds.current.add(c.id);
        for (const c of ev.related?.cards ?? []) seenIds.current.add(c.id);
        trackEvent(EVENTS.PAGE_LOADED, {
          offset: r.cards.length,
          kind: "session",
          total_matches: ev.total_matches,
          results: cardsDigest(fresh, r.cards.length),
        });
        if (ev.related) {
          trackEvent(EVENTS.RELATED_SHOWN, {
            reason: ev.related.reason,
            count: ev.related.count,
            results: cardsDigest(ev.related.cards),
          });
        }
        setResults((prev) =>
          prev
            ? {
                ...prev,
                cards: [...prev.cards, ...fresh],
                visibleCards: prev.visibleCards + fresh.length,
                related: ev.related ?? prev.related,
              }
            : prev,
        );
      });
    } finally {
      busyRef.current = false;
      setLoadingMore(false);
    }
  }, [results, runSearch]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !results) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [results, loadMore]);

  /* ---------------- Mapa (forma (b): P2 resuelve el criterio) ---------------- */

  useEffect(() => {
    if (!((showMap && !isMobile) || mapMobileOpen)) return;
    if (!results || results.cards.length === 0) return;
    const sessionId = sessionRef.current;
    if (!sessionId) return;

    const key = `${sessionId}#${turn}`;
    if (mapKey.current === key) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/search/map", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as MapSearchResponse;
        if (cancelled) return;
        mapKey.current = key;
        setMapPins(data.pins);
        setMapTotalMatches(data.total_matches);
        trackEvent(EVENTS.MAP_FEED, { pins: data.total_pins, total_matches: data.total_matches });
      } catch {
        /* sin pins: el mapa queda vacío hasta la próxima búsqueda */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showMap, mapMobileOpen, results, turn, isMobile]);

  const handleMapSelect = useCallback((id: string) => {
    setSelectedId(id);
    document.getElementById(`pcard-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const toggleDesktopMap = useCallback(() => {
    const next = !showMap;
    setShowMap(next);
    trackEvent(EVENTS.MAP_TOGGLED, { open: next, mode: "split" });
  }, [showMap]);

  const toggleMapOverlay = useCallback(() => {
    const next = !mapMobileOpen;
    setMapMobileOpen(next);
    trackEvent(EVENTS.MAP_TOGGLED, { open: next, mode: "overlay" });
  }, [mapMobileOpen]);

  /** Chip de clarificación terminal: se resuelve DENTRO de la misma sesión (spec §3). */
  const handleChip = useCallback(
    (chip: string) => {
      const lower = chip.toLowerCase();
      trackEvent(EVENTS.CLARIFICATION_CHOICE, { chip, reason: "terminal", mode: "search" });
      // Elegir "Comprar"/"Alquilar"/"Invertir"/"Lotes" acá también es elegir
      // vertical: el selector y la preferencia acompañan (el summary lo confirma después).
      if (isVerticalId(lower)) {
        verticalRef.current = lower;
        setVertical(lower);
        storeVertical(lower);
      }
      const override = OVERRIDE_BY_CHIP[lower];
      if (override) {
        void runSearch(urlQuery, { override, keepSession: true, mode: "chip" });
      } else {
        // Chips que no son vertical ("Viviendas", "Lotes"…): el texto del chip
        // es la respuesta, como refinamiento en la sesión.
        void runSearch(chip, { keepSession: true, mode: "chip" });
      }
    },
    [runSearch, urlQuery],
  );

  /** Relajación (`few_results`): el `label` del chip va como query en la misma sesión (§3.3b). */
  const handleRelax = useCallback(
    (o: RelaxOption) => {
      trackEvent(EVENTS.CLARIFICATION_CHOICE, { chip: o.label, relax: o.relax, count: o.count, reason: "few_results" });
      setRelax(null);
      void runSearch(o.label, { keepSession: true, mode: "relax" });
    },
    [runSearch],
  );

  /** `suggestions` de P2: acciones sobre el criterio del turno → misma sesión. */
  const handleSuggestion = useCallback(
    (s: string) => {
      void runSearch(s, { keepSession: true, mode: "suggestion" });
    },
    [runSearch],
  );

  /** Chips de interpretación (T2): frase de refinamiento en la misma sesión. */
  const handleRefine = useCallback(
    (phrase: string, meta: RefineMeta) => {
      void runSearch(phrase, { keepSession: true, mode: meta.kind === "order" ? "order" : "refine" });
    },
    [runSearch],
  );

  /** "Asumí compra · cambiar a alquiler": override en la misma sesión (preserva el criterio). */
  const handleFlipAssumption = useCallback(
    (to: "alquilar" | "comprar") => {
      verticalRef.current = to;
      setVertical(to);
      storeVertical(to);
      void runSearch(urlQuery, { override: VERTICAL_OVERRIDE[to], keepSession: true, mode: "assumption" });
    },
    [runSearch, urlQuery],
  );

  /* ---------------- Render ---------------- */

  const pins = useMemo(() => mapPins ?? [], [mapPins]);
  const mapAvailable = !!results && results.cards.length > 0;
  // En mobile el split no existe: el mapa se monta SOLO con el overlay
  // abierto, así Leaflet no compite con el pintado de las cards (T1).
  const mapSplit = mapAvailable && showMap && !isMobile;
  const mapOverlay = mapAvailable && mapMobileOpen;
  const zero = !!results && results.totalMatches === 0;
  const isRent = results?.summary?.vertical?.toLowerCase().includes("alquiler") ?? vertical === "alquilar";
  /** Skeleton: buscando y todavía sin nada en pantalla. */
  const showSkeleton = searching && !results && !error && !clarification;
  /** Refinando con resultados en pantalla: se atenúan hasta que llegan los nuevos. */
  const refreshing = searching && !!results;

  return (
    <div
      className={`results-layout${mapSplit ? " has-map" : ""}${mapOverlay ? " map-overlay-open" : ""}`}
      data-testid="results"
      data-first-cards-ms={firstCardsMs ?? undefined}
      data-state={showSkeleton ? "searching" : results ? "results" : clarification ? "clarification" : error ? "error" : "idle"}
    >
      <div className="results-col results-page">
        <form
          className="searchbar-row"
          onSubmit={(e) => {
            e.preventDefault();
            submitQuery(input);
          }}
          role="search"
        >
          <VerticalSelector
            className="vseg--bar"
            value={vertical}
            onChange={changeVertical}
            disabled={searching}
          />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Buscá: casa con patio en Rawson hasta 80 mil dólares"
            aria-label="Buscar propiedades"
          />
          <button type="submit" className="btn btn-magenta" disabled={searching || !input.trim()}>
            {searching ? "…" : "Buscar"}
          </button>
        </form>

        <div className="results-head-row">
          <ResultsHead
            results={results}
            query={urlQuery}
            searching={searching}
            pending={pending}
            isRent={isRent}
            onRefine={handleRefine}
            onFlipAssumption={handleFlipAssumption}
          />
          {mapAvailable && (
            <button
              type="button"
              className="btn btn-ghost map-toggle-desktop"
              onClick={toggleDesktopMap}
              aria-pressed={mapSplit}
            >
              {mapSplit ? "Ocultar mapa" : "Ver mapa"}
            </button>
          )}
        </div>

        {/* Espera larga (T1): sin cards a los 4 s → lo interpretado hasta ahora
            (la consulta) y el fallback sync de P2. */}
        {pending?.slow && !results && (
          <div className="slow-wait" role="status" data-testid="slow-wait">
            <h3>Está tardando más de lo normal</h3>
            <p>
              Sigo buscando: «{pending.query}». Si preferís, hago la búsqueda directa con los filtros (sin el
              resumen en prosa).
            </p>
            <button type="button" className="btn btn-magenta" onClick={() => void runFallback()}>
              Buscar con filtros
            </button>
          </div>
        )}

        {/* Resumen de P2 en prosa — texto de P3/LLM, se muestra tal cual; se
            va escribiendo debajo de las cards conforme llegan los chunks. */}
        {narrative?.text && (
          <div className="summary" role="status" aria-live="polite" data-testid="narrative">
            <span className="summary-label">Resumen</span>
            <p>
              {narrative.text}
              {narrative.streaming && <span className="caret" aria-hidden />}
            </p>
          </div>
        )}

        {/* Aclaración NO terminal (`few_results`): burbuja con las relajaciones
            propuestas y sus conteos; las cards que cumplen quedan debajo. */}
        {relax && (
          <div className="relax-bubble" role="status" data-testid="relax-bubble">
            <p>{relax.message}</p>
            <div className="msg-chips">
              {relax.options.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  className="chip chip--action"
                  onClick={() => handleRelax(o)}
                  disabled={searching}
                >
                  {o.label}
                  {o.count >= 0 && <span className="chip-count">{fmtInt(o.count)}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {clarification && clarification.soft && (
          <div className="relax-bubble relax-bubble--soft" role="status">
            <p>{clarification.message}</p>
            <p className="section-note">Los resultados de abajo siguen siendo los de tu búsqueda anterior.</p>
          </div>
        )}

        {clarification && !clarification.repeat && !clarification.soft && (
          <div className="zero-state" role="status" data-testid="clarification">
            <h3>Una precisión antes de buscar</h3>
            <p>{clarification.message}</p>
            {clarification.chips.length > 0 ? (
              <div className="msg-chips">
                {clarification.chips.map((chip) => (
                  <button
                    key={chip}
                    className="chip chip--action"
                    onClick={() => handleChip(chip)}
                    disabled={searching}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            ) : (
              // P2 puede clarificar SIN chips (visto 31/08: reason "otra_ciudad",
              // chips=[] y nivel1_required=false). Sin acciones el bloque es un
              // callejón sin salida: se ofrecen búsquedas de ejemplo, como en el
              // caso `repeat`.
              <>
                <p className="section-note">Probá, por ejemplo:</p>
                <div className="msg-chips">
                  {REPEAT_EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      className="chip chip--action"
                      onClick={() => submitQuery(ex)}
                      disabled={searching}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {clarification?.repeat && (
          <div className="zero-state" role="status">
            <h3>Necesito un dato más para buscar</h3>
            <p>
              Con eso todavía no puedo armar una búsqueda. Sumá al menos un tipo de propiedad,
              una zona o un presupuesto — por ejemplo:
            </p>
            <div className="msg-chips">
              {REPEAT_EXAMPLES.map((ex) => (
                <button key={ex} className="chip chip--action" onClick={() => submitQuery(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="zero-state" role="alert" data-testid="search-error">
            <h3>No pude completar la búsqueda</h3>
            <p>{error.text}</p>
            {error.canRetry && (
              <button
                className="btn btn-magenta"
                onClick={() => {
                  const last = lastRun.current;
                  if (last) void runSearch(last.query, last.opts);
                }}
              >
                Reintentar
              </button>
            )}
          </div>
        )}

        {/* Cero resultados: la narrativa de P2 ya explica el caso; acá van sus
            acciones (`suggestions`) para relajar el criterio (regla 6). */}
        {zero && (results!.suggestions?.length ?? 0) > 0 && (
          <div className="zero-state" role="status">
            <h3>Sin resultados para esta búsqueda</h3>
            <p>En San Juan el cero casi siempre es el mercado, no un error. Probá con:</p>
            <div className="msg-chips">
              {results!.suggestions!.map((s) => (
                <button
                  key={s}
                  className="chip chip--action"
                  onClick={() => handleSuggestion(s)}
                  disabled={searching}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {showSkeleton && <SearchSkeleton />}

        {results && results.visibleCards > 0 && (
          <div className={`cards-grid${refreshing ? " cards-grid--refreshing" : ""}`} data-testid="cards-grid">
            {results.cards.slice(0, results.visibleCards).map((card, i) => (
              <div
                key={card.id}
                id={`pcard-${card.id}`}
                className={`map-card-wrap${selectedId === card.id ? " is-active" : ""}`}
                onMouseEnter={mapSplit ? () => setSelectedId(card.id) : undefined}
              >
                <PropertyCard card={card} searchId={results.searchId} rank={i + 1} vertical={vertical} />
              </div>
            ))}
          </div>
        )}

        {/* Cierre del listado duro: solo cuando hubo scroll real (más de una
            página) — va ANTES de las relacionadas, que no son parte del total. */}
        {results &&
          results.totalMatches > PAGE_SIZE &&
          results.cards.length >= results.totalMatches &&
          results.visibleCards >= results.cards.length && (
            <div className="sysmsg">
              Eso es todo lo publicado para esta búsqueda ({fmtInt(results.totalMatches)} avisos).
            </div>
          )}

        {/* `related` (embeddings, máx 10): el cierre del scroll — llega solo con
            la última página del criterio, ya deduplicado por P2. Se muestra
            recién cuando el buffer de resultados duros está todo en pantalla. */}
        {results?.related &&
          results.related.cards.length > 0 &&
          results.visibleCards >= results.cards.length && (
            <>
              <h2 className="section-title">
                {zero ? "Podrían interesarte" : "Similares que no cumplen todos los filtros"}
              </h2>
              <p className="section-note">
                {zero
                  ? "No cumplen tu búsqueda, pero son lo más parecido que hay publicado."
                  : "Se parecen a lo que pedís, aunque no cumplen todos los filtros."}
              </p>
              <div className="cards-grid">
                {results.related.cards.map((card, i) => (
                  <PropertyCard key={card.id} card={card} similar searchId={results.searchId} rank={i + 1} vertical={vertical} />
                ))}
              </div>
            </>
          )}

        {(refreshing || loadingMore) && (
          <div className="loading-row" role="status">
            <span className="spinner" aria-hidden />
            {refreshing ? "Actualizando resultados…" : "Cargando más resultados…"}
          </div>
        )}

        <div ref={sentinelRef} aria-hidden />
      </div>

      {mapAvailable && (mapSplit || mapOverlay) && results && (
        <aside className="map-col">
          <div className="map-note" role="note">
            {mapPins
              ? `${fmtInt(pins.length)} de ${fmtInt(mapTotalMatches ?? results.totalMatches)} con ubicación publicada${vertical === "lotes" ? " · lotes" : ""}`
              : "Cargando ubicaciones…"}
          </div>
          <button type="button" className="map-close" onClick={toggleMapOverlay}>
            ✕ Cerrar mapa
          </button>
          <ResultsMap
            pins={pins}
            selectedId={selectedId}
            onSelect={handleMapSelect}
            searchId={results.searchId}
            layer={vertical === "lotes" ? "land" : "homes"}
          />
        </aside>
      )}

      {mapAvailable && (
        <button type="button" className="map-fab" onClick={toggleMapOverlay}>
          {mapOverlay ? "☰ Ver lista" : "🗺 Ver mapa"}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ResultsHead({
  results,
  query,
  searching,
  pending,
  isRent,
  onRefine,
  onFlipAssumption,
}: {
  results: ResultsState | null;
  query: string;
  searching: boolean;
  pending: Pending | null;
  isRent: boolean;
  onRefine: (phrase: string, meta: RefineMeta) => void;
  onFlipAssumption: (to: "alquilar" | "comprar") => void;
}) {
  if (!results) {
    return (
      <div className="results-head">
        {query ? (
          <p className="results-query results-query--searching" data-testid="searching-line" aria-live="polite">
            {searching || pending ? (
              <>
                <span className="spinner spinner--inline" aria-hidden /> Buscando… «{query}»
              </>
            ) : (
              <>Buscando: «{query}»</>
            )}
          </p>
        ) : null}
      </div>
    );
  }

  // `summary` ya viene resuelto y localizado por P2: los chips son sus
  // `hard_filters` tal cual, con acciones de quitar/editar (T2).
  const s = results.summary;

  return (
    <div className="results-head">
      {/* Contador = total_matches (total real en DB), nunca `total`. */}
      <h1 className="results-count" data-testid="results-count">
        {fmtInt(results.totalMatches)} {results.totalMatches === 1 ? "resultado" : "resultados"}
      </h1>
      {query && <p className="results-query">para: «{query}»</p>}
      {s && <InterpretationChips summary={s} disabled={searching} onRefine={onRefine} onFlipAssumption={onFlipAssumption} isRent={isRent} />}
    </div>
  );
}
