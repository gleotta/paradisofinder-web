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
  apartment: "Appartamento",
  // Contrato 13/09 §4.4: la etiqueta de `land` es "Lote".
  land: "Terreno",
  office: "Ufficio",
  retail: "Locale commerciale",
  villa: "Villa",
  garage: "Box",
  warehouse: "Capannone",
  room: "Stanza",
  studio: "Monolocale",
  attic: "Attico",
  penthouse: "Attico",
  other: "Immobile",
};

export const OPERATION_LABEL: Record<Operation, string> = {
  sale: "Vendita",
  rent: "Affitto",
};

/** `unknown` no se muestra. */
export const CONDITION_LABEL: Record<Exclude<Condition, "unknown">, string> = {
  new: "Nuova costruzione",
  excellent: "Ottimo stato",
  good: "Buono stato",
  needs_renovation: "Da ristrutturare",
  under_construction: "In costruzione",
};

export const PUBLISHER_LABEL: Record<Publisher, string> = {
  agency: "Agenzia",
  owner: "Privato",
};

/** Sufijo del precio en alquileres; null = no informado → se asume mensual. */
export const RENTAL_PERIOD_SUFFIX: Record<RentalPeriod, string> = {
  day: "/giorno",
  week: "/settimana",
  month: "/mese",
};

export const ROOM_CLASS_LABEL: Record<RoomClass, string> = {
  single: "Singola",
  single_double_bed: "Singola con letto matrimoniale",
  double: "Doppia",
  triple_plus: "Tripla o più",
};

export const RATING_LABEL = {
  deal_rating: "Prezzo",
  resale_investment_rating: "Investimento: rivendita",
  rental_investment_rating: "Investimento: rendita",
} as const;

/**
 * Etiqueta visible de los valores NO cromáticos de `deal_rating` (contrato
 * 13/09 §4.1, sugeridas por P2): el chip dice esto en vez de "Precio".
 */
export const DEAL_RATING_LABEL: Record<Exclude<DealRating, RatingColor>, string> = {
  verify_data: "Dati da verificare",
  outdated: "Non aggiornato",
};

/** Etiquetas de antigüedad (§4.2): visibles en la card, nunca como "malo". */
export const AGE_FLAG_LABEL: Record<AgeFlag, string> = {
  old: "Annuncio datato",
  very_old: "In catalogo da più di un anno",
};

export const LISTING_STATUS_LABEL: Partial<Record<ListingStatus, string>> = {
  stale: "Non aggiornato",
};

/** Vocabulario público del request (spec §5 — "Request"). */
export const REQUEST_VERTICAL_LABEL: Record<string, string> = {
  sale: "Vendita",
  rent: "Affitto",
  investment: "Investimento",
  temporary_rent: "Affitto breve",
  land: "Terreni in vendita",
};

export const ORDER_LABEL: Record<string, string> = {
  opportunity_score: "Più rilevanti",
  price_asc: "Prezzo crescente",
  price_desc: "Prezzo decrescente",
  price_per_sqm_asc: "Prezzo al m²",
  valuation_gap_desc: "Più sotto il prezzo di zona",
  price_percentile_asc: "Prezzo basso per la zona",
  gross_yield_desc: "Rendita stimata più alta",
  days_on_market_desc: "Da più tempo in catalogo",
  distance_asc: "Vicinanza",
};

/** Chips de atributos (solo si vienen informados en true). */
export const ATTRIBUTE_LABEL = {
  pool: "Piscina",
  bbq_area: "Barbecue",
  patio: "Giardino",
  furnished: "Arredato",
  parking: "Box o posto auto",
  gated_community: "Comprensorio privato",
  mortgage_eligible: "Mutuabile",
  elevator: "Ascensore",
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
/**
 * "Avisos similares" del detalle (decisión de German, 03/10): a la vista van
 * las 5 de superficie más parecida, con la propiedad intercalada en su lugar
 * por precio; el resto, detrás de "Ver los N similares".
 */
export const SIMILARS_VISIBLE = 5;

/** Etiqueta de la fila propia entre los similares ("Esta casa"). */
export const SELF_LABEL: Partial<Record<PropertyType, string>> = {
  house: "Questa casa",
  apartment: "Questo appartamento",
  land: "Questo terreno",
  villa: "Questa villa",
  room: "Questa stanza",
  studio: "Questo monolocale",
  office: "Questo ufficio",
  retail: "Questo locale",
  garage: "Questo box",
  warehouse: "Questo capannone",
  penthouse: "Questo attico",
  attic: "Questo attico",
};
export const SELF_LABEL_DEFAULT = "Questo immobile";

export const POSITION_UNIT = {
  rent: "affitti",
  house: "case",
  apartment: "appartamenti",
  land: "terreni",
  land_urban: "terreni edificabili",
  land_rural: "terreni agricoli",
  land_rural_services: "terreni agricoli con servizi",
  other: "annunci simili",
} as const;

/** Aviso de estimación (C10): va en TODA card y al pie de "Lectura de FINDER". Texto exacto. */
export const ESTIMATE_NOTICE =
  "Valori stimati a partire dagli annunci pubblicati, non da compravendite concluse. Sono indicativi.";

/** Aclaración fija del bloque "Esta propiedad · estimación" (Invertir). */
export const ESTIMATE_BLOCK_NOTE =
  "Secondo affitti simili pubblicati nella zona. Rendimento = un anno di quell'affitto ÷ prezzo di questo annuncio.";

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
  urban: "Terreno edificabile",
  rural: "Terreno agricolo",
};

export const LAND_SERVICE_LABEL: Record<LandService, string> = {
  agua: "acqua",
  luz: "luce",
  cloacas: "fognatura",
  gas: "gas",
  pavimento: "strada asfaltata",
};

export const LAND_ZONING_LABEL: Record<LandZoning, string> = {
  residential: "Zona residenziale",
  commercial: "Zona commerciale",
  industrial: "Zona industriale",
  rural: "Zona agricola",
  mixed: "Zona mista",
};
