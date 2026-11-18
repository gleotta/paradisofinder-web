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
 *  6. Invertir (02/11 — `docs/DECISION_2026-11-02_analisis-inversion.md`): en
 *     PARALELO al stream, el análisis de inversión (`/api/invest/analysis` →
 *     P2 `/search/invest`) con el texto crudo del usuario. P2 decide si tiene
 *     algo que agregar (`skip` en ~1,5 s para "departamentos en Capital"); si
 *     manda `plan`, el panel "Lectura de FINDER · inversión" aparece arriba
 *     del listado. Solo por envío explícito (texto nuevo, selector o chip de
 *     aclaración a Invertir); quitar o editar un chip no re-analiza; una
 *     búsqueda nueva o cambiar de vertical cierra el SSE (P2 deja de pagar).
 *
 * La sesión vive SOLO para esa búsqueda: los chips de clarificación
 * (`vertical_override`), las relajaciones, los chips de interpretación (T2:
 * "Quitar X", "en Zona", "hasta …", orden), las `suggestions` y el scroll se
 * resuelven dentro de ella, porque necesitan el criterio que P2 ya tiene.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AreaSearchResponse,
  Bbox,
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
  getVisitorId,
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
  verticalFromSummary,
  type VerticalId,
} from "@/lib/vertical";
import InterpretationChips, { type RefineMeta } from "./InterpretationChips";
import InvestPanel, { useInvestAnalysis } from "./InvestPanel";
import { searchHref } from "@/lib/market";
import PropertyCard from "./PropertyCard";
import ResultsMap from "./ResultsMap";
import SearchSkeleton from "./SearchSkeleton";
import VerticalSelector from "./VerticalSelector";

const PAGE_SIZE = 10;
/** Búsqueda por área: espera desde el último movimiento del mapa hasta pedir. */
const AREA_DEBOUNCE_MS = 450;
/** Preferencia del visitante: "0" = no actualizar el listado al mover el mapa. */
const AREA_AUTO_KEY = "pf_area_auto";
/** Chips del lugar de la consulta: en modo área el rectángulo ocupa su sitio. */
const AREA_HIDDEN_CHIPS = ["zones", "place", "near"] as const;
/** Sin `cards` después de esto: mensaje de espera + botón de fallback (T1). */
const SLOW_MS = 4000;
const DEFAULT_CHIPS = ["Comprare", "Affittare"];
/** El sitio de Italia no tiene vertical de inversión: el chip que P2 ofrece no se muestra. */
const soloCompraAffitto = (chips: string[]) => chips.filter((c) => c.trim().toLowerCase() !== "investire");
/** Chip de P2 Italia → vertical del selector. */
const CHIP_VERTICAL: Record<string, VerticalId> = { comprare: "comprar", affittare: "alquilar" };
/** Valores que acepta `vertical_override` (spec §3; "lotes" desde el 13/09). */
const OVERRIDE_BY_CHIP: Record<string, string> = {
  comprar: "comprar",
  alquilar: "alquilar",
  // P2 Italia manda los chips en italiano y acepta esos mismos valores.
  comprare: "comprare",
  affittare: "affittare",
  // Invertir = la vertical `investment` de P2 (02/11); "invertir" cae en compra.
  invertir: VERTICAL_OVERRIDE.invertir,
  lotes: "lotes",
};
/** Salida del bucle cuando ya eligió operación y P2 sigue sin señal. */
const REPEAT_EXAMPLES = [
  "villa a Pomezia",
  "appartamento a Milano fino a 400 mila euro",
  "appartamento con 2 camere e giardino",
  "terreno a Roma",
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

/**
 * Modo área (German, 18/11): el listado sigue al mapa. Mientras existe, las
 * cards en pantalla son las del rectángulo y no las de la consulta; el
 * rectángulo REEMPLAZA el lugar de la consulta y el resto del criterio vale
 * (lo resuelve P2 con la sesión). Los resultados de la consulta quedan
 * intactos en `results`: salir del modo área los vuelve a mostrar.
 */
interface AreaState {
  bbox: Bbox;
  cards: Card[];
  total: number;
  /** Pidiendo la primera página de este rectángulo. */
  loading: boolean;
  error: string | null;
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
  /** Modo área: `null` = el listado es el de la consulta. */
  const [area, setArea] = useState<AreaState | null>(null);
  /** Pins del criterio SIN el lugar: lo que se ve al alejarse de la zona buscada. */
  const [areaPins, setAreaPins] = useState<{ pins: MapPin[]; totalMatches: number } | null>(null);
  /** "Aggiorna mentre sposto la mappa" (por defecto sí; se recuerda por navegador). */
  const [areaAuto, setAreaAuto] = useState(() => {
    try {
      return typeof window === "undefined" || window.localStorage.getItem(AREA_AUTO_KEY) !== "0";
    } catch {
      return true;
    }
  });
  /** Con la actualización apagada: el visitante movió el mapa y todavía no buscó ahí. */
  const [areaPending, setAreaPending] = useState<Bbox | null>(null);
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
  const areaRef = useRef<AreaState | null>(null);
  const areaAutoRef = useRef(areaAuto);
  const areaTimer = useRef<number | null>(null);
  const areaAbort = useRef<AbortController | null>(null);
  /** Token del pedido de área vigente: una respuesta vieja no pisa a una nueva. */
  const areaSeq = useRef(0);
  const areaPinsKey = useRef<string | null>(null);
  const areaMoreRef = useRef(false);
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
  /** Análisis de inversión (Invertir): el segundo canal, en paralelo al stream. */
  const invest = useInvestAnalysis();
  const investStart = invest.start;
  const investCancel = invest.cancel;

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

  /** Sale del modo área y descarta lo que hubiera en vuelo (búsqueda nueva, refinamiento, ✕). */
  const resetArea = useCallback(() => {
    if (areaTimer.current !== null) {
      window.clearTimeout(areaTimer.current);
      areaTimer.current = null;
    }
    areaAbort.current?.abort();
    areaAbort.current = null;
    areaSeq.current++;
    areaPinsKey.current = null;
    areaMoreRef.current = false;
    areaRef.current = null;
    setArea(null);
    setAreaPins(null);
    setAreaPending(null);
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
      // Una búsqueda o un refinamiento vuelven al listado de la consulta: el
      // criterio cambia y el mapa se re-encuadra con lo nuevo.
      resetArea();
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
        // Búsqueda nueva = sesión nueva: sin memoria de la anterior. El
        // análisis de inversión en curso se cierra (el que corresponda a la
        // consulta nueva lo dispara quien llama, si es Invertir).
        investCancel();
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
          setError({ text: "Non sono riuscito ad avviare la ricerca. Riprova tra qualche secondo.", canRetry: true });
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
                ? "La sessione di ricerca è scaduta e non sono riuscito ad aprirne un'altra. Ripeti la ricerca."
                : (body?.error ?? "Non sono riuscito a completare la ricerca. Riprova tra un momento."),
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
              // El análisis de inversión es SOLO de Invertir: si el texto mandó
              // a otra vertical ("depto para alquilar" con Invertir elegido), se cierra.
              if (detected !== "invertir") investCancel();
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
                chips: soloCompraAffitto(ev.chips.length ? ev.chips : ev.nivel1_required ? DEFAULT_CHIPS : []),
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
          setError({ text: "Si è interrotta la connessione con il motore di ricerca. Riprova.", canRetry: true });
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
    [applyRelax, investCancel, resetArea],
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
    resetArea();
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
        setError({ text: body?.error ?? "Non sono riuscito a completare la ricerca. Riprova tra un momento.", canRetry: true });
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
        setError({ text: "Non sono riuscito a cercare nemmeno con la ricerca diretta. Riprova tra un momento.", canRetry: true });
      }
    } finally {
      if (isCurrent()) {
        setPending(null);
        setSearching(false);
        busyRef.current = false;
      }
    }
  }, [applyRelax, resetArea]);

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
        if (vert === "invertir") investStart(q, null);
      } else {
        const params = new URLSearchParams({ q });
        if (vert) params.set("v", vert);
        router.push(searchHref(params));
      }
    },
    [router, runSearch, urlQuery, urlVertical, investStart],
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
      // Invertir: el análisis arranca en el mismo tick que la búsqueda, con el
      // texto crudo (la frase canónica es cosa del stream). La sesión todavía
      // no existe: la correlación va por `search_id` en el sobre de los eventos.
      if (urlVertical === "invertir") investStart(urlQuery, null);
    }
  }, [urlQuery, urlVertical, runSearch, investStart]);

  /**
   * Click en el selector: queda como preferencia y cambia la búsqueda vigente.
   *
   * Con resultados en pantalla el click es la intención MÁS reciente y le
   * gana al texto YA buscado — si no, con un texto tipo "depto para alquilar"
   * el botón rebotaba a Alquilar y parecía roto (reporte de German 01/09).
   * Se resuelve DENTRO de la misma sesión para no perder el criterio
   * acumulado (zona, tipo, presupuesto — verificado contra P2 real):
   * `vertical_override` para las cuatro (Invertir = `investment`, la vertical
   * de inversión de P2, desde el 02/11; antes iba por frase).
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
        void runSearch(urlQuery, { override: VERTICAL_OVERRIDE[v], keepSession: true, mode: "vertical" });
        // Elegir Invertir con resultados en pantalla es pedir el análisis de la pregunta tipeada.
        if (v === "invertir") investStart(urlQuery, sessionRef.current);
        else investCancel();
        // La URL acompaña (link compartible / back reproducible) sin relanzar
        // el efecto: la clave ya se marca como procesada.
        processedQuery.current = runKey(urlQuery, v);
        const params = new URLSearchParams({ q: urlQuery, v });
        router.replace(searchHref(params), { scroll: false });
        return;
      }

      submitQuery(urlQuery, v);
    },
    [results, router, runSearch, submitQuery, urlQuery, investStart, investCancel],
  );

  /* ------------- Búsqueda por área: el listado sigue al mapa (18/11) ------------- */

  useEffect(() => {
    areaRef.current = area;
  }, [area]);

  /** Primera página del rectángulo. Cancela el pedido anterior si quedó viejo. */
  const searchArea = useCallback(async (bbox: Bbox, how: "auto" | "button") => {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    areaAbort.current?.abort();
    const ac = new AbortController();
    areaAbort.current = ac;
    const seq = ++areaSeq.current;
    areaMoreRef.current = false;
    setAreaPending(null);
    setArea((prev) => ({ bbox, cards: prev?.cards ?? [], total: prev?.total ?? 0, loading: true, error: null }));

    // Pins del criterio SIN el lugar: una vez por turno, al entrar al modo área
    // (no en cada movimiento: los que quedan fuera de la vista no molestan).
    const pinsKey = `${sessionId}#${turnRef.current}`;
    if (areaPinsKey.current !== pinsKey) {
      areaPinsKey.current = pinsKey;
      void (async () => {
        try {
          const res = await fetch("/api/search/map", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sessionId, ignore_place: true }),
          });
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as MapSearchResponse;
          if (areaPinsKey.current === pinsKey) setAreaPins({ pins: data.pins, totalMatches: data.total_matches });
        } catch {
          // quedan los pins de la consulta; se reintenta con el próximo movimiento
          if (areaPinsKey.current === pinsKey) areaPinsKey.current = null;
        }
      })();
    }

    const failed = "Non sono riuscito ad aggiornare l'elenco per quest'area. Sposta di nuovo la mappa per riprovare.";
    try {
      const res = await fetch("/api/search/area", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, bbox, offset: 0, limit: PAGE_SIZE, visitor_id: getVisitorId() }),
        signal: ac.signal,
      });
      if (seq !== areaSeq.current) return;
      if (!res.ok) {
        const text =
          res.status === 404
            ? "La ricerca è scaduta: ripetila per continuare sulla mappa."
            : res.status === 429
              ? "Troppi spostamenti in poco tempo: aspetta qualche secondo e sposta di nuovo la mappa."
              : failed;
        setArea((prev) => (prev ? { ...prev, loading: false, error: text } : prev));
        return;
      }
      const data = (await res.json()) as AreaSearchResponse;
      if (seq !== areaSeq.current) return;
      setArea({ bbox, cards: data.cards, total: data.total_matches, loading: false, error: null });
      setSelectedId(null);
      trackEvent(EVENTS.MAP_AREA, { how, total_matches: data.total_matches, cards: data.cards.length, bbox });
    } catch {
      if (ac.signal.aborted || seq !== areaSeq.current) return;
      setArea((prev) => (prev ? { ...prev, loading: false, error: failed } : prev));
    }
  }, []);

  /** El visitante movió el mapa (ResultsMap no avisa los encuadres de la página). */
  const handleViewport = useCallback(
    (bbox: Bbox) => {
      if (!sessionRef.current || busyRef.current) return;
      if (!areaAutoRef.current) {
        setAreaPending(bbox);
        return;
      }
      if (areaTimer.current !== null) window.clearTimeout(areaTimer.current);
      areaTimer.current = window.setTimeout(() => {
        areaTimer.current = null;
        void searchArea(bbox, "auto");
      }, AREA_DEBOUNCE_MS);
    },
    [searchArea],
  );

  const toggleAreaAuto = useCallback(() => {
    const next = !areaAutoRef.current;
    areaAutoRef.current = next;
    setAreaAuto(next);
    try {
      window.localStorage.setItem(AREA_AUTO_KEY, next ? "1" : "0");
    } catch {
      /* sin almacenamiento: vale para esta visita */
    }
    trackEvent(EVENTS.MAP_AREA_AUTO, { on: next });
    // Prenderla con un movimiento sin buscar: se busca ahí mismo.
    if (next && areaPending) void searchArea(areaPending, "auto");
  }, [areaPending, searchArea]);

  const exitArea = useCallback(() => {
    trackEvent(EVENTS.MAP_AREA_EXIT, { total_matches: areaRef.current?.total ?? null });
    resetArea();
  }, [resetArea]);

  /** Páginas siguientes del MISMO rectángulo. */
  const loadMoreArea = useCallback(async () => {
    const a = areaRef.current;
    const sessionId = sessionRef.current;
    if (!a || !sessionId || a.loading || a.error || areaMoreRef.current || a.cards.length >= a.total) return;
    areaMoreRef.current = true;
    const seq = areaSeq.current;
    setLoadingMore(true);
    try {
      const res = await fetch("/api/search/area", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          bbox: a.bbox,
          offset: a.cards.length,
          limit: PAGE_SIZE,
          visitor_id: getVisitorId(),
        }),
      });
      if (!res.ok || seq !== areaSeq.current) return;
      const data = (await res.json()) as AreaSearchResponse;
      if (seq !== areaSeq.current) return;
      setArea((prev) => {
        if (!prev) return prev;
        const seen = new Set(prev.cards.map((c) => c.id));
        const fresh = data.cards.filter((c) => !seen.has(c.id));
        // Una página vacía cierra el listado (el catálogo cambió entre pedidos).
        const total = fresh.length === 0 ? prev.cards.length : data.total_matches;
        return { ...prev, cards: [...prev.cards, ...fresh], total };
      });
    } catch {
      /* la próxima vez que el final del listado entre en pantalla se reintenta */
    } finally {
      if (seq === areaSeq.current) areaMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

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
        if (entries.some((e) => e.isIntersecting)) void (areaRef.current ? loadMoreArea() : loadMore());
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [results, loadMore, area, loadMoreArea]);

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
      const chosen = isVerticalId(lower) ? lower : (CHIP_VERTICAL[lower] ?? null);
      if (chosen) {
        verticalRef.current = chosen;
        setVertical(chosen);
        storeVertical(chosen);
      }
      const override = OVERRIDE_BY_CHIP[lower];
      if (override) {
        void runSearch(urlQuery, { override, keepSession: true, mode: "chip" });
        // El chip "Invertir" de una aclaración es una elección explícita de vertical.
        if (lower === "invertir") investStart(urlQuery, sessionRef.current);
        else investCancel();
      } else {
        // Chips que no son vertical ("Viviendas", "Lotes"…): el texto del chip
        // es la respuesta, como refinamiento en la sesión.
        void runSearch(chip, { keepSession: true, mode: "chip" });
      }
    },
    [runSearch, urlQuery, investStart, investCancel],
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
      investCancel();
      void runSearch(urlQuery, { override: VERTICAL_OVERRIDE[to], keepSession: true, mode: "assumption" });
    },
    [runSearch, urlQuery, investCancel],
  );

  /* ---------------- Render ---------------- */

  const pins = useMemo(() => mapPins ?? [], [mapPins]);
  // Modo área: los pins son los del criterio sin el lugar (cuando llegan) y el
  // listado, el del rectángulo. Los de la consulta siguen en `results`.
  const shownPins = area && areaPins ? areaPins.pins : pins;
  const listCards = area ? area.cards : results ? results.cards.slice(0, results.visibleCards) : [];
  const mapAvailable = !!results && results.cards.length > 0;
  // En mobile el split no existe: el mapa se monta SOLO con el overlay
  // abierto, así Leaflet no compite con el pintado de las cards (T1).
  const mapSplit = mapAvailable && showMap && !isMobile;
  const mapOverlay = mapAvailable && mapMobileOpen;
  const zero = !!results && results.totalMatches === 0;
  const isRent = results?.summary?.vertical?.toLowerCase().includes("affitto") ?? vertical === "alquilar";
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
      data-invest={invest.state.phase}
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
            placeholder="Cerca: appartamento con giardino a Roma fino a 300 mila euro"
            aria-label="Cerca immobili"
          />
          <button type="submit" className="btn btn-magenta" disabled={searching || !input.trim()}>
            {searching ? "…" : "Cerca"}
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
            area={area}
          />
          {mapAvailable && (
            <button
              type="button"
              className="btn btn-ghost map-toggle-desktop"
              onClick={toggleDesktopMap}
              aria-pressed={mapSplit}
            >
              {mapSplit ? "Nascondi mappa" : "Mostra mappa"}
            </button>
          )}
        </div>

        {/* Invertir (02/11): "Lectura de FINDER · inversión", arriba del listado.
            Solo existe desde que P2 manda `plan`; el listado no lo espera. */}
        <InvestPanel state={invest.state} searchId={results?.searchId ?? null} />

        {/* Espera larga (T1): sin cards a los 4 s → lo interpretado hasta ahora
            (la consulta) y el fallback sync de P2. */}
        {pending?.slow && !results && (
          <div className="slow-wait" role="status" data-testid="slow-wait">
            <h3>Ci sta mettendo più del solito</h3>
            <p>
              Sto ancora cercando: «{pending.query}». Se preferisci, faccio la ricerca diretta con i filtri (senza il commento).
            </p>
            <button type="button" className="btn btn-magenta" onClick={() => void runFallback()}>
              Cerca con i filtri
            </button>
          </div>
        )}

        {/* Resumen de P2 en prosa — texto de P3/LLM, se muestra tal cual; se
            va escribiendo debajo de las cards conforme llegan los chunks. */}
        {narrative?.text && !area && (
          <div className="summary" role="status" aria-live="polite" data-testid="narrative">
            <span className="summary-label">In breve</span>
            <p>
              {narrative.text}
              {narrative.streaming && <span className="caret" aria-hidden />}
            </p>
          </div>
        )}

        {/* Aclaración NO terminal (`few_results`): burbuja con las relajaciones
            propuestas y sus conteos; las cards que cumplen quedan debajo. */}
        {relax && !area && (
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
            <p className="section-note">I risultati qui sotto sono ancora quelli della ricerca precedente.</p>
          </div>
        )}

        {clarification && !clarification.repeat && !clarification.soft && (
          <div className="zero-state" role="status" data-testid="clarification">
            <h3>Una precisazione prima di cercare</h3>
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
                <p className="section-note">Prova, per esempio:</p>
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
            <h3>Mi serve un dato in più per cercare</h3>
            <p>
              Con questo non riesco ancora a fare una ricerca. Aggiungi almeno una tipologia, una zona o un budget — per esempio:
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
            <h3>Non sono riuscito a completare la ricerca</h3>
            <p>{error.text}</p>
            {error.canRetry && (
              <button
                className="btn btn-magenta"
                onClick={() => {
                  const last = lastRun.current;
                  if (last) void runSearch(last.query, last.opts);
                }}
              >
                Riprova
              </button>
            )}
          </div>
        )}

        {/* Cero resultados: la narrativa de P2 ya explica el caso; acá van sus
            acciones (`suggestions`) para relajar el criterio (regla 6). */}
        {zero && !area && (results!.suggestions?.length ?? 0) > 0 && (
          <div className="zero-state" role="status">
            <h3>Nessun risultato per questa ricerca</h3>
            <p>Al momento non c&apos;è nulla che rispetti tutti i criteri. Prova con:</p>
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

        {/* Modo área (18/11): el listado es el del rectángulo del mapa. */}
        {area && (
          <div className="area-bar" role="status" data-testid="area-bar" data-total={area.total} data-loading={area.loading ? "" : undefined}>
            <p>
              <strong>L&apos;elenco segue la mappa.</strong> Il luogo della ricerca non conta più; tipologia, prezzo e gli altri filtri sì.
            </p>
            <button type="button" className="chip chip--action" onClick={exitArea} data-testid="area-exit">
              ✕ Torna alla ricerca
            </button>
          </div>
        )}
        {area?.error && (
          <div className="sysmsg" role="alert" data-testid="area-error">
            {area.error}
          </div>
        )}
        {area && !area.loading && !area.error && area.total === 0 && (
          <div className="zero-state" role="status" data-testid="area-empty">
            <h3>Nessun annuncio in quest&apos;area</h3>
            <p>Allontana lo zoom o sposta la mappa: gli altri filtri della ricerca restano attivi.</p>
          </div>
        )}
        {area?.loading && area.cards.length === 0 && <SearchSkeleton />}

        {results && listCards.length > 0 && (
          <div
            className={`cards-grid${refreshing || area?.loading ? " cards-grid--refreshing" : ""}`}
            data-testid="cards-grid"
            data-area={area ? "" : undefined}
          >
            {listCards.map((card, i) => (
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
        {area && !area.loading && area.total > PAGE_SIZE && area.cards.length >= area.total && (
          <div className="sysmsg">Questi sono tutti gli annunci in quest&apos;area ({fmtInt(area.total)} annunci).</div>
        )}

        {results &&
          !area &&
          results.totalMatches > PAGE_SIZE &&
          results.cards.length >= results.totalMatches &&
          results.visibleCards >= results.cards.length && (
            <div className="sysmsg">
              Questi sono tutti gli annunci per questa ricerca ({fmtInt(results.totalMatches)} annunci).
            </div>
          )}

        {/* `related` (embeddings, máx 10): el cierre del scroll — llega solo con
            la última página del criterio, ya deduplicado por P2. Se muestra
            recién cuando el buffer de resultados duros está todo en pantalla. */}
        {results?.related &&
          !area &&
          results.related.cards.length > 0 &&
          results.visibleCards >= results.cards.length && (
            <>
              <h2 className="section-title">
                {zero ? "Potrebbero interessarti" : "Simili che non rispettano tutti i filtri"}
              </h2>
              <p className="section-note">
                {zero
                  ? "Non rispettano la tua ricerca, ma sono gli annunci più vicini a quello che cerchi."
                  : "Somigliano a quello che chiedi, anche se non rispettano tutti i filtri."}
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
            {refreshing ? "Aggiorno i risultati…" : "Carico altri risultati…"}
          </div>
        )}

        <div ref={sentinelRef} aria-hidden />
      </div>

      {mapAvailable && (mapSplit || mapOverlay) && results && (
        <aside className="map-col">
          <div className="map-note" role="note" data-testid="map-note">
            {area
              ? area.loading
                ? "Aggiorno l'elenco…"
                : `${fmtInt(area.total)} ${area.total === 1 ? "annuncio" : "annunci"} in quest'area`
              : mapPins
                ? `${fmtInt(pins.length)} di ${fmtInt(mapTotalMatches ?? results.totalMatches)} con posizione sulla mappa${vertical === "lotes" ? " · terreni" : ""}`
                : "Carico le posizioni…"}
          </div>
          <button type="button" className="map-close" onClick={toggleMapOverlay}>
            ✕ Chiudi mappa
          </button>
          {/* Con la actualización apagada, el visitante decide cuándo buscar. */}
          {!areaAuto && areaPending && (
            <button
              type="button"
              className="map-area-btn"
              onClick={() => void searchArea(areaPending, "button")}
              data-testid="area-search-here"
            >
              Cerca in quest&apos;area
            </button>
          )}
          <label className="map-area-auto" data-testid="area-auto">
            <input type="checkbox" checked={areaAuto} onChange={toggleAreaAuto} />
            <span>Aggiorna mentre sposto la mappa</span>
          </label>
          <ResultsMap
            pins={shownPins}
            selectedId={selectedId}
            onSelect={handleMapSelect}
            searchId={results.searchId}
            layer={vertical === "lotes" ? "land" : "homes"}
            onViewportChange={handleViewport}
            fitOnPins={!area}
          />
        </aside>
      )}

      {mapAvailable && (
        <button type="button" className="map-fab" onClick={toggleMapOverlay}>
          {mapOverlay
            ? area && !area.loading
              ? `☰ Vedi ${fmtInt(area.total)} ${area.total === 1 ? "annuncio" : "annunci"}`
              : "☰ Vedi elenco"
            : "🗺 Vedi mappa"}
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
  area,
}: {
  results: ResultsState | null;
  query: string;
  searching: boolean;
  pending: Pending | null;
  isRent: boolean;
  onRefine: (phrase: string, meta: RefineMeta) => void;
  onFlipAssumption: (to: "alquilar" | "comprar") => void;
  /** Modo área: el contador es el del rectángulo y el lugar de la consulta no se muestra. */
  area: AreaState | null;
}) {
  if (!results) {
    return (
      <div className="results-head">
        {query ? (
          <p className="results-query results-query--searching" data-testid="searching-line" aria-live="polite">
            {searching || pending ? (
              <>
                <span className="spinner spinner--inline" aria-hidden /> Sto cercando… «{query}»
              </>
            ) : (
              <>Sto cercando: «{query}»</>
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
      <h1 className="results-count" data-testid="results-count" data-area={area ? "" : undefined} aria-busy={area?.loading || undefined}>
        {area
          ? `${fmtInt(area.total)} ${area.total === 1 ? "annuncio" : "annunci"} in quest'area`
          : `${fmtInt(results.totalMatches)} ${results.totalMatches === 1 ? "risultato" : "risultati"}`}
      </h1>
      {query && <p className="results-query">{area ? <>dalla ricerca «{query}», nell&apos;area della mappa</> : <>per: «{query}»</>}</p>}
      {s && (
        <InterpretationChips
          summary={s}
          disabled={searching}
          onRefine={onRefine}
          onFlipAssumption={onFlipAssumption}
          isRent={isRent}
          hideFields={area ? AREA_HIDDEN_CHIPS : undefined}
        />
      )}
    </div>
  );
}
