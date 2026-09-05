/**
 * Formateo es-AR según las REGLAS DE DISPLAY de la card (spec §5).
 * Nada se recalcula acá: solo se presenta lo que P3/P2 ya computaron.
 */
import type { Card, Currency, MiniCard, Reason } from "./p2/types";
import { RENTAL_PERIOD_SUFFIX } from "./labels";

/**
 * Reasons del rating de precio. P2 real expone `deal_rating_reasons`
 * (verificado contra Swagger 29/08); `deal_reasons` queda como alias.
 * Regla de producto 4: ninguna señal sin su explicación.
 */
export function dealReasons(card: Pick<Card, "deal_rating_reasons" | "deal_reasons">): Reason[] | null {
  return card.deal_rating_reasons ?? card.deal_reasons ?? null;
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
 * Referencia secundaria: `price_usd` cuando el aviso está en ARS;
 * `price_ars` SOLO en alquileres publicados en USD.
 */
export function secondaryPrice(
  card: Pick<Card, "currency" | "operation" | "price_usd" | "price_ars">,
): string | null {
  if (card.currency === "ARS" && card.price_usd != null) {
    return `≈ US$ ${nf.format(card.price_usd)}`;
  }
  if (card.operation === "rent" && card.currency === "USD" && card.price_ars != null) {
    return `≈ $ ${nf.format(card.price_ars)}`;
  }
  return null;
}

/** Solo en VENTAS (regla de display). */
export function pricePerSqm(card: Pick<Card, "operation" | "price_per_sqm">): string | null {
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
 * Nombre de zona para títulos: P2 manda el código en minúsculas ("rawson",
 * "villa krause"); acá solo se capitaliza cada palabra — no es traducción.
 * null → "San Juan" (el mercado).
 */
export function zoneName(zone: string | null | undefined): string {
  if (!zone) return "San Juan";
  return zone
    .split(/\s+/)
    .map((w) => (w.length > 2 || w === zone ? w.charAt(0).toLocaleUpperCase("es-AR") + w.slice(1) : w))
    .join(" ");
}

export function fmtDaysOnMarket(days: number): string {
  return days === 1 ? "1 día publicada" : `${nf.format(days)} días publicada`;
}

export function fmtDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

/** "2 dorm. · 1 baño · 60 m²" — omite todo null (null = no informado, nunca 0). */
export function specsLine(card: Card): string {
  const parts: string[] = [];
  if (card.rooms != null) parts.push(`${card.rooms} amb.`);
  if (card.bedrooms != null) parts.push(`${card.bedrooms} dorm.`);
  if (card.bathrooms != null) parts.push(card.bathrooms === 1 ? "1 baño" : `${card.bathrooms} baños`);
  if (card.area_sqm != null) parts.push(`${nf.format(card.area_sqm)} m²`);
  if (card.floor != null) parts.push(`piso ${card.floor}`);
  return parts.join(" · ");
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
