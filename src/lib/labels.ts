/**
 * Etiquetas es-AR para los CÓDIGOS estables del contrato (claves en inglés).
 * Esto NO traduce textos de P3 (esos se muestran tal cual): mapea códigos → UI,
 * igual que la spec pide "Inmobiliaria"/"Dueño directo" para `publisher`.
 */
import type {
  Condition,
  Operation,
  PropertyType,
  Publisher,
  RentalPeriod,
  RoomClass,
} from "./p2/types";

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  house: "Casa",
  apartment: "Departamento",
  land: "Terreno",
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

/** Vocabulario público del request (spec §5 — "Request"). */
export const REQUEST_VERTICAL_LABEL: Record<string, string> = {
  sale: "Venta",
  rent: "Alquiler",
  investment: "Inversión",
  temporary_rent: "Alquiler temporario",
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
