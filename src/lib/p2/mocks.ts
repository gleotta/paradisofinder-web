/**
 * Adaptador MOCK de P2 — se usa cuando P2 no está corriendo (ver client.ts).
 * Los ejemplos base viven en /mocks (ilustrativos); la verdad es el Swagger vivo.
 *
 * Reproduce la mecánica del contrato, incluida la realidad del mercado San Juan:
 * zonas sin stock devuelven 0 (Zonda, Calingasta, Jáchal, Ullum, 25 de Mayo),
 * temporario tiene ~10 avisos, y las consultas sin señal piden clarificación.
 */

import baseSearch from "../../../mocks/search-text-response.json";
import baseClarification from "../../../mocks/clarification-event.json";
import type {
  Card,
  CardsEvent,
  ClarificationEvent,
  Complemento,
  MapPin,
  MapSearchRequest,
  MapSearchResponse,
  MiniCard,
  PropertyDetail,
  PropertyDetailResponse,
  RatingColor,
  Riepilogo,
  SearchTextResponse,
  SessionResponse,
  StreamRequest,
  StructuredParams,
  StructuredResponse,
  SearchResult,
} from "./types";

const BASE_CARDS = (baseSearch as { result: { cards: unknown } }).result
  .cards as Card[];

/* ------------------------------------------------------------------ */
/* Interpretación naive de la query (SOLO para el mock; el NLP vive en P2) */
/* ------------------------------------------------------------------ */

const DEAD_ZONES = ["zonda", "calingasta", "jáchal", "jachal", "ullum", "25 de mayo"];
const LIVE_ZONES = [
  "capital",
  "rivadavia",
  "santa lucía",
  "santa lucia",
  "rawson",
  "chimbas",
  "pocito",
  "desamparados",
  "caucete",
  "albardón",
  "albardon",
];

type Vertical = "sale" | "rent" | "investment" | "temporary_rent";

interface MockIntent {
  clarify: boolean;
  reset: boolean;
  vertical: Vertical;
  assumedSale: boolean;
  zones: string[];
  deadZone: string | null;
  tipo: "apartment" | "house" | "room" | "land" | null;
  order: NonNullable<StructuredParams["order"]>;
  budget: string | null;
}

function titleCase(s: string): string {
  return s.replace(/\p{L}+/gu, (w) => w[0].toUpperCase() + w.slice(1));
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

  let vertical: Vertical | null = null;
  if (temporary) vertical = "temporary_rent";
  else if (investor) vertical = "investment";
  else if (rent) vertical = "rent";
  else if (buy) vertical = "sale";

  const override = (verticalOverride ?? "").toLowerCase();
  if (override) {
    if (/alquilar|affittare/.test(override)) vertical = "rent";
    else if (/invertir|investire/.test(override)) vertical = "investment";
    else if (/comprar|comprare/.test(override)) vertical = "sale";
  }

  let tipo: MockIntent["tipo"] = null;
  if (/habitaci[óo]n|monoambiente/.test(q)) tipo = "room";
  else if (/depto|departamento|d[úu]plex|ph\b/.test(q)) tipo = "apartment";
  else if (/casa|chalet/.test(q)) tipo = "house";
  else if (/terreno|lote/.test(q)) tipo = "land";
  if (vertical === "temporary_rent" && !tipo) tipo = "room";

  const deadZone = DEAD_ZONES.find((z) => q.includes(z)) ?? null;
  const zones = LIVE_ZONES.filter((z) => q.includes(z)).map(titleCase);

  const assumedSale = vertical === null && tipo !== null;
  if (assumedSale) vertical = "sale";

  let order: MockIntent["order"] = "opportunity_score";
  if (/barat/.test(q)) order = "price_asc";
  else if (/para renta|renta\b/.test(q)) order = "gross_yield_desc";
  else if (/revaloriz|revender|ganga/.test(q)) order = "valuation_gap_desc";
  else if (/bajo precio de zona|percentil/.test(q)) order = "price_percentile_asc";

  const budgetMatch = q.match(/hasta\s+(?:us?\$?\s*)?([\d.,]+)\s*(mil|millones)?\s*(d[óo]lares|usd|pesos)?/);
  let budget: string | null = null;
  if (budgetMatch) {
    const usd = /d[óo]lares|usd|us\$/.test(budgetMatch[0]);
    budget = `hasta ${usd ? "US$ " : "$ "}${budgetMatch[1]}${budgetMatch[2] ? " " + budgetMatch[2] : ""}`;
  }

  return {
    clarify: vertical === null,
    reset,
    vertical: vertical ?? "sale",
    assumedSale,
    zones,
    deadZone,
    tipo,
    order,
    budget,
  };
}

/* ------------------------------------------------------------------ */
/* Generador determinístico de cards                                   */
/* ------------------------------------------------------------------ */

function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const ZONE_CYCLE = ["Capital", "Rivadavia", "Santa Lucía", "Rawson", "Chimbas", "Desamparados"];
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
];
const RATING_CYCLE: (RatingColor | null)[] = ["green", "yellow", "green", null, "red", "yellow"];

const DEAL_REASONS: Record<RatingColor, { code: string; text: string }[]> = {
  green: [{ code: "below_market", text: "Precio por debajo del mercado de su zona" }],
  yellow: [{ code: "market_price", text: "En precio de zona" }],
  red: [{ code: "above_market", text: "Publicada por encima de comparables de su zona" }],
};
const RESALE_REASONS: Record<RatingColor, { code: string; text: string }[]> = {
  green: [{ code: "high_valuation_gap", text: "Gap de valuación alto para la zona" }],
  yellow: [{ code: "low_valuation_gap", text: "Sin descuento relevante frente a comparables" }],
  red: [{ code: "negative_gap", text: "Pagarías por encima del valor de referencia de la zona" }],
};
const RENTAL_REASONS: Record<RatingColor, { code: string; text: string }[]> = {
  green: [{ code: "high_yield", text: "Renta estimada por encima de la mediana de la zona" }],
  yellow: [{ code: "avg_yield", text: "Renta estimada en línea con la zona" }],
  red: [{ code: "low_yield", text: "Renta estimada por debajo de la mediana de la zona" }],
};

type IdKind = "s" | "r" | "t" | "i" | "x";

function photo(label: string, n: number, w = 640, h = 420): string {
  const bg = PASTELS[n % PASTELS.length];
  return `https://placehold.co/${w}x${h}/${bg}/4D1480?text=${encodeURIComponent(label)}`;
}

const TYPE_LABEL_SHORT: Record<string, string> = {
  apartment: "Depto",
  house: "Casa",
  land: "Terreno",
  room: "Habitación",
};

export function mockCard(n: number, kind: IdKind, opts: { zones?: string[]; tipo?: string | null }): Card {
  const r = (k: number) => rand(n * 7 + k);
  const zone = opts.zones?.length ? opts.zones[n % opts.zones.length] : ZONE_CYCLE[n % ZONE_CYCLE.length];
  const isRent = kind === "r";
  const isTemp = kind === "t";
  const tipo = (opts.tipo ?? (n % 3 === 0 ? "house" : "apartment")) as Card["property_type"];
  const type = isTemp ? "room" : tipo;
  const label = `${TYPE_LABEL_SHORT[type] ?? "Propiedad"} ${zone}`;

  const areaBase = type === "house" ? 120 : type === "land" ? 300 : 55;
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
  const deal = RATING_CYCLE[n % RATING_CYCLE.length];
  const resale = isSale ? RATING_CYCLE[(n + 2) % RATING_CYCLE.length] : null;
  const rentalR = isSale ? RATING_CYCLE[(n + 4) % RATING_CYCLE.length] : null;

  const gap = Math.round((r(3) * 30 - 18) * 10) / 10;
  const yieldPct = Math.round((6 + r(4) * 4.5) * 10) / 10;
  const score = Math.round(45 + r(5) * 50);

  const signalFromGap = gap < -4;
  const primary_signal = isTemp
    ? { text: "Disponible por día — consultá estadía mínima", type: "availability", color: "yellow" as const }
    : signalFromGap
      ? { text: `${String(Math.abs(gap)).replace(".", ",")}% bajo comparables de la zona`, type: "valuation_gap", color: "green" as const }
      : isSale
        ? { text: `Renta estimada ${String(yieldPct).replace(".", ",")}% anual`, type: "gross_yield", color: (yieldPct > 8 ? "green" : "yellow") as RatingColor }
        : { text: gap > 8 ? "Por encima del precio típico de su zona" : "En precio de zona", type: "price_position", color: (gap > 8 ? "red" : "yellow") as RatingColor };

  const bedrooms = type === "land" ? null : Math.max(1, Math.round(1 + r(6) * 3));

  return {
    id: `sj-mk${kind}${n}`,
    operation: isRent || isTemp ? "rent" : "sale",
    property_type: type,
    price,
    currency,
    price_usd,
    price_ars: isRent && currency === "USD" ? price_ars : null,
    price_per_sqm: isSale && type !== "land" ? Math.round((price_usd ?? 0) / area) : null,
    rental_period,
    zone,
    address: `${STREETS[n % STREETS.length]} al ${100 + (n % 40) * 50}`,
    latitude: -31.5351 + (r(7) - 0.5) * 0.12,
    longitude: -68.5386 + (r(8) - 0.5) * 0.12,
    bedrooms: isTemp ? null : n % 7 === 6 ? null : bedrooms,
    bathrooms: type === "land" ? null : n % 5 === 3 ? null : Math.max(1, Math.round(r(9) * 2)),
    rooms: type === "land" || isTemp ? null : bedrooms === null ? null : bedrooms + 1,
    area_sqm: isTemp ? (n % 2 === 0 ? 14 + (n % 8) : null) : area,
    floor: type === "apartment" && n % 4 === 1 ? (n % 6) + 1 : null,
    condition: (["good", "excellent", "unknown", "new", "needs_renovation"] as const)[n % 5],
    opportunity_score: score,
    score_components: [
      {
        key: "valuation_gap",
        label: "Precio vs. zona",
        value: Math.round(Math.max(0, -gap) * 2.4),
        weight: 0.4,
        raw_value: gap,
        raw_unit: "%",
        description:
          gap < 0
            ? `Publicado ${String(Math.abs(gap)).replace(".", ",")}% por debajo de comparables de ${zone}`
            : `Publicado ${String(gap).replace(".", ",")}% por encima de comparables de ${zone}`,
      },
      ...(isSale
        ? [
            {
              key: "gross_yield",
              label: "Renta bruta estimada",
              value: Math.round(yieldPct * 3.5),
              weight: 0.3,
              raw_value: yieldPct,
              raw_unit: "%",
              description: `Renta bruta anual estimada de ${String(yieldPct).replace(".", ",")}%`,
            },
          ]
        : []),
      {
        key: "days_on_market",
        label: "Tiempo en mercado",
        value: Math.round(r(10) * 20),
        weight: 0.1,
        raw_value: 5 + Math.round(r(10) * 90),
        raw_unit: "días",
        description: "Días de publicación frente a la mediana de su zona",
      },
    ],
    primary_signal,
    deal_rating: deal,
    // Clave real de P2 (verificada contra Swagger 29/08).
    deal_rating_reasons: deal ? DEAL_REASONS[deal] : null,
    resale_investment_rating: resale,
    resale_investment_reasons: resale ? RESALE_REASONS[resale] : null,
    rental_investment_rating: rentalR,
    rental_investment_reasons: rentalR ? RENTAL_REASONS[rentalR] : null,
    market_context:
      n % 6 === 0
        ? `${zone} concentra una de las mayores ofertas de ${type === "house" ? "casas" : "departamentos"} de la provincia`
        : null,
    gross_yield_pct: isSale ? yieldPct : null,
    valuation_gap_pct: isTemp ? null : gap,
    price_percentile: isTemp ? null : Math.round(r(11) * 100),
    estimated_monthly_rent: isSale ? Math.round((price_usd ?? 0) * (yieldPct / 100 / 12)) : null,
    rent_to_price_ratio: isSale ? Math.round(yieldPct / 12 * 100) / 100 : null,
    comparables_count: 8 + Math.round(r(12) * 40),
    zone_supply: 60 + Math.round(r(13) * 160),
    days_on_market: 5 + Math.round(r(10) * 90),
    listing_published_at: "2026-07-10",
    listing_updated_at: "2026-08-21",
    quality_tier: n % 8 === 5 ? 1 : 2,
    quality_score: Math.round((0.55 + r(14) * 0.4) * 100) / 100,
    pool: isSale && n % 5 === 0 ? true : null,
    bbq_area: n % 4 === 0 ? true : null,
    patio: type === "house" ? true : null,
    furnished: isRent && n % 3 === 0 ? true : isTemp ? true : null,
    parking: n % 3 !== 1 ? true : null,
    gated_community: n % 9 === 4 ? true : null,
    mortgage_eligible: isSale && n % 4 === 2 ? true : null,
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
      whatsapp: `+54 264 555-0${String(100 + n).slice(-3)}`,
      web: null,
    },
    semantic_qualities: QUALITIES[n % QUALITIES.length],
    nearby_points: n % 5 === 0 ? ["Plaza 25 de Mayo"] : n % 5 === 2 ? ["UNSJ — Campus"] : [],
    beds: isTemp ? 1 + (n % 3) : null,
    double_bed: isTemp ? n % 2 === 0 : null,
    private_bathroom: isTemp ? n % 3 !== 1 : null,
    room_class: isTemp ? (["single", "single_double_bed", "double", "triple_plus"] as const)[n % 4] : null,
    relevance_score: kind === "x" ? Math.round((0.93 - (n % 10) * 0.03) * 100) / 100 : null,
  };
}

/* ------------------------------------------------------------------ */
/* Totales por criterio (consistentes entre /text y /structured)       */
/* ------------------------------------------------------------------ */

function totalFor(vertical: Vertical, zones: string[], deadZone: string | null): number {
  if (deadZone) return 0;
  if (vertical === "temporary_rent") return 8;
  if (zones.some((z) => z.toLowerCase() === "pocito")) return 23;
  if (vertical === "rent") return 34;
  if (vertical === "investment") return 41;
  return 87;
}

function kindFor(vertical: Vertical): IdKind {
  return vertical === "rent" ? "r" : vertical === "temporary_rent" ? "t" : vertical === "investment" ? "i" : "s";
}

function pageCards(params: StructuredParams): { cards: Card[]; total_matches: number } {
  const vertical = (params.vertical ?? "sale") as Vertical;
  const zones = params.zones ?? [];
  const deadZone = null; // structured llega con zonas ya válidas del extractor
  const total_matches = totalFor(vertical, zones, deadZone);
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 20;
  const kind = kindFor(vertical);
  const tipo = (params.property_type as string) ?? null;

  const cards: Card[] = [];
  for (let i = offset; i < Math.min(offset + limit, total_matches); i++) {
    if (kind === "s" && i < BASE_CARDS.length && !zones.length && !tipo) {
      cards.push(BASE_CARDS[i]);
    } else {
      cards.push(mockCard(i, kind, { zones, tipo }));
    }
  }
  return { cards, total_matches };
}

function toParams(intent: MockIntent, limit: number): StructuredParams {
  return {
    vertical: intent.vertical,
    ...(intent.zones.length ? { zones: intent.zones } : {}),
    ...(intent.tipo ? { property_type: intent.tipo as StructuredParams["property_type"] } : {}),
    order: intent.order,
    limit,
    offset: 0,
  };
}

const ZERO_SUGGESTIONS = ["Ampliar la zona", "Ajustar el presupuesto", "Probar en Capital o Rawson"];

function buildComplemento(intent: MockIntent, faltantes: number): Complemento | null {
  if (faltantes <= 0) return null;
  const agregadas = Math.min(3, faltantes);
  const cards: Card[] = [];
  for (let i = 0; i < agregadas; i++) {
    const c = mockCard(60 + i, "x", { zones: [], tipo: intent.tipo });
    cards.push(c);
  }
  return { motivo: "resultados_insuficientes", faltantes, agregadas, cards };
}

/* ------------------------------------------------------------------ */
/* Endpoints mock                                                      */
/* ------------------------------------------------------------------ */

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export async function mockSearchText(query: string, limit = 10): Promise<SearchTextResponse> {
  await sleep(250);
  const intent = interpretQuery(query);

  if (intent.clarify) {
    return {
      covered: false,
      clarification_needed: true,
      extraction: null,
      result: null,
      complemento: null,
      message: (baseClarification as { message: string }).message,
      chips: (baseClarification as { chips: string[] }).chips,
    };
  }

  const params = toParams(intent, limit);
  if (intent.deadZone) {
    return {
      covered: true,
      clarification_needed: false,
      extraction: { params, meta: { extractor: "fast" } },
      result: {
        total: 0,
        total_matches: 0,
        citta: "san_juan",
        params_applied: { vertical: intent.vertical, zones: [titleCase(intent.deadZone)] },
        cards: [],
        suggestions: ZERO_SUGGESTIONS,
      },
      complemento: null,
    };
  }

  const { cards, total_matches } = pageCards(params);
  return {
    covered: true,
    clarification_needed: false,
    extraction: { params, meta: { extractor: "fast" } },
    result: {
      total: cards.length,
      total_matches,
      citta: "san_juan",
      params_applied: {
        vertical: intent.vertical,
        ...(intent.zones.length ? { zones: intent.zones } : {}),
        ...(intent.tipo ? { property_type: intent.tipo } : {}),
        order: intent.order,
      },
      cards,
      suggestions: total_matches === 0 ? ZERO_SUGGESTIONS : null,
    },
    complemento: total_matches > 0 && total_matches < limit ? buildComplemento(intent, limit - total_matches) : null,
  };
}

export async function mockSearchStructured(params: StructuredParams): Promise<StructuredResponse> {
  await sleep(60);
  const { cards, total_matches } = pageCards(params);
  return {
    total: cards.length,
    total_matches,
    citta: "san_juan",
    params_applied: params as Record<string, unknown>,
    cards,
  };
}

export async function mockSearchSemantic(query: string, offset = 0, limit = 10): Promise<SearchResult> {
  await sleep(120);
  const intent = interpretQuery(query);
  const TOTAL_SIMILAR = 12;
  const cards: Card[] = [];
  for (let i = offset; i < Math.min(offset + limit, TOTAL_SIMILAR); i++) {
    cards.push(mockCard(80 + i, "x", { zones: [], tipo: intent.tipo }));
  }
  return {
    total: cards.length,
    total_matches: TOTAL_SIMILAR,
    citta: "san_juan",
    params_applied: { query },
    cards,
  };
}

/**
 * Mock de POST /search/map: mismo criterio que el listado pero devolviendo el
 * "universo" mapeable (tier >= 2 con coordenadas), sin tope ni paginación.
 */
export async function mockSearchMap(body: MapSearchRequest): Promise<MapSearchResponse> {
  await sleep(80);
  const vertical = (body.vertical ?? "sale") as Vertical;
  const zones = body.zones ?? [];
  const total_matches = totalFor(vertical, zones, null);
  const kind = kindFor(vertical);
  const tipo = body.property_type ?? null;

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
    citta: "san_juan",
    params_applied: { ...body },
    pins,
  };
}

export async function mockCreateSession(): Promise<SessionResponse> {
  const now = new Date();
  const expires = new Date(now.getTime() + 24 * 3600 * 1000);
  return {
    session_id: `mock-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
  };
}

/* --------------------------- SSE mock ------------------------------ */

const VERTICAL_LABEL: Record<Vertical, string> = {
  sale: "Venta",
  rent: "Alquiler",
  investment: "Inversión",
  temporary_rent: "Alquiler temporario",
};
const ORDER_LABEL: Record<string, string> = {
  opportunity_score: "Opportunity Score",
  price_asc: "Precio, de menor a mayor",
  price_desc: "Precio, de mayor a menor",
  valuation_gap_desc: "Mayor descuento vs. zona",
  price_percentile_asc: "Bajo precio de zona",
  gross_yield_desc: "Mayor renta estimada",
  price_per_sqm_asc: "Precio por m²",
  days_on_market_desc: "Más días publicadas",
};
const TIPO_LABEL: Record<string, string> = {
  apartment: "Departamento",
  house: "Casa",
  land: "Terreno",
  room: "Habitación",
};

function buildRiepilogo(intent: MockIntent, total: number): Riepilogo {
  return {
    vertical: VERTICAL_LABEL[intent.vertical],
    zona: intent.deadZone ? titleCase(intent.deadZone) : intent.zones.length ? intent.zones.join(", ") : "Toda la provincia",
    tipo: intent.tipo ? TIPO_LABEL[intent.tipo] : null,
    budget: intent.budget,
    orden: ORDER_LABEL[intent.order],
    nota_asuncion: intent.assumedSale ? "Asumí compra — decime si buscás alquilar" : null,
    total_resultados: total,
  };
}

function buildNarrative(intent: MockIntent, total: number, shown: number): string {
  const zona = intent.deadZone
    ? titleCase(intent.deadZone)
    : intent.zones.length
      ? intent.zones.join(" y ")
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

function sseChunk(event: string, data: unknown): Uint8Array {
  // CRLF como P2 real: si el mock usa LF, tapa bugs de framing del parser.
  return new TextEncoder().encode(`event: ${event}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`);
}

/**
 * Mock del canal SSE POST /search/stream — respeta el orden de eventos del contrato:
 * cards → response_chunk(×N) → done | clarification | error.
 */
export function mockSearchStream(body: StreamRequest): Response {
  const intent = interpretQuery(body.query, body.vertical_override);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (intent.reset) {
          await sleep(200);
          const ev: ClarificationEvent = {
            session_id: body.session_id,
            message: "Listo, arrancamos de cero. ¿Qué estás buscando? Puedo mostrarte propiedades para comprar, para alquilar o para invertir.",
            chips: ["Comprar", "Alquilar", "Invertir"],
            clarification_reason: "sin_senal",
            nivel1_required: true,
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
            context: {},
          };
          controller.enqueue(sseChunk("clarification", ev));
          controller.close();
          return;
        }

        const params = toParams(intent, 20);
        const total_matches = totalFor(intent.vertical, intent.zones, intent.deadZone);
        const { cards } = intent.deadZone ? { cards: [] as Card[] } : pageCards(params);

        await sleep(150);
        const cardsEvent: CardsEvent = {
          session_id: body.session_id,
          cards,
          riepilogo: buildRiepilogo(intent, total_matches),
          nivel1_required: false,
          total: cards.length,
          total_matches,
          complemento:
            total_matches > 0 && total_matches < 10 ? buildComplemento(intent, 10 - total_matches) : null,
          suggestions: total_matches === 0 ? ZERO_SUGGESTIONS : null,
          content_language: "es-AR",
        };
        controller.enqueue(sseChunk("cards", cardsEvent));

        // Narrativa con "typing": un token por palabra, como el LLM real.
        const narrative = buildNarrative(intent, total_matches, cards.length);
        const tokens = narrative.split(/(?<=\s)/);
        await sleep(500);
        for (const token of tokens) {
          controller.enqueue(sseChunk("response_chunk", { token }));
          await sleep(28);
        }

        controller.enqueue(
          sseChunk("done", {
            context: { search_params: params },
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

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
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
    heating: isRoom ? null : seed % 3 === 0 ? "Gas natural" : seed % 3 === 1 ? "Split frío/calor" : null,
    year_built: card.property_type === "land" ? null : seed % 4 === 0 ? null : 1985 + (seed % 35),
  };
  const kind: IdKind = card.operation === "rent" ? (isRoom ? "t" : "r") : "s";
  const comparables: MiniCard[] = [0, 1, 2].map((i) => {
    const c = mockCard(seed + 40 + i, kind, { zones: card.zone ? [card.zone] : [], tipo: card.property_type });
    return {
      id: c.id,
      zone: c.zone,
      area_sqm: c.area_sqm,
      price: c.price,
      currency: c.currency,
      price_usd: c.price_usd,
      property_type: c.property_type,
      operation: c.operation,
    };
  });
  return {
    property,
    comparables,
    score_components: card.score_components,
    content_language: "es-AR",
  };
}

export async function mockGetProperty(id: string): Promise<PropertyDetailResponse | null> {
  await sleep(120);
  const base = BASE_CARDS.find((c) => c.id === id);
  if (base) return detailFromCard(base, 1);

  const m = id.match(/^sj-mk([srtix])(\d+)$/);
  if (!m) return null;
  const n = Number(m[2]);
  const kind = m[1] as IdKind;
  const card = mockCard(n, kind, {});
  return detailFromCard(card, n);
}
