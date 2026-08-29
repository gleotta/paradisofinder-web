"use client";

/**
 * Pantalla 2 — Resultados con chat anclado (producto §5, spec §§2-3).
 *
 * Estrategia híbrida del checklist I1→I2:
 *  1. Primera consulta: POST /search/text (stateless), limit=10; se guardan
 *     `extraction.params`.
 *  2. Scroll: /search/structured con esos params (10 × 3, tope 30); agotado
 *     `total_matches`, /search/semantic completa con "similares" (dedup en P1).
 *  3. Refinamiento (el usuario vuelve a escribir): sesión + SSE /search/stream.
 *     El estado conversacional se acumula EN P2; P1 solo envía texto.
 *  4. CLARIFICATION es diseño: pregunta con chips, jamás un error.
 *
 * La paginación está documentada solo para el modo portal: los turnos de chat
 * muestran lo que P2 devuelve, sin scroll infinito (pendiente registrado en
 * producto §9).
 */

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Card,
  CardsEvent,
  ClarificationEvent,
  Complemento,
  DoneEvent,
  MapPin,
  MapSearchRequest,
  MapSearchResponse,
  Riepilogo,
  SearchTextResponse,
  StreamErrorEvent,
  StructuredParams,
  StructuredResponse,
  SearchResult,
} from "@/lib/p2/types";
import { toMapRequest } from "@/lib/p2/types";
import { readSSE } from "@/lib/sse";
import { EVENTS, setTrackingSession, trackEvent } from "@/lib/track";
import { ORDER_LABEL, PROPERTY_TYPE_LABEL, REQUEST_VERTICAL_LABEL } from "@/lib/labels";
import { fmtInt } from "@/lib/format";
import PropertyCard from "./PropertyCard";
import ResultsMap from "./ResultsMap";

const PAGE_SIZE = 10;
const CAP = 30;
const DEFAULT_CLARIFICATION_CHIPS = ["Comprar", "Alquilar", "Invertir"];
const OVERRIDE_BY_CHIP: Record<string, string> = {
  comprar: "comprar",
  alquilar: "alquilar",
  invertir: "invertir",
};

type Msg =
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "assistant"; text: string; streaming: boolean }
  | { id: number; kind: "system"; text: string }
  | {
      id: number;
      kind: "clarification";
      message: string;
      chips: string[];
      mode: "portal" | "chat";
      resolved?: string;
    }
  | { id: number; kind: "error"; text: string; canRetry: boolean };

interface ResultsView {
  mode: "portal" | "chat";
  cards: Card[];
  totalMatches: number;
  paramsApplied: Record<string, unknown> | null;
  riepilogo: Riepilogo | null;
  complemento: Complemento | null;
  similares: Card[];
  suggestions: string[] | null;
  capReached: boolean;
}

type LastAction =
  | { type: "portal"; query: string }
  | { type: "chat"; query: string; override?: string };

let msgSeq = 0;
const nextId = () => ++msgSeq;

/** Omit distributivo: preserva cada variante de la unión Msg. */
type NewMsg = Msg extends infer M ? (M extends Msg ? Omit<M, "id"> : never) : never;

export default function ConversationView() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const chipId = searchParams.get("chip");

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [results, setResults] = useState<ResultsView | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [input, setInput] = useState("");
  const [displayQuery, setDisplayQuery] = useState("");
  // En mobile el log arranca colapsado (CSS lo ignora en desktop) y se abre solo
  // cuando el sistema necesita atención: respuesta, clarificación o error.
  const [logOpen, setLogOpen] = useState(false);
  // Mapa (decisión 29/08): split desktop activable + overlay fullscreen mobile.
  const [showMap, setShowMap] = useState(true);
  const [mapMobileOpen, setMapMobileOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Pins del mapa: POST /search/map (P2 29/08) devuelve el universo mapeable del
  // criterio (tier >= 2 con coordenadas), sin tope. null = todavía sin respuesta.
  const [mapPins, setMapPins] = useState<MapPin[] | null>(null);
  const [mapTotalMatches, setMapTotalMatches] = useState<number | null>(null);
  const [mapParamsVersion, setMapParamsVersion] = useState(0);
  const mapParamsRef = useRef<StructuredParams | null>(null);
  const mapFeedKey = useRef<string | null>(null);

  const processedQuery = useRef<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const portalRef = useRef<{
    query: string;
    params: StructuredParams | null;
    semanticOffset: number;
    semanticDone: boolean;
  }>({ query: "", params: null, semanticOffset: 0, semanticDone: false });
  const seenIds = useRef<Set<string>>(new Set());
  const lastAction = useRef<LastAction | null>(null);
  const lastUserQuery = useRef<string>("");
  const streamingMsgId = useRef<number | null>(null);
  // La sesión de P2 nace vacía: el primer refinamiento tras una búsqueda del
  // portal no tiene contexto que refinar (verificado contra P2 real: "mejor en
  // alquiler" solo devuelve clarificación). Se siembra con la consulta original.
  const sessionSeeded = useRef(false);
  const busyRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Los updaters de setMsgs deben ser PUROS (StrictMode los doble-invoca):
  // ids y refs se resuelven afuera, nunca adentro del updater.
  const pushMsg = useCallback((msg: NewMsg) => {
    const withId = { ...msg, id: nextId() } as Msg;
    setMsgs((prev) => [...prev, withId]);
    if (msg.kind === "clarification" || msg.kind === "error") setLogOpen(true);
  }, []);

  /* ---------------- Modo portal (stateless) ---------------- */

  const runPortalSearch = useCallback(
    async (query: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setSearching(true);
      lastAction.current = { type: "portal", query };
      lastUserQuery.current = query;
      setDisplayQuery(query);
      pushMsg({ kind: "user", text: query });
      trackEvent(EVENTS.SEARCH, { mode: "portal", query, chip: chipId ?? undefined });

      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, limit: PAGE_SIZE }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          pushMsg({
            kind: "error",
            text: body?.error ?? "Error interno. Probá de nuevo en un momento.",
            canRetry: res.status !== 422,
          });
          return;
        }
        const data = (await res.json()) as SearchTextResponse;

        // CLARIFICATION es diseño, no error (regla 3).
        if (data.clarification_needed || !data.result) {
          trackEvent(EVENTS.CLARIFICATION_SHOWN, { mode: "portal", query });
          pushMsg({
            kind: "clarification",
            message:
              data.message ??
              "¿Qué estás buscando? Puedo mostrarte propiedades para comprar, para alquilar o para invertir.",
            chips: data.chips?.length ? data.chips : DEFAULT_CLARIFICATION_CHIPS,
            mode: "portal",
          });
          return;
        }

        const result = data.result;
        portalRef.current = {
          query,
          params: data.extraction?.params ?? null,
          semanticOffset: 0,
          semanticDone: false,
        };
        // Nuevo criterio → nuevo feed de mapa con estos params.
        mapParamsRef.current = data.extraction?.params ?? null;
        mapFeedKey.current = null;
        setMapPins(null);
        setMapTotalMatches(null);
        setMapParamsVersion((v) => v + 1);
        seenIds.current = new Set(result.cards.map((c) => c.id));
        for (const c of data.complemento?.cards ?? []) seenIds.current.add(c.id);

        setSelectedId(null);
        setResults({
          mode: "portal",
          cards: result.cards,
          totalMatches: result.total_matches,
          paramsApplied: result.params_applied,
          riepilogo: null,
          complemento: data.complemento,
          similares: [],
          suggestions: result.suggestions ?? null,
          capReached: false,
        });

        if (result.total_matches === 0) {
          trackEvent(EVENTS.ZERO_RESULTS, { mode: "portal", query });
          pushMsg({
            kind: "system",
            text: "No hay publicaciones que cumplan eso hoy — en San Juan muchas zonas tienen poco stock. Probá una de las sugerencias o ajustá el criterio acá abajo.",
          });
        } else {
          if (data.complemento) {
            trackEvent(EVENTS.COMPLEMENT_SHOWN, { motivo: data.complemento.motivo, agregadas: data.complemento.agregadas });
          }
          pushMsg({
            kind: "system",
            text: `${fmtInt(result.total_matches)} propiedades cumplen tu búsqueda; te muestro las primeras ${result.cards.length}. Escribime acá para refinar.`,
          });
        }
      } catch {
        pushMsg({ kind: "error", text: "No pude conectar con el buscador. Probá de nuevo.", canRetry: true });
      } finally {
        busyRef.current = false;
        setSearching(false);
      }
    },
    [chipId, pushMsg],
  );

  /* ---------------- Scroll infinito 10 × 3 + semántica ---------------- */

  const loadMore = useCallback(async () => {
    const r = results;
    const portal = portalRef.current;
    if (!r || r.mode !== "portal" || busyRef.current || r.capReached) return;
    const shown = r.cards.length + r.similares.length;
    if (shown === 0) return;

    // Tope de 30 por consulta → invitación a refinar, no más páginas (regla 5).
    if (shown >= CAP) {
      setResults((prev) => (prev ? { ...prev, capReached: true } : prev));
      pushMsg({
        kind: "system",
        text: "Llegamos al tope de 30 resultados por consulta. Contame qué priorizás — barrio, rango de precio, prioridad — y afino la lista.",
      });
      return;
    }

    busyRef.current = true;
    setLoadingMore(true);
    try {
      if (r.cards.length < r.totalMatches && portal.params) {
        // Páginas 2 y 3: /search/structured con los params guardados + offset.
        const limit = Math.min(PAGE_SIZE, CAP - shown);
        const res = await fetch("/api/search/structured", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...portal.params, offset: r.cards.length, limit }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as StructuredResponse;
        const fresh = data.cards.filter((c) => !seenIds.current.has(c.id));
        for (const c of fresh) seenIds.current.add(c.id);
        const page = Math.floor(r.cards.length / PAGE_SIZE) + 1;
        trackEvent(EVENTS.PAGE_LOADED, { page, offset: r.cards.length, kind: "structured" });
        setResults((prev) => (prev ? { ...prev, cards: [...prev.cards, ...fresh] } : prev));
      } else if (!portal.semanticDone && portal.query) {
        // total_matches agotado antes del tope → /search/semantic ("similares", dedup en P1).
        const budget = CAP - shown;
        const res = await fetch("/api/search/semantic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: portal.query, offset: portal.semanticOffset, limit: Math.min(PAGE_SIZE, budget) }),
        });
        if (!res.ok) {
          portal.semanticDone = true;
          return;
        }
        const data = (await res.json()) as SearchResult;
        portal.semanticOffset += data.cards.length;
        if (data.cards.length === 0) portal.semanticDone = true;
        const fresh = data.cards.filter((c) => !seenIds.current.has(c.id)).slice(0, budget);
        for (const c of fresh) seenIds.current.add(c.id);
        if (fresh.length > 0) {
          trackEvent(EVENTS.PAGE_LOADED, { kind: "semantic", offset: portal.semanticOffset });
          setResults((prev) => (prev ? { ...prev, similares: [...prev.similares, ...fresh] } : prev));
        }
      }
    } finally {
      busyRef.current = false;
      setLoadingMore(false);
    }
  }, [results, pushMsg]);

  /* ---------------- Modo chat (SSE, el estado vive en P2) ---------------- */

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (sessionRef.current) return sessionRef.current;
    const res = await fetch("/api/sessions", { method: "POST" });
    if (!res.ok) return null;
    const data = (await res.json()) as { session_id: string };
    sessionRef.current = data.session_id;
    sessionSeeded.current = false;
    setTrackingSession(data.session_id);
    return data.session_id;
  }, []);

  const sendChat = useCallback(
    async (query: string, override?: string, opts?: { echoText?: string }) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setStreaming(true);
      lastAction.current = { type: "chat", query, override };
      if (!override) {
        lastUserQuery.current = query;
        setDisplayQuery(query);
      }
      pushMsg({ kind: "user", text: opts?.echoText ?? query });
      trackEvent(EVENTS.SEARCH, { mode: "chat", query, vertical_override: override });

      try {
        let sessionId = await ensureSession();
        if (!sessionId) {
          pushMsg({ kind: "error", text: "No pude iniciar la conversación. Probá de nuevo.", canRetry: true });
          return;
        }

        // Primer turno de una sesión nueva tras una búsqueda del portal: se
        // antepone la consulta original para que P2 tenga qué refinar (si no,
        // responde clarificación). El refinamiento va DESPUÉS, así lo último que
        // escribió el usuario predomina; al usuario se le muestra solo su texto.
        let sent = query;
        const seed = portalRef.current.query;
        if (!sessionSeeded.current && !override && seed && seed !== query) {
          sent = `${seed}, ${query}`;
        }

        let res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, query: sent, ...(override ? { vertical_override: override } : {}) }),
        });

        // 404 = sesión expirada → crear una nueva y reintentar (el contexto se
        // pierde: aceptado por diseño, spec §3).
        if (res.status === 404) {
          sessionRef.current = null;
          setTrackingSession(null);
          sessionId = await ensureSession();
          if (sessionId) {
            res = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ session_id: sessionId, query: sent, ...(override ? { vertical_override: override } : {}) }),
            });
          }
        }

        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          pushMsg({
            kind: "error",
            text: body?.error ?? "Error interno. Probá de nuevo en un momento.",
            canRetry: true,
          });
          return;
        }

        await readSSE(res.body, ({ event, data }) => {
          switch (event) {
            case "cards": {
              const ev = JSON.parse(data) as CardsEvent;
              // La sesión ya tiene criterio acumulado: los próximos turnos son
              // refinamientos puros, sin resembrar la consulta original.
              sessionSeeded.current = true;
              seenIds.current = new Set(ev.cards.map((c) => c.id));
              setSelectedId(null);
              // El criterio cambió: invalidar el feed del mapa Y sus params — los
              // vigentes llegan recién en `done` (context.search_params); usar los
              // viejos acá dispararía un fetch stale. Hasta entonces, el mapa
              // dibuja estas cards.
              mapParamsRef.current = null;
              mapFeedKey.current = null;
              setMapPins(null);
              setMapTotalMatches(null);
              setResults({
                mode: "chat",
                cards: ev.cards,
                totalMatches: ev.total_matches,
                paramsApplied: null,
                riepilogo: ev.riepilogo,
                complemento: ev.complemento,
                similares: [],
                suggestions: ev.suggestions,
                capReached: false,
              });
              if (ev.total_matches === 0) {
                trackEvent(EVENTS.ZERO_RESULTS, { mode: "chat", query });
              } else if (ev.complemento) {
                trackEvent(EVENTS.COMPLEMENT_SHOWN, { motivo: ev.complemento.motivo, agregadas: ev.complemento.agregadas });
              }
              break;
            }
            case "response_chunk": {
              const { token } = JSON.parse(data) as { token: string };
              if (streamingMsgId.current == null) {
                const id = nextId();
                streamingMsgId.current = id;
                setMsgs((prev) => [...prev, { id, kind: "assistant", text: token, streaming: true }]);
                setLogOpen(true);
              } else {
                const id = streamingMsgId.current;
                setMsgs((prev) =>
                  prev.map((m) =>
                    m.id === id && m.kind === "assistant" ? { ...m, text: m.text + token } : m,
                  ),
                );
              }
              break;
            }
            case "clarification": {
              const ev = JSON.parse(data) as ClarificationEvent;
              trackEvent(EVENTS.CLARIFICATION_SHOWN, { mode: "chat", reason: ev.clarification_reason });
              pushMsg({
                kind: "clarification",
                message: ev.message,
                chips: ev.chips.length ? ev.chips : ev.nivel1_required ? DEFAULT_CLARIFICATION_CHIPS : [],
                mode: "chat",
              });
              break;
            }
            case "error": {
              const ev = JSON.parse(data) as StreamErrorEvent;
              pushMsg({ kind: "error", text: ev.message, canRetry: true });
              break;
            }
            case "done": {
              // El contexto acumulado vive en P2 (spec §3); de acá solo tomamos
              // search_params, que es un body válido de /search/structured, para
              // alimentar el mapa con el criterio vigente del turno.
              try {
                const ev = JSON.parse(data) as DoneEvent;
                const sp = ev.context?.search_params;
                if (sp && typeof sp === "object" && !Array.isArray(sp)) {
                  mapParamsRef.current = sp as StructuredParams;
                  setMapParamsVersion((v) => v + 1);
                }
              } catch {
                /* sin params del turno: el mapa sigue con las cards del payload */
              }
              break;
            }
          }
        });
      } catch {
        pushMsg({ kind: "error", text: "Se cortó la conexión con el buscador. Probá de nuevo.", canRetry: true });
      } finally {
        setMsgs((prev) =>
          prev.map((m) => (m.kind === "assistant" && m.streaming ? { ...m, streaming: false } : m)),
        );
        streamingMsgId.current = null;
        busyRef.current = false;
        setStreaming(false);
      }
    },
    [ensureSession, pushMsg],
  );

  /* ---------------- Interacciones ---------------- */

  const handleClarificationChip = useCallback(
    (msgId: number, chip: string, mode: "portal" | "chat") => {
      trackEvent(EVENTS.CLARIFICATION_CHIP, { chip, mode });
      setMsgs((prev) =>
        prev.map((m) => (m.id === msgId && m.kind === "clarification" ? { ...m, resolved: chip } : m)),
      );
      const lower = chip.toLowerCase();
      if (mode === "portal") {
        // Spec §2: reintentar la MISMA query anteponiendo la elección.
        void runPortalSearch(`${lower} ${lastUserQuery.current}`.trim());
      } else {
        // Spec §3: nueva request con vertical_override; P2 usa TODO el contexto.
        const override = OVERRIDE_BY_CHIP[lower] ?? lower;
        void sendChat(lastUserQuery.current || lower, override, { echoText: chip });
      }
    },
    [runPortalSearch, sendChat],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || busyRef.current) return;
      setInput("");
      if (!results && !lastUserQuery.current) {
        // Sin búsqueda previa: es la primera consulta → modo portal.
        void runPortalSearch(text);
      } else {
        // Refinamiento → canal conversacional (el estado se acumula en P2).
        void sendChat(text);
      }
    },
    [input, results, runPortalSearch, sendChat],
  );

  const handleRetry = useCallback(() => {
    const action = lastAction.current;
    if (!action || busyRef.current) return;
    if (action.type === "portal") void runPortalSearch(action.query);
    else void sendChat(action.query, action.override);
  }, [runPortalSearch, sendChat]);

  const handleSuggestion = useCallback(
    (s: string) => {
      // Las suggestions de P2 alimentan la conversación, como todo chip.
      void sendChat(s);
    },
    [sendChat],
  );

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

  const handleMapSelect = useCallback((id: string) => {
    setSelectedId(id);
    // En desktop, llevar la card correspondiente a la vista.
    document.getElementById(`pcard-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  /* ---------------- Efectos ---------------- */

  useEffect(() => {
    if (initialQuery && processedQuery.current !== initialQuery) {
      processedQuery.current = initialQuery;
      void runPortalSearch(initialQuery);
    }
  }, [initialQuery, runPortalSearch]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, logOpen]);

  // Pins del mapa: una sola llamada fast-path por criterio, solo con el mapa
  // visible. Forma (b) con `session_id` cuando hay sesión de chat (P2 resuelve el
  // estado acumulado); forma (a) con el criterio del portal en el resto. El body
  // se filtra con toMapRequest(): el schema es extra="forbid" y `limit`/`offset`/
  // `order` de los params darían 422.
  useEffect(() => {
    if (!(showMap || mapMobileOpen)) return;
    if (!results || results.cards.length === 0) return;

    const sessionId = results.mode === "chat" ? sessionRef.current : null;
    const params = mapParamsRef.current;
    if (!sessionId && !params) return;

    const body: MapSearchRequest = sessionId
      ? { session_id: sessionId }
      : toMapRequest(params as StructuredParams);
    // El body identifica el criterio. En modo sesión el body no cambia entre
    // turnos, pero cada evento `cards` resetea mapFeedKey: eso es lo que
    // dispara el refetch. `mapParamsVersion` es solo dependencia del efecto
    // (los refs no re-renderizan); meterlo en la clave duplicaría la llamada.
    const key = JSON.stringify(body);
    if (mapFeedKey.current === key) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/search/map", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as MapSearchResponse;
        if (cancelled) return;
        mapFeedKey.current = key;
        setMapPins(data.pins);
        setMapTotalMatches(data.total_matches);
        trackEvent(EVENTS.MAP_FEED, {
          pins: data.total_pins,
          total_matches: data.total_matches,
          mode: sessionId ? "session" : "params",
        });
      } catch {
        /* sin pins: el mapa queda con lo que tenga (o vacío hasta el próximo turno) */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showMap, mapMobileOpen, results, mapParamsVersion]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !results || results.mode !== "portal" || results.capReached) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [results, loadMore]);

  /* ---------------- Render ---------------- */

  const busy = searching || streaming;
  const pendingClarification = [...msgs].reverse().find(
    (m): m is Extract<Msg, { kind: "clarification" }> => m.kind === "clarification" && !m.resolved,
  );

  // Pins tal como los da /search/map: P2 ya aplicó el gate del mapa
  // (quality_tier >= 2 + coordenadas), así que P1 no vuelve a filtrar.
  // Memoizado: una identidad nueva por render reconstruiría los markers.
  const pins = useMemo(() => mapPins ?? [], [mapPins]);
  // Los controles dependen de que HAYA resultados, no de que los pins ya
  // llegaron: si no, al ocultar el mapa y buscar de nuevo desaparecería el botón.
  const mapAvailable = !!results && results.cards.length > 0;
  const mapSplit = mapAvailable && showMap;
  const mapOverlay = mapAvailable && mapMobileOpen;

  return (
    <div
      className={`results-layout${mapSplit ? " has-map" : ""}${mapOverlay ? " map-overlay-open" : ""}`}
    >
      <div className="results-col results-page">
      <div className="results-head-row">
        <ResultsHead results={results} query={displayQuery || initialQuery} />
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

      {!results && !searching && pendingClarification && (
        <div className="zero-state" role="status">
          <h3>Una precisión antes de buscar</h3>
          <p>{pendingClarification.message}</p>
          <div className="msg-chips">
            {pendingClarification.chips.map((chip) => (
              <button
                key={chip}
                className="chip chip--action"
                onClick={() => handleClarificationChip(pendingClarification.id, chip, pendingClarification.mode)}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}

      {results && results.totalMatches === 0 && (
        <div className="zero-state" role="status">
          <h3>No hay nada que cumpla esto hoy</h3>
          <p>
            En San Juan el cero casi siempre es el mercado: hay zonas con muy poco stock publicado.
            Ajustemos el criterio y vuelvo a buscar.
          </p>
          {(results.suggestions?.length ?? 0) > 0 && (
            <div className="msg-chips">
              {results.suggestions!.map((s) => (
                <button key={s} className="chip chip--action" onClick={() => handleSuggestion(s)} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {results && results.cards.length > 0 && (
        <div className="cards-grid">
          {results.cards.map((card) => (
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

      {results?.complemento && results.complemento.cards.length > 0 && (
        <ComplementBlock complemento={results.complemento} />
      )}

      {results && results.similares.length > 0 && (
        <>
          <h2 className="section-title">Similares que quizás te sirvan</h2>
          <p className="section-note">
            No cumplen todos los filtros de tu búsqueda; las agrego porque se le parecen.
          </p>
          <div className="cards-grid">
            {results.similares.map((card) => (
              <PropertyCard key={card.id} card={card} similar />
            ))}
          </div>
        </>
      )}

      {results?.capReached && (
        <div className="sysmsg">
          Mostré los 30 mejores resultados para esta consulta. Refinemos: contame barrio, rango de
          precio o qué priorizás, y busco de nuevo.
        </div>
      )}

      {(searching || loadingMore) && (
        <div className="loading-row" role="status">
          <span className="spinner" aria-hidden />
          {searching ? "Buscando en San Juan…" : "Cargando más resultados…"}
        </div>
      )}

      <div ref={sentinelRef} aria-hidden />

      {/* ---------------- Chat anclado, persistente ---------------- */}
      <div className="dock-wrap">
        <div className={`dock${logOpen ? " dock--open" : ""}`}>
          {/* Solo visible en mobile: colapsa/expande el historial para no tapar la lista */}
          <button
            type="button"
            className="dock-toggle"
            onClick={() => setLogOpen((v) => !v)}
            aria-expanded={logOpen}
            aria-controls="dock-log"
          >
            <span className="dock-grabber" aria-hidden />
            <span className="dock-toggle-row">
              Conversación
              {msgs.length > 0 && <span className="dock-count">{msgs.length}</span>}
              <span aria-hidden>{logOpen ? "▾" : "▴"}</span>
            </span>
          </button>
          <div className="dock-log" id="dock-log" ref={logRef} role="log" aria-live="polite" aria-label="Conversación">
            {msgs.map((m) => (
              <DockMessage key={m.id} msg={m} onChip={handleClarificationChip} onRetry={handleRetry} busy={busy} />
            ))}
          </div>
          <form className="dock-form" onSubmit={handleSubmit}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                results
                  ? 'Refiná la búsqueda: "de 2 dormitorios", "sacale la pileta", "hasta 700 mil"…'
                  : "Escribí qué estás buscando…"
              }
              aria-label="Mensaje para refinar la búsqueda"
              disabled={busy}
            />
            <button type="submit" className="btn btn-magenta" disabled={busy || !input.trim()}>
              {busy ? "…" : "Enviar"}
            </button>
          </form>
          <p className="dock-hint">
            La conversación acumula contexto: podés pedir “también en Rivadavia”, “las más baratas
            primero” o “empecemos de nuevo”.
          </p>
        </div>
      </div>
      </div>

      {/* Mapa: split fijo en desktop, overlay fullscreen en mobile.
          El aviso de parcialidad es obligatorio (handoff §4.1). */}
      {mapAvailable && (showMap || mapOverlay) && results && (
        <aside className="map-col">
          {/* Ya no es "lo de esta página": /search/map devuelve el universo del
              criterio. La diferencia con total_matches son los avisos sin
              ubicación publicada (tier 1), y se dice explícitamente. */}
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

function ResultsHead({ results, query }: { results: ResultsView | null; query: string }) {
  if (!results) {
    return (
      <div className="results-head">
        {query ? <p className="results-query">Buscando: «{query}»</p> : null}
      </div>
    );
  }

  const pills: string[] = [];
  if (results.riepilogo) {
    const r = results.riepilogo;
    for (const v of [r.vertical, r.tipo, r.zona, r.budget]) if (v) pills.push(v);
    if (r.orden) pills.push(`Orden: ${r.orden}`);
  } else if (results.paramsApplied) {
    const p = results.paramsApplied;
    if (typeof p.vertical === "string") pills.push(REQUEST_VERTICAL_LABEL[p.vertical] ?? p.vertical);
    if (typeof p.property_type === "string")
      pills.push(PROPERTY_TYPE_LABEL[p.property_type as keyof typeof PROPERTY_TYPE_LABEL] ?? p.property_type);
    if (Array.isArray(p.zones) && p.zones.length) pills.push((p.zones as string[]).join(", "));
    if (typeof p.order === "string") pills.push(`Orden: ${ORDER_LABEL[p.order] ?? p.order}`);
  }

  return (
    <div className="results-head">
      {/* Contador = total_matches (total real en DB), nunca `total` (regla 7). */}
      <h1 className="results-count">
        {fmtInt(results.totalMatches)} {results.totalMatches === 1 ? "resultado" : "resultados"}
      </h1>
      {query && <p className="results-query">para: «{query}»</p>}
      {(pills.length > 0 || results.riepilogo?.nota_asuncion) && (
        <div className="applied-pills">
          {pills.map((p) => (
            <span className="pill" key={p}>
              {p}
            </span>
          ))}
          {results.riepilogo?.nota_asuncion && (
            <span className="pill pill--note">{results.riepilogo.nota_asuncion}</span>
          )}
        </div>
      )}
    </div>
  );
}

function ComplementBlock({ complemento }: { complemento: Complemento }) {
  return (
    <>
      <h2 className="section-title">Similares que no cumplen todos los filtros</h2>
      <p className="section-note">
        {complemento.faltantes != null
          ? `Faltaron ${complemento.faltantes} para completar la página; estas se parecen a lo que pedís.`
          : "Estas se parecen a lo que pedís, aunque no cumplen todos los filtros."}
      </p>
      <div className="cards-grid">
        {complemento.cards.map((card) => (
          <PropertyCard key={card.id} card={card} similar />
        ))}
      </div>
    </>
  );
}

function DockMessage({
  msg,
  onChip,
  onRetry,
  busy,
}: {
  msg: Msg;
  onChip: (msgId: number, chip: string, mode: "portal" | "chat") => void;
  onRetry: () => void;
  busy: boolean;
}) {
  switch (msg.kind) {
    case "user":
      return <div className="msg msg--user">{msg.text}</div>;
    case "assistant":
      return (
        <div className="msg msg--assistant">
          {msg.text}
          {msg.streaming && <span className="caret" aria-hidden />}
        </div>
      );
    case "system":
      return <div className="msg msg--system">{msg.text}</div>;
    case "clarification":
      return (
        <div className="msg msg--assistant">
          {msg.message}
          {msg.chips.length > 0 && (
            <div className="msg-chips">
              {msg.chips.map((chip) => (
                <button
                  key={chip}
                  className={`chip${msg.resolved === chip ? " chip--active" : " chip--action"}`}
                  onClick={() => onChip(msg.id, chip, msg.mode)}
                  disabled={busy || !!msg.resolved}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    case "error":
      return (
        <div className="msg msg--error" role="alert">
          {msg.text}
          {msg.canRetry && (
            <button onClick={onRetry} disabled={busy}>
              Reintentar
            </button>
          )}
        </div>
      );
  }
}
