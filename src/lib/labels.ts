/**
 * Etiquetas es-AR para los CÓDIGOS estables del contrato (claves en inglés).
 * Esto NO traduce textos de P3 (esos se muestran tal cual): mapea códigos → UI,
 * igual que la spec pide "Inmobiliaria"/"Dueño directo" para `publisher`.
 */
import type {
  AgeFlag,
  Condition,
  DealRating,
  LandClass,
  LandService,
  LandZoning,
  ListingStatus,
  Operation,
  PropertyType,
  Publisher,
  RatingColor,
  RentalPeriod,
  RoomClass,
} from "./p2/types";

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  house: "Casa",
  apartment: "Departamento",
  // Contrato 13/09 §4.4: la etiqueta de `land` es "Lote".
  land: "Lote",
  office: "Oficina",
  retail: "Local comercial",
  villa: "Villa",
  garage: "Cochera",
  warehouse: "Galpón",
  room: "Habitación",
  studio: "Monoambiente",
  attic: "Ático",
  penthouse: "Penthouse",
  other: "Propiedad",
};

export const OPERATION_LABEL: Record<Operation, string> = {
  sale: "Venta",
  rent: "Alquiler",
};

/** `unknown` no se muestra. */
export const CONDITION_LABEL: Record<Exclude<Condition, "unknown">, string> = {
  new: "A estrenar",
  excellent: "Excelente estado",
  good: "Buen estado",
  needs_renovation: "A refaccionar",
  under_construction: "En construcción",
};

export const PUBLISHER_LABEL: Record<Publisher, string> = {
  agency: "Inmobiliaria",
  owner: "Dueño directo",
};

/** Sufijo del precio en alquileres; null = no informado → se asume mensual. */
export const RENTAL_PERIOD_SUFFIX: Record<RentalPeriod, string> = {
  day: "/día",
  week: "/semana",
  month: "/mes",
};

export const ROOM_CLASS_LABEL: Record<RoomClass, string> = {
  single: "Individual",
  single_double_bed: "Individual con cama matrimonial",
  double: "Doble",
  triple_plus: "Triple o más",
};

export const RATING_LABEL = {
  deal_rating: "Precio",
  resale_investment_rating: "Inversión: reventa",
  rental_investment_rating: "Inversión: renta",
} as const;

/**
 * Etiqueta visible de los valores NO cromáticos de `deal_rating` (contrato
 * 13/09 §4.1, sugeridas por P2): el chip dice esto en vez de "Precio".
 */
export const DEAL_RATING_LABEL: Record<Exclude<DealRating, RatingColor>, string> = {
  verify_data: "Verificar datos",
  outdated: "Sin actualizar",
};

/** Etiquetas de antigüedad (§4.2): visibles en la card, nunca como "malo". */
export const AGE_FLAG_LABEL: Record<AgeFlag, string> = {
  old: "Aviso antiguo",
  very_old: "Más de un año publicado",
};

export const LISTING_STATUS_LABEL: Partial<Record<ListingStatus, string>> = {
  stale: "Sin actualizar",
};

/** Vocabulario público del request (spec §5 — "Request"). */
export const REQUEST_VERTICAL_LABEL: Record<string, string> = {
  sale: "Venta",
  rent: "Alquiler",
  investment: "Inversión",
  temporary_rent: "Alquiler temporario",
  land: "Lotes en venta",
};

export const ORDER_LABEL: Record<string, string> = {
  opportunity_score: "Opportunity Score",
  price_asc: "Precio, de menor a mayor",
  price_desc: "Precio, de mayor a menor",
  price_per_sqm_asc: "Precio por m²",
  valuation_gap_desc: "Mayor descuento vs. zona",
  price_percentile_asc: "Bajo precio de zona",
  gross_yield_desc: "Mayor renta estimada",
  days_on_market_desc: "Más días publicadas",
  distance_asc: "Cercanía",
};

/** Chips de atributos (solo si vienen informados en true). */
export const ATTRIBUTE_LABEL = {
  pool: "Pileta",
  bbq_area: "Quincho",
  patio: "Patio",
  furnished: "Amoblado",
  parking: "Cochera",
  gated_community: "Barrio cerrado",
  mortgage_eligible: "Apto crédito",
  elevator: "Ascensor",
} as const;

export type AttributeKey = keyof typeof ATTRIBUTE_LABEL;

/* ---------------- Cards por vertical (guía 29/09) ---------------- */

/** Layout de la card: las cuatro verticales del selector. */
export type CardVertical = "alquilar" | "comprar" | "invertir" | "lotes";

/**
 * Estado del inmueble como chip: SOLO los extremos declarados (C11).
 * "Excelente"/"bueno" no se muestran en la card (sí en el detalle).
 */
export const CONDITION_CHIP_LABEL: Partial<Record<Condition, string>> = {
  new: CONDITION_LABEL.new,
  under_construction: CONDITION_LABEL.under_construction,
  needs_renovation: CONDITION_LABEL.needs_renovation,
};

/** Un chip duro de vivienda: atributo en `true` o estado declarado. */
export type ChipKey = AttributeKey | `condition:${"new" | "under_construction" | "needs_renovation"}`;

/** Orden FIJO de los chips duros de vivienda por vertical (guía §2.3); lotes tiene los suyos. */
export const CHIP_ORDER: Record<Exclude<CardVertical, "lotes">, ChipKey[]> = {
  comprar: [
    "mortgage_eligible",
    "condition:new",
    "condition:under_construction",
    "condition:needs_renovation",
    "parking",
    "patio",
    "bbq_area",
    "pool",
    "gated_community",
    "elevator",
  ],
  invertir: [
    "mortgage_eligible",
    "condition:new",
    "condition:under_construction",
    "condition:needs_renovation",
    "parking",
    "patio",
    "bbq_area",
    "pool",
    "gated_community",
    "elevator",
  ],
  alquilar: ["furnished", "condition:new", "parking", "patio", "gated_community", "elevator", "pool", "bbq_area"],
};

/**
 * Unidad del subtítulo del bloque de posición ("30 casas en Capital, 3 dorm."):
 * contra QUÉ se comparó el aviso. Lotes: P3 nunca compara urbano contra rural
 * y parte el rural por servicios declarados.
 */
export const POSITION_UNIT = {
  rent: "alquileres",
  house: "casas",
  apartment: "departamentos",
  land: "lotes",
  land_urban: "lotes urbanos",
  land_rural: "lotes rurales",
  land_rural_services: "lotes rurales con servicios",
  other: "avisos similares",
} as const;

/** Aviso de estimación (C10): va en TODA card y al pie de "Lectura de FINDER". Texto exacto. */
export const ESTIMATE_NOTICE =
  "Valores estimados a partir de avisos publicados, no de operaciones concretadas. Son orientativos.";

/** Aclaración fija del bloque "Esta propiedad · estimación" (Invertir). */
export const ESTIMATE_BLOCK_NOTE =
  "Según alquileres similares publicados en la zona. Rentabilidad = un año de ese alquiler ÷ precio de este aviso.";

/**
 * "Publicado hace X · margen para negociar" (C13): solo cuando
 * `days_on_market` SUPERA el corte — los mismos de vigencia de P3.
 */
export const NEGOTIATION_DAYS: Record<Operation, number> = {
  rent: 60,
  sale: 90,
};

/* ---------------- Lotes (contrato 13/09 §4.4) ---------------- */

export const LAND_CLASS_LABEL: Record<LandClass, string> = {
  urban: "Lote urbano",
  rural: "Lote rural",
};

export const LAND_SERVICE_LABEL: Record<LandService, string> = {
  agua: "agua",
  luz: "luz",
  cloacas: "cloacas",
  gas: "gas",
  pavimento: "pavimento",
};

export const LAND_ZONING_LABEL: Record<LandZoning, string> = {
  residential: "Zonificación residencial",
  commercial: "Zonificación comercial",
  industrial: "Zonificación industrial",
  rural: "Zonificación rural",
  mixed: "Zonificación mixta",
};
