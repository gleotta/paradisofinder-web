/**
 * Tipos del contrato P2 → P1 según docs/P1_INTEGRATION_SPEC.md (2026-08-30).
 * La fuente de verdad es el Swagger vivo de P2 (`http://localhost:8001/docs`) y la
 * colección Postman; ante diferencia, ganan Swagger/Postman.
 *
 * Contrato internacional (2026-08-27; completado el 29/08 — spec §5b): claves y
 * códigos en inglés; los TEXTOS libres vienen localizados por P3
 * (`content_language`, acá "es-AR") y se muestran tal cual.
 */

export type Operation = "sale" | "rent";

export type PropertyType =
  | "house"
  | "apartment"
  | "land"
  | "office"
  | "retail"
  | "villa"
  | "garage"
  | "warehouse"
  | "room"
  | "studio"
  | "attic"
  | "penthouse"
  | "other";

export type Condition =
  | "unknown"
  | "new"
  | "excellent"
  | "good"
  | "needs_renovation"
  | "under_construction";

export type Currency = "USD" | "ARS" | "EUR";

export type RentalPeriod = "day" | "week" | "month";

/** null = NO EVALUADO → omitir, jamás "malo". */
export type RatingColor = "green" | "yellow" | "red";

export type Publisher = "agency" | "owner";

/** Derivado por P2 para habitaciones (P3 no lo persiste). */
export type RoomClass = "single" | "single_double_bed" | "double" | "triple_plus";

export interface ScoreComponent {
  key: string;
  label: string;
  value: number;
  weight: number;
  raw_value: number | null;
  raw_unit: string | null;
  /** Texto de P3, ya localizado: display directo. */
  description: string;
}

export interface Reason {
  /** Estable, sirve para lógica. */
  code: string;
  /** Texto de P3: mostrar tal cual. */
  text: string;
}

export interface PrimarySignal {
  text: string;
  /** En P2 real: "positive" | "neutral" | "negative" (el color manda para el display). */
  type: string;
  color: RatingColor;
}

/** Indicador secundario con explicación (P3, localizado): display directo. */
export interface SecondaryIndicator {
  name: string;
  value: string;
  tooltip: string | null;
}

export interface Source {
  name: string;
  id: string;
  url: string | null;
}

export interface ContactInfo {
  phone: string | null;
  whatsapp: string | null;
  web: string | null;
}

/** Card de resultado — shape §5 de la spec. null = no informado → omitir (nunca 0). */
export interface Card {
  id: string;
  operation: Operation;
  property_type: PropertyType;
  /**
   * Marca ortogonal al tipo (delta 01/09): un dúplex sigue tipificado
   * `apartment` o `house`. Tri-estado: null = NO EVALUADO, nunca "no es" —
   * el sello se muestra SOLO con `=== true`.
   */
  is_duplex?: boolean | null;

  /** Precio principal: SIEMPRE el original del aviso. */
  price: number;
  currency: Currency;
  /** Referencia secundaria en avisos ARS; comparar SIEMPRE por acá. */
  price_usd: number | null;
  /** Referencia secundaria SOLO en alquileres publicados en USD. */
  price_ars?: number | null;
  /** Solo en VENTAS. */
  price_per_sqm: number | null;
  /** Estimación de P3 por m² — NO es un precio total. */
  estimated_price_per_sqm?: number | null;
  /** Sufijo en alquileres; null = no informado → asumir mensual sin comparar periodicidades. */
  rental_period: RentalPeriod | null;

  zone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;

  bedrooms: number | null;
  bathrooms: number | null;
  rooms: number | null;
  area_sqm: number | null;
  covered_area_sqm?: number | null;
  floor?: number | null;
  condition: Condition | null;

  opportunity_score: number | null;
  score_components: ScoreComponent[] | null;
  primary_signal: PrimarySignal | null;
  /** Color del badge de score que calcula P3 (ej. "green_dark"). */
  score_badge_color?: string | null;
  /** Indicadores con tooltip explicativo (P3): mostrar tal cual. */
  secondary_indicators?: SecondaryIndicator[] | null;
  deal_rating: RatingColor | null;
  /**
   * OJO: la clave real de P2 es `deal_rating_reasons` (verificado contra el
   * Swagger vivo 29/08); la spec §5 la nombraba genéricamente `*_reasons`.
   * `deal_reasons` se mantiene como alias defensivo — leer con dealReasons().
   */
  deal_rating_reasons?: Reason[] | null;
  deal_reasons?: Reason[] | null;
  /** Solo en ventas. */
  resale_investment_rating: RatingColor | null;
  resale_investment_reasons: Reason[] | null;
  /** Solo en ventas. */
  rental_investment_rating: RatingColor | null;
  rental_investment_reasons: Reason[] | null;
  /** Frase lista de P3; null = nada que destacar. */
  market_context: string | null;

  /** Renta bruta anual estimada (%), ventas; null = no evaluado → omitir. */
  gross_yield_pct: number | null;
  valuation_gap_pct: number | null;
  price_percentile: number | null;
  estimated_monthly_rent: number | null;
  rent_to_price_ratio: number | null;
  comparables_count: number | null;
  zone_supply: number | null;

  days_on_market: number | null;
  listing_published_at: string | null;
  listing_updated_at: string | null;

  quality_tier: number | null;
  quality_score: number | null;

  /** Chips de atributos; null = no informado → omitir. */
  pool?: boolean | null;
  bbq_area?: boolean | null;
  patio?: boolean | null;
  furnished?: boolean | null;
  parking?: boolean | null;
  gated_community?: boolean | null;
  mortgage_eligible?: boolean | null;
  elevator?: boolean | null;

  photo_url: string | null;
  photos: string[] | null;

  /** Procedencia — mostrar SIEMPRE (principio UX 4). */
  sources: Source[] | null;
  listing_url: string | null;
  publisher: Publisher | null;
  contact: ContactInfo | null;

  /** Tags de enriquecimiento y puntos de referencia (P3, localizados). */
  semantic_qualities?: string[] | null;
  nearby_points?: string[] | null;

  /** Habitaciones (temporario): beds = TAMAÑO de la habitación. */
  beds?: number | null;
  double_bed?: boolean | null;
  private_bathroom?: boolean | null;
  room_class?: RoomClass | null;

  /** En cards de `related`: score de similitud. */
  relevance_score?: number | null;
}

/** Comparable del detalle (shape mínima según spec §4; Swagger manda). */
export interface MiniCard {
  id?: string | null;
  zone: string | null;
  area_sqm: number | null;
  price: number;
  currency: Currency;
  price_usd: number | null;
  property_type?: PropertyType | null;
  operation?: Operation | null;
}

/** PropertyDetail ⊃ Card + campos propios del detalle. */
export interface PropertyDetail extends Card {
  description: string | null;
  heating: string | null;
  year_built: number | null;
}

export interface PropertyDetailResponse {
  property: PropertyDetail;
  comparables: MiniCard[] | null;
  score_components: ScoreComponent[] | null;
  content_language: string;
}

/* ------------------------------------------------------------------ */
/* Búsqueda del portal (stateless) — spec §2                           */
/* ------------------------------------------------------------------ */

/** Vocabulario público del request (2026-08-27, pase 2). */
export interface StructuredFilter {
  field: string;
  operator: string;
  value: unknown;
}

export interface StructuredParams {
  vertical?: "sale" | "rent" | "investment" | "temporary_rent";
  zones?: string[];
  /** Filtro DURO. */
  property_type?: PropertyType;
  /**
   * Filtro DURO del dúplex (delta 01/09): "dúplex en rivadavia" llega como
   * `{is_duplex: true, property_type: null}` — la marca es ortogonal al tipo.
   * Reemplaza la aproximación anterior por `preferred_property_type` +
   * `semantic_query`.
   */
  is_duplex?: boolean;
  /**
   * Barrio/localidad que no es zona del catálogo (delta 31/08): FILTRA por el
   * nombre en el texto del aviso. Lo produce la extracción y P2 lo conserva
   * al paginar — P1 nunca lo manda.
   */
  place?: string;
  /**
   * Preferencia BLANDA: ordena, NO filtra. Desde el 01/09 no la emite ninguna
   * regla (el dúplex pasó a `is_duplex`): siempre llega null. Sigue en el
   * contrato, reservada para la próxima categoría que P3 no tipifique.
   */
  preferred_property_type?: PropertyType;
  /** Texto libre residual de la extracción; también pesa en el ranking. */
  semantic_query?: string;
  currency?: Currency;
  area_min_sqm?: number;
  filters?: StructuredFilter[];
  order?:
    | "opportunity_score"
    | "price_asc"
    | "price_desc"
    | "price_per_sqm_asc"
    | "valuation_gap_desc"
    | "price_percentile_asc"
    | "gross_yield_desc"
    | "days_on_market_desc";
  limit?: number;
  offset?: number;
  /** El Swagger puede sumar campos; se reenvían tal cual a /search/structured. */
  [key: string]: unknown;
}

/**
 * "Relacionadas" por embeddings (ex `complemento`, renombrado el 29/08).
 * Llegan SOLO en la última página del criterio (máx 10), ya deduplicadas
 * contra lo mostrado; en páginas intermedias el campo es null.
 */
export interface Related {
  /** Hoy: "structured_exhausted". */
  reason: string;
  count: number;
  cards: Card[];
}

export interface SearchResult {
  /** Cards devueltas en ESTA página. */
  total: number;
  /** Total real en DB — el contador de resultados usa ESTE. */
  total_matches: number;
  market: string;
  params_applied: Record<string, unknown> | null;
  cards: Card[];
  suggestions?: string[] | null;
  content_language?: string;
}

export interface SearchTextResponse {
  covered: boolean;
  clarification_needed: boolean;
  extraction: {
    /** Body válido de /search/structured — es el mecanismo del scroll. */
    params: StructuredParams;
    meta: Record<string, unknown> | null;
  } | null;
  result: SearchResult | null;
  /** Solo en la última página del criterio. */
  related: Related | null;
  /** Presentes cuando clarification_needed=true (chips fijos de la spec si faltan). */
  message?: string | null;
  chips?: string[] | null;
}

/** /search/structured y /search/semantic devuelven la misma shape de resultado. */
export type StructuredResponse = SearchResult;

/* ------------------------------------------------------------------ */
/* Mapa — POST /search/map (P2, 2026-08-29; pedido en P2_PEDIDO_SEARCH_MAP.md) */
/* ------------------------------------------------------------------ */

/**
 * Request del mapa. Dos formas MUTUAMENTE EXCLUYENTES: criterio estructurado
 * o `session_id`. El schema es `additionalProperties: false` (extra="forbid"):
 * mandar `limit`/`offset`/`order` — o cualquier campo de más — devuelve 422.
 * Por eso los params del portal/chat se filtran con `toMapRequest()`.
 */
export interface MapSearchRequest {
  session_id?: string;
  vertical?: string;
  zones?: string[];
  property_type?: string;
  budget_max?: number;
  budget_min?: number;
  currency?: string;
  area_min_sqm?: number;
  filters?: StructuredFilter[];
}

/** Payload mínimo de un marker; el detalle se pide con GET /property/{id}. */
export interface MapPin {
  id: string;
  latitude: number;
  longitude: number;
  /** Precio original del aviso. */
  price: number;
  currency: Currency | null;
  /** Única base comparable entre monedas. */
  price_usd: number | null;
  /** null = no informado (no asumir mensual al comparar). */
  rental_period: RentalPeriod | null;
  property_type: PropertyType;
  operation: Operation | null;
}

export interface MapSearchResponse {
  /** Mismo valor que /search/text para el criterio (incluye avisos sin ubicación). */
  total_matches: number;
  /** Subconjunto mapeable (tier >= 2 con coordenadas). Siempre == pins.length. */
  total_pins: number;
  market: string;
  params_applied: Record<string, unknown>;
  pins: MapPin[];
}

/**
 * Campos que el endpoint acepta (whitelist: el resto da 422).
 * OJO: NO incluye `is_duplex` ni `place` — /search/map conservó su contrato en
 * el delta del 01/09. Un criterio con dúplex/barrio se mapea completo solo por
 * la forma (b) con `session_id` (la que usa la búsqueda simple).
 */
const MAP_REQUEST_FIELDS = [
  "vertical",
  "zones",
  "property_type",
  "budget_max",
  "budget_min",
  "currency",
  "area_min_sqm",
  "filters",
] as const;

/**
 * Traduce los params de búsqueda vigentes (`extraction.params` del portal o
 * `context.search_params` del chat) a un body válido de /search/map: descarta
 * `limit`/`offset`/`order` y cualquier campo interno de cálculo, y omite nulls.
 */
export function toMapRequest(params: StructuredParams): MapSearchRequest {
  const out: MapSearchRequest = {};
  for (const key of MAP_REQUEST_FIELDS) {
    const value = params[key];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    Object.assign(out, { [key]: value });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Conversacional (SSE) — spec §3                                      */
/* ------------------------------------------------------------------ */

export interface SessionResponse {
  session_id: string;
  created_at: string;
  expires_at: string;
}

/**
 * Dos formas (spec §3):
 *  - Turno: `{session_id, query, vertical_override?}` — pasa por el LLM.
 *  - Paginación (2026-08-29): `{session_id, offset, limit?}` SIN `query` —
 *    re-consulta el criterio acumulado, no cuenta como turno (14-21 ms) y el
 *    SSE emite `cards` → `done` sin `response_chunk`.
 */
export interface StreamRequest {
  session_id: string;
  query?: string;
  /** "comprar" | "alquilar" | "invertir" (chips de clarificación). */
  vertical_override?: string;
  /** Default 20. */
  limit?: number;
  offset?: number;
}

/** Ex `riepilogo` (renombrado el 29/08 — spec §5b). Textos ya localizados por P2. */
export interface Summary {
  vertical: string | null;
  zone: string | null;
  property_type: string | null;
  budget: string | null;
  order: string | null;
  assumption_note: string | null;
  /** = total_matches REAL en DB. */
  total_results: number;
}

export interface CardsEvent {
  session_id: string;
  cards: Card[];
  summary: Summary;
  nivel1_required: boolean;
  total: number;
  total_matches: number;
  /** Solo en la última página del criterio (spec §2/§3). */
  related: Related | null;
  suggestions: string[] | null;
  /** El spec §3 lo muestra, pero la instancia real no siempre lo manda. */
  content_language?: string;
}

export interface ResponseChunkEvent {
  token: string;
}

export interface DoneEvent {
  context: Record<string, unknown>;
  meta: {
    extractor?: string;
    narrativa?: string;
    latency_ms?: Record<string, number>;
  } | null;
}

export interface ClarificationEvent {
  session_id: string;
  message: string;
  chips: string[];
  clarification_reason: string;
  nivel1_required: boolean;
  context: Record<string, unknown>;
}

export interface StreamErrorEvent {
  message: string;
  status?: number;
}

export type SSEEventName =
  | "cards"
  | "response_chunk"
  | "done"
  | "clarification"
  | "error";

/* ------------------------------------------------------------------ */
/* Eventos — spec §4                                                   */
/* ------------------------------------------------------------------ */

/**
 * Enum CERRADO de `event_type` de P2 (Swagger vivo, verificado 05/09): cualquier
 * otro valor da 422, igual que un `session_id` que no sea el UUID de una sesión.
 * El mapeo desde los eventos propios de P1 vive en `src/app/api/events/route.ts`.
 */
export type P2EventType =
  | "session_created"
  | "search_executed"
  | "nivel1_shown"
  | "refinement_applied"
  | "card_clicked"
  | "outbound_click"
  | "detail_viewed"
  | "empty_results"
  | "tipologia_fuera_alcance"
  | "agency_ingest";

export interface TrackEventBody {
  /** UUID de sesión de P2 (patrón `^[0-9a-f-]{36}$`). */
  session_id: string;
  event_type: P2EventType;
  /** ≤ 4 KB. */
  payload: Record<string, unknown>;
}
