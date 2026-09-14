/**
 * Formateo es-AR según las REGLAS DE DISPLAY de la card (spec §5).
 * Nada se recalcula acá: solo se presenta lo que P3/P2 ya computaron.
 */
import type { Card, Currency, MiniCard, Reason } from "./p2/types";
import { LAND_SERVICE_LABEL, RENTAL_PERIOD_SUFFIX } from "./labels";
import { zoneDisplay } from "./zones";

/**
 * Reasons del rating de precio. P2 real expone `deal_rating_reasons`
 * (verificado contra Swagger 29/08); `deal_reasons` queda como alias.
 * Regla de producto 4: ninguna señal sin su explicación.
 */
export function dealReasons(card: Pick<Card, "deal_rating_reasons" | "deal_reasons">): Reason[] | null {
  return card.deal_rating_reasons ?? card.deal_reasons ?? null;
}

/**
 * Texto "no informado" que a veces llega como string (QA 07/09: "None",
 * "null", "unknown", "nan" visibles en producción). Regla dura: null = no
 * informado → se omite. Devuelve null para cualquiera de esos casos, y el
 * string recortado si es un valor real.
 */
export function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v) return null;
  if (/^(none|null|nil|unknown|undefined|nan|n\/a|-)$/i.test(v)) return null;
  return v;
}

const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

export function fmtInt(n: number): string {
  return nf.format(n);
}

export function fmtPct(n: number, withSign = false): string {
  const sign = withSign && n > 0 ? "+" : "";
  return `${sign}${nf1.format(n)}%`;
}

export function fmtMoney(amount: number, currency: Currency): string {
  const prefix = currency === "USD" ? "US$ " : currency === "EUR" ? "€ " : "$ ";
  return `${prefix}${nf.format(amount)}`;
}

/** Precio principal: SIEMPRE el original del aviso, con sufijo de periodicidad en alquileres. */
export function mainPrice(card: Pick<Card, "price" | "currency" | "operation" | "rental_period">): string {
  const base = fmtMoney(card.price, card.currency);
  if (card.operation !== "rent") return base;
  // null = no informado → asumir mensual (sin comparar entre periodicidades).
  const suffix = card.rental_period ? RENTAL_PERIOD_SUFFIX[card.rental_period] : "/mes";
  return `${base} ${suffix}`;
}

/**
 * Conversión entre paréntesis (T3): `price_usd` cuando el aviso está en ARS;
 * `price_ars` cuando está en USD y P2 la manda (hoy solo en alquileres).
 * Nunca se calcula acá: sin el campo, no hay conversión.
 */
export function secondaryPrice(
  card: Pick<Card, "currency" | "operation" | "price_usd" | "price_ars">,
): string | null {
  if (card.currency === "ARS" && card.price_usd != null) {
    return `≈ US$ ${nf.format(card.price_usd)}`;
  }
  if (card.currency === "USD" && card.price_ars != null) {
    return `≈ $ ${nf.format(card.price_ars)}`;
  }
  return null;
}

/**
 * Precio por m²: en VENTAS de vivienda, `price_per_sqm` (sobre cubierta);
 * en lotes, `price_per_sqm_land` (sobre superficie total) y, si es rural,
 * `price_per_hectare`.
 */
export function pricePerSqm(
  card: Pick<Card, "operation" | "price_per_sqm" | "property_type" | "price_per_sqm_land" | "price_per_hectare">,
): string | null {
  if (card.property_type === "land") {
    if (card.price_per_hectare != null) return `US$ ${nf.format(card.price_per_hectare)}/ha`;
    if (card.price_per_sqm_land != null) return `US$ ${nf1.format(card.price_per_sqm_land)}/m²`;
    return null;
  }
  if (card.operation !== "sale" || card.price_per_sqm == null) return null;
  return `US$ ${nf.format(card.price_per_sqm)}/m²`;
}

export function miniCardPrice(mc: MiniCard): { main: string; secondary: string | null } {
  return {
    main: fmtMoney(mc.price, mc.currency),
    secondary: mc.currency === "ARS" && mc.price_usd != null ? `≈ US$ ${nf.format(mc.price_usd)}` : null,
  };
}

const nfCompact = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });

/**
 * Precio compacto para el marker del mapa ("US$ 65 mil", "$ 154 M").
 * Siempre el precio ORIGINAL del aviso (misma regla que el precio principal);
 * compacto es solo la notación, no una conversión.
 */
export function compactPrice(card: Pick<Card, "price" | "currency">): string {
  const prefix = card.currency === "USD" ? "US$ " : card.currency === "EUR" ? "€ " : "$ ";
  return `${prefix}${nfCompact.format(card.price)}`;
}

/**
 * Nombre de zona para títulos: P2 manda el CÓDIGO ("rawson", "santa_lucia");
 * se resuelve contra el catálogo (`src/lib/zones.ts`) — no es traducción.
 * null → "San Juan" (el mercado).
 */
export function zoneName(zone: string | null | undefined): string {
  return zoneDisplay(clean(zone)) ?? "San Juan";
}

export function fmtDaysOnMarket(days: number): string {
  return days === 1 ? "1 día publicada" : `${nf.format(days)} días publicada`;
}

/**
 * "hace X" humano para las dos fechas de la card (T3): días exactos hasta un
 * mes, después meses/años aproximados — la precisión al día no aporta y
 * "hace 1.622 días" no se lee.
 */
export function fmtAgo(days: number): string {
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 45) return `hace ${days} días`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return months <= 1 ? "hace 1 mes" : `hace ${months} meses`;
  }
  const years = Math.floor(days / 365);
  const rest = Math.round((days - years * 365) / 30);
  const y = years === 1 ? "1 año" : `${years} años`;
  return rest >= 1 && years < 3 ? `hace ${y} y ${rest === 1 ? "1 mes" : `${rest} meses`}` : `hace ${y}`;
}

export function fmtDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

export function fmtKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${nf1.format(km)} km`;
}

/** "2 dorm. · 1 baño · 60 m²" — omite todo null (null = no informado, nunca 0). */
export function specsLine(card: Card): string {
  if (card.property_type === "land") return landSpecsLine(card);
  const parts: string[] = [];
  if (card.rooms != null) parts.push(`${card.rooms} amb.`);
  if (card.bedrooms != null) parts.push(`${card.bedrooms} dorm.`);
  if (card.bathrooms != null) parts.push(card.bathrooms === 1 ? "1 baño" : `${card.bathrooms} baños`);
  if (card.area_sqm != null) parts.push(`${nf.format(card.area_sqm)} m²`);
  if (card.floor != null) parts.push(`piso ${card.floor}`);
  return parts.join(" · ");
}

/** Lotes (T3): m² de lote, medidas si el aviso las da; sin campos de vivienda. */
export function landSpecsLine(card: Card): string {
  const parts: string[] = [];
  if (card.area_sqm != null) {
    parts.push(card.area_sqm >= 10000 ? `${nf1.format(card.area_sqm / 10000)} ha` : `${nf.format(card.area_sqm)} m² de lote`);
  }
  if (card.frontage_m != null && card.depth_m != null) {
    parts.push(`${nf1.format(card.frontage_m)} × ${nf1.format(card.depth_m)} m`);
  } else if (card.frontage_m != null) {
    parts.push(`${nf1.format(card.frontage_m)} m de frente`);
  }
  return parts.join(" · ");
}

/** Servicios declarados del lote ("Con servicios: agua, luz"); SOLO con `land_services === true`. */
export function landServicesLabel(card: Pick<Card, "land_services" | "land_services_detail">): string | null {
  if (card.land_services !== true) return null;
  const detail = (card.land_services_detail ?? []).map((s) => LAND_SERVICE_LABEL[s] ?? s).filter(Boolean);
  return detail.length ? `Con servicios: ${detail.join(", ")}` : "Con servicios";
}

/** Para habitaciones: las camas son el mínimo de visibilidad, no los metros. */
export function roomSpecsLine(card: Card): string {
  const parts: string[] = [];
  if (card.beds != null) parts.push(card.beds === 1 ? "1 cama" : `${card.beds} camas`);
  if (card.double_bed === true) parts.push("cama matrimonial");
  if (card.private_bathroom === true) parts.push("baño privado");
  if (card.area_sqm != null) parts.push(`${nf.format(card.area_sqm)} m²`);
  return parts.join(" · ");
}
