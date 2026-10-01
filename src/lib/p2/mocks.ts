/**
 * Adaptador MOCK de P2 — se usa cuando P2 no está corriendo (ver client.ts).
 * Los ejemplos base viven en /mocks (ilustrativos); la verdad es el Swagger vivo.
 *
 * Reproduce la mecánica del contrato (13/09 incluido: `hard_filters`,
 * aclaración NO terminal `few_results`, vertical `land`, refinamientos en
 * sesión "Quitar X" / "en Zona" / "hasta …", fallback sync), y la realidad del
 * mercado San Juan: zonas sin stock devuelven 0 (Zonda, Calingasta, Jáchal,
 * Ullum, 25 de Mayo), temporario tiene ~10 avisos, y las consultas sin señal
 * piden clarificación. Algunas cards traen "None" en campos de texto a
 * propósito: así las pruebas verifican que P1 nunca lo muestra.
 *
 * Cards por vertical (29/09 — `docs/GUIA_P1_2026-09-29_cards-por-vertical.md`
 * §2.5): las cards traen desde ya los campos pedidos a P2 y P3 (`price_trend`
 * y compañía, `zone_ref`, `estimated_monthly_rent_ars`), y las TRES PRIMERAS
 * de cada vertical son casos fijos con los avisos del mockup aprobado
 * (`FIXTURES`), para ver y probar la card completa antes de que exista en P2.
 * El signo del gap es el del contrato real: `valuation_gap_pct` > 0 = el
 * aviso está por DEBAJO de sus similares.
 *
 * Respuesta de P2 del 30/09-01/10 (`docs/RESPUESTA_P2_A_P1_2026-09-30.md`),
 * reproducida acá: un alquiler más de 35 % por encima de similares es `red`
 * con `sobreprecio` (acotado a −35), no `verify_data`; `area_sqm` puede ser
 * null (nunca 0); el detalle lista el conjunto entero de similares con
 * `comparables_pool` (alquiler por dormitorios sin tope: `sj-mkr0` tiene 80,
 * 42 a la vista); y los textos de componentes y motivos son los vigentes.
 */

import baseSearch from "../../../mocks/search-text-response.json";
import baseClarification from "../../../mocks/clarification-event.json";
import type {
  Card,
  CardsEvent,
  ClarificationEvent,
  ClarificationInfo,
  ComparablesPool,
  DealRating,
  HardFilter,
  MapPin,
  MapSearchRequest,
  MapSearchResponse,
  MiniCard,
  PropertyDetail,
  PropertyDetailResponse,
  RatingColor,
  Related,
  RelaxOption,
  SearchTextResponse,
  SessionResponse,
  StreamRequest,
  StructuredParams,
  StructuredResponse,
  Summary,
  SyncSearchResponse,
  ZoneRef,
} from "./types";

const BASE_CARDS = (baseSearch as { result: { cards: unknown } }).result
  .cards as Card[];

/* ------------------------------------------------------------------ */
/* Interpretación naive de la query (SOLO para el mock; el NLP vive en P2) */
/* ------------------------------------------------------------------ */

const DEAD_ZONES = ["zonda", "calingasta", "jáchal", "jachal", "ullum", "25 de mayo"];
/** Barrios fuera del catálogo (delta 31/08 `place`): filtran por texto y dejan pocos resultados. */
const PLACES = ["trinidad", "concepción", "concepcion", "desamparados"];
const LIVE_ZONES: { code: string; match: RegExp }[] = [
  { code: "capital", match: /capital/ },
  { code: "rivadavia", match: /rivadavia/ },
  { code: "santa_lucia", match: /santa luc[ií]a/ },
  { code: "rawson", match: /rawson|villa krause/ },
  { code: "chimbas", match: /chimbas/ },
  { code: "pocito", match: /pocito/ },
  { code: "caucete", match: /caucete/ },
  { code: "albardon", match: /albard[óo]n/ },
  { code: "san_martin", match: /san mart[ií]n/ },
  { code: "nueve_de_julio", match: /9 de julio|nueve de julio/ },
  { code: "sarmiento", match: /sarmiento/ },
  { code: "angaco", match: /angaco/ },
];
const ZONE_NAME: Record<string, string> = {
  capital: "Capital",
  rivadavia: "Rivadavia",
  santa_lucia: "Santa Lucía",
  rawson: "Rawson",
  chimbas: "Chimbas",
  pocito: "Pocito",
  caucete: "Caucete",
  albardon: "Albardón",
  san_martin: "San Martín",
  nueve_de_julio: "9 de Julio",
  sarmiento: "Sarmiento",
  angaco: "Angaco",
};

type Vertical = "sale" | "rent" | "investment" | "temporary_rent" | "land";

/** Filtros duros booleanos que el mock reconoce (campo público → etiqueta). */
const ATTR_FILTERS: { field: string; match: RegExp; label: string; remove: RegExp }[] = [
  { field: "pool", match: /pileta|piscina/, label: "con pileta", remove: /pileta/ },
  { field: "parking", match: /cochera|garage/, label: "con cochera", remove: /cochera/ },
  { field: "bbq_area", match: /quincho/, label: "con quincho", remove: /quincho/ },
  { field: "furnished", match: /amoblad|amueblad/, label: "amoblado", remove: /amoblad|amueblad/ },
  { field: "patio", match: /patio/, label: "con patio", remove: /patio/ },
  { field: "mortgage_eligible", match: /apt[oa] cr[ée]dito/, label: "apto crédito", remove: /cr[ée]dito/ },
];

interface MockIntent {
  clarify: boolean;
  reset: boolean;
  vertical: Vertical;
  assumedSale: boolean;
  zones: string[];
  deadZone: string | null;
  tipo: "apartment" | "house" | "room" | "land" | null;
  order: NonNullable<StructuredParams["order"]>;
  budgetMax: number | null;
  budgetMin: number | null;
  currency: "USD" | "ARS";
  bedrooms: number | null;
  attrs: string[];
  landClass: "urban" | "rural" | null;
  near: string | null;
  /** Barrio fuera del catálogo (`place`): filtro duro por texto. */
  place: string | null;
  /** Nota de asunción del turno ("Quité pileta", "Asumí compra…"). */
  note: string | null;
}

function titleCase(s: string): string {
  return s.replace(/\p{L}+/gu, (w) => w[0].toUpperCase() + w.slice(1));
}

function parseBudget(q: string): { max: number | null; min: number | null; currency: "USD" | "ARS" } {
  const re = /(hasta|desde|menos de|m[áa]s de)\s+(?:us\$?\s*|u\$s\s*|\$\s*)?([\d.,]+)\s*(mil|millones|m)?\s*(d[óo]lares|usd|pesos)?/g;
  let max: number | null = null;
  let min: number | null = null;
  let currency: "USD" | "ARS" = "USD";
  for (const m of q.matchAll(re)) {
    let n = Number(m[2].replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n)) continue;
    if (m[3] === "mil") n *= 1000;
    else if (m[3] === "millones" || m[3] === "m") n *= 1_000_000;
    const usd = /d[óo]lares|usd/.test(m[4] ?? "") || /us\$|u\$s/.test(m[0]);
    const ars = /pesos/.test(m[4] ?? "") || (/\$\s*[\d]/.test(m[0]) && !usd) || n >= 5_000_000;
    currency = ars && !usd ? "ARS" : "USD";
    if (/hasta|menos de/.test(m[1])) max = Math.round(n);
    else min = Math.round(n);
  }
  return { max, min, currency };
}

export function interpretQuery(query: string, verticalOverride?: string): MockIntent {
  const q = query.toLowerCase();

  const reset = /empecemos de nuevo|olvidate|empezar de cero|borr[áa] todo/.test(q);

  // Regla de mercado 28/08: "para alquilar" es SIEMPRE un inquilino; el inversor
  // lo dice explícito ("comprar para alquilar", "para renta", "para después alquilar").
  const investor =
    /(compr|invert)\w*[^.]{0,30}(alquilar|renta)|para (despu[ée]s )?alquilar(la|lo)s? después|para renta|para revender|revaloriz/.test(
      q,
    );
  const temporary = /temporari|habitaci[óo]n|por d[íi]a|por semana/.test(q);
  const rent = /alquil/.test(q) && !investor;
  const buy = /compr|venta|vend|invert|revend|revaloriz|para renta/.test(q);
  const land = /terreno|lote/.test(q);

  let vertical: Vertical | null = null;
  if (land) vertical = "land";
  else if (temporary) vertical = "temporary_rent";
  else if (investor) vertical = "investment";
  else if (rent) vertical = "rent";
  else if (buy) vertical = "sale";

  const override = (verticalOverride ?? "").toLowerCase();
  if (override) {
    if (/alquilar|affittare/.test(override)) vertical = "rent";
    else if (/invertir|investire/.test(override)) vertical = "investment";
    else if (/comprar|comprare/.test(override)) vertical = "sale";
    else if (/lote|terreno/.test(override)) vertical = "land";
  }

  let tipo: MockIntent["tipo"] = null;
  if (/habitaci[óo]n|monoambiente/.test(q)) tipo = "room";
  else if (/depto|departamento|d[úu]plex|ph\b/.test(q)) tipo = "apartment";
  else if (/casa|chalet/.test(q)) tipo = "house";
  else if (vertical === "land") tipo = "land";
  if (vertical === "temporary_rent" && !tipo) tipo = "room";

  const deadZone = DEAD_ZONES.find((z) => q.includes(z)) ?? null;
  const zones = LIVE_ZONES.filter((z) => z.match.test(q)).map((z) => z.code);
  const placeHit = PLACES.find((pl) => q.includes(pl)) ?? null;
  const place = placeHit ? titleCase(placeHit) : null;

  const budgetProbe = parseBudget(q);
  // Como P2 real ("algo en Pocito" → compra asumida): con tipo, zona o
  // presupuesto hay señal suficiente; sin nada, aclaración.
  const assumedSale =
    vertical === null && (tipo !== null || zones.length > 0 || deadZone !== null || place !== null || budgetProbe.max != null);
  if (assumedSale) vertical = "sale";

  const nearMatch = q.match(/cerca de (?:la |el |los |las )?([^,.]+)/);
  const near = nearMatch ? titleCase(nearMatch[1].trim()) : null;

  let order: MockIntent["order"] = "opportunity_score";
  if (near) order = "distance_asc";
  if (/barat|de menor a mayor/.test(q)) order = "price_asc";
  else if (/de mayor a menor/.test(q)) order = "price_desc";
  else if (/ordenadas? por renta|para renta|\brenta\b/.test(q)) order = "gross_yield_desc";
  else if (/revaloriz|revender|ganga|por debajo del precio de su zona/.test(q)) order = "valuation_gap_desc";
  else if (/bajo precio de zona|percentil/.test(q)) order = "price_percentile_asc";
  else if (/mucho tiempo publicad|m[áa]s tiempo publicad|negociar/.test(q)) order = "days_on_market_desc";
  else if (/ordenar por score/.test(q)) order = "opportunity_score";

  const budget = budgetProbe;
  const bed = q.match(/(\d)\s*\+?\s*(dormitorio|dorm\b|habitaciones)/);
  const attrs = ATTR_FILTERS.filter((a) => a.match.test(q)).map((a) => a.field);
  const landClass: MockIntent["landClass"] = /rural/.test(q) ? "rural" : /urban/.test(q) ? "urban" : null;

  return {
    clarify: vertical === null,
    reset,
    vertical: vertical ?? "sale",
    assumedSale,
    zones,
    deadZone,
    tipo,
    order,
    budgetMax: budget.max,
    budgetMin: budget.min,
    currency: budget.currency,
    bedrooms: bed ? Number(bed[1]) : null,
    attrs,
    landClass,
    near,
    place,
    note: assumedSale ? "Asumí compra — decime si buscás alquilar" : null,
  };
}

/**
 * Refinamiento DENTRO de la sesión, como el `context_merge` de P2: la frase
 * corta ("Quitar pileta", "en Rawson", "hasta US$ 70.000", "de 2 dormitorios",
 * "departamento", frases de orden) modifica el criterio acumulado. Cualquier
 * otra consulta reemplaza el criterio (turno nuevo).
 */
function mergeRefinement(prev: MockIntent, query: string, verticalOverride?: string): MockIntent {
  const q = query.trim().toLowerCase();
  const next: MockIntent = { ...prev, zones: [...prev.zones], attrs: [...prev.attrs], note: null, assumedSale: false };

  if (verticalOverride) {
    const o = verticalOverride.toLowerCase();
    if (/alquilar/.test(o)) next.vertical = "rent";
    else if (/comprar/.test(o)) next.vertical = "sale";
    else if (/invertir/.test(o)) next.vertical = "investment";
    else if (/lote/.test(o)) {
      next.vertical = "land";
      next.tipo = "land";
    }
    if (next.vertical !== "land" && next.tipo === "land") next.tipo = null;
    return next;
  }

  const quitar = q.match(/^quitar (.+)$/);
  if (quitar) {
    const what = quitar[1];
    if (/tipo/.test(what)) next.tipo = null;
    else if (/zona/.test(what)) next.zones = [];
    else if (/lugar/.test(what)) next.place = null;
    else if (/presupuesto/.test(what)) {
      next.budgetMax = null;
      next.budgetMin = null;
    } else if (/dormitorio/.test(what)) next.bedrooms = null;
    else if (/clase de lote/.test(what)) next.landClass = null;
    else if (/cercan/.test(what)) {
      next.near = null;
      next.order = "opportunity_score";
    } else {
      const attr = ATTR_FILTERS.find((a) => a.remove.test(what));
      if (attr) next.attrs = next.attrs.filter((f) => f !== attr.field);
    }
    next.note = `Quité ${what}`;
    return next;
  }

  const zone = LIVE_ZONES.filter((z) => z.match.test(q)).map((z) => z.code);
  if (/^en /.test(q) && zone.length) {
    next.zones = zone;
    next.deadZone = null;
    return next;
  }
  if (/^en /.test(q) && DEAD_ZONES.some((z) => q.includes(z))) {
    next.zones = [];
    next.deadZone = DEAD_ZONES.find((z) => q.includes(z)) ?? null;
    return next;
  }
  if (/^(hasta|desde|menos de|m[áa]s de)\b/.test(q)) {
    const b = parseBudget(q);
    if (b.max != null) next.budgetMax = b.max;
    if (b.min != null) next.budgetMin = b.min;
    next.currency = b.currency;
    return next;
  }
  const bed = q.match(/^de (\d) dormitorios?$/);
  if (bed) {
    next.bedrooms = Number(bed[1]);
    return next;
  }
  if (/^(casa|departamento|depto|lote|terreno)$/.test(q)) {
    next.tipo = /casa/.test(q) ? "house" : /lote|terreno/.test(q) ? "land" : "apartment";
    if (next.tipo === "land") next.vertical = "land";
    else if (next.vertical === "land") next.vertical = "sale";
    return next;
  }
  if (/^lote (urbano|rural)$/.test(q)) {
    next.landClass = /rural/.test(q) ? "rural" : "urban";
    return next;
  }
  const fresh = interpretQuery(query);
  const orderPhrase = /barat|de mayor a menor|de menor a mayor|renta|por debajo del precio|negociar|tiempo publicad|ordenar por score|cerca de/.test(q);
  if (orderPhrase) {
    next.order = fresh.order;
    next.near = fresh.near ?? (fresh.order === "distance_asc" ? next.near : null);
    return next;
  }
  // Turno nuevo con señal propia: reemplaza el criterio (como P2 con una consulta completa).
  if (!fresh.clarify) return fresh;
  // Sin señal: P2 real pide aclaración terminal; el mock conserva el criterio.
  return { ...next, note: null };
}

/* ------------------------------------------------------------------ */
/* Generador determinístico de cards                                   */
/* ------------------------------------------------------------------ */

function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const ZONE_CYCLE = ["capital", "rivadavia", "santa_lucia", "rawson", "chimbas", "pocito"];
const STREETS = [
  "Av. Libertador Gral. San Martín",
  "Mendoza Sur",
  "Av. Córdoba",
  "Gral. Acha Norte",
  "Mitre Este",
  "San Luis Oeste",
  "Av. Rawson",
  "Sarmiento Sur",
];
const PASTELS = ["F7B8D4", "E4D3F2", "C9B4DE", "FFD7E8", "D9C2EC"];
const QUALITIES = [
  ["luminoso", "cerca del centro"],
  ["a estrenar"],
  ["patio amplio", "zona residencial"],
  ["ideal primera vivienda"],
  ["excelente ubicación"],
  [],
  // "None" a propósito: P1 tiene que filtrarlo (T3).
  ["None"],
];
const RATING_CYCLE: (RatingColor | null)[] = ["green", "yellow", "green", null, "red", "yellow"];

// Textos de P3/P2 en lenguaje de usuario, como se les pidió el 29/09
// (pedido a P2 §3.3.5, a P3 §4.5): sin "gap", "percentil", "cap" ni siglas.
const DEAL_REASONS: Record<DealRating, { code: string; text: string }[]> = {
  green: [{ code: "below_market", text: "Precio por debajo de avisos similares de su zona" }],
  yellow: [{ code: "market_price", text: "En precio de zona" }],
  red: [{ code: "above_market", text: "Publicada por encima de avisos similares de su zona" }],
  verify_data: [{ code: "verificar_datos", text: "Diferencia muy grande con avisos similares: conviene verificar el aviso" }],
  outdated: [{ code: "sin_actualizar", text: "Aviso sin actualizar hace más de 90 días" }],
};
// Alquiler más de 35 % por encima de similares (P2 30/09 §3.3.1): `red`, con
// `sobreprecio` primero y sin el porcentaje real (iría al lado de un −35 acotado).
const rentOverpricedReasons = (comparables: number) => [
  { code: "sobreprecio", text: "Muy por encima de alquileres similares" },
  { code: "comparables", text: `Comparado con ${comparables} avisos similares` },
];
const RESALE_REASONS: Record<RatingColor, { code: string; text: string }[]> = {
  green: [{ code: "high_valuation_gap", text: "Diferencia alta a favor frente a avisos similares de la zona" }],
  yellow: [{ code: "low_valuation_gap", text: "Sin descuento relevante frente a avisos similares" }],
  red: [{ code: "negative_gap", text: "Pagarías por encima del valor de referencia de la zona" }],
};
const RENTAL_REASONS: Record<RatingColor, { code: string; text: string }[]> = {
  green: [{ code: "high_yield", text: "Renta estimada por encima de la mediana de la zona" }],
  yellow: [{ code: "avg_yield", text: "Renta estimada en línea con la zona" }],
  red: [{ code: "low_yield", text: "Renta estimada por debajo de la mediana de la zona" }],
};

type IdKind = "s" | "r" | "t" | "i" | "x" | "l";

function photo(label: string, n: number, w = 640, h = 420): string {
  const bg = PASTELS[n % PASTELS.length];
  return `https://placehold.co/${w}x${h}/${bg}/4D1480?text=${encodeURIComponent(label)}`;
}

const TYPE_LABEL_SHORT: Record<string, string> = {
  apartment: "Depto",
  house: "Casa",
  land: "Lote",
  room: "Habitación",
};

/* ------------------------------------------------------------------ */
/* Casos fijos: los avisos del mockup aprobado (guía 29/09 §2.5)       */
/* ------------------------------------------------------------------ */

/** Semana de la celda zonal (la corrida con la que se armó el mockup). */
const ZONE_WEEK = "2026-09-21";

function zoneRef(cell: Partial<ZoneRef> & Pick<ZoneRef, "zone" | "bucket">): ZoneRef {
  return {
    property_type: null,
    median_price_per_sqm: null,
    median_price_per_hectare: null,
    median_price: null,
    sample: 30,
    fallback: null,
    trend: null,
    trend_pct: null,
    trend_weeks: null,
    cap_pct: null,
    week: ZONE_WEEK,
    ...cell,
  };
}

const NO_ATTRS: Partial<Card> = {
  pool: null,
  bbq_area: null,
  patio: null,
  furnished: null,
  parking: null,
  gated_community: null,
  mortgage_eligible: null,
  elevator: null,
  is_duplex: null,
  floor: null,
};

const NO_TREND: Partial<Card> = {
  price_trend: null,
  previous_price: null,
  previous_price_usd: null,
  price_change_pct: null,
  price_changed_at: null,
};

/** Alquilar: verde con baja · en línea con alza · diferencia a verificar, sin tendencia. */
const RENT_FIXTURES: Partial<Card>[] = [
  {
    ...NO_ATTRS,
    property_type: "apartment",
    zone: "capital",
    address: "9 de Julio 560",
    price: 320000,
    currency: "ARS",
    price_usd: 207,
    price_ars: null,
    rental_period: "month",
    rooms: 2,
    bedrooms: 1,
    bathrooms: 1,
    area_sqm: 40,
    covered_area_sqm: null,
    condition: "good",
    valuation_gap_pct: 33,
    valuation_gap_capped: false,
    deal_rating: "green",
    price_percentile: 3,
    // Conjunto por dormitorios, sin tope (P2 01/10): 80 en el conjunto, 42 a la vista en el detalle.
    comparables_count: 80,
    price_trend: "down",
    price_change_pct: -8.6,
    previous_price: 350000,
    previous_price_usd: 226,
    price_changed_at: "2026-09-14",
    days_since_update: 3,
    days_on_market: 730,
    age_flag: "very_old",
    // Sin chips duros: entra UN tag del LLM, no los dos (C12).
    semantic_qualities: ["luminoso", "cerca del centro"],
    estimated_monthly_rent: 310,
    estimated_monthly_rent_ars: 478000,
    zone_ref: zoneRef({ zone: "capital", property_type: "apartment", bucket: "1", median_price: 310, sample: 64, trend: "flat", trend_pct: 0.4, trend_weeks: 4 }),
  },
  {
    ...NO_ATTRS,
    property_type: "house",
    zone: "rivadavia",
    address: "CESAP",
    price: 900000,
    currency: "ARS",
    price_usd: 583,
    price_ars: null,
    rental_period: "month",
    rooms: 5,
    bedrooms: 3,
    bathrooms: 2,
    area_sqm: 280,
    covered_area_sqm: null,
    // "Excelente" no es un extremo declarado: no va como chip (C11).
    condition: "excellent",
    valuation_gap_pct: 9,
    valuation_gap_capped: false,
    deal_rating: "yellow",
    price_percentile: 26,
    comparables_count: 30,
    price_trend: "up",
    price_change_pct: 5.3,
    previous_price: 855000,
    previous_price_usd: 554,
    price_changed_at: "2026-09-07",
    days_since_update: 2,
    days_on_market: 39,
    age_flag: null,
    furnished: true,
    parking: true,
    patio: true,
    bbq_area: true,
    semantic_qualities: ["patio amplio"],
    estimated_monthly_rent: 640,
    estimated_monthly_rent_ars: 988000,
    zone_ref: zoneRef({ zone: "rivadavia", property_type: "house", bucket: "3", median_price: 640, sample: 41, trend: "up", trend_pct: 2.6, trend_weeks: 4 }),
  },
  {
    ...NO_ATTRS,
    ...NO_TREND,
    property_type: "house",
    zone: "rivadavia",
    address: "Natania XV, Rivadavia",
    price: 1000000,
    currency: "ARS",
    price_usd: 647,
    price_ars: null,
    rental_period: "month",
    rooms: 5,
    bedrooms: 4,
    bathrooms: 2,
    area_sqm: 250,
    covered_area_sqm: null,
    condition: "unknown",
    valuation_gap_pct: 35,
    valuation_gap_capped: true,
    deal_rating: "verify_data",
    price_percentile: 7,
    comparables_count: 13,
    days_since_update: 27,
    // 75 días: supera el corte de alquiler (60) y NO el de venta (90).
    days_on_market: 75,
    age_flag: null,
    patio: true,
    parking: true,
    // No es un chip de Alquilar: no se muestra en esta vertical.
    mortgage_eligible: true,
    semantic_qualities: [],
    estimated_monthly_rent: 995,
    estimated_monthly_rent_ars: null,
    zone_ref: null,
  },
];

/** Comprar e Invertir: los mismos tres avisos (Invertir = Comprar + rentabilidad). */
const SALE_FIXTURES: Partial<Card>[] = [
  {
    ...NO_ATTRS,
    property_type: "house",
    zone: "capital",
    address: "Salta pasando Chile",
    price: 150000,
    currency: "USD",
    price_usd: 150000,
    price_per_sqm: 600,
    rooms: 5,
    bedrooms: 3,
    bathrooms: 3,
    area_sqm: 502,
    covered_area_sqm: 250,
    condition: "good",
    valuation_gap_pct: 15.1,
    valuation_gap_capped: false,
    deal_rating: "green",
    price_percentile: 40,
    comparables_count: 30,
    price_trend: "down",
    price_change_pct: -11.8,
    previous_price: 170000,
    previous_price_usd: 170000,
    price_changed_at: "2026-09-14",
    days_since_update: 2,
    days_on_market: 1035,
    age_flag: "very_old",
    patio: true,
    bbq_area: true,
    gross_yield_pct: 7.2,
    estimated_monthly_rent: 906,
    rent_to_price_ratio: 0.6,
    semantic_qualities: ["luminoso"],
    zone_ref: zoneRef({ zone: "capital", property_type: "house", bucket: "3", median_price_per_sqm: 857, sample: 307, trend: "flat", trend_pct: -0.9, trend_weeks: 4, cap_pct: 7.77 }),
  },
  {
    ...NO_ATTRS,
    property_type: "apartment",
    zone: "rivadavia",
    address: "Fernández 9, Posta del Ángel",
    price: 75000,
    currency: "USD",
    price_usd: 75000,
    price_per_sqm: 1103,
    rooms: 3,
    bedrooms: 2,
    bathrooms: 1,
    area_sqm: 68,
    covered_area_sqm: null,
    condition: "new",
    valuation_gap_pct: 7.2,
    valuation_gap_capped: false,
    deal_rating: "yellow",
    price_percentile: 36,
    comparables_count: 30,
    price_trend: "up",
    price_change_pct: 8.7,
    previous_price: 69000,
    previous_price_usd: 69000,
    price_changed_at: "2026-09-07",
    days_since_update: 2,
    // 75 días: en venta el corte es 90, no hay "margen para negociar".
    days_on_market: 75,
    age_flag: null,
    mortgage_eligible: true,
    parking: true,
    bbq_area: true,
    gross_yield_pct: 6.5,
    estimated_monthly_rent: 405,
    rent_to_price_ratio: 0.54,
    semantic_qualities: ["a estrenar"],
    zone_ref: zoneRef({ zone: "rivadavia", property_type: "apartment", bucket: "2", median_price_per_sqm: 1193, sample: 118, trend: "up", trend_pct: 3.8, trend_weeks: 4, cap_pct: 6.4 }),
  },
  {
    ...NO_ATTRS,
    ...NO_TREND,
    property_type: "house",
    zone: "capital",
    address: "Mitre 1102, La Estancia",
    price: 100000,
    currency: "USD",
    price_usd: 100000,
    price_per_sqm: 833,
    rooms: 5,
    bedrooms: 4,
    bathrooms: 2,
    area_sqm: 220,
    covered_area_sqm: 120,
    condition: "excellent",
    valuation_gap_pct: -35,
    valuation_gap_capped: true,
    deal_rating: "verify_data",
    price_percentile: 93,
    comparables_count: 30,
    days_since_update: 12,
    days_on_market: 365,
    age_flag: "old",
    parking: true,
    gross_yield_pct: 13.6,
    estimated_monthly_rent: 1133,
    rent_to_price_ratio: 1.13,
    semantic_qualities: [],
    // Celda sin muestra propia: nivel superior, sin tendencia ni rentabilidad promedio.
    zone_ref: zoneRef({ zone: "capital", property_type: "house", bucket: "4plus", median_price_per_sqm: 809, sample: 8, fallback: "macro_zona" }),
  },
];

/** Lotes: urbano verde con baja · urbano en línea con zona en suba · rural a verificar. */
const LAND_FIXTURES: Partial<Card>[] = [
  {
    ...NO_ATTRS,
    property_type: "land",
    zone: "capital",
    address: "Mariano Moreno",
    price: 44000,
    currency: "USD",
    price_usd: 44000,
    area_sqm: 458,
    frontage_m: 10.6,
    depth_m: 46,
    land_class: "urban",
    land_services: true,
    land_services_detail: [],
    in_subdivision: null,
    subdivision_name: null,
    buildable: null,
    land_zoning: null,
    price_per_sqm_land: 96.07,
    price_per_hectare: null,
    valuation_gap_pct: 32,
    valuation_gap_capped: false,
    deal_rating: "green",
    price_percentile: 13,
    comparables_count: 30,
    price_trend: "down",
    price_change_pct: -8.3,
    previous_price: 48000,
    previous_price_usd: 48000,
    price_changed_at: "2026-09-14",
    days_since_update: 3,
    days_on_market: 150,
    age_flag: null,
    semantic_qualities: [],
    zone_ref: zoneRef({ zone: "capital", bucket: "lote_urbano", median_price_per_sqm: 141, sample: 212, trend: "flat", trend_pct: 0.6, trend_weeks: 2 }),
  },
  {
    ...NO_ATTRS,
    ...NO_TREND,
    property_type: "land",
    zone: "santa_lucia",
    address: "Calle 32 s/n, Barrio Privado San Rafael",
    price: 14000,
    currency: "USD",
    price_usd: 14000,
    area_sqm: 600,
    frontage_m: 16,
    depth_m: 38,
    land_class: "urban",
    land_services: true,
    land_services_detail: ["agua", "luz"],
    in_subdivision: true,
    subdivision_name: "San Rafael",
    buildable: true,
    land_zoning: "mixed",
    price_per_sqm_land: 23.33,
    price_per_hectare: null,
    valuation_gap_pct: 8,
    valuation_gap_capped: false,
    deal_rating: "yellow",
    price_percentile: 38,
    comparables_count: 30,
    days_since_update: 4,
    days_on_market: 20,
    age_flag: null,
    semantic_qualities: [],
    zone_ref: zoneRef({ zone: "santa_lucia", bucket: "lote_urbano", median_price_per_sqm: 35, sample: 96, trend: "up", trend_pct: 2.4, trend_weeks: 2 }),
  },
  {
    ...NO_ATTRS,
    property_type: "land",
    zone: "pocito",
    address: "Calle 14",
    price: 35000,
    currency: "USD",
    price_usd: 35000,
    area_sqm: 59000,
    frontage_m: 95,
    depth_m: 620,
    land_class: "rural",
    land_services: true,
    land_services_detail: ["luz"],
    in_subdivision: null,
    subdivision_name: null,
    buildable: null,
    land_zoning: "industrial",
    price_per_sqm_land: 0.59,
    price_per_hectare: 5932,
    valuation_gap_pct: 35,
    valuation_gap_capped: true,
    deal_rating: "verify_data",
    price_percentile: 20,
    comparables_count: 30,
    price_trend: "up",
    price_change_pct: 6.1,
    previous_price: 33000,
    previous_price_usd: 33000,
    price_changed_at: "2026-09-14",
    days_since_update: 3,
    days_on_market: 240,
    age_flag: "old",
    semantic_qualities: [],
    zone_ref: zoneRef({ zone: "pocito", bucket: "lote_rural_srv", median_price_per_hectare: 30000, sample: 31, fallback: "provincia", trend: "flat", trend_pct: 0.2, trend_weeks: 2 }),
  },
];

const FIXTURES: Partial<Record<IdKind, Partial<Card>[]>> = {
  r: RENT_FIXTURES,
  s: SALE_FIXTURES,
  i: SALE_FIXTURES,
  l: LAND_FIXTURES,
};

/** Celda zonal generada para las cards que no son casos fijos. */
function mockZoneRef(
  n: number,
  card: Pick<Card, "zone" | "property_type" | "operation" | "bedrooms" | "land_class" | "land_services">,
): ZoneRef | null {
  const r = (k: number) => rand(n * 7 + k);
  // Zona fuera del catálogo o sin muestra ni nivel superior: sin celda.
  if (!card.zone || n % 7 === 4) return null;
  const isLand = card.property_type === "land";
  // Vivienda sin dormitorios: P2 no sirve celda (no existe el bucket "todos").
  if (!isLand && card.bedrooms == null) return null;
  const bucket = isLand
    ? card.land_class === "rural"
      ? card.land_services === true
        ? "lote_rural_srv"
        : "lote_rural"
      : "lote_urbano"
    : card.bedrooms! >= 4
      ? "4plus"
      : String(card.bedrooms);
  const rural = isLand && card.land_class === "rural";
  const isRent = card.operation === "rent";
  const trend = (["flat", "up", "down", "up", null] as const)[n % 5];
  const trendPct =
    trend === "up"
      ? 2.1 + r(21) * 3
      : trend === "down"
        ? -(2.1 + r(21) * 5)
        : trend === "flat"
          ? (r(21) - 0.5) * 3
          : null;
  return zoneRef({
    zone: card.zone,
    property_type: card.property_type === "house" || card.property_type === "apartment" ? card.property_type : null,
    bucket,
    median_price_per_sqm: isRent || rural ? null : Math.round(isLand ? 30 + r(19) * 120 : 700 + r(19) * 600),
    median_price_per_hectare: rural ? Math.round((15000 + r(19) * 30000) / 250) * 250 : null,
    median_price: isRent ? Math.round(250 + r(19) * 450) : null,
    sample: 10 + Math.round(r(20) * 300),
    fallback: n % 10 === 8 ? "provincia" : n % 5 === 3 ? "macro_zona" : null,
    trend,
    trend_pct: trendPct == null ? null : Math.round(trendPct * 10) / 10,
    trend_weeks: trend ? 4 : null,
    cap_pct: !isRent && !isLand && n % 3 !== 2 ? Math.round((6 + r(22) * 2.5) * 100) / 100 : null,
  });
}

/**
 * Celda zonal del lote en el contrato del 13/09 (`zone_stats_ref`): P2 real la
 * manda en TODO lote visible, exista o no el `zone_ref` nuevo.
 */
function landCell(
  n: number,
  card: Pick<Card, "land_class" | "land_services">,
  ref: ZoneRef | null,
): NonNullable<Card["zone_stats_ref"]> {
  const rural = card.land_class === "rural";
  return {
    bucket: ref?.bucket ?? (rural ? (card.land_services === true ? "lote_rural_srv" : "lote_rural") : "lote_urbano"),
    median_price_per_sqm: ref ? ref.median_price_per_sqm : rural ? null : Math.round(30 + rand(n * 7 + 19) * 120),
    median_price_per_hectare: ref ? ref.median_price_per_hectare : rural ? Math.round((15000 + rand(n * 7 + 19) * 30000) / 250) * 250 : null,
    sample: ref?.sample ?? 10 + Math.round(rand(n * 7 + 20) * 300),
    fallback: ref?.fallback ?? null,
    fallback_ref: null,
  };
}

export function mockCard(
  n: number,
  kind: IdKind,
  opts: { zones?: string[]; tipo?: string | null; near?: string | null },
): Card {
  const r = (k: number) => rand(n * 7 + k);
  // Caso fijo del mockup (las tres primeras de cada vertical); la zona y el
  // tipo pedidos en la búsqueda mandan sobre los del caso.
  const fx = FIXTURES[kind]?.[n];
  const zone = opts.zones?.length ? opts.zones[n % opts.zones.length] : (fx?.zone ?? ZONE_CYCLE[n % ZONE_CYCLE.length]);
  const zoneLabel = ZONE_NAME[zone] ?? titleCase(zone.replace(/_/g, " "));
  const isRent = kind === "r";
  const isTemp = kind === "t";
  const isLand = kind === "l" || opts.tipo === "land";
  const tipo = (isLand ? "land" : (opts.tipo ?? fx?.property_type ?? (n % 3 === 0 ? "house" : "apartment"))) as Card["property_type"];
  const type = isTemp ? "room" : tipo;
  const label = `${TYPE_LABEL_SHORT[type] ?? "Propiedad"} ${zoneLabel}`;

  const areaBase = type === "house" ? 120 : type === "land" ? 400 : 55;
  const area = Math.round(areaBase + r(1) * areaBase * 0.8);

  let price: number;
  let currency: Card["currency"];
  let price_usd: number | null;
  let price_ars: number | null = null;
  let rental_period: Card["rental_period"] = null;

  if (isTemp) {
    rental_period = n % 3 === 0 ? "week" : "day";
    currency = "ARS";
    price = Math.round((rental_period === "day" ? 25000 + r(2) * 30000 : 140000 + r(2) * 120000) / 500) * 500;
    price_usd = Math.round(price / 1350);
  } else if (isRent) {
    rental_period = n % 5 === 4 ? null : "month";
    if (n % 4 === 2) {
      currency = "USD";
      price = Math.round(250 + r(2) * 400);
      price_usd = price;
      price_ars = price * 1350;
    } else {
      currency = "ARS";
      price = Math.round((320000 + r(2) * 580000) / 5000) * 5000;
      price_usd = Math.round(price / 1350);
    }
  } else if (isLand) {
    currency = "USD";
    price = Math.round((9000 + r(2) * 40000) / 500) * 500;
    price_usd = price;
  } else {
    if (n % 3 === 1) {
      currency = "ARS";
      const usd = Math.round(38000 + r(2) * 90000);
      price = usd * 1250;
      price_usd = usd;
    } else {
      currency = "USD";
      price = Math.round((38000 + r(2) * 90000) / 500) * 500;
      price_usd = price;
    }
  }

  const isSale = !isRent && !isTemp;
  const isHomeSale = isSale && !isLand;

  // Gap con el signo del contrato real: > 0 = por DEBAJO de sus similares.
  // Sin comparables suficientes no hay gap (ni percentil, ni semáforo).
  // En un caso fijo mandan sus valores, así la señal y los componentes del
  // score que se arman más abajo cuentan lo mismo que la card.
  const hasGap = fx ? fx.valuation_gap_pct != null : !isTemp && n % 10 !== 9;
  const capped = fx ? fx.valuation_gap_capped === true : hasGap && n % 13 === 6;
  // Acotado (±35): el alquiler generado va por ENCIMA — en P2 real (30/09
  // §3.3.1) es un aviso caro, `red` con `sobreprecio`, no un dato dudoso —;
  // venta y lotes alternan el lado y son `verify_data`.
  const gap = fx?.valuation_gap_pct ?? (capped ? (isRent ? -35 : n % 2 === 0 ? 35 : -35) : Math.round((r(3) * 32 - 13) * 10) / 10);
  // El semáforo lo decide P3 con SUS umbrales; el mock los imita (+10 %) para
  // que el color y el número sean coherentes. P1 solo mira `deal_rating`.
  let deal: DealRating | null = null;
  if (capped) deal = isRent && gap < 0 ? "red" : "verify_data";
  else if (hasGap && n % 12 !== 10) deal = gap >= 10 ? "green" : gap <= -10 ? "red" : "yellow";
  const percentile = Math.max(0, Math.min(100, Math.round(50 - gap * 1.4 + (r(11) - 0.5) * 16)));
  const resale = isHomeSale ? RATING_CYCLE[(n + 2) % RATING_CYCLE.length] : null;
  const rentalR = isHomeSale ? RATING_CYCLE[(n + 4) % RATING_CYCLE.length] : null;

  // Rentabilidad: sin pool de alquileres suficiente, P3 no estima (null los tres).
  const hasYield = isHomeSale && (fx ? fx.gross_yield_pct != null : n % 6 !== 5);
  const yieldPct = fx?.gross_yield_pct ?? Math.round((6 + r(4) * 4.5) * 10) / 10;
  const score = Math.round(35 + r(5) * 58);
  // Antigüedad (contrato 13/09): algunos avisos viejos y muy viejos.
  const days =
    fx?.days_on_market ??
    (n % 9 === 7 ? 200 + Math.round(r(10) * 100) : n % 9 === 8 ? 400 + Math.round(r(10) * 900) : 5 + Math.round(r(10) * 90));
  const age_flag: Card["age_flag"] = days > 365 ? "very_old" : days > 180 ? "old" : null;
  const updated = Math.min(days, n % 6 === 0 ? 0 : 1 + Math.round(r(15) * 40));

  const gapText = String(Math.abs(gap)).replace(".", ",");
  const primary_signal = isTemp
    ? { text: "Disponible por día — consultá estadía mínima", type: "availability", color: "yellow" as const }
    : hasGap && gap > 4
      ? { text: `${gapText}% por debajo de avisos similares de la zona`, type: "valuation_gap", color: "green" as const }
      : hasYield
        ? { text: `Rentabilidad estimada ${String(yieldPct).replace(".", ",")}% anual`, type: "gross_yield", color: (yieldPct > 8 ? "green" : "yellow") as RatingColor }
        : { text: hasGap && gap < -8 ? "Por encima del precio típico de su zona" : "En precio de zona", type: "price_position", color: (hasGap && gap < -8 ? "red" : "yellow") as RatingColor };

  const bedrooms = isLand ? null : Math.max(1, Math.round(1 + r(6) * 3));
  // `quality_tier` es 0 · 1 · 2 (medido 28/09): el tier 3 no existe, y el
  // tier 1 es justamente el aviso SIN coordenadas (no entra al mapa).
  const tier = n % 8 === 5 ? 1 : 2;
  const landClass: Card["land_class"] = isLand ? (n % 4 === 3 ? "rural" : "urban") : null;
  // Conjunto de similares (P2 30/09-01/10): hasta 30 con banda de superficie;
  // el alquiler por dormitorios no tiene tope (hay casos de 80 y más).
  const comparables =
    fx?.comparables_count ??
    (hasGap ? (isRent && n % 5 === 3 ? 40 + Math.round(r(12) * 60) : 8 + Math.round(r(12) * 22)) : Math.round(r(12) * 4));
  const simUnit = isRent ? "alquileres similares" : isLand ? `lotes ${landClass === "rural" ? "rurales" : "urbanos"} similares` : "avisos similares";

  // Tendencia del aviso (P3, en dólares): una de cada cuatro bajó, otra subió.
  const trendDir: Card["price_trend"] = isTemp ? null : n % 4 === 0 ? "down" : n % 4 === 1 ? "up" : null;
  const changePct =
    trendDir === "down"
      ? -Math.round((4 + r(18) * 14) * 10) / 10
      : trendDir === "up"
        ? Math.round((3 + r(18) * 9) * 10) / 10
        : null;
  const step = currency === "ARS" ? 5000 : price >= 10000 ? 500 : 5;
  const previous = changePct != null ? Math.round(price / (1 + changePct / 100) / step) * step : null;
  // Renta estimada de un ALQUILER (mediana de similares, USD) y su conversión de P2.
  const rentRef = isRent && hasGap && price_usd != null ? Math.round(price_usd / (1 - gap / 100)) : null;

  const card: Card = {
    id: `sj-mk${kind}${n}`,
    operation: isRent || isTemp ? "rent" : "sale",
    property_type: type,
    price,
    currency,
    price_usd,
    price_ars: isRent && currency === "USD" ? price_ars : null,
    price_per_sqm: isHomeSale ? Math.round((price_usd ?? 0) / area) : null,
    rental_period,
    zone,
    // "None" a propósito en algunas (T3: nunca visible).
    address: n % 11 === 3 ? "None" : `${STREETS[n % STREETS.length]} al ${100 + (n % 40) * 50}`,
    latitude: tier < 2 ? null : -31.5351 + (r(7) - 0.5) * 0.12,
    longitude: tier < 2 ? null : -68.5386 + (r(8) - 0.5) * 0.12,
    bedrooms: isTemp ? null : n % 7 === 6 ? null : bedrooms,
    bathrooms: isLand ? null : n % 5 === 3 ? null : Math.max(1, Math.round(r(9) * 2)),
    rooms: isLand || isTemp ? null : bedrooms === null ? null : bedrooms + 1,
    // null = no informada (P2 la pasó de 0 a null el 30/09): una de cada 17 viviendas.
    area_sqm: isTemp ? (n % 2 === 0 ? 14 + (n % 8) : null) : !isLand && n % 17 === 4 ? null : area,
    covered_area_sqm: isLand || isTemp ? null : Math.round(area * 0.7),
    floor: type === "apartment" && n % 4 === 1 ? (n % 6) + 1 : null,
    condition: (["good", "excellent", "unknown", "new", "needs_renovation", "under_construction"] as const)[n % 6],
    opportunity_score: score,
    score_components: [
      ...(hasGap
        ? [
            {
              key: isLand ? "gap_zonal" : "gap_valuacion",
              label: isLand ? "Precio del m² frente a la zona" : "Precio frente a similares",
              value: Math.round(Math.max(0, gap) * 2.4),
              weight: 0.4,
              raw_value: gap,
              raw_unit: "%",
              // Textos vigentes de P2 (30/09 §3.3.5): "más bajo/alto que N avisos similares en Zona"; acotado, "más de 35 %".
              description: isLand
                ? `m² ${gapText} % más ${gap > 0 ? "bajo" : "alto"} que el valor típico de ${simUnit.replace(" similares", "")} en ${zoneLabel}`
                : capped
                  ? `Precio más de 35 % más ${gap > 0 ? "bajo" : "alto"} que ${comparables} ${simUnit} en ${zoneLabel}: conviene verificar el aviso`
                  : `Precio ${gapText} % más ${gap > 0 ? "bajo" : "alto"} que ${comparables} ${simUnit} en ${zoneLabel}`,
            },
            {
              key: "price_position",
              label: "Posición de precio",
              value: Math.round((100 - percentile) * 0.3),
              weight: 0.2,
              raw_value: percentile,
              raw_unit: null,
              description:
                percentile < 50
                  ? `Más barato que el ${100 - percentile} % de ${comparables} ${simUnit} en ${zoneLabel}`
                  : percentile === 50
                    ? `Precio en el medio de ${comparables} ${simUnit} en ${zoneLabel}`
                    : `Más caro que el ${percentile} % de ${comparables} ${simUnit} en ${zoneLabel}`,
            },
          ]
        : []),
      // Pedido a P2 §3.3.2: el score de compra ya no pesa la rentabilidad; queda en inversión.
      ...(hasYield && kind === "i"
        ? [
            {
              key: "gross_yield",
              label: "Rentabilidad estimada",
              value: Math.round(yieldPct * 3.5),
              weight: 0.3,
              raw_value: yieldPct,
              raw_unit: "%",
              description: `Rentabilidad anual estimada de ${String(yieldPct).replace(".", ",")}%`,
            },
          ]
        : []),
      {
        key: "time_on_market",
        label: "Tiempo publicado",
        value: Math.round(r(10) * 20),
        weight: 0.15,
        raw_value: days,
        raw_unit: "días",
        description: `Publicado hace ${days} días — margen de negociación`,
      },
      // Tope de "dato dudoso": solo con `verify_data` (el alquiler caro no lo lleva; P2 30/09).
      ...(deal === "verify_data"
        ? [
            {
              key: "tope_gap_fuera_de_rango",
              label: "Diferencia muy grande con similares",
              value: 0,
              weight: 0,
              raw_value: null,
              raw_unit: null,
              description: "Diferencia muy grande con avisos similares: conviene verificar el aviso. Score máximo 55",
            },
          ]
        : []),
    ],
    primary_signal,
    deal_rating: deal,
    // Clave real de P2 (verificada contra Swagger 29/08).
    deal_rating_reasons: deal ? (deal === "red" && capped ? rentOverpricedReasons(comparables) : DEAL_REASONS[deal]) : null,
    resale_investment_rating: resale,
    resale_investment_reasons: resale ? RESALE_REASONS[resale] : null,
    rental_investment_rating: rentalR,
    rental_investment_reasons: rentalR ? RENTAL_REASONS[rentalR] : null,
    market_context:
      n % 6 === 0
        ? `${zoneLabel} concentra una de las mayores ofertas de ${type === "house" ? "casas" : type === "land" ? "lotes" : "departamentos"} de la provincia`
        : n % 6 === 3
          ? "null"
          : null,
    gross_yield_pct: hasYield ? yieldPct : null,
    valuation_gap_pct: hasGap ? gap : null,
    valuation_gap_capped: capped,
    has_covered_area: isLand ? null : true,
    price_percentile: hasGap ? percentile : null,
    estimated_monthly_rent: hasYield ? Math.round((price_usd ?? 0) * (yieldPct / 100 / 12)) : rentRef,
    estimated_monthly_rent_ars: rentRef != null ? Math.round((rentRef * 1350) / 1000) * 1000 : null,
    rent_to_price_ratio: hasYield ? Math.round((yieldPct / 12) * 100) / 100 : null,
    comparables_count: comparables,
    zone_supply: 60 + Math.round(r(13) * 160),
    days_on_market: days,
    days_since_update: updated,
    listing_status: "active",
    age_flag,
    atypical_flags: [],
    distance_km: opts.near ? Math.round((0.15 + r(16) * 6) * 100) / 100 : null,
    location_confidence: tier < 2 ? "low" : n % 5 === 0 ? "medium" : "high",
    listing_published_at: "2026-07-10",
    listing_updated_at: "2026-08-21",
    quality_tier: tier,
    quality_score: Math.round((0.55 + r(14) * 0.4) * 100) / 100,
    price_trend: trendDir,
    previous_price: previous,
    previous_price_usd:
      changePct != null && price_usd != null ? Math.round(price_usd / (1 + changePct / 100)) : null,
    price_change_pct: changePct,
    price_changed_at: trendDir ? "2026-09-14" : null,
    // Marca ortogonal al tipo (delta 01/09): hay dúplex-depto y dúplex-casa.
    is_duplex: (type === "apartment" || type === "house") && n % 7 === 5 ? true : null,
    pool: isHomeSale && n % 5 === 0 ? true : null,
    bbq_area: !isLand && n % 4 === 0 ? true : null,
    patio: type === "house" ? true : null,
    furnished: isRent && n % 3 === 0 ? true : isTemp ? true : null,
    parking: !isLand && n % 3 !== 1 ? true : null,
    gated_community: n % 9 === 4 ? true : null,
    mortgage_eligible: isHomeSale && n % 4 === 2 ? true : null,
    elevator: type === "apartment" && n % 2 === 0 ? true : null,
    photo_url: photo(label, n),
    photos: [photo(`${label} — living`, n, 1120, 640), photo(`${label} — frente`, n + 1, 1120, 640), photo(`${label} — cocina`, n + 2, 1120, 640)],
    sources: [
      {
        name: n % 2 === 0 ? "Portal Ejemplo" : "InmoAvisos",
        id: `ext-${1000 + n}`,
        url: `https://ejemplo.com/aviso/${1000 + n}`,
      },
    ],
    listing_url: `https://ejemplo.com/aviso/${1000 + n}`,
    publisher: n % 3 === 0 ? "owner" : "agency",
    contact: {
      phone: n % 4 === 3 ? null : `+54 264 555-0${String(100 + n).slice(-3)}`,
      // Un tercio sin WhatsApp propio: el botón cae al número de FINDER (T4).
      whatsapp: n % 3 === 2 ? null : `+54 264 555-0${String(100 + n).slice(-3)}`,
      web: null,
    },
    semantic_qualities: QUALITIES[n % QUALITIES.length],
    nearby_points: n % 5 === 0 ? ["Plaza 25 de Mayo"] : n % 5 === 2 ? ["UNSJ — Campus"] : [],
    beds: isTemp ? 1 + (n % 3) : null,
    double_bed: isTemp ? n % 2 === 0 : null,
    private_bathroom: isTemp ? n % 3 !== 1 : null,
    room_class: isTemp ? (["single", "single_double_bed", "double", "triple_plus"] as const)[n % 4] : null,
    relevance_score: kind === "x" ? Math.round((0.93 - (n % 10) * 0.03) * 100) / 100 : null,
    /* ---- lote ---- */
    land_class: landClass,
    land_class_confidence: isLand ? "high" : null,
    land_services: isLand ? (n % 3 === 0 ? true : n % 3 === 1 ? false : null) : null,
    land_services_detail: isLand && n % 3 === 0 ? ["agua", "luz"] : [],
    in_subdivision: isLand && n % 2 === 0 ? true : null,
    subdivision_name: isLand && n % 2 === 0 ? (n % 4 === 0 ? "Vistas del Este" : "None") : null,
    price_per_sqm_land: isLand ? Math.round(((price_usd ?? 0) / area) * 100) / 100 : null,
    price_per_hectare: isLand && landClass === "rural" ? Math.round(((price_usd ?? 0) / area) * 10000) : null,
    land_zoning: isLand && n % 5 === 0 ? "residential" : null,
    frontage_m: isLand && n % 2 === 1 ? 10 : null,
    depth_m: isLand && n % 2 === 1 ? Math.round(area / 10) : null,
    buildable: isLand && n % 4 === 2 ? true : null,
  };

  if (!fx) {
    const ref = isTemp ? null : mockZoneRef(n, card);
    return { ...card, zone_ref: ref, zone_stats_ref: isLand ? landCell(n, card, ref) : null };
  }

  // Caso fijo: pisa lo generado, salvo la zona y el tipo que pidió la búsqueda.
  const fixed: Card = { ...card, ...fx, zone, property_type: type };
  if (fx.zone_ref) {
    fixed.zone_ref = {
      ...fx.zone_ref,
      zone,
      property_type: type === "house" || type === "apartment" ? type : null,
    };
  }
  fixed.deal_rating_reasons = fixed.deal_rating ? DEAL_REASONS[fixed.deal_rating] : null;
  fixed.zone_stats_ref = isLand ? landCell(n, fixed, fixed.zone_ref ?? null) : null;
  return fixed;
}

/* ------------------------------------------------------------------ */
/* Totales por criterio (consistentes entre /text y /structured)       */
/* ------------------------------------------------------------------ */

function totalFor(vertical: Vertical, zones: string[], deadZone: string | null, intent?: MockIntent): number {
  if (deadZone) return 0;
  if (vertical === "temporary_rent") return 8;
  // Criterio muy restrictivo → menos de 3 resultados (aclaración no terminal).
  if (intent && intent.bedrooms != null && intent.bedrooms >= 5) return 2;
  if (intent?.place) return intent.attrs.length ? 0 : 2;
  if (zones.some((z) => z === "pocito")) return 23;
  if (vertical === "land") return 52;
  if (vertical === "rent") return 34;
  if (vertical === "investment") return 41;
  let n = 87;
  if (intent?.budgetMax != null) n = Math.max(12, Math.round(n * 0.6));
  if (intent?.attrs.length) n = Math.max(6, Math.round(n / (1 + intent.attrs.length)));
  return n;
}

function kindFor(vertical: Vertical): IdKind {
  return vertical === "rent" ? "r" : vertical === "temporary_rent" ? "t" : vertical === "investment" ? "i" : vertical === "land" ? "l" : "s";
}

function pageCards(params: StructuredParams, intent?: MockIntent): { cards: Card[]; total_matches: number } {
  const vertical = (params.vertical ?? "sale") as Vertical;
  const zones = (params.zones ?? []).map((z) => z.toLowerCase().replace(/\s+/g, "_"));
  const deadZone = null; // structured llega con zonas ya válidas del extractor
  const total_matches = totalFor(vertical, zones, deadZone, intent);
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 20;
  const kind = kindFor(vertical);
  const tipo = (params.property_type as string) ?? (vertical === "land" ? "land" : null);
  const near = intent?.order === "distance_asc" ? intent.near : null;

  const cards: Card[] = [];
  for (let i = offset; i < Math.min(offset + limit, total_matches); i++) {
    cards.push(mockCard(i, kind, { zones, tipo, near }));
  }
  return { cards, total_matches };
}

function toParams(intent: MockIntent, limit: number): StructuredParams {
  return {
    vertical: intent.vertical,
    ...(intent.zones.length ? { zones: intent.zones } : {}),
    ...(intent.tipo ? { property_type: intent.tipo as StructuredParams["property_type"] } : {}),
    ...(intent.budgetMax != null ? { budget_max: intent.budgetMax, currency: intent.currency } : {}),
    ...(intent.landClass ? { land_class: intent.landClass } : {}),
    order: intent.order,
    limit,
    offset: 0,
  };
}

const ZERO_SUGGESTIONS = ["Ampliar la zona", "Ajustar el presupuesto", "Probar en Capital o Rawson"];

/** ¿Esta página agota el criterio? Solo entonces viaja `related` (spec §2). */
function isLastPage(offset: number, pageLen: number, total_matches: number): boolean {
  return offset + pageLen >= total_matches;
}

/** Relacionadas por embeddings (máx 10): SOLO en la última página del criterio. */
function buildRelated(intent: MockIntent): Related {
  const cards: Card[] = [];
  for (let i = 0; i < 3; i++) {
    cards.push(mockCard(60 + i, "x", { zones: [], tipo: intent.tipo }));
  }
  return { reason: "structured_exhausted", count: cards.length, cards };
}

/* ------------------------------------------------------------------ */
/* Endpoints mock                                                      */
/* ------------------------------------------------------------------ */

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export async function mockSearchText(query: string, limit = 10, offset = 0): Promise<SearchTextResponse> {
  await sleep(250);
  const intent = interpretQuery(query);

  if (intent.clarify) {
    return {
      covered: false,
      clarification_needed: true,
      extraction: null,
      result: null,
      related: null,
      message: (baseClarification as { message: string }).message,
      chips: (baseClarification as { chips: string[] }).chips,
    };
  }

  const params = { ...toParams(intent, limit), offset };
  if (intent.deadZone) {
    return {
      covered: true,
      clarification_needed: false,
      extraction: { params, meta: { extractor: "fast" } },
      result: {
        total: 0,
        total_matches: 0,
        market: "san_juan",
        params_applied: { vertical: intent.vertical, zones: [titleCase(intent.deadZone)] },
        cards: [],
        suggestions: ZERO_SUGGESTIONS,
      },
      // Cero también es "última página": las relacionadas son el "Podrían interesarte".
      related: buildRelated(intent),
    };
  }

  const { cards, total_matches } = pageCards(params, intent);
  return {
    covered: true,
    clarification_needed: false,
    extraction: { params, meta: { extractor: "fast" } },
    result: {
      total: cards.length,
      total_matches,
      market: "san_juan",
      params_applied: {
        vertical: intent.vertical,
        ...(intent.zones.length ? { zones: intent.zones } : {}),
        ...(intent.tipo ? { property_type: intent.tipo } : {}),
        order: intent.order,
      },
      cards,
      suggestions: total_matches === 0 ? ZERO_SUGGESTIONS : null,
    },
    related: isLastPage(offset, cards.length, total_matches) ? buildRelated(intent) : null,
  };
}

export async function mockSearchStructured(params: StructuredParams): Promise<StructuredResponse> {
  await sleep(60);
  const { cards, total_matches } = pageCards(params);
  return {
    total: cards.length,
    total_matches,
    market: "san_juan",
    params_applied: params as Record<string, unknown>,
    cards,
  };
}

/**
 * Mock de POST /search/map: mismo criterio que el listado pero devolviendo el
 * "universo" mapeable (tier >= 2 con coordenadas), sin tope ni paginación.
 * Con `session_id` (forma b) resuelve el criterio acumulado de la sesión.
 */
export async function mockSearchMap(body: MapSearchRequest): Promise<MapSearchResponse> {
  await sleep(80);
  const intent = body.session_id ? SESSION_INTENT.get(body.session_id) : undefined;
  const vertical = (intent?.vertical ?? body.vertical ?? "sale") as Vertical;
  const zones = intent?.zones ?? body.zones ?? [];
  const total_matches = totalFor(vertical, zones, intent?.deadZone ?? null, intent);
  const kind = kindFor(vertical);
  const tipo = intent?.tipo ?? body.property_type ?? (vertical === "land" ? "land" : null);

  const pins: MapPin[] = [];
  // El universo mapeable es mayor que la página: simulamos hasta 3× el listado.
  for (let i = 0; i < total_matches * 3; i++) {
    const card = mockCard(i, kind, { zones, tipo });
    if ((card.quality_tier ?? 0) < 2 || card.latitude == null || card.longitude == null) continue;
    pins.push({
      id: card.id,
      latitude: card.latitude,
      longitude: card.longitude,
      price: card.price,
      currency: card.currency,
      price_usd: card.price_usd,
      rental_period: card.rental_period,
      property_type: card.property_type,
      operation: card.operation,
    });
  }

  return {
    total_matches,
    total_pins: pins.length,
    market: "san_juan",
    params_applied: { ...body },
    pins,
  };
}

export async function mockCreateSession(): Promise<SessionResponse> {
  const now = new Date();
  const expires = new Date(now.getTime() + 24 * 3600 * 1000);
  // UUID real: los eventos que P1 reenvía a P2 exigen ese formato.
  return {
    session_id: crypto.randomUUID(),
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
  };
}

/* --------------------------- SSE mock ------------------------------ */

const VERTICAL_LABEL: Record<Vertical, string> = {
  sale: "Compra",
  rent: "Alquiler",
  investment: "Compra",
  temporary_rent: "Alquiler temporario",
  land: "Lotes en venta",
};
const ORDER_LABEL: Record<string, string> = {
  opportunity_score: "Opportunity Score",
  price_asc: "Precio (menor a mayor)",
  price_desc: "Precio (mayor a menor)",
  valuation_gap_desc: "Mayor descuento vs. zona",
  // Etiquetas de P2 real (29-30/09); el selector decide por `order_code`, no por estos textos.
  price_percentile_asc: "Más baratas entre avisos similares",
  gross_yield_desc: "Rentabilidad (mayor a menor)",
  price_per_sqm_asc: "Precio por m²",
  days_on_market_desc: "Más tiempo publicadas primero",
  distance_asc: "Cercanía",
};
const TIPO_LABEL: Record<string, string> = {
  apartment: "Departamento",
  house: "Casa",
  land: "Lote",
  room: "Habitación",
};
const ATTR_LABEL: Record<string, string> = Object.fromEntries(ATTR_FILTERS.map((a) => [a.field, a.label]));
const nfAR = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

function money(n: number, currency: "USD" | "ARS"): string {
  return `${currency === "USD" ? "US$" : "$"} ${nfAR.format(n)}`;
}

function hardFilters(intent: MockIntent): HardFilter[] {
  const out: HardFilter[] = [{ field: "vertical", operator: "eq", value: intent.vertical, label: VERTICAL_LABEL[intent.vertical] }];
  if (intent.vertical === "land") {
    out.push({
      field: "land_class",
      operator: "eq",
      value: intent.landClass ?? "both",
      label: intent.landClass === "rural" ? "Lote rural" : intent.landClass === "urban" ? "Lote urbano" : "Lote urbano y rural",
    });
  } else if (intent.tipo) {
    out.push({ field: "property_type", operator: "eq", value: intent.tipo, label: TIPO_LABEL[intent.tipo] });
  }
  if (intent.place) out.push({ field: "place", operator: "text", value: intent.place.toLowerCase(), label: `en ${intent.place}` });
  if (intent.zones.length) {
    out.push({ field: "zones", operator: "in", value: intent.zones, label: intent.zones.map((z) => ZONE_NAME[z] ?? z).join(", ") });
  } else if (intent.deadZone) {
    out.push({ field: "zones", operator: "in", value: [intent.deadZone], label: titleCase(intent.deadZone) });
  }
  if (intent.budgetMax != null && intent.budgetMin != null) {
    out.push({ field: "budget", operator: "between", value: [intent.budgetMin, intent.budgetMax], label: `entre ${money(intent.budgetMin, intent.currency)} y ${money(intent.budgetMax, intent.currency)}` });
  } else if (intent.budgetMax != null) {
    out.push({ field: "budget_max", operator: "lte", value: intent.budgetMax, label: `hasta ${money(intent.budgetMax, intent.currency)}` });
  } else if (intent.budgetMin != null) {
    out.push({ field: "budget_min", operator: "gte", value: intent.budgetMin, label: `desde ${money(intent.budgetMin, intent.currency)}` });
  }
  if (intent.bedrooms != null) out.push({ field: "bedrooms", operator: "gte", value: intent.bedrooms, label: `${intent.bedrooms}+ dormitorios` });
  for (const f of intent.attrs) out.push({ field: f, operator: "eq", value: true, label: ATTR_LABEL[f] ?? f });
  return out;
}

function budgetLabel(intent: MockIntent): string | null {
  const f = hardFilters(intent).find((h) => h.field.startsWith("budget"));
  return f ? f.label : null;
}

function buildSummary(intent: MockIntent, total: number): Summary {
  return {
    vertical: VERTICAL_LABEL[intent.vertical],
    zone: intent.deadZone
      ? titleCase(intent.deadZone)
      : intent.zones.length
        ? intent.zones.map((z) => ZONE_NAME[z] ?? z).join(", ")
        : intent.place
          ? `${intent.place} (San Juan)`
          : "Toda la provincia",
    property_type: intent.tipo ? TIPO_LABEL[intent.tipo] : null,
    budget: budgetLabel(intent),
    order: intent.order === "distance_asc" && intent.near ? `Cercanía a ${intent.near}` : ORDER_LABEL[intent.order],
    assumption_note: intent.note,
    total_results: total,
    order_code: intent.order,
    hard_filters: hardFilters(intent),
    soft_criteria: [],
    near: intent.order === "distance_asc" ? intent.near : null,
    land_class: intent.vertical === "land" ? (intent.landClass ?? "both") : null,
    includes_outdated: false,
  };
}

function buildNarrative(intent: MockIntent, total: number, shown: number): string {
  const zona = intent.deadZone
    ? titleCase(intent.deadZone)
    : intent.zones.length
      ? intent.zones.map((z) => ZONE_NAME[z] ?? z).join(" y ")
      : "San Juan";
  if (total === 0) {
    return `No encontré publicaciones que cumplan eso en ${zona}. En esa zona casi no hay stock publicado — es el mercado, no un error. Podemos ampliar la zona o ajustar el presupuesto y vuelvo a buscar.`;
  }
  const tipo = intent.tipo ? TIPO_LABEL[intent.tipo].toLowerCase() + (total !== 1 ? "s" : "") : "propiedades";
  const orden = ORDER_LABEL[intent.order];
  let extra = "Decime si querés ajustar zona, presupuesto o prioridad y refino la lista.";
  if (intent.vertical === "temporary_rent") {
    extra = "El mercado temporario de San Juan es chico: esto es prácticamente todo lo publicado hoy.";
  } else if (intent.order === "gross_yield_desc") {
    extra = "Las ordené por renta bruta estimada; mirá el detalle de cada una para ver los componentes del cálculo.";
  }
  return `Encontré ${total} ${tipo} en ${zona} y te muestro ${shown} ordenadas por ${orden}. ${extra}`;
}

/** Aclaración NO terminal (`few_results`, contrato §3.3b): menos de 3 resultados. */
function relaxOptions(intent: MockIntent): RelaxOption[] {
  const out: RelaxOption[] = [];
  if (intent.place) out.push({ relax: "place", label: "Quitar el lugar", count: 85 });
  if (intent.deadZone || intent.zones.length) out.push({ relax: "zones", label: "Quitar la zona", count: 87 });
  if (intent.bedrooms != null) out.push({ relax: "bedrooms", label: "Quitar los dormitorios", count: 4 });
  for (const f of intent.attrs) out.push({ relax: f, label: `Quitar ${(ATTR_LABEL[f] ?? f).replace(/^con /, "")}`, count: 6 });
  if (intent.budgetMax != null) out.push({ relax: "budget", label: "Quitar el presupuesto", count: 15 });
  if (intent.tipo) out.push({ relax: "property_type", label: "Quitar el tipo", count: 3 });
  return out;
}

function buildClarification(intent: MockIntent, total: number): ClarificationInfo | null {
  if (total >= 3) return null;
  const options = relaxOptions(intent);
  if (!options.length) return null;
  const list = options.map((o) => `${o.label.replace(/^Quitar /, "quitar ")}: ${o.count}`).join("; ");
  return {
    reason: "few_results",
    message:
      total === 0
        ? `No encontré avisos que cumplan todo lo que pediste. Si aflojás un filtro tendrías — ${list}.`
        : `Solo ${total} ${total === 1 ? "aviso cumple" : "avisos cumplen"} todo lo que pediste. Si aflojás un filtro tendrías — ${list}.`,
    chips: options.map((o) => o.label),
    options,
  };
}

function sseChunk(event: string, data: unknown): Uint8Array {
  // CRLF como P2 real: si el mock usa LF, tapa bugs de framing del parser.
  return new TextEncoder().encode(`event: ${event}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`);
}

function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/**
 * Estado acumulado por sesión, como en P2 real: la paginación
 * `{session_id, offset}` no trae query, así que el criterio sale de acá.
 */
const SESSION_INTENT = new Map<string, MockIntent>();

function buildCardsEvent(sessionId: string, intent: MockIntent, offset: number, limit: number): CardsEvent {
  const total_matches = totalFor(intent.vertical, intent.zones, intent.deadZone, intent);
  const params = { ...toParams(intent, limit), offset };
  const cards = intent.deadZone ? [] : pageCards(params, intent).cards;
  return {
    session_id: sessionId,
    cards,
    summary: buildSummary(intent, total_matches),
    nivel1_required: false,
    total: cards.length,
    total_matches,
    related: isLastPage(offset, cards.length, total_matches) ? buildRelated(intent) : null,
    suggestions: total_matches === 0 ? ZERO_SUGGESTIONS : null,
    clarification: offset === 0 ? buildClarification(intent, total_matches) : null,
    content_language: "es-AR",
  };
}

/** Criterio del turno: refinamiento si la sesión ya buscó, turno nuevo si no. */
function resolveIntent(body: StreamRequest, query: string): MockIntent {
  const prev = SESSION_INTENT.get(body.session_id);
  if (prev) return mergeRefinement(prev, query, body.vertical_override);
  return interpretQuery(query, body.vertical_override);
}

/** Simulación de latencia de P2: `?slow` en la consulta demora las cards (pruebas del estado de espera, T1). */
function cardsDelay(query: string): number {
  const m = query.match(/\?slow(?:=(\d+))?/);
  if (!m) return 150;
  return m[1] ? Number(m[1]) : 6000;
}

/**
 * Mock del canal SSE POST /search/stream — respeta el orden de eventos del contrato:
 * cards → [clarification NO terminal] → response_chunk(×N) → done | clarification | error.
 * Paginación (sin `query`): cards → done, sin narrativa — no es un turno.
 */
export function mockSearchStream(body: StreamRequest): Response {
  const query = body.query?.trim();

  if (!query && !body.vertical_override) {
    const intent = SESSION_INTENT.get(body.session_id);
    if (typeof body.offset !== "number") {
      return Response.json({ detail: "query, vertical_override u offset requeridos" }, { status: 422 });
    }
    if (!intent) {
      return Response.json({ detail: "La sesión todavía no buscó nada" }, { status: 422 });
    }
    const cardsEvent = buildCardsEvent(body.session_id, intent, body.offset, body.limit ?? 20);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        await sleep(18); // P2 real: 14-21 ms, sin LLM
        controller.enqueue(sseChunk("cards", cardsEvent));
        controller.enqueue(sseChunk("done", { context: {}, meta: { extractor: "pagination", latency_ms: { search: 12, total: 18 } } }));
        controller.close();
      },
    });
    return sseResponse(stream);
  }

  // Sesión desconocida con un id "vencido" (pruebas de reintento): 404 como P2 real (F2).
  if (/^00000000-/.test(body.session_id)) {
    return Response.json({ detail: `Session ${body.session_id} not found or expired` }, { status: 404 });
  }

  const intent = resolveIntent(body, query ?? "");
  const limit = body.limit ?? 20;
  const delay = cardsDelay(query ?? "");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (intent.reset) {
          SESSION_INTENT.delete(body.session_id);
          await sleep(200);
          const ev: ClarificationEvent = {
            session_id: body.session_id,
            message: "Listo, arrancamos de cero. ¿Qué estás buscando? Puedo mostrarte propiedades para comprar, para alquilar o para invertir.",
            chips: ["Comprar", "Alquilar", "Invertir"],
            clarification_reason: "sin_senal",
            nivel1_required: true,
            terminal: true,
            context: {},
          };
          controller.enqueue(sseChunk("clarification", ev));
          controller.close();
          return;
        }

        if (intent.clarify) {
          await sleep(250);
          const ev: ClarificationEvent = {
            session_id: body.session_id,
            message: (baseClarification as { message: string }).message,
            chips: (baseClarification as { chips: string[] }).chips,
            clarification_reason: "sin_senal",
            nivel1_required: true,
            terminal: true,
            context: {},
          };
          controller.enqueue(sseChunk("clarification", ev));
          controller.close();
          return;
        }

        if (SESSION_INTENT.size > 200) SESSION_INTENT.clear();
        SESSION_INTENT.set(body.session_id, intent);

        await sleep(delay);
        const cardsEvent = buildCardsEvent(body.session_id, intent, 0, limit);
        controller.enqueue(sseChunk("cards", cardsEvent));

        if (cardsEvent.clarification) {
          const ev: ClarificationEvent = {
            session_id: body.session_id,
            message: cardsEvent.clarification.message,
            chips: cardsEvent.clarification.chips,
            clarification_reason: "few_results",
            options: cardsEvent.clarification.options,
            nivel1_required: false,
            terminal: false,
            context: {},
          };
          controller.enqueue(sseChunk("clarification", ev));
        }

        // Narrativa con "typing": un token por palabra, como el LLM real.
        const narrative = buildNarrative(intent, cardsEvent.total_matches, cardsEvent.cards.length);
        const tokens = narrative.split(/(?<=\s)/);
        await sleep(500);
        for (const token of tokens) {
          controller.enqueue(sseChunk("response_chunk", { token }));
          await sleep(28);
        }

        controller.enqueue(
          sseChunk("done", {
            context: { search_params: toParams(intent, limit) },
            meta: {
              extractor: body.vertical_override ? "override" : "fast",
              narrativa: "template",
              latency_ms: { extraction_y_merge: 1.2, search: 8.1, narrativa: 900, total: 950 },
            },
          }),
        );
        controller.close();
      } catch {
        controller.enqueue(sseChunk("error", { message: "Internal search error" }));
        controller.close();
      }
    },
  });

  return sseResponse(stream);
}

/** Mock de `POST /search` (fallback sync, contrato §3.7): cards + summary + resumen template. */
export async function mockSearchSync(body: StreamRequest): Promise<SyncSearchResponse> {
  await sleep(120);
  if (/^00000000-/.test(body.session_id)) {
    throw Object.assign(new Error(`Session ${body.session_id} not found or expired`), { status: 404 });
  }
  const query = body.query?.trim() ?? "";
  const intent = resolveIntent(body, query);
  SESSION_INTENT.set(body.session_id, intent);
  const ev = buildCardsEvent(body.session_id, intent, 0, body.limit ?? 20);
  return {
    session_id: body.session_id,
    content_language: "es-AR",
    summary: ev.summary,
    cards: ev.cards,
    nivel1_required: false,
    chips: null,
    suggestions: ev.suggestions,
    context: { search_params: toParams(intent, body.limit ?? 20) },
    llm_response: buildNarrative(intent, ev.total_matches, ev.cards.length),
    related: ev.related,
    clarification: ev.clarification ?? null,
  };
}

/* --------------------------- Detalle -------------------------------- */

const DESCRIPTIONS = [
  "Propiedad muy luminosa, en excelente ubicación, a metros de servicios y transporte. Cocina integrada, aberturas de aluminio y detalles de categoría. Se entrega en el estado en que se encuentra. Consultá por financiación.",
  "Ideal primera vivienda o inversión. Distribución funcional, patio con parral y lavadero cubierto. Escritura al día, apta crédito hipotecario. Se aceptan permutas menores.",
  "Sobre calle tranquila, con portón automatizado y cochera cubierta. Amplio living comedor con hogar a leña, dormitorios con placares. Zona de constante revalorización.",
];

function detailFromCard(card: Card, seed: number): PropertyDetailResponse {
  const isRoom = card.property_type === "room";
  const property: PropertyDetail = {
    ...card,
    description: DESCRIPTIONS[seed % DESCRIPTIONS.length],
    heating: isRoom ? null : seed % 3 === 0 ? "Gas natural" : seed % 3 === 1 ? "unknown" : null,
    year_built: card.property_type === "land" ? null : seed % 4 === 0 ? null : 1985 + (seed % 35),
  };
  const kind: IdKind = card.operation === "rent" ? (isRoom ? "t" : "r") : card.property_type === "land" ? "l" : "s";
  // Respuesta de P2 30/09-01/10 (§3.3.4): el detalle lista el conjunto ENTERO
  // que se puede mostrar, por precio en USD, y `comparables_pool` dice cuántos
  // son y cuántos no se muestran (tier 0: sin foto o sin superficie). Venta y
  // lotes: hasta 30. Alquiler por dormitorios: sin tope, y casi la mitad del
  // conjunto no se muestra. Sin similares, lista vacía y pool null.
  const count = card.comparables_count ?? 0;
  const listed = count === 0 ? 0 : card.operation === "rent" && count > 30 ? Math.round(count * 0.53) : Math.min(count, 30);
  const comparables_pool: ComparablesPool | null =
    count > 0 ? { scope: count < 5 ? "adjacent_zones" : "zone", count, listed, not_listed: count - listed } : null;
  const comparables: MiniCard[] = Array.from({ length: listed }, (_, i) => {
    const c = mockCard(seed + 40 + i, kind, { zones: card.zone ? [card.zone] : [], tipo: card.property_type });
    const covered = c.covered_area_sqm ?? null;
    // US$/m² sobre la MISMA base con que se compara: cubierta en vivienda, total en lotes; solo en venta.
    const base = c.property_type === "land" ? c.area_sqm : covered;
    return {
      id: c.id,
      zone: c.zone,
      area_sqm: c.area_sqm,
      price: c.price,
      currency: c.currency,
      price_usd: c.price_usd,
      opportunity_score: c.opportunity_score,
      property_type: c.property_type,
      operation: c.operation,
      // Mismos dormitorios que el aviso (así se arma el conjunto en vivienda).
      bedrooms: card.property_type === "land" ? null : (card.bedrooms ?? c.bedrooms),
      covered_area_sqm: covered,
      price_per_sqm: c.operation === "sale" && base != null && base > 0 && c.price_usd != null ? Math.round((c.price_usd / base) * 100) / 100 : null,
    };
  }).sort((a, b) => (a.price_usd ?? 0) - (b.price_usd ?? 0));
  return {
    property,
    comparables,
    comparables_pool,
    score_components: card.score_components,
    content_language: "es-AR",
  };
}

export async function mockGetProperty(id: string): Promise<PropertyDetailResponse | null> {
  await sleep(120);
  const base = BASE_CARDS.find((c) => c.id === id);
  if (base) return detailFromCard(base, 1);

  const m = id.match(/^sj-mk([srtixl])(\d+)$/);
  if (!m) return null;
  const n = Number(m[2]);
  const kind = m[1] as IdKind;
  const card = mockCard(n, kind, {});
  return detailFromCard(card, n);
}
