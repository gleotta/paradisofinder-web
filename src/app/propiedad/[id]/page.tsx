import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProperty } from "@/lib/p2/client";
import type { DealRating, PropertyDetail, Reason } from "@/lib/p2/types";
import {
  AGE_FLAG_LABEL,
  CONDITION_LABEL,
  DEAL_RATING_LABEL,
  LAND_CLASS_LABEL,
  LAND_ZONING_LABEL,
  LISTING_STATUS_LABEL,
  PROPERTY_TYPE_LABEL,
  OPERATION_LABEL,
  RATING_LABEL,
  ROOM_CLASS_LABEL,
} from "@/lib/labels";
import {
  clean,
  dealReasons,
  fmtAgo,
  fmtDate,
  fmtInt,
  fmtKm,
  fmtPct,
  landServicesLabel,
  mainPrice,
  miniCardPrice,
  pricePerSqm,
  secondaryPrice,
  zoneName,
} from "@/lib/format";
import { SignalBadge, ratingDotStyle } from "@/components/signals";
import DetailMap from "@/components/DetailMap";
import { BackLink, ContactActions, DetailTracker, Gallery, MiniCardLink, SourceLinks } from "@/components/detail";
import { isCardOrigin, isSearchId } from "@/lib/tracking-ids";
import { isVerticalId } from "@/lib/vertical";
import { siteUrl } from "@/lib/server/contact";
import { propertyOgImageUrl, propertyShareUrl } from "@/lib/share";

/**
 * Pantalla 3 — Detalle de propiedad (producto §6): página propia con URL por
 * propiedad, sin chat. Orden narrativo: galería → señales + score explicado →
 * indicadores de mercado → comparables → datos duros → descripción → contacto
 * → source. Todo display directo de P2/P3; null = no informado → se omite, y
 * ningún "None"/"unknown" llega a pantalla (`clean()`, T3 14/09).
 */

const load = cache((id: string) => getProperty(id));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await load(id).catch(() => null);
  if (!data) return { title: "Propiedad no encontrada", robots: { index: false } };
  const p = data.property;
  const type = PROPERTY_TYPE_LABEL[p.property_type] ?? "Propiedad";
  const zone = zoneName(p.zone);
  // Open Graph (T6): título con precio y zona, imagen del aviso — lo que se
  // ve al compartir la card por WhatsApp. La imagen se sirve desde el dominio
  // (15/09, `src/app/og/propiedad/[file]/route.ts`), no desde el portal.
  const title = `${type} en ${zone} · ${mainPrice(p)}`;
  const description =
    clean(p.primary_signal?.text) ??
    clean(p.description)?.slice(0, 160) ??
    `${OPERATION_LABEL[p.operation]} en ${zone}, San Juan. Oportunidad inmobiliaria explicada por FINDER.`;
  const photo = clean(p.photo_url) ? propertyOgImageUrl(siteUrl(), p.id) : null;
  const url = propertyShareUrl(siteUrl(), p.id);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} — FINDER San Juan`,
      description,
      url,
      type: "website",
      locale: "es_AR",
      siteName: "paradisofinder.com",
      ...(photo ? { images: [{ url: photo, width: 1200, height: 630, alt: `${type} en ${zone}` }] } : {}),
    },
    twitter: {
      card: photo ? "summary_large_image" : "summary",
      title: `${title} — FINDER San Juan`,
      description,
      ...(photo ? { images: [photo] } : {}),
    },
  };
}

export default async function PropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // Contexto de la búsqueda que abrió esta pestaña (05/09): solo con la forma
  // esperada; cualquier otra cosa se ignora y la visita cuenta como directa.
  const searchId = isSearchId(sp.s) ? sp.s : null;
  const rank = typeof sp.r === "string" && /^\d{1,5}$/.test(sp.r) ? Number(sp.r) : null;
  const from = isCardOrigin(sp.from) ? sp.from : null;
  const vertical = isVerticalId(sp.v) ? sp.v : null;
  const data = await load(id);
  if (!data) notFound();

  const p = data.property;
  const isLand = p.property_type === "land";
  const scoreComponents = data.score_components ?? p.score_components ?? [];
  const title = `${PROPERTY_TYPE_LABEL[p.property_type] ?? "Propiedad"} en ${zoneName(p.zone)}`;
  const photos = (p.photos?.length ? p.photos : p.photo_url ? [p.photo_url] : []).map(clean).filter((x): x is string => !!x);
  const secondary = secondaryPrice(p);
  const sqm = pricePerSqm(p);
  const address = clean(p.address);
  const marketContext = clean(p.market_context);
  const description = clean(p.description);

  const ratings = ratingBlocks(p);
  const indicators = indicatorList(p);
  const hardData = hardDataList(p);
  const flags = flagList(p);

  return (
    <main className="detail-page container">
      <DetailTracker propertyId={p.id} searchId={searchId} rank={rank} from={from} vertical={vertical} />
      <BackLink />

      <div className="detail-title-row">
        <h1>{title}</h1>
        <p className="where">
          {[address, zoneName(p.zone), "San Juan"].filter(Boolean).join(" · ")} ·{" "}
          {OPERATION_LABEL[p.operation]}
          {p.distance_km != null && ` · a ${fmtKm(p.distance_km)}`}
        </p>
        {flags.length > 0 && (
          <div className="detail-flags">
            {flags.map((f) => (
              <span className={`pflag pflag--${f.tone}`} key={f.label}>
                {f.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="detail-pricebox">
        <span className="detail-price">{mainPrice(p)}</span>
        {secondary && <span className="pcard-price-sec">({secondary})</span>}
        {sqm && <span className="pcard-sqm">{sqm}</span>}
      </div>

      {/* 1 — Galería */}
      {photos.length > 0 && <Gallery photos={photos} alt={title} />}

      <div className="detail-grid">
        <div className="detail-main">
          {/* 2 — Señales + score explicado (el diferencial, arriba) */}
          {(clean(p.primary_signal?.text) ||
            ratings.length > 0 ||
            (p.opportunity_score != null && scoreComponents.length > 0) ||
            (p.secondary_indicators?.length ?? 0) > 0 ||
            marketContext) && (
            <section className="dsection">
              <h2>Lectura de FINDER</h2>
              <div className="stack">
                {p.primary_signal && clean(p.primary_signal.text) && (
                  <SignalBadge signal={{ ...p.primary_signal, text: clean(p.primary_signal.text)! }} />
                )}

                {p.opportunity_score != null && scoreComponents.length > 0 && (
                  <div>
                    <div className="score-head">
                      <span className="score-num">
                        {p.opportunity_score}
                        <small> / 100 · Opportunity Score</small>
                      </span>
                    </div>
                    <table className="comp-table">
                      <tbody>
                        {scoreComponents.map((c) => (
                          <tr key={c.key} className={c.weight === 0 ? "comp-row--cap" : undefined}>
                            <td className="lbl">{c.label}</td>
                            <td className="raw">
                              {c.raw_value != null
                                ? `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(c.raw_value)}${c.raw_unit === "%" ? "%" : c.raw_unit ? ` ${c.raw_unit}` : ""}`
                                : "—"}
                            </td>
                            <td className="desc">{c.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {ratings.map((r) => (
                  <div className="rating-block" key={r.label}>
                    <div className="rating-head">
                      <span className="dot" style={ratingDotStyle(r.color)} aria-hidden />
                      {r.label}
                      {r.special && <span className="rating-special">{r.special}</span>}
                    </div>
                    {r.reasons && r.reasons.length > 0 && (
                      <ul>
                        {r.reasons.map((reason) => (
                          <li key={reason.code}>{reason.text}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}

                {/* Indicadores secundarios de P3: nombre + valor + explicación, tal cual */}
                {(p.secondary_indicators?.length ?? 0) > 0 && (
                  <table className="comp-table">
                    <tbody>
                      {p.secondary_indicators!
                        .filter((ind) => clean(ind.name) && clean(ind.value))
                        .map((ind) => (
                          <tr key={ind.name}>
                            <td className="lbl">{ind.name}</td>
                            <td className="raw">{ind.value}</td>
                            <td className="desc">{clean(ind.tooltip) ?? ""}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}

                {marketContext && <p className="market-context">{marketContext}</p>}
              </div>
            </section>
          )}

          {/* 3 — Indicadores de mercado (según operación) */}
          {indicators.length > 0 && (
            <section className="dsection">
              <h2>Indicadores de mercado</h2>
              <div className="ind-grid">
                {indicators.map((ind) => (
                  <div className="ind" key={ind.label}>
                    <div className="k">{ind.label}</div>
                    <div className="v">{ind.value}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 4 — Comparables */}
          {data.comparables && data.comparables.length > 0 && (
            <section className="dsection">
              <h2>Comparables en la zona</h2>
              <div className="minicards">
                {data.comparables.map((mc, i) => {
                  const price = miniCardPrice(mc);
                  const body = (
                    <>
                      <div className="mprice">
                        {price.main}
                        {price.secondary && <small style={{ color: "var(--muted)", fontWeight: 400 }}> {price.secondary}</small>}
                      </div>
                      <div className="mmeta">
                        {[
                          mc.property_type ? PROPERTY_TYPE_LABEL[mc.property_type] : null,
                          clean(mc.zone) ? zoneName(mc.zone) : null,
                          mc.area_sqm != null ? `${fmtInt(mc.area_sqm)} m²` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </>
                  );
                  return mc.id ? (
                    <MiniCardLink id={mc.id} searchId={searchId} key={mc.id}>
                      {body}
                    </MiniCardLink>
                  ) : (
                    <div className="minicard" key={i}>
                      {body}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 5 — Datos duros */}
          {hardData.length > 0 && (
            <section className="dsection">
              <h2>{isLand ? "Datos del lote" : "Características"}</h2>
              <dl className="datalist">
                {hardData.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {/* 5b — Ubicación (15/09): solo con coordenadas de P2; "low" es solo la zona → sin mapa */}
          {p.latitude != null && p.longitude != null && p.location_confidence !== "low" && (
            <section className="dsection">
              <h2>Ubicación</h2>
              <DetailMap
                propertyId={p.id}
                latitude={p.latitude}
                longitude={p.longitude}
                confidence={p.location_confidence}
              />
            </section>
          )}

          {/* 6 — Descripción original del aviso (tal cual) */}
          {description && (
            <section className="dsection">
              <h2>Descripción del aviso</h2>
              <p className="description-text">{description}</p>
            </section>
          )}
        </div>

        {/* 7 y 8 — Contacto + Source */}
        <aside>
          <div className="contact-card">
            <ContactActions card={p} rank={rank} />
            <SourceLinks propertyId={p.id} sources={p.sources ?? null} listingUrl={clean(p.listing_url)} rank={rank} />
            <div className="contact-meta">
              {p.days_on_market != null && (
                <p>
                  Publicado {fmtAgo(p.days_on_market)}
                  {p.listing_published_at ? ` (${fmtDate(p.listing_published_at)})` : ""}
                </p>
              )}
              {p.days_since_update != null && (
                <p>
                  Actualizado {fmtAgo(p.days_since_update)}
                  {p.listing_updated_at ? ` (${fmtDate(p.listing_updated_at)})` : ""}
                </p>
              )}
              {p.days_since_update == null && p.listing_updated_at && <p>Actualizada el {fmtDate(p.listing_updated_at)}</p>}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function flagList(p: PropertyDetail): { label: string; tone: "warn" | "ok" }[] {
  const out: { label: string; tone: "warn" | "ok" }[] = [];
  if (p.listing_status === "stale") out.push({ label: LISTING_STATUS_LABEL.stale!, tone: "warn" });
  else if (p.age_flag && AGE_FLAG_LABEL[p.age_flag]) out.push({ label: AGE_FLAG_LABEL[p.age_flag], tone: "warn" });
  if ((p.quality_tier ?? 0) >= 3) out.push({ label: "Datos completos", tone: "ok" });
  return out;
}

function ratingBlocks(
  p: PropertyDetail,
): { label: string; color: DealRating; reasons: Reason[] | null; special: string | null }[] {
  const out: { label: string; color: DealRating; reasons: Reason[] | null; special: string | null }[] = [];
  // null = NO EVALUADO → se omite; resale/rental solo en ventas (spec §5).
  if (p.deal_rating) {
    const special = p.deal_rating === "verify_data" || p.deal_rating === "outdated" ? DEAL_RATING_LABEL[p.deal_rating] : null;
    out.push({ label: RATING_LABEL.deal_rating, color: p.deal_rating, reasons: dealReasons(p), special });
  }
  if (p.operation === "sale" && p.resale_investment_rating)
    out.push({ label: RATING_LABEL.resale_investment_rating, color: p.resale_investment_rating, reasons: p.resale_investment_reasons, special: null });
  if (p.operation === "sale" && p.rental_investment_rating)
    out.push({ label: RATING_LABEL.rental_investment_rating, color: p.rental_investment_rating, reasons: p.rental_investment_reasons, special: null });
  return out;
}

function indicatorList(p: PropertyDetail): { label: string; value: string }[] {
  const isSale = p.operation === "sale";
  const isLand = p.property_type === "land";
  const out: { label: string; value: string }[] = [];
  if (p.valuation_gap_pct != null)
    out.push({
      label: isLand ? "Precio del m² vs. la zona" : "Precio vs. comparables",
      value: `${fmtPct(p.valuation_gap_pct, true)}${p.valuation_gap_capped ? " (acotado)" : ""}`,
    });
  if (p.price_percentile != null) out.push({ label: "Percentil de precio en su zona", value: `P${fmtInt(p.price_percentile)}` });
  if (isSale && !isLand && p.gross_yield_pct != null) out.push({ label: "Renta bruta anual estimada", value: fmtPct(p.gross_yield_pct) });
  if (isSale && !isLand && p.estimated_monthly_rent != null)
    out.push({ label: "Alquiler mensual estimado", value: `US$ ${fmtInt(p.estimated_monthly_rent)}` });
  if (isSale && !isLand && p.rent_to_price_ratio != null)
    out.push({
      label: "Relación alquiler/precio",
      value: new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(p.rent_to_price_ratio),
    });
  if (p.comparables_count != null) out.push({ label: "Comparables considerados", value: fmtInt(p.comparables_count) });
  if (p.zone_supply != null) out.push({ label: "Avisos activos en la zona", value: fmtInt(p.zone_supply) });
  return out;
}

function hardDataList(p: PropertyDetail): [string, string][] {
  const out: [string, string][] = [];
  const isRoom = p.property_type === "room";
  const isLand = p.property_type === "land";
  // Sello de dúplex (delta 01/09): marca ortogonal al tipo, solo con true.
  const typeLabel = PROPERTY_TYPE_LABEL[p.property_type] ?? "Propiedad";
  out.push(["Tipo", p.is_duplex === true ? `${typeLabel} · Dúplex` : typeLabel]);
  out.push(["Operación", OPERATION_LABEL[p.operation]]);
  if (isLand) {
    // Lote (contrato 13/09 §4.4): sin campos de vivienda; servicios SOLO si `true`.
    if (p.land_class) out.push(["Clase", LAND_CLASS_LABEL[p.land_class]]);
    if (p.area_sqm != null) out.push(["Superficie del lote", p.area_sqm >= 10000 ? `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(p.area_sqm / 10000)} ha (${fmtInt(p.area_sqm)} m²)` : `${fmtInt(p.area_sqm)} m²`]);
    if (p.frontage_m != null) out.push(["Frente", `${p.frontage_m} m`]);
    if (p.depth_m != null) out.push(["Fondo", `${p.depth_m} m`]);
    const services = landServicesLabel(p);
    if (services) out.push(["Servicios", services.replace(/^Con servicios:?\s*/, "") || "Declara servicios"]);
    if (p.in_subdivision === true) out.push(["Loteo", clean(p.subdivision_name) ?? "Dentro de loteo"]);
    if (p.buildable === true) out.push(["Apto construcción", "Sí, según el aviso"]);
    if (p.land_zoning && LAND_ZONING_LABEL[p.land_zoning]) out.push(["Zonificación", LAND_ZONING_LABEL[p.land_zoning].replace("Zonificación ", "")]);
    if (p.price_per_sqm_land != null) out.push(["Precio por m² de lote", `US$ ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(p.price_per_sqm_land)}`]);
    if (p.price_per_hectare != null) out.push(["Precio por hectárea", `US$ ${fmtInt(p.price_per_hectare)}`]);
  } else {
    if (isRoom) {
      // Habitaciones: el mínimo de visibilidad son las camas, no los metros.
      if (p.beds != null) out.push(["Camas", fmtInt(p.beds)]);
      if (p.double_bed != null) out.push(["Cama matrimonial", p.double_bed ? "Sí" : "No"]);
      if (p.private_bathroom != null) out.push(["Baño privado", p.private_bathroom ? "Sí" : "No"]);
      if (p.room_class) out.push(["Clase", ROOM_CLASS_LABEL[p.room_class]]);
    }
    if (p.area_sqm != null) out.push(["Superficie", `${fmtInt(p.area_sqm)} m²`]);
    if (p.covered_area_sqm != null) out.push(["Sup. cubierta", `${fmtInt(p.covered_area_sqm)} m²`]);
    if (!isRoom) {
      if (p.rooms != null) out.push(["Ambientes", fmtInt(p.rooms)]);
      if (p.bedrooms != null) out.push(["Dormitorios", fmtInt(p.bedrooms)]);
      if (p.bathrooms != null) out.push(["Baños", fmtInt(p.bathrooms)]);
    }
    if (p.condition && p.condition !== "unknown" && CONDITION_LABEL[p.condition]) out.push(["Estado", CONDITION_LABEL[p.condition]]);
    if (p.floor != null) out.push(["Piso", fmtInt(p.floor)]);
    if (p.year_built != null) out.push(["Año de construcción", String(p.year_built)]);
    // "unknown"/"None" es el no-informado de P3 (igual que en `condition`): se omite.
    const heating = clean(p.heating);
    if (heating) out.push(["Calefacción", heating]);
  }
  if (clean(p.zone)) out.push(["Zona", zoneName(p.zone)]);
  const address = clean(p.address);
  if (address) out.push(["Dirección", address]);
  if (p.location_confidence === "low") out.push(["Ubicación", "Aproximada (solo la zona)"]);
  return out;
}
