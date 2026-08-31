"use client";

/**
 * Pantalla 2 — Resultados: BÚSQUEDA SIMPLE + mapa (patrón Airbnb).
 *
 * Cambio de producto del 29/08 (German): la interfaz no es conversacional. Pero
 * la búsqueda usa el canal con streaming de P2 abriendo una **sesión nueva por
 * consulta** (opción C), porque ese canal entrega los textos de P2/P3 que el
 * canal del portal no tiene: `suggestions`, el mensaje y los chips de
 * clarificación, el `summary` con `assumption_note`, y el resumen en prosa.
 * Registro y comparación de opciones en
 * `docs/DECISION_2026-08-29_busqueda-simple.md`.
 *
 * Flujo por búsqueda:
 *  1. `POST /sessions` → session_id (nuevo: sin memoria entre búsquedas).
 *  2. `POST /search/stream` (SSE): 20 cards al instante → prosa en streaming →
 *     done. Se muestran 10 y las otras 10 quedan de buffer (página 2 sin red).
 *  3. Mapa: `POST /search/map {session_id}` — forma (b), P2 resuelve el criterio.
 *  4. Scroll: páginas siguientes por el MISMO `/search/stream` con
 *     `{session_id, offset}` sin `query` (paginación del 29/08: no es un turno,
 *     sin LLM, ~100 ms) — de a 10 hasta agotar `total_matches`, SIN tope
 *     (el tope de 30 se eliminó el 30/08: `related` viaja solo en la última
 *     página del criterio, y con tope jamás llegaba — ver
 *     `docs/DECISION_2026-08-30_scroll-completo.md`). El criterio vive en la
 *     sesión de P2, así que nada se pierde al paginar
 *     (`preferred_property_type`, `semantic_query`).
 *     La última página puede venir corta (p. ej. 2 cards + 10 related con 62
 *     resultados): igual se muestra entera.
 *
 * La sesión vive SOLO para esa búsqueda: los chips de clarificación
 * (`vertical_override`), las `suggestions` y el scroll se resuelven dentro de
 * ella, porque necesitan el criterio que P2 ya tiene acumulado de ese turno.
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
  StreamErrorEvent,
  Summary,
} from "@/lib/p2/types";
import { readSSE } from "@/lib/sse";
import { EVENTS, setTrackingSession, trackEvent } from "@/lib/track";
import { fmtInt } from "@/lib/format";
import PropertyCard from "./PropertyCard";
import ResultsMap from "./ResultsMap";

const PAGE_SIZE = 10;
const DEFAULT_CHIPS = ["Comprar", "Alquilar", "Invertir"];
/** Valores que acepta `vertical_override` (spec §3). */
const OVERRIDE_BY_CHIP: Record<string, string> = {
  comprar: "comprar",
  alquilar: "alquilar",
  invertir: "invertir",
};
/** Salida del bucle cuando ya eligió operación y P2 sigue sin señal. */
const REPEAT_EXAMPLES = [
  "casa en Rawson",
  "departamento en Capital hasta 60 mil dólares",
  "casa de 3 dormitorios con patio",
];

interface ResultsState {
  query: string;
  /**
   * Todo lo recibido: el turno manda 20 de una, así que las 10 que sobran
   * quedan de buffer para la página 2 (sin red).
   */
  cards: Card[];
  /** Cuántas de `cards` se están mostrando: la página 1 son 10 (regla 10 × 3). */
  visibleCards: number;
  totalMatches: number;
  summary: Summary | null;
  /** Llega SOLO con la última página del criterio (máx 10, ya deduplicado). */
  related: Related | null;
  suggestions: string[] | null;
}

interface Clarification {
  message: string;
  chips: string[];
  /** true = ya eligió operación y P2 sigue sin señal: no repetir los chips. */
  repeat: boolean;
}

export default function SearchResultsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

  const [input, setInput] = useState(urlQuery);
  const [results, setResults] = useState<ResultsState | null>(null);
  const [narrative, setNarrative] = useState<{ text: string; streaming: boolean } | null>(null);
  const [clarification, setClarification] = useState<Clarification | null>(null);
  const [error, setError] = useState<{ text: string; canRetry: boolean } | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [mapPins, setMapPins] = useState<MapPin[] | null>(null);
  const [mapTotalMatches, setMapTotalMatches] = useState<number | null>(null);
  const [showMap, setShowMap] = useState(true);
  const [mapMobileOpen, setMapMobileOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Sube en cada turno con resultados: invalida los pins del mapa. */
  const [turn, setTurn] = useState(0);

  const processedQuery = useRef<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const mapKey = useRef<string | null>(null);
  const busyRef = useRef(false);
  const lastRun = useRef<{ query: string; override?: string } | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const pendingNarrative = useRef("");
  const flushHandle = useRef<number | null>(null);
  /** Token de corrida: una búsqueda nueva invalida el stream anterior. */
  const runSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  /* ---------------- Búsqueda (sesión nueva + SSE) ---------------- */

  const runSearch = useCallback(
    async (query: string, opts?: { override?: string; keepSession?: boolean }) => {
      // Una búsqueda nueva aborta el stream anterior (puede seguir escribiendo
      // el resumen) en vez de rebotar contra el guard.
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const myRun = ++runSeq.current;
      const isCurrent = () => runSeq.current === myRun;

      busyRef.current = true;
      setSearching(true);
      setError(null);
      setClarification(null);
      setNarrative(null);
      setSelectedId(null);
      pendingNarrative.current = "";
      if (flushHandle.current != null) {
        cancelAnimationFrame(flushHandle.current);
        flushHandle.current = null;
      }
      lastRun.current = { query, override: opts?.override };
      trackEvent(EVENTS.SEARCH, { mode: "search", query, vertical_override: opts?.override });

      if (!opts?.keepSession) {
        // Búsqueda nueva = sesión nueva: sin memoria de la anterior.
        setResults(null);
        setMapPins(null);
        setMapTotalMatches(null);
        mapKey.current = null;
        sessionRef.current = null;
      }

      try {
        if (!sessionRef.current) {
          const sres = await fetch("/api/sessions", { method: "POST" });
          if (!sres.ok) {
            setError({ text: "No pude iniciar la búsqueda. Probá de nuevo.", canRetry: true });
            return;
          }
          const sdata = (await sres.json()) as { session_id: string };
          sessionRef.current = sdata.session_id;
          setTrackingSession(sdata.session_id);
        }

        const send = (sessionId: string) =>
          fetch("/api/search/stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: ac.signal,
            body: JSON.stringify({
              session_id: sessionId,
              query,
              ...(opts?.override ? { vertical_override: opts.override } : {}),
            }),
          });

        let res = await send(sessionRef.current);
        // 404 = sesión expirada → abrir otra y reintentar (spec §3).
        if (res.status === 404) {
          const sres = await fetch("/api/sessions", { method: "POST" });
          if (sres.ok) {
            const sdata = (await sres.json()) as { session_id: string };
            sessionRef.current = sdata.session_id;
            setTrackingSession(sdata.session_id);
            res = await send(sdata.session_id);
          }
        }

        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setError({
            text: body?.error ?? "Error interno. Probá de nuevo en un momento.",
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
              seenIds.current = new Set(ev.cards.map((c) => c.id));
              for (const c of ev.related?.cards ?? []) seenIds.current.add(c.id);
              setResults({
                query,
                cards: ev.cards,
                visibleCards: Math.min(PAGE_SIZE, ev.cards.length),
                totalMatches: ev.total_matches,
                summary: ev.summary,
                related: ev.related,
                suggestions: ev.suggestions,
              });
              setTurn((t) => t + 1);
              // Los resultados YA están en pantalla: la búsqueda terminó para el
              // usuario. Esperar a que cierre el stream dejaba el spinner y el
              // botón bloqueados ~2 s de más mientras se escribía el resumen.
              setSearching(false);
              busyRef.current = false;
              if (ev.total_matches === 0) trackEvent(EVENTS.ZERO_RESULTS, { mode: "search", query });
              if (ev.related) {
                trackEvent(EVENTS.RELATED_SHOWN, {
                  reason: ev.related.reason,
                  count: ev.related.count,
                });
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
              const repeat = !!opts?.override;
              trackEvent(EVENTS.CLARIFICATION_SHOWN, { mode: "search", query, repeat });
              setResults(null);
              setClarification({
                message: ev.message,
                chips: ev.chips.length ? ev.chips : ev.nivel1_required ? DEFAULT_CHIPS : [],
                repeat,
              });
              break;
            }
            case "error": {
              const ev = JSON.parse(data) as StreamErrorEvent;
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
        // Un abort es una búsqueda nueva pisando a la anterior, no un fallo.
        if (isCurrent() && !ac.signal.aborted) {
          setError({ text: "Se cortó la conexión con el buscador. Probá de nuevo.", canRetry: true });
        }
      } finally {
        // Volcado final: el último frame puede quedar pendiente al cerrar el stream.
        if (flushHandle.current != null) {
          cancelAnimationFrame(flushHandle.current);
          flushHandle.current = null;
        }
        if (isCurrent()) {
          const text = pendingNarrative.current;
          setNarrative(text ? { text, streaming: false } : null);
          busyRef.current = false;
          setSearching(false);
        }
      }
    },
    // `clarification` se lee solo para el guard final; no debe recrear el callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Navegar cambia `?q=`, y el efecto dispara la búsqueda (sesión nueva). */
  const submitQuery = useCallback(
    (query: string) => {
      const q = query.trim();
      if (!q) return;
      setInput(q);
      if (q === urlQuery) {
        processedQuery.current = null;
        void runSearch(q);
      } else {
        router.push(`/buscar?q=${encodeURIComponent(q)}`);
      }
    },
    [router, runSearch, urlQuery],
  );

  useEffect(() => {
    if (urlQuery && processedQuery.current !== urlQuery) {
      processedQuery.current = urlQuery;
      setInput(urlQuery);
      void runSearch(urlQuery);
    }
  }, [urlQuery, runSearch]);

  /* ------- Scroll infinito (de a 10 hasta agotar el criterio, sin tope) ------- */

  const loadMore = useCallback(async () => {
    const r = results;
    if (!r || busyRef.current) return;
    if (r.visibleCards === 0) return;

    // Página 2: ya está en memoria (el turno mandó 20). Sin red, sin spinner.
    if (r.visibleCards < r.cards.length) {
      const next = Math.min(r.cards.length, r.visibleCards + PAGE_SIZE);
      trackEvent(EVENTS.PAGE_LOADED, { offset: r.visibleCards, kind: "buffer" });
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
    // nada que reenviar ni que poder perder (`preferred_property_type` incluido).
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
      if (!res.ok || !res.body) return;
      await readSSE(res.body, ({ event, data }) => {
        if (runSeq.current !== myRun || event !== "cards") return;
        const ev = JSON.parse(data) as CardsEvent;
        const fresh = ev.cards.filter((c) => !seenIds.current.has(c.id));
        for (const c of fresh) seenIds.current.add(c.id);
        for (const c of ev.related?.cards ?? []) seenIds.current.add(c.id);
        trackEvent(EVENTS.PAGE_LOADED, { offset: r.cards.length, kind: "session" });
        if (ev.related) {
          trackEvent(EVENTS.RELATED_SHOWN, { reason: ev.related.reason, count: ev.related.count });
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
  }, [results]);

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
    if (!(showMap || mapMobileOpen)) return;
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
  }, [showMap, mapMobileOpen, results, turn]);

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

  /** Chip de clarificación: se resuelve DENTRO de la misma sesión (spec §3). */
  const handleChip = useCallback(
    (chip: string) => {
      const lower = chip.toLowerCase();
      trackEvent(EVENTS.CLARIFICATION_CHIP, { chip, mode: "search" });
      void runSearch(urlQuery, { override: OVERRIDE_BY_CHIP[lower] ?? lower, keepSession: true });
    },
    [runSearch, urlQuery],
  );

  /** `suggestions` de P2: acciones sobre el criterio del turno → misma sesión. */
  const handleSuggestion = useCallback(
    (s: string) => {
      trackEvent(EVENTS.SEARCH, { mode: "suggestion", query: s });
      void runSearch(s, { keepSession: true });
    },
    [runSearch],
  );

  /* ---------------- Render ---------------- */

  const pins = useMemo(() => mapPins ?? [], [mapPins]);
  const mapAvailable = !!results && results.cards.length > 0;
  const mapSplit = mapAvailable && showMap;
  const mapOverlay = mapAvailable && mapMobileOpen;
  const zero = !!results && results.totalMatches === 0;

  return (
    <div className={`results-layout${mapSplit ? " has-map" : ""}${mapOverlay ? " map-overlay-open" : ""}`}>
      <div className="results-col results-page">
        <form
          className="searchbar-row"
          onSubmit={(e) => {
            e.preventDefault();
            submitQuery(input);
          }}
          role="search"
        >
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
          <ResultsHead results={results} query={urlQuery} />
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

        {/* Resumen de P2 en prosa — texto de P3/LLM, se muestra tal cual. */}
        {narrative?.text && (
          <div className="summary" role="status" aria-live="polite">
            <span className="summary-label">Resumen</span>
            <p>
              {narrative.text}
              {narrative.streaming && <span className="caret" aria-hidden />}
            </p>
          </div>
        )}

        {clarification && !clarification.repeat && (
          <div className="zero-state" role="status">
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
          <div className="zero-state" role="alert">
            <h3>No pude completar la búsqueda</h3>
            <p>{error.text}</p>
            {error.canRetry && (
              <button
                className="btn btn-magenta"
                onClick={() => {
                  const last = lastRun.current;
                  if (last) void runSearch(last.query, { override: last.override });
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

        {results && results.visibleCards > 0 && (
          <div className="cards-grid">
            {results.cards.slice(0, results.visibleCards).map((card) => (
              <div
                key={card.id}
                id={`pcard-${card.id}`}
                className={`map-card-wrap${selectedId === card.id ? " is-active" : ""}`}
                onMouseEnter={mapSplit ? () => setSelectedId(card.id) : undefined}
              >
                <PropertyCard card={card} />
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
                {results.related.cards.map((card) => (
                  <PropertyCard key={card.id} card={card} similar />
                ))}
              </div>
            </>
          )}

        {(searching || loadingMore) && (
          <div className="loading-row" role="status">
            <span className="spinner" aria-hidden />
            {searching ? "Buscando en San Juan…" : "Cargando más resultados…"}
          </div>
        )}

        <div ref={sentinelRef} aria-hidden />
      </div>

      {mapAvailable && (showMap || mapOverlay) && results && (
        <aside className="map-col">
          <div className="map-note" role="note">
            {mapPins
              ? `${fmtInt(pins.length)} de ${fmtInt(mapTotalMatches ?? results.totalMatches)} con ubicación publicada`
              : "Cargando ubicaciones…"}
          </div>
          <button type="button" className="map-close" onClick={toggleMapOverlay}>
            ✕ Cerrar mapa
          </button>
          <ResultsMap pins={pins} selectedId={selectedId} onSelect={handleMapSelect} />
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

function ResultsHead({ results, query }: { results: ResultsState | null; query: string }) {
  if (!results) {
    return (
      <div className="results-head">
        {query ? <p className="results-query">Buscando: «{query}»</p> : null}
      </div>
    );
  }

  // `summary` ya viene resuelto y localizado por P2: se muestra tal cual.
  const s = results.summary;
  const pills = [s?.vertical, s?.property_type, s?.zone, s?.budget].filter(Boolean) as string[];
  if (s?.order) pills.push(`Orden: ${s.order}`);

  return (
    <div className="results-head">
      {/* Contador = total_matches (total real en DB), nunca `total`. */}
      <h1 className="results-count">
        {fmtInt(results.totalMatches)} {results.totalMatches === 1 ? "resultado" : "resultados"}
      </h1>
      {query && <p className="results-query">para: «{query}»</p>}
      {(pills.length > 0 || s?.assumption_note) && (
        <div className="applied-pills">
          {pills.map((pill) => (
            <span className="pill" key={pill}>
              {pill}
            </span>
          ))}
          {s?.assumption_note && <span className="pill pill--note">{s.assumption_note}</span>}
        </div>
      )}
    </div>
  );
}
