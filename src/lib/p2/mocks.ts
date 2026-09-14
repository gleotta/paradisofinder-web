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
 */

import baseSearch from "../../../mocks/search-text-response.json";
import baseClarification from "../../../mocks/clarification-event.json";
import type {
  Card,
  CardsEvent,
  ClarificationEvent,
  ClarificationInfo,
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

const DEAL_REASONS: Record<DealRating, { code: string; text: string }[]> = {
  green: [{ code: "below_market", text: "Precio por debajo del mercado de su zona" }],
  yellow: [{ code: "market_price", text: "En precio de zona" }],
  red: [{ code: "above_market", text: "Publicada por encima de comparables de su zona" }],
  verify_data: [{ code: "verificar_datos", text: "El gap supera ±35 %: conviene verificar superficie y precio del aviso" }],
  outdated: [{ code: "sin_actualizar", text: "Aviso sin actualizar hace más de 90 días" }],
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

export function mockCard(
  n: number,
  kind: IdKind,
  opts: { zones?: string[]; tipo?: string | null; near?: string | null },
): Card {
  const r = (k: number) => rand(n * 7 + k);
  const zone = opts.zones?.length ? opts.zones[n % opts.zones.length] : ZONE_CYCLE[n % ZONE_CYCLE.length];
  const zoneLabel = ZONE_NAME[zone] ?? titleCase(zone.replace(/_/g, " "));
  const isRent = kind === "r";
  const isTemp = kind === "t";
  const isLand = kind === "l" || opts.tipo === "land";
  const tipo = (isLand ? "land" : (opts.tipo ?? (n % 3 === 0 ? "house" : "apartment"))) as Card["property_type"];
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
  let deal: DealRating | null = RATING_CYCLE[n % RATING_CYCLE.length];
  if (n % 13 === 6) deal = "verify_data";
  const resale = isSale && !isLand ? RATING_CYCLE[(n + 2) % RATING_CYCLE.length] : null;
  const rentalR = isSale && !isLand ? RATING_CYCLE[(n + 4) % RATING_CYCLE.length] : null;

  const gap = Math.round((r(3) * 30 - 18) * 10) / 10;
  const yieldPct = Math.round((6 + r(4) * 4.5) * 10) / 10;
  const score = Math.round(35 + r(5) * 58);
  // Antigüedad (contrato 13/09): algunos avisos viejos y muy viejos.
  const days = n % 9 === 7 ? 200 + Math.round(r(10) * 100) : n % 9 === 8 ? 400 + Math.round(r(10) * 900) : 5 + Math.round(r(10) * 90);
  const age_flag: Card["age_flag"] = days > 365 ? "very_old" : days > 180 ? "old" : null;
  const updated = Math.min(days, n % 6 === 0 ? 0 : 1 + Math.round(r(15) * 40));

  const signalFromGap = gap < -4;
  const primary_signal = isTemp
    ? { text: "Disponible por día — consultá estadía mínima", type: "availability", color: "yellow" as const }
    : signalFromGap
      ? { text: `${String(Math.abs(gap)).replace(".", ",")}% bajo comparables de la zona`, type: "valuation_gap", color: "green" as const }
      : isSale && !isLand
        ? { text: `Renta estimada ${String(yieldPct).replace(".", ",")}% anual`, type: "gross_yield", color: (yieldPct > 8 ? "green" : "yellow") as RatingColor }
        : { text: gap > 8 ? "Por encima del precio típico de su zona" : "En precio de zona", type: "price_position", color: (gap > 8 ? "red" : "yellow") as RatingColor };

  const bedrooms = isLand ? null : Math.max(1, Math.round(1 + r(6) * 3));
  const landClass: Card["land_class"] = isLand ? (n % 4 === 3 ? "rural" : "urban") : null;

  return {
    id: `sj-mk${kind}${n}`,
    operation: isRent || isTemp ? "rent" : "sale",
    property_type: type,
    price,
    currency,
    price_usd,
    price_ars: isRent && currency === "USD" ? price_ars : null,
    price_per_sqm: isSale && !isLand ? Math.round((price_usd ?? 0) / area) : null,
    rental_period,
    zone,
    // "None" a propósito en algunas (T3: nunca visible).
    address: n % 11 === 3 ? "None" : `${STREETS[n % STREETS.length]} al ${100 + (n % 40) * 50}`,
    latitude: -31.5351 + (r(7) - 0.5) * 0.12,
    longitude: -68.5386 + (r(8) - 0.5) * 0.12,
    bedrooms: isTemp ? null : n % 7 === 6 ? null : bedrooms,
    bathrooms: isLand ? null : n % 5 === 3 ? null : Math.max(1, Math.round(r(9) * 2)),
    rooms: isLand || isTemp ? null : bedrooms === null ? null : bedrooms + 1,
    area_sqm: isTemp ? (n % 2 === 0 ? 14 + (n % 8) : null) : area,
    covered_area_sqm: isLand || isTemp ? null : Math.round(area * 0.7),
    floor: type === "apartment" && n % 4 === 1 ? (n % 6) + 1 : null,
    condition: (["good", "excellent", "unknown", "new", "needs_renovation"] as const)[n % 5],
    opportunity_score: score,
    score_components: [
      {
        key: isLand ? "gap_zonal" : "gap_valuacion",
        label: isLand ? "Precio del m² vs. la zona" : "Subvaluación",
        value: Math.round(Math.max(0, -gap) * 2.4),
        weight: 0.4,
        raw_value: gap,
        raw_unit: "%",
        description:
          gap < 0
            ? `Publicado ${String(Math.abs(gap)).replace(".", ",")}% por debajo de comparables de ${zoneLabel}`
            : `Publicado ${String(gap).replace(".", ",")}% por encima de comparables de ${zoneLabel}`,
      },
      ...(isSale && !isLand
        ? [
            {
              key: "gross_yield",
              label: "Rendimiento bruto",
              value: Math.round(yieldPct * 3.5),
              weight: 0.3,
              raw_value: yieldPct,
              raw_unit: "%",
              description: `Renta bruta anual estimada de ${String(yieldPct).replace(".", ",")}%`,
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
      ...(n % 13 === 6
        ? [
            {
              key: "tope_verificar",
              label: "Tope por datos a verificar",
              value: 0,
              weight: 0,
              raw_value: null,
              raw_unit: null,
              description: "El gap real supera ±35 %: el score queda topado hasta verificar los datos",
            },
          ]
        : []),
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
        ? `${zoneLabel} concentra una de las mayores ofertas de ${type === "house" ? "casas" : type === "land" ? "lotes" : "departamentos"} de la provincia`
        : n % 6 === 3
          ? "null"
          : null,
    gross_yield_pct: isSale && !isLand ? yieldPct : null,
    valuation_gap_pct: isTemp ? null : gap,
    valuation_gap_capped: n % 13 === 6,
    has_covered_area: isLand ? null : true,
    price_percentile: isTemp ? null : Math.round(r(11) * 100),
    estimated_monthly_rent: isSale && !isLand ? Math.round((price_usd ?? 0) * (yieldPct / 100 / 12)) : null,
    rent_to_price_ratio: isSale && !isLand ? Math.round(yieldPct / 12 * 100) / 100 : null,
    comparables_count: 8 + Math.round(r(12) * 40),
    zone_supply: 60 + Math.round(r(13) * 160),
    days_on_market: days,
    days_since_update: updated,
    listing_status: "active",
    age_flag,
    atypical_flags: [],
    distance_km: opts.near ? Math.round((0.15 + r(16) * 6) * 100) / 100 : null,
    location_confidence: n % 5 === 0 ? "medium" : "high",
    listing_published_at: "2026-07-10",
    listing_updated_at: "2026-08-21",
    quality_tier: n % 8 === 5 ? 1 : n % 8 === 2 ? 3 : 2,
    quality_score: Math.round((0.55 + r(14) * 0.4) * 100) / 100,
    // Marca ortogonal al tipo (delta 01/09): hay dúplex-depto y dúplex-casa.
    is_duplex: (type === "apartment" || type === "house") && n % 7 === 5 ? true : null,
    pool: isSale && !isLand && n % 5 === 0 ? true : null,
    bbq_area: !isLand && n % 4 === 0 ? true : null,
    patio: type === "house" ? true : null,
    furnished: isRent && n % 3 === 0 ? true : isTemp ? true : null,
    parking: !isLand && n % 3 !== 1 ? true : null,
    gated_community: n % 9 === 4 ? true : null,
    mortgage_eligible: isSale && !isLand && n % 4 === 2 ? true : null,
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
    if (kind === "s" && i < BASE_CARDS.length && !zones.length && !tipo) {
      cards.push(BASE_CARDS[i]);
    } else {
      cards.push(mockCard(i, kind, { zones, tipo, near }));
    }
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
  price_percentile_asc: "Bajo precio de zona",
  gross_yield_desc: "Rentabilidad",
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

  const m = id.match(/^sj-mk([srtixl])(\d+)$/);
  if (!m) return null;
  const n = Number(m[2]);
  const kind = m[1] as IdKind;
  const card = mockCard(n, kind, {});
  return detailFromCard(card, n);
}
