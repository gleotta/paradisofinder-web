/**
 * Formateo es-AR según las REGLAS DE DISPLAY de la card (spec §5).
 * Nada se recalcula acá: solo se presenta lo que P3/P2 ya computaron.
 */
import type { Card, ComparablesPool, Currency, MiniCard, PriceTrend, Reason, ZoneTrend } from "./p2/types";
import {
  ATTRIBUTE_LABEL,
  CHIP_ORDER,
  CONDITION_CHIP_LABEL,
  LAND_SERVICE_LABEL,
  LAND_ZONING_LABEL,
  NEGOTIATION_DAYS,
  POSITION_UNIT,
  PROPERTY_TYPE_LABEL,
  RENTAL_PERIOD_SUFFIX,
  ROOM_CLASS_LABEL,
  type CardVertical,
} from "./labels";
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

/** Prefijo por moneda. Sin moneda informada (el Swagger la admite null en comparables) va el número solo. */
export function fmtMoney(amount: number, currency: Currency | null | undefined): string {
  const prefix = currency === "USD" ? "US$ " : currency === "EUR" ? "€ " : currency === "ARS" ? "$ " : "";
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

/** Rótulo corto del m² medido sobre la superficie total (el aviso no publica la cubierta). */
const TOTAL_BASIS_SUFFIX = " total";

/**
 * Precio por m²: en VENTAS de vivienda, `price_per_sqm` (sobre cubierta);
 * en lotes, `price_per_sqm_land` (sobre superficie total) y, si es rural,
 * `price_per_hectare`. Un departamento medido sobre la total
 * (`total_area_basis`, P2 04/10) lleva el m² rotulado: "/m² total" en la
 * card, "sobre superficie total" en el detalle (`long`).
 */
export function pricePerSqm(
  card: Pick<Card, "operation" | "price_per_sqm" | "property_type" | "price_per_sqm_land" | "price_per_hectare" | "total_area_basis">,
  { long = false }: { long?: boolean } = {},
): string | null {
  if (card.property_type === "land") {
    if (card.price_per_hectare != null) return `US$ ${nf.format(card.price_per_hectare)}/ha`;
    if (card.price_per_sqm_land != null) {
      // El decimal solo aporta en valores chicos ("US$ 2,3/m²").
      const v = card.price_per_sqm_land;
      return `US$ ${(v >= 10 ? nf : nf1).format(v)}/m²`;
    }
    return null;
  }
  if (card.operation !== "sale" || card.price_per_sqm == null) return null;
  const basis = card.total_area_basis === true ? (long ? " sobre superficie total" : TOTAL_BASIS_SUFFIX) : "";
  return `US$ ${nf.format(card.price_per_sqm)}/m²${basis}`;
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

/**
 * Superficie informada: P2 todavía manda `area_sqm: 0` cuando el aviso no la
 * trae (pedido 29/09 §3.3.3, 0 → null); una superficie de 0 m² no es un dato.
 */
function hasArea(v: number | null | undefined): v is number {
  return v != null && v > 0;
}

/**
 * "3 dorm. · 2 baños · 250 m² cub. · 502 m² lote" — omite todo null (null =
 * no informado, nunca 0). Con cubierta informada va primero ("cub."); la
 * total solo si es otra cifra, y en casas es el lote.
 */
export function specsLine(card: Card): string {
  if (card.property_type === "land") return landSpecsLine(card);
  const parts: string[] = [];
  if (card.rooms != null) parts.push(`${card.rooms} amb.`);
  if (card.bedrooms != null) parts.push(`${card.bedrooms} dorm.`);
  if (card.bathrooms != null) parts.push(card.bathrooms === 1 ? "1 baño" : `${card.bathrooms} baños`);
  const covered = hasArea(card.covered_area_sqm) ? card.covered_area_sqm : null;
  if (covered != null) parts.push(`${nf.format(covered)} m² cub.`);
  if (hasArea(card.area_sqm) && card.area_sqm !== covered) {
    const lot = covered != null && card.property_type === "house";
    parts.push(`${nf.format(card.area_sqm)} m²${lot ? " lote" : ""}`);
  }
  if (card.floor != null) parts.push(`piso ${card.floor}`);
  return parts.join(" · ");
}

/** Lotes (T3): m² de lote, medidas si el aviso las da; sin campos de vivienda. */
export function landSpecsLine(card: Card): string {
  const parts: string[] = [];
  if (hasArea(card.area_sqm)) {
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
  if (hasArea(card.area_sqm)) parts.push(`${nf.format(card.area_sqm)} m²`);
  return parts.join(" · ");
}

/* ------------------------------------------------------------------ */
/* Cards por vertical (guía 29/09 §2.3)                                */
/* Todo es PRESENTACIÓN de campos que llegan: ningún indicador ni      */
/* umbral se calcula acá. Sin el campo, la función devuelve null y la  */
/* ranura queda vacía.                                                 */
/* ------------------------------------------------------------------ */

const NBSP = " ";

/** "33 %": entero y sin signo (el sentido lo dice la frase que lo acompaña). */
export function fmtPctRound(n: number): string {
  return `${Math.round(Math.abs(n))}${NBSP}%`;
}

/** "2,4 %": un decimal y sin signo. */
export function fmtPctAbs(n: number): string {
  return `${nf1.format(Math.abs(n))}${NBSP}%`;
}

/**
 * Layout de la card. El aviso manda sobre el selector: un lote siempre es
 * Lotes y un alquiler siempre es Alquilar (en "Podrían interesarte" pueden
 * venir mezclados); una venta de vivienda es Invertir solo si esa es la
 * vertical vigente.
 */
export function cardVertical(
  card: Pick<Card, "operation" | "property_type">,
  vertical?: string | null,
): CardVertical {
  if (card.property_type === "land") return "lotes";
  if (card.operation === "rent") return "alquilar";
  return vertical === "invertir" ? "invertir" : "comprar";
}

function positionUnit(card: Pick<Card, "operation" | "property_type" | "land_class" | "land_services">): string {
  if (card.property_type === "land") {
    if (card.land_class === "urban") return POSITION_UNIT.land_urban;
    if (card.land_class === "rural") {
      return card.land_services === true ? POSITION_UNIT.land_rural_services : POSITION_UNIT.land_rural;
    }
    return POSITION_UNIT.land;
  }
  if (card.operation === "rent") return POSITION_UNIT.rent;
  if (card.property_type === "house") return POSITION_UNIT.house;
  if (card.property_type === "apartment") return POSITION_UNIT.apartment;
  return POSITION_UNIT.other;
}

export interface PositionInfo {
  /** "33 %" · "35 %+" cuando P2 avisa que la diferencia real es mayor (`valuation_gap_capped`). */
  pct: string;
  /** "por debajo de similares" · "por encima · en línea con la zona" · "por debajo · verificar el aviso" · … */
  head: string;
  /** "30 casas en Capital, 3 dorm." */
  sub: string;
  /** Solo con `deal_rating: verify_data`. */
  note: string | null;
  /** Verde SOLO con `deal_rating: green` (lo decide P3; acá no se mira el porcentaje). */
  green: boolean;
  /** 0 = el más barato de sus similares, 100 = el más caro; null = sin barra. */
  percentile: number | null;
}

/**
 * Bloque de posición contra similares — la única comparación de la card (C3).
 * `valuation_gap_pct` > 0 = el aviso está por DEBAJO de sus similares.
 *
 * "verificar el aviso" es el rating `verify_data`, NO el flag `capped`
 * (respuesta de P2 30/09): un alquiler más de 35 % por encima de similares
 * llega acotado (gap −35, `capped: true`) con `deal_rating: red` — es un
 * aviso caro, no un dato dudoso — y la card lo muestra "35 %+ por encima de
 * similares", en neutro como todo lo que no es verde (C1).
 */
export function positionInfo(
  card: Pick<
    Card,
    | "valuation_gap_pct"
    | "valuation_gap_capped"
    | "deal_rating"
    | "price_percentile"
    | "comparables_count"
    | "zone"
    | "bedrooms"
    | "operation"
    | "property_type"
    | "land_class"
    | "land_services"
    | "comparables_by_area_only"
  >,
): PositionInfo | null {
  const gap = card.valuation_gap_pct;
  if (gap == null || !Number.isFinite(gap)) return null;
  const capped = card.valuation_gap_capped === true;
  const verify = card.deal_rating === "verify_data";
  const pct = fmtPctRound(gap);
  const side = Math.round(Math.abs(gap)) === 0 ? null : gap > 0 ? "por debajo" : "por encima";

  let head: string;
  if (verify) head = side ? `${side} · verificar el aviso` : "verificar el aviso";
  else if (!side) head = "en línea con la zona";
  // Umbral de presentación, no de indicador: solo cambia la frase.
  else if (Math.abs(gap) < 10) head = `${side} · en línea con la zona`;
  else head = `${side} de similares`;

  const unit = poolUnit(card);
  const where = poolWhere(card);
  const sub =
    card.comparables_count != null
      ? `${nf.format(card.comparables_count)} ${unit} ${where}`
      : `${unit[0].toUpperCase()}${unit.slice(1)} ${where}`;

  const p = card.price_percentile;
  return {
    pct: capped ? `${pct}+` : pct,
    head,
    sub,
    note: verify ? "diferencia muy grande con similares: conviene verificar el aviso" : null,
    green: card.deal_rating === "green",
    percentile: p != null && Number.isFinite(p) ? Math.max(0, Math.min(100, p)) : null,
  };
}

/**
 * ¿El conjunto de similares de P3 se arma por dormitorios? Sí en alquiler de
 * vivienda (dormitorios exactos) y en departamentos en venta (mismo tramo);
 * NO en casas en venta ni en lotes, donde manda la banda de superficie
 * (`_select_comparables` de P3; verificado el 03/10: entre las 30 casas
 * similares de una casa de 3 dormitorios hay casas de 1 y 2). Decir
 * ", 3 dorm." ahí sería falso. Tampoco cuando el aviso no publica
 * dormitorios y el conjunto se armó por superficie sola
 * (`comparables_by_area_only`, P2 04/10): ahí hay de todos.
 */
function poolByBedrooms(card: Pick<Card, "operation" | "property_type" | "comparables_by_area_only">): boolean {
  if (card.property_type === "land" || card.property_type === "room") return false;
  if (card.comparables_by_area_only === true) return false;
  return card.operation === "rent" || card.property_type === "apartment";
}

/** "en Rawson" · "en Capital, 2 dorm." (los dormitorios solo cuando el conjunto los exige). */
function poolWhere(card: Pick<Card, "zone" | "bedrooms" | "operation" | "property_type" | "comparables_by_area_only">): string {
  const dorm = poolByBedrooms(card) && card.bedrooms ? `, ${card.bedrooms} dorm.` : "";
  return `en ${zoneName(card.zone)}${dorm}`;
}

/**
 * "departamentos" · "departamentos de superficie similar" cuando el conjunto
 * se armó por superficie sola (`comparables_by_area_only`): es lo que P2/P3
 * sugieren decir ("avisos similares en superficie"), con la unidad de la card.
 */
function poolUnit(
  card: Pick<Card, "operation" | "property_type" | "land_class" | "land_services" | "comparables_by_area_only">,
): string {
  const unit = positionUnit(card);
  if (card.comparables_by_area_only !== true) return unit;
  return `${unit === POSITION_UNIT.other ? "avisos" : unit} de superficie similar`;
}

/** Motivos de P2/P3 que explican por qué un aviso no tiene comparación de precio. */
const NO_POSITION_CODES = new Set(["sin_superficie_cubierta", "pocos_comparables", "sin_comparables", "atipico", "sin_datos"]);

/**
 * Por qué la card no tiene bloque de posición (03/10, German: "hay cards que
 * no muestran el porcentaje contra similares"): el motivo que mandan P2/P3
 * en `deal_rating_reasons` ("Sin superficie cubierta: no se puede comparar
 * el precio por m²", "Hay menos de 5 avisos similares en la zona…"), tal
 * cual. Solo cuando no hay gap; sin motivo conocido, nada.
 */
export function positionMissingReason(card: Pick<Card, "valuation_gap_pct" | "deal_rating_reasons" | "deal_reasons">): string | null {
  if (card.valuation_gap_pct != null) return null;
  const reason = (dealReasons(card) ?? []).find((r) => NO_POSITION_CODES.has(r.code) && clean(r.text));
  return reason ? clean(reason.text) : null;
}

/**
 * Misma lectura del gap en una frase, para el detalle: el número con signo
 * solo ("+15%") no dice si el aviso está por debajo o por encima.
 */
export function positionPhrase(card: Parameters<typeof positionInfo>[0]): string | null {
  const info = positionInfo(card);
  return info ? `${info.pct} ${info.head}` : null;
}

/**
 * Ficha de un comparable del detalle: "Casa · 3 dorm. · 80 m² cub. · US$ 375/m²".
 * `price_per_sqm` ya viene de P2 sobre la base con que se compara (cubierta en
 * vivienda — la total en un departamento sin cubierta —, total en lotes). La
 * zona solo si no es la del aviso: el conjunto puede ampliarse a zonas vecinas
 * (`comparables_pool.scope`). null = no informado → se omite (nunca "0 m²").
 */
export function miniCardMeta(mc: MiniCard, propertyZone: string | null, { withSqm = true }: { withSqm?: boolean } = {}): string {
  const parts: string[] = [];
  const type = mc.property_type ? PROPERTY_TYPE_LABEL[mc.property_type] : null;
  if (type) parts.push(type);
  const zone = clean(mc.zone);
  if (zone && zone !== propertyZone) parts.push(zoneName(zone));
  if (mc.property_type === "land") {
    if (hasArea(mc.area_sqm)) {
      parts.push(mc.area_sqm >= 10000 ? `${nf1.format(mc.area_sqm / 10000)} ha` : `${nf.format(mc.area_sqm)} m² de lote`);
    }
  } else {
    if (mc.bedrooms != null) parts.push(`${mc.bedrooms} dorm.`);
    if (hasArea(mc.covered_area_sqm)) {
      parts.push(`${nf.format(mc.covered_area_sqm)} m² cub.`);
      // En casas, el lote cuando es más grande que la cubierta (misma lectura que la ficha de la card).
      if (mc.property_type === "house" && hasArea(mc.area_sqm) && mc.area_sqm > mc.covered_area_sqm) parts.push(`${nf.format(mc.area_sqm)} m² lote`);
    } else if (hasArea(mc.area_sqm)) parts.push(`${nf.format(mc.area_sqm)} m²`);
  }
  if (withSqm) {
    const sqm = miniCardSqm(mc);
    if (sqm) parts.push(sqm);
  }
  return parts.join(" · ");
}

/**
 * "US$ 375/m²" del similar (base de P2: cubierta en vivienda, total en lotes);
 * null sin dato. En vivienda, un similar sin cubierta y con total se midió
 * sobre la total (contrato 04/10 §4.7): se rotula igual que en la card, para
 * no mezclar en la lista dos m² distintos sin decirlo.
 */
export function miniCardSqm(
  mc: Pick<MiniCard, "price_per_sqm"> & Partial<Pick<MiniCard, "property_type" | "covered_area_sqm" | "area_sqm">>,
): string | null {
  if (mc.price_per_sqm == null || !Number.isFinite(mc.price_per_sqm)) return null;
  const totalBasis = mc.property_type !== "land" && !hasArea(mc.covered_area_sqm) && hasArea(mc.area_sqm);
  return `US$ ${(mc.price_per_sqm >= 10 ? nf : nf1).format(mc.price_per_sqm)}/m²${totalBasis ? TOTAL_BASIS_SUFFIX : ""}`;
}

export interface ComparablesPoolInfo {
  /**
   * "Comparado con 80 alquileres similares en Capital, 3 dorm."; null cuando el
   * aviso no tiene comparación (conjunto de 1 a 4: se lista igual y en su
   * lugar va el motivo de P2).
   */
  summary: string | null;
  /** "30 a la vista · los otros 50 no se muestran porque no publican foto o superficie"; null si se muestran todos. */
  hidden: string | null;
}

/**
 * Cabecera de "Avisos similares" del detalle (respuesta de P2 30/09-01/10
 * §3.3.4): el conjunto con el que P3 midió el precio, hasta dónde hubo que
 * ampliar la zona (`scope`) y cuántos del conjunto no se muestran (tier 0:
 * sin foto o sin superficie; en alquiler, casi la mitad). Sin `pool`, nada.
 *
 * P2 04/10: "Comparado con…" solo si hubo comparación (`valuation_gap_pct`).
 * Un conjunto de 1 a 4 se lista igual pero no alcanza para comparar: sin
 * resumen acá, la cabecera es el motivo de P2 (`positionMissingReason`). Y el
 * conjunto armado por superficie sola (`comparables_by_area_only`) se dice
 * así, sin dormitorios: hay de todos.
 */
export function comparablesPoolInfo(
  pool: ComparablesPool | null | undefined,
  card: Pick<
    Card,
    | "zone"
    | "bedrooms"
    | "operation"
    | "property_type"
    | "land_class"
    | "land_services"
    | "valuation_gap_pct"
    | "comparables_by_area_only"
  >,
): ComparablesPoolInfo | null {
  if (!pool || !(pool.count > 0)) return null;
  const byArea = card.comparables_by_area_only === true;
  // "80 alquileres similares" · "30 casas similares" · "4 lotes rurales similares con servicios" (como lo dice P2).
  const unit = byArea
    ? poolUnit(card)
    : positionUnit(card).replace(/^(lotes rurales)( con servicios)?$/, "$1 similares$2").replace(/^(?!.*similares).*$/, (u) => `${u} similares`);
  const zone = zoneName(card.zone);
  const dorm = byArea ? ", con cualquier cantidad de dormitorios" : poolByBedrooms(card) && card.bedrooms ? `, ${card.bedrooms} dorm.` : "";
  const where =
    pool.scope === "adjacent_zones" ? `en ${zone} y zonas vecinas` : pool.scope === "macro_zone" ? `en ${zone} y alrededores` : `en ${zone}`;
  const summary = card.valuation_gap_pct != null ? `Comparado con ${nf.format(pool.count)} ${unit} ${where}${dorm}` : null;
  const notListed = pool.not_listed > 0 ? pool.not_listed : 0;
  const hidden =
    notListed > 0
      ? `${nf.format(pool.listed)} a la vista · ${notListed === 1 ? "el otro no se muestra porque no publica" : `los otros ${nf.format(notListed)} no se muestran porque no publican`} foto o superficie`
      : null;
  return { summary, hidden };
}

/**
 * Cuáles similares van a la vista (decisión de German, 03/10): las N de
 * superficie más parecida a la de la propiedad — el mismo criterio con el
 * que P3 recorta su conjunto a 30 —, mostradas por precio. Base: cubierta en
 * vivienda (la total si el aviso no publica cubierta: es la base con que P3
 * mide a ese departamento, P2 04/10), total en lotes. Sin superficie en la
 * propiedad, las N de precio más cercano. Empates: precio más cercano
 * y después el id, así la selección no depende del orden de llegada.
 * `all` queda ordenada por precio en USD (los sin precio al final).
 */
export function pickSimilars<T extends MiniCard>(
  comparables: T[],
  property: Pick<Card, "property_type" | "covered_area_sqm" | "area_sqm" | "price_usd">,
  n: number,
): { shown: T[]; all: T[] } {
  const land = property.property_type === "land";
  const base = (c: Pick<MiniCard, "area_sqm" | "covered_area_sqm">) => (land ? c.area_sqm : (c.covered_area_sqm ?? c.area_sqm)) ?? null;
  const target = base(property);
  const price = property.price_usd ?? null;
  const priceGap = (c: MiniCard) => (price != null && c.price_usd != null ? Math.abs(c.price_usd - price) : Number.POSITIVE_INFINITY);
  const closeness = (c: MiniCard) => {
    const b = base(c);
    return target != null && b != null ? Math.abs(b - target) : Number.POSITIVE_INFINITY;
  };
  const byPrice = (a: MiniCard, b: MiniCard) =>
    (a.price_usd ?? Number.POSITIVE_INFINITY) - (b.price_usd ?? Number.POSITIVE_INFINITY) || String(a.id).localeCompare(String(b.id));
  const all = [...comparables].sort(byPrice);
  const shown = [...comparables]
    .sort((a, b) => closeness(a) - closeness(b) || priceGap(a) - priceGap(b) || String(a.id).localeCompare(String(b.id)))
    .slice(0, Math.max(0, n))
    .sort(byPrice);
  return { shown, all };
}

/**
 * Dónde cae la propiedad entre sus similares, ordenados por precio: el índice
 * del primero más caro (ahí se intercala "Esta casa"). Sin precio, al final.
 */
export function selfIndexByPrice(sorted: Pick<MiniCard, "price_usd">[], priceUsd: number | null | undefined): number {
  if (priceUsd == null) return sorted.length;
  const i = sorted.findIndex((c) => c.price_usd != null && c.price_usd > priceUsd);
  return i === -1 ? sorted.length : i;
}

/**
 * Tira de precios de "Avisos similares": la posición de cada precio entre el
 * mínimo y el máximo del conjunto (y la propiedad), en porcentaje. Es la
 * misma información que el percentil, dibujada: ningún cálculo nuevo.
 */
export function priceStrip(
  comparables: Pick<MiniCard, "id" | "price_usd">[],
  propertyPriceUsd: number | null | undefined,
): { min: number; max: number; x: (v: number) => number } | null {
  const prices = comparables.map((c) => c.price_usd).filter((v): v is number => v != null && Number.isFinite(v));
  if (propertyPriceUsd != null) prices.push(propertyPriceUsd);
  if (prices.length < 2) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const x = (v: number) => (max === min ? 50 : Math.round(((v - min) / (max - min)) * 1000) / 10);
  return { min, max, x };
}

/**
 * Posición entre similares en una frase, para el detalle: el percentil solo
 * ("P28") es jerga. Misma lectura que el componente `price_position` de P2:
 * p < 50 → más barato que el (100 − p) %; 50 → en el medio; p > 50 → más
 * caro que el p %. Es presentación del mismo número, no otro indicador.
 */
export function percentilePhrase(percentile: number | null | undefined): string | null {
  if (percentile == null || !Number.isFinite(percentile)) return null;
  const p = Math.max(0, Math.min(100, Math.round(percentile)));
  if (p < 50) return `Más barato que el ${100 - p}${NBSP}% de los similares`;
  if (p === 50) return "En el medio de los similares";
  return `Más caro que el ${p}${NBSP}% de los similares`;
}

/**
 * Flecha de tendencia del aviso: la marca P3 (en dólares), acá solo se arma
 * el texto. "antes" va en la moneda del aviso y solo en la baja.
 */
export function priceTrendInfo(
  card: Pick<Card, "price_trend" | "price_change_pct" | "previous_price" | "currency">,
): { dir: PriceTrend; label: string } | null {
  const dir = card.price_trend;
  if (dir !== "up" && dir !== "down") return null;
  const pct = card.price_change_pct != null ? ` ${fmtPctRound(card.price_change_pct)}` : "";
  if (dir === "up") return { dir, label: `En alta${pct}` };
  const before = card.previous_price != null ? ` · antes ${fmtMoney(card.previous_price, card.currency)}` : "";
  return { dir, label: `En baja${pct}${before}` };
}

export interface ZoneRefInfo {
  /** "Zona · Capital" */
  title: string;
  /** "m² US$ 857" · "ha US$ 30.000"; null si la celda no trae el valor de esta clase. */
  value: string | null;
  /** La celda es de un nivel superior (`fallback`): "(zona ampliada)". */
  widened: boolean;
  /** Verde SOLO con la zona en suba. */
  green: boolean;
  trend: { dir: ZoneTrend; label: string } | null;
  /** Solo Invertir: "Rentabilidad promedio de la zona: 7,8 % anual". */
  yieldLine: string | null;
}

/**
 * Bloque Zona (Comprar, Lotes, Invertir): referencia de la zona para el mismo
 * tipo y dormitorios, SIN porcentaje contra el aviso. En Alquilar no va.
 *
 * Fuente: `zone_ref` (pedido a P2 del 29/09). En lotes, mientras no llegue,
 * la celda que el contrato del 13/09 ya manda (`zone_stats_ref`): mismos
 * valores, sin tendencia.
 */
export function zoneRefInfo(
  card: Pick<Card, "zone_ref" | "zone_stats_ref" | "property_type" | "land_class" | "zone">,
  vertical: CardVertical,
): ZoneRefInfo | null {
  if (vertical === "alquilar") return null;
  const isLand = card.property_type === "land";
  const z = card.zone_ref ?? null;
  const cell = z ?? (isLand ? (card.zone_stats_ref ?? null) : null);
  if (!cell) return null;
  const rural = isLand && card.land_class === "rural";
  const median = rural ? cell.median_price_per_hectare : cell.median_price_per_sqm;
  // El decimal solo aporta en valores chicos (m² de lote por debajo de US$ 10).
  const value = median != null ? `${rural ? "ha" : "m²"} US$ ${(median >= 10 ? nf : nf1).format(median)}` : null;
  const yieldLine =
    vertical === "invertir" && z?.cap_pct != null
      ? `Rentabilidad promedio de la zona: ${fmtPctAbs(z.cap_pct)} anual`
      : null;
  if (!value && !yieldLine) return null;

  let trend: ZoneRefInfo["trend"] = null;
  if (z?.trend === "flat") trend = { dir: "flat", label: "Estable" };
  else if (z?.trend === "up" || z?.trend === "down") {
    const pct = z.trend_pct != null ? ` ${fmtPctAbs(z.trend_pct)}` : "";
    trend = { dir: z.trend, label: `${z.trend === "up" ? "En suba" : "En baja"}${pct}` };
  }

  return {
    title: `Zona · ${zoneName(clean(z?.zone) ?? card.zone)}`,
    value,
    widened: cell.fallback != null,
    green: z?.trend === "up",
    trend,
    yieldLine,
  };
}

/** Bloque "Esta propiedad · estimación" (Invertir): las dos líneas, o null sin ninguno de los dos campos. */
export function estimateInfo(
  card: Pick<Card, "gross_yield_pct" | "estimated_monthly_rent">,
): { yieldLine: string | null; rentLine: string | null } | null {
  const yieldLine = card.gross_yield_pct != null ? `Rentabilidad anual estimada ${fmtPctAbs(card.gross_yield_pct)}` : null;
  const rentLine =
    card.estimated_monthly_rent != null ? `Podría alquilarse a ≈ US$ ${nf.format(card.estimated_monthly_rent)}/mes` : null;
  return yieldLine || rentLine ? { yieldLine, rentLine } : null;
}

/**
 * Fechas de la card (C13): "Actualizado hace Y" siempre; "publicado hace X ·
 * margen para negociar" solo cuando `days_on_market` supera el corte de la
 * operación. Sin fecha de actualización queda la de publicación.
 */
export function cardDates(
  card: Pick<Card, "days_on_market" | "days_since_update" | "operation">,
): { text: string; negotiate: boolean } | null {
  const published = card.days_on_market;
  const negotiate = published != null && published > NEGOTIATION_DAYS[card.operation];
  if (card.days_since_update != null) {
    const updated = `Actualizado ${fmtAgo(card.days_since_update)}`;
    return {
      text: negotiate ? `${updated} · publicado ${fmtAgo(published!)} · margen para negociar` : updated,
      negotiate,
    };
  }
  if (published == null) return null;
  return { text: `Publicado ${fmtAgo(published)}${negotiate ? " · margen para negociar" : ""}`, negotiate };
}

export interface CardChip {
  label: string;
  /** Tag del LLM (`semantic_qualities`), no un dato duro. */
  soft: boolean;
}

/**
 * Chips de la card en el orden FIJO de su vertical (guía §2.3): solo lo
 * declarado (`true` / valor real) y, del estado, solo los extremos. Los tags
 * del LLM entran como mucho de a uno y solo si no hay ningún chip duro (C12).
 */
export function cardChips(card: Card, vertical: CardVertical): CardChip[] {
  const hard: string[] = [];
  if (card.property_type === "land") {
    const services = landServicesLabel(card);
    if (services) hard.push(services);
    if (card.in_subdivision === true) {
      const name = clean(card.subdivision_name);
      hard.push(name ? `En loteo ${name}` : "Dentro de loteo");
    }
    if (card.buildable === true) hard.push("Apto construcción");
    if (card.land_zoning && LAND_ZONING_LABEL[card.land_zoning]) hard.push(LAND_ZONING_LABEL[card.land_zoning]);
  } else {
    if (card.property_type === "room" && card.room_class) hard.push(ROOM_CLASS_LABEL[card.room_class]);
    for (const key of CHIP_ORDER[vertical === "lotes" ? "comprar" : vertical]) {
      if (key.startsWith("condition:")) {
        const condition = key.slice("condition:".length);
        const label = card.condition === condition ? CONDITION_CHIP_LABEL[card.condition] : undefined;
        if (label) hard.push(label);
      } else if (card[key as keyof typeof ATTRIBUTE_LABEL] === true) {
        hard.push(ATTRIBUTE_LABEL[key as keyof typeof ATTRIBUTE_LABEL]);
      }
    }
  }
  if (hard.length > 0) return hard.map((label) => ({ label, soft: false }));
  const tag = (card.semantic_qualities ?? []).map(clean).find((s): s is string => !!s);
  return tag ? [{ label: tag, soft: true }] : [];
}
