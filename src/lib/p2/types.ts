/**
 * Tipos del contrato P2 → P1 según docs/P1_INTEGRATION_SPEC.md (2026-08-30) +
 * `API_CONTRACT.md` de P2 (2026-09-13: filtros duros, aclaración no terminal,
 * vigencia/antigüedad, vertical de lotes, cercanía) — copia en
 * `docs/API_CONTRACT_P2_2026-09-13.md`.
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

/**
 * `deal_rating` (API_CONTRACT 2026-09-13 §4.1): a los tres colores se suman
 * `verify_data` (el gap real excede ±35 %: "verificar datos") y `outdated`
 * (aviso `stale`, > 90 días sin actualizar: "sin actualizar").
 * Desde el 30/09 (respuesta de P2 §3.3.1, `docs/RESPUESTA_P2_A_P1_2026-09-30.md`)
 * un ALQUILER más de 35 % por encima de sus similares es `red` (primer motivo
 * `sobreprecio`), no `verify_data`: llega con `valuation_gap_capped: true` y
 * gap −35. En alquiler `verify_data` queda solo para > +35 %.
 */
export type DealRating = RatingColor | "verify_data" | "outdated";

/** Antigüedad del aviso (§4.2): > 180 días · > 365 días · null. */
export type AgeFlag = "old" | "very_old";

/** Vigencia de P3 (§4.2): `removed` nunca llega. */
export type ListingStatus = "active" | "stale";

export type LandClass = "urban" | "rural";
export type LandService = "agua" | "luz" | "cloacas" | "gas" | "pavimento";
export type LandZoning = "residential" | "commercial" | "industrial" | "rural" | "mixed";

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

/** Celda zonal de un lote en el contrato del 13/09 (precursora de `ZoneRef`). */
export interface ZoneStatsRef {
  bucket: string;
  median_price_per_sqm: number | null;
  median_price_per_hectare: number | null;
  sample: number | null;
  fallback: string | null;
  /** Nombre del nivel cuando hay fallback ("gran_san_juan"). */
  fallback_ref?: string | null;
}

/** Tendencia del aviso: la marca P3 en dólares, P2 la pasa (guía 29/09, C6). */
export type PriceTrend = "up" | "down";

/** Tendencia de la celda zonal (P3): solo precio, umbral y ventana de P3. */
export type ZoneTrend = "up" | "down" | "flat";

/**
 * Referencia de zona del aviso (pedido a P2 del 29/09, §3.2; entregada el
 * 30/09, `docs/RESPUESTA_P2_A_P1_2026-09-30.md`): la celda de la semana
 * vigente para su zona, operación y bucket. Es referencia, NO comparación: la
 * card la muestra sin porcentaje contra el aviso (C3). Interpretaciones de
 * P2: un valor de referencia por celda (mensual en alquiler, hectárea en
 * lotes rurales, m² en el resto) y propia o fallback se decide sobre ESE
 * valor; sin mezclar con la celda `todos`; habitaciones y tarifas por día o
 * semana → null.
 *
 * ⚠️ 31/10 (contrato §4.8): sus medianas (`median_price_per_sqm`,
 * `median_price_per_hectare`, `median_price`) siguen llegando pero YA NO SE
 * MUESTRAN — la referencia de precio es `price_ref`, ni al lado ni de
 * respaldo. De acá siguen saliendo tendencia, rentabilidad y semana.
 */
export interface ZoneRef {
  /** Código ("santa_lucia"). */
  zone: string;
  /** `house` · `apartment` (tipo de la celda) · `land` en lotes · null si la serie zonal todavía no distingue tipo. */
  property_type: PropertyType | null;
  /**
   * "1" | "2" | "3" | "4plus" | "lote_urbano" | "lote_rural" | "lote_rural_srv";
   * "todos" = vivienda que no informa dormitorios, o informa 0 (P2 04/10: antes
   * llegaba sin `zone_ref`).
   */
  bucket: string;
  /** Vivienda en venta y lotes urbanos (USD). */
  median_price_per_sqm: number | null;
  /** Lotes rurales (USD). */
  median_price_per_hectare: number | null;
  /** Alquiler mensual (USD) — no se muestra en la card de alquiler (decisión 15). */
  median_price: number | null;
  /** Avisos detrás del valor de referencia que se sirve. */
  sample: number | null;
  /** ≠ null = la zona no llega a la muestra mínima y los valores son de ese nivel. */
  fallback: "macro_zona" | "provincia" | null;
  /** Nombre del nivel cuando hay fallback ("gran_san_juan"). */
  fallback_ref?: string | null;
  trend: ZoneTrend | null;
  trend_pct: number | null;
  /** Semanas entre las dos puntas comparadas (2 el 01/10; sube con las corridas). */
  trend_weeks: number | null;
  /** Rentabilidad promedio de la zona (solo venta de vivienda). */
  cap_pct: number | null;
  /** Lunes ISO de la celda. */
  week: string;
}

/**
 * LA referencia de precio del aviso (contrato §4.8 del 31/10; columnas `ref_*`
 * de la migración 040 de P3, `docs/RESPUESTA_P3_A_P1_2026-10-31_indicadores-por-radio.md`).
 * Un solo valor, elegido por P3 con su cascada por vertical entre lo que rodea
 * al aviso (radio 1 de 1 km; en lotes urbanos también el radio 2 de 3 o 5 km)
 * y su zona: venta de vivienda r1 → zona; alquiler r1 solo con el tramo propio
 * → zona; lote urbano r1 → r2 → zona; lote rural zona. P2 no elige, P1 tampoco.
 * Reemplaza a la mediana de `zone_ref` en la card y el detalle: sin
 * `price_ref` no hay referencia de precio (jamás `zone_ref` de respaldo).
 * USD, como `zone_ref`. En los niveles de zona el valor es exactamente el de
 * `zone_ref` del mismo aviso.
 */
export interface PriceRef {
  /** `radius` = avisos alrededor (ver `radius_km`) · `zona` · `macro_zona` · `provincia` (vocabulario de `zone_ref.fallback`). */
  level: string;
  /** Con `radius`: 1 (radio 1) · 3 o 5 (radio 2, solo lotes urbanos). null en los niveles de zona. */
  radius_km: number | null;
  /** Con los niveles de zona: `capital`, `gran_san_juan` / `periferia` / `alejado`, `san_juan`. null con `radius`. */
  place: string | null;
  /** El valor, en USD, por `unit`. */
  value: number;
  /** `sqm` (venta de vivienda y lotes urbanos) · `month` (alquiler mensual) · `hectare` (lotes rurales). */
  unit: string;
  /** Avisos que respaldan el valor. */
  sample: number | null;
  /** `1` · `2` · `3` · `4plus` · `todos` (sin distinguir dormitorios) · `lote_urbano` · `lote_rural` · `lote_rural_srv`. */
  bucket: string | null;
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
  /**
   * USD/m² sobre la superficie cubierta; con `total_area_basis`, sobre la
   * total (P2 04/10: ahí se rotula). La card lo muestra solo en VENTAS.
   */
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
  /** Superficie total; null = no informada (nunca 0: P2 lo pasó de 0 a null el 30/09). */
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
  deal_rating: DealRating | null;
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

  /** Días desde la publicación ORIGINAL: señal de negociación ("publicado hace X"). */
  days_on_market: number | null;
  /** Días desde `listing_updated_at`: la frescura ("actualizado hace Y"). */
  days_since_update?: number | null;
  listing_published_at: string | null;
  listing_updated_at: string | null;
  /** `stale` solo entra cuando se pidió antigüedad explícita (§1). */
  listing_status?: ListingStatus | null;
  age_flag?: AgeFlag | null;
  /** `composite` · `shared_or_partial` · `tiny_unit` — atípicos, score ≤ 40. */
  atypical_flags?: string[] | null;
  /** Solo con `order_code: distance_asc`: km al punto de `summary.near`. */
  distance_km?: number | null;
  location_confidence?: "high" | "medium" | "low" | null;
  /**
   * true = el gap real excede ±35 % y el mostrado está acotado. Va con
   * `verify_data`, SALVO el alquiler caro (gap −35, `red`; P2 30/09): por eso
   * "verificar el aviso" se decide por `deal_rating`, no por este flag.
   */
  valuation_gap_capped?: boolean | null;
  /**
   * Vivienda: el aviso publica superficie cubierta. Con `total_area_basis` es
   * `false` aunque haya m² y comparación (P2 04/10): NO sirve para decidir si
   * va el bloque de posición.
   */
  has_covered_area?: boolean | null;
  /**
   * `true` = departamento que no publica cubierta y se midió sobre la total
   * (`area_sqm`): su m², su conjunto de similares y su entrada al de otros
   * (P2 04/10 — `docs/RESPUESTA_P2_A_P1_2026-10-04.md`). `true` o null, nunca
   * `false`.
   */
  total_area_basis?: boolean | null;
  /**
   * `true` = el aviso no publica dormitorios y su conjunto se armó por
   * superficie ±30 % sola, con avisos de cualquier cantidad de dormitorios
   * (P2 04/10). `true` o null, nunca `false`.
   */
  comparables_by_area_only?: boolean | null;
  /** Score de P3 (trazabilidad): NO se muestra. */
  p3_opportunity_score?: number | null;

  /* ---- Cards por vertical (guía 29/09): aditivos, null hasta que P2/P3 los entreguen ---- */
  /** Tendencia del aviso (P3 → P2). null = sin cambio registrado. */
  price_trend?: PriceTrend | null;
  /** Precio anterior nominal, en `currency` del aviso (para "antes $ 480.000"). */
  previous_price?: number | null;
  previous_price_usd?: number | null;
  /** Variación en USD, con signo (−8.3). */
  price_change_pct?: number | null;
  /** Fecha ISO del cambio. */
  price_changed_at?: string | null;
  zone_ref?: ZoneRef | null;
  /** LA referencia de precio (31/10): la única que se muestra. null = sin referencia, sin caer a `zone_ref`. */
  price_ref?: PriceRef | null;
  /**
   * Lotes (contrato 13/09 §4.4): la celda zonal que P2 usó para el gap del
   * lote. Sirvió de respaldo del bloque Zona hasta el 31/10; desde entonces
   * la referencia es `price_ref` y esta celda no se muestra.
   */
  zone_stats_ref?: ZoneStatsRef | null;
  /** Alquiler: renta estimada en pesos (P2 convierte con la tasa de la corrida). Solo detalle. */
  estimated_monthly_rent_ars?: number | null;

  quality_tier: number | null;
  quality_score: number | null;

  /* ---- Lote (§4.4; `property_type: "land"`, vertical `land`) ---- */
  land_class?: LandClass | null;
  land_class_confidence?: "high" | "medium" | "low" | null;
  /** true declara servicios · false declara que NO · null no lo dice (NUNCA "sin servicios"). */
  land_services?: boolean | null;
  land_services_detail?: LandService[] | null;
  in_subdivision?: boolean | null;
  subdivision_name?: string | null;
  /** USD/m² sobre superficie TOTAL (`area_sqm`). */
  price_per_sqm_land?: number | null;
  /** USD/ha — solo rurales. */
  price_per_hectare?: number | null;
  land_zoning?: LandZoning | null;
  frontage_m?: number | null;
  depth_m?: number | null;
  /** "apto construcción" SOLO si el aviso lo dice. */
  buildable?: boolean | null;

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

/**
 * Comparable del detalle (Swagger manda). Desde el 30/09 (respuesta de P2
 * §3.3.4) es un aviso del MISMO conjunto con el que P3 midió el precio, y
 * suma dormitorios, cubierta y US$/m².
 */
export interface MiniCard {
  id?: string | null;
  zone: string | null;
  /** Superficie total; null = no informada (nunca 0). */
  area_sqm: number | null;
  price: number;
  currency: Currency | null;
  price_usd: number | null;
  property_type?: PropertyType | null;
  operation?: Operation | null;
  bedrooms?: number | null;
  covered_area_sqm?: number | null;
  /**
   * USD/m² sobre la MISMA base con que se compara: cubierta en vivienda (la
   * total en un departamento sin cubierta: `covered_area_sqm` null y
   * `area_sqm` con valor — P2 04/10), total en lotes. null sin esa superficie
   * y en alquileres de vivienda, que se comparan por precio mensual.
   */
  price_per_sqm?: number | null;
  /** Primera foto del similar, la misma de su card (P2 04/10). Todo similar listado tiene foto. */
  photo_url?: string | null;
  /** Llega; no se muestra (regla de producto 13 c). */
  opportunity_score?: number | null;
}

/**
 * El conjunto de similares del detalle (respuesta de P2 30/09-01/10 §3.3.4).
 * `count` = `comparables_count` de la card; hasta 30 con banda de superficie
 * (venta de vivienda y lotes) y SIN tope en alquiler por dormitorios (hoy
 * hasta 274). `count = listed + not_listed`: `not_listed` son los avisos del
 * conjunto que no se muestran (tier 0: sin foto o sin superficie) — en
 * alquiler, casi la mitad.
 */
export interface ComparablesPool {
  /** Hasta dónde hubo que ampliar para juntar avisos similares. */
  scope: "zone" | "adjacent_zones" | "macro_zone" | string;
  count: number;
  /** Cuántos van en `comparables`: todos los que se pueden mostrar. */
  listed: number;
  not_listed: number;
}

/** PropertyDetail ⊃ Card + campos propios del detalle. */
export interface PropertyDetail extends Card {
  description: string | null;
  heating: string | null;
  year_built: number | null;
}

export interface PropertyDetailResponse {
  property: PropertyDetail;
  /**
   * Todos los avisos del conjunto que se pueden mostrar, por precio en USD:
   * hasta 30 en venta y lotes, sin tope en alquiler (P2 01/10; antes eran 3).
   * Si la sección tiene que ser corta, el recorte es de P1.
   */
  comparables: MiniCard[] | null;
  /** null = el aviso no tiene con qué compararse. */
  comparables_pool?: ComparablesPool | null;
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

export type RequestVertical = "sale" | "rent" | "investment" | "temporary_rent" | "land";

export type OrderCode =
  | "opportunity_score"
  | "price_asc"
  | "price_desc"
  | "price_per_sqm_asc"
  | "valuation_gap_desc"
  | "price_percentile_asc"
  | "gross_yield_desc"
  | "days_on_market_desc"
  | "distance_asc";

export interface StructuredParams {
  vertical?: RequestVertical;
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
  budget_max?: number;
  budget_min?: number;
  area_min_sqm?: number;
  filters?: StructuredFilter[];
  /** "cerca de X" (contrato 13/09): resuelto contra POIs y zonas; con `near` el orden default es `distance_asc`. */
  near?: string;
  /** Solo `vertical: land`: `urban` · `rural` · null (ambas). */
  land_class?: LandClass;
  order?: OrderCode;
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
  /** Aceptados desde el contrato del 13/09. */
  place?: string;
  land_class?: string;
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
 * Campos que el endpoint acepta (whitelist: el resto da 422). Desde el
 * contrato del 13/09 suma `place` y `land_class` (Swagger vivo verificado
 * 14/09); sigue SIN `is_duplex`: un criterio con dúplex se mapea completo solo
 * por la forma (b) con `session_id` (la que usa la búsqueda simple).
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
  "place",
  "land_class",
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
  /** "comprar" | "alquilar" | "lotes" | "investment" (chips de clarificación y selector en sesión; "invertir" cae en compra). */
  vertical_override?: string;
  /** Default 20. */
  limit?: number;
  offset?: number;
}

/**
 * Filtro DURO aplicado (API_CONTRACT 13/09 §3.2): uno por chip. `label` viene
 * es-AR de P2 y se muestra tal cual; `field`/`value` sirven para la acción
 * (quitar / editar) — ver `src/lib/interpretation.ts`.
 */
export interface HardFilter {
  field: string;
  operator: string;
  value: unknown;
  label: string;
}

/** Opción de relajación de la aclaración NO terminal (`few_results`). */
export interface RelaxOption {
  relax: string;
  label: string;
  count: number;
}

/** Copia de la aclaración no terminal que viaja dentro de `cards` (§3.1). */
export interface ClarificationInfo {
  reason: string;
  message: string;
  chips: string[];
  options: RelaxOption[];
}

/** Ex `riepilogo` (renombrado el 29/08 — spec §5b). Textos ya localizados por P2. */
export interface Summary {
  vertical: string | null;
  zone: string | null;
  property_type: string | null;
  budget: string | null;
  /** Etiqueta del orden REAL aplicado. */
  order: string | null;
  assumption_note: string | null;
  /** = total_matches REAL en DB. */
  total_results: number;
  /* ---- contrato 13/09 (aditivos; opcionales por si el mock/instancia vieja no los manda) ---- */
  order_code?: OrderCode | string;
  hard_filters?: HardFilter[];
  /** Blandos: ordenan, no filtran. */
  soft_criteria?: string[];
  /** Nombre resuelto de "cerca de X" (con `order_code: distance_asc`). */
  near?: string | null;
  land_class?: "urban" | "rural" | "both" | null;
  /** true si entran avisos `stale` (se pidió antigüedad explícita). */
  includes_outdated?: boolean;
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
  /** Copia de la aclaración NO terminal (`few_results`) o null (contrato 13/09). */
  clarification?: ClarificationInfo | null;
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
    pagination?: { limit: number; offset: number; returned: number; total_matches: number; has_more: boolean };
  } | null;
}

/**
 * Dos formas (contrato 13/09 §3.3), distinguidas por `terminal`:
 *  (a) terminal (default si falta): cierra el stream sin `cards`;
 *  (b) NO terminal (`few_results`): llega DESPUÉS de `cards` cuando quedaron
 *      menos de 3 resultados, con `options[]` (relajar UN filtro y su conteo);
 *      el stream sigue con la narrativa y `done`.
 */
export interface ClarificationEvent {
  session_id: string;
  message: string;
  chips: string[];
  clarification_reason: string;
  nivel1_required: boolean;
  terminal?: boolean;
  options?: RelaxOption[];
  context: Record<string, unknown>;
}

/** Respuesta de `POST /search` (fallback sync, contrato §3.7): misma info que el stream, sin narrativa LLM. */
export interface SyncSearchResponse {
  session_id: string;
  content_language?: string;
  summary: Summary;
  cards: Card[];
  nivel1_required: boolean;
  chips: string[] | null;
  suggestions: string[] | null;
  context: Record<string, unknown>;
  /** Resumen template (es-AR). */
  llm_response: string | null;
  related: Related | null;
  clarification: ClarificationInfo | null;
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

/* ------------------------------------------------------------------ */
/* Análisis de inversión — POST /search/invest (P2 01/11, contrato §9) */
/* `docs/HANDOFF_P2_INVEST_2026-11-01.md` §3. SSE con CRLF, como el    */
/* stream. Orden: plan → step* → picks → [comparison] → answer_chunk* → */
/* done | skip | error. Es OTRO canal: no trae `cards` ni               */
/* `response_chunk`. Las claves van en inglés (`reason`, no `motivo`).  */
/* ------------------------------------------------------------------ */

/** `simple` nunca llega como plan: es `skip`. */
export type InvestQuestionType = "seleccion" | "comparacion" | "zona" | "propiedad";

export interface InvestRequest {
  /** Texto crudo del usuario, ≤ 500 caracteres. */
  query: string;
  vertical: "invertir";
  /** Solo correlación de eventos: el análisis no lee ni escribe la sesión. */
  session_id: string | null;
}

export interface InvestPlanStep {
  index: number;
  label: string;
}

export interface InvestPlanEvent {
  analysis_id: string;
  question_type: InvestQuestionType | string;
  /** Los pasos a pintar, en orden; con resúmenes de zona hay uno más ("Resumen de N zonas"). */
  steps: InvestPlanStep[];
  /** Supuesto del plan para el usuario, ya filtrado de vocabulario; null si no asumió nada. */
  note: string | null;
  /** Lo que P2 corrigió (diagnóstico, forma libre): no se muestra, viaja en la analítica. */
  adjustments: unknown;
}

export interface InvestStepEvent {
  index: number;
  status: "running" | "done" | "failed";
  label: string;
  total_matches: number | null;
  ms: number;
  /** Solo en `done`: el criterio público aplicado (body válido de /search/structured). */
  params?: StructuredParams | null;
  /** Solo en `done`: avisos con rentabilidad estimada en el universo entero. */
  with_yield?: number | null;
  /** Solo en `failed`. */
  error?: string | null;
}

/** Card completa (la misma del evento `cards`) + el motivo del LLM, ≤ 140 caracteres. */
export interface InvestPick extends Card {
  reason: string | null;
}

export interface InvestPicksEvent {
  /** 3 a 6, el mejor primero; con menos candidatos llegan los que hay. */
  cards: InvestPick[];
}

export interface InvestComparisonRaw {
  label: string;
  total_matches: number;
  with_yield: number;
  yield_median_pct: number | null;
  yield_p25_pct: number | null;
  yield_p75_pct: number | null;
  valuation_gap_median_pct: number | null;
  zone_trend: ZoneTrend | null;
  zone_trend_pct: number | null;
  zone_cap_pct: number | null;
}

/** `columns` y `rows` vienen en lenguaje de usuario, listas para dibujar; `raw` es para gráficos. */
export interface InvestComparisonEvent {
  columns: string[];
  rows: string[][];
  raw?: InvestComparisonRaw[] | null;
}

/** Una oración validada por chunk; cada una termina en espacio: se concatenan tal cual. */
export interface InvestAnswerChunkEvent {
  text: string;
}

export interface InvestUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface InvestDoneEvent {
  analysis_id: string;
  /** true = se venció `INVEST_TIMEOUT_S` (45 s): lo que llegó es válido. */
  partial: boolean;
  latency_ms: number;
  latency_detail_ms?: Record<string, number> | null;
  steps: InvestStepEvent[];
  question_type: InvestQuestionType | string;
  model: string | null;
  plan_model?: string | null;
  prompt_versions?: Record<string, string> | null;
  usage: InvestUsage | null;
  /** Estimación por tabla de precios. */
  cost_usd: number | null;
  /** `llm` · `llm_truncated` · `partial` · `fallback` (oración fija, sin prosa del LLM). */
  narrative: "llm" | "llm_truncated" | "partial" | "fallback" | string;
  candidates?: number | null;
  /** Oraciones que la guardia descartó, con el motivo (diagnóstico). */
  dropped?: unknown;
}

/** El análisis no agrega nada: P1 no muestra panel y no reintenta. */
export interface InvestSkipEvent {
  analysis_id: string;
  reason: "simple" | "plan_timeout" | "plan_unparseable" | string;
}

/** HTTP 200 como en /search/stream; `llm_unavailable` (503) · `llm_error` (502). */
export interface InvestErrorEvent {
  code: string;
  status?: number;
  message: string;
}
