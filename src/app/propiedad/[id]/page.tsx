import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProperty } from "@/lib/p2/client";
import type { PropertyDetail, RatingColor, Reason } from "@/lib/p2/types";
import {
  CONDITION_LABEL,
  PROPERTY_TYPE_LABEL,
  OPERATION_LABEL,
  RATING_LABEL,
  ROOM_CLASS_LABEL,
} from "@/lib/labels";
import {
  dealReasons,
  fmtDate,
  fmtDaysOnMarket,
  fmtInt,
  fmtPct,
  mainPrice,
  miniCardPrice,
  pricePerSqm,
  secondaryPrice,
} from "@/lib/format";
import { SignalBadge, ratingDotStyle } from "@/components/signals";
import { BackLink, ContactActions, DetailTracker, Gallery, SourceLinks } from "@/components/detail";

/**
 * Pantalla 3 — Detalle de propiedad (producto §6): página propia con URL por
 * propiedad, sin chat. Orden narrativo: galería → señales + score explicado →
 * indicadores de mercado → comparables → datos duros → descripción → contacto
 * → source. Todo display directo de P2/P3; null = no informado → se omite.
 */

const load = cache((id: string) => getProperty(id));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await load(id).catch(() => null);
  if (!data) return { title: "Propiedad no encontrada" };
  const p = data.property;
  const title = `${PROPERTY_TYPE_LABEL[p.property_type] ?? "Propiedad"} en ${p.zone ?? "San Juan"} · ${mainPrice(p)}`;
  const description =
    p.primary_signal?.text ?? p.description?.slice(0, 160) ?? "Oportunidad inmobiliaria en San Juan.";
  return {
    title,
    description,
    // P2 también expone GET /property/{id}/card (HTML OG para previews de WhatsApp).
    openGraph: {
      title,
      description,
      ...(p.photo_url ? { images: [{ url: p.photo_url }] } : {}),
    },
  };
}

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();

  const p = data.property;
  const scoreComponents = data.score_components ?? p.score_components ?? [];
  const title = `${PROPERTY_TYPE_LABEL[p.property_type] ?? "Propiedad"} en ${p.zone ?? "San Juan"}`;
  const photos = p.photos?.length ? p.photos : p.photo_url ? [p.photo_url] : [];
  const secondary = secondaryPrice(p);
  const sqm = pricePerSqm(p);

  const ratings = ratingBlocks(p);
  const indicators = indicatorList(p);
  const hardData = hardDataList(p);

  return (
    <main className="detail-page container">
      <DetailTracker propertyId={p.id} />
      <BackLink />

      <div className="detail-title-row">
        <h1>{title}</h1>
        <p className="where">
          {[p.address, p.zone, "San Juan"].filter(Boolean).join(" · ")} ·{" "}
          {OPERATION_LABEL[p.operation]}
        </p>
      </div>

      <div className="detail-pricebox">
        <span className="detail-price">{mainPrice(p)}</span>
        {secondary && <span className="pcard-price-sec">{secondary}</span>}
        {sqm && <span className="pcard-sqm">{sqm}</span>}
      </div>

      {/* 1 — Galería */}
      {photos.length > 0 && <Gallery photos={photos} alt={title} />}

      <div className="detail-grid">
        <div className="detail-main">
          {/* 2 — Señales + score explicado (el diferencial, arriba) */}
          {(p.primary_signal ||
            ratings.length > 0 ||
            (p.opportunity_score != null && scoreComponents.length > 0) ||
            (p.secondary_indicators?.length ?? 0) > 0 ||
            p.market_context) && (
            <section className="dsection">
              <h2>Lectura de FINDER</h2>
              <div className="stack">
                {p.primary_signal && <SignalBadge signal={p.primary_signal} />}

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
                          <tr key={c.key}>
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
                      {p.secondary_indicators!.map((ind) => (
                        <tr key={ind.name}>
                          <td className="lbl">{ind.name}</td>
                          <td className="raw">{ind.value}</td>
                          <td className="desc">{ind.tooltip}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {p.market_context && <p className="market-context">{p.market_context}</p>}
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
                          mc.zone,
                          mc.area_sqm != null ? `${fmtInt(mc.area_sqm)} m²` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </>
                  );
                  return mc.id ? (
                    <a className="minicard" href={`/propiedad/${encodeURIComponent(mc.id)}`} key={mc.id}>
                      {body}
                    </a>
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
              <h2>Características</h2>
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

          {/* 6 — Descripción original del aviso (tal cual) */}
          {p.description && (
            <section className="dsection">
              <h2>Descripción del aviso</h2>
              <p className="description-text">{p.description}</p>
            </section>
          )}
        </div>

        {/* 7 y 8 — Contacto + Source */}
        <aside>
          <div className="contact-card">
            <ContactActions propertyId={p.id} contact={p.contact ?? null} publisher={p.publisher ?? null} />
            <SourceLinks propertyId={p.id} sources={p.sources ?? null} listingUrl={p.listing_url ?? null} />
            <div className="contact-meta">
              {p.days_on_market != null && <p>{fmtDaysOnMarket(p.days_on_market)}</p>}
              {p.listing_published_at && <p>Publicada el {fmtDate(p.listing_published_at)}</p>}
              {p.listing_updated_at && <p>Actualizada el {fmtDate(p.listing_updated_at)}</p>}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function ratingBlocks(p: PropertyDetail): { label: string; color: RatingColor; reasons: Reason[] | null }[] {
  const out: { label: string; color: RatingColor; reasons: Reason[] | null }[] = [];
  // null = NO EVALUADO → se omite; resale/rental solo en ventas (spec §5).
  if (p.deal_rating)
    out.push({ label: RATING_LABEL.deal_rating, color: p.deal_rating, reasons: dealReasons(p) });
  if (p.operation === "sale" && p.resale_investment_rating)
    out.push({ label: RATING_LABEL.resale_investment_rating, color: p.resale_investment_rating, reasons: p.resale_investment_reasons });
  if (p.operation === "sale" && p.rental_investment_rating)
    out.push({ label: RATING_LABEL.rental_investment_rating, color: p.rental_investment_rating, reasons: p.rental_investment_reasons });
  return out;
}

function indicatorList(p: PropertyDetail): { label: string; value: string }[] {
  const isSale = p.operation === "sale";
  const out: { label: string; value: string }[] = [];
  if (p.valuation_gap_pct != null) out.push({ label: "Precio vs. comparables", value: fmtPct(p.valuation_gap_pct, true) });
  if (p.price_percentile != null) out.push({ label: "Percentil de precio en su zona", value: `P${fmtInt(p.price_percentile)}` });
  if (isSale && p.gross_yield_pct != null) out.push({ label: "Renta bruta anual estimada", value: fmtPct(p.gross_yield_pct) });
  if (isSale && p.estimated_monthly_rent != null)
    out.push({ label: "Alquiler mensual estimado", value: `US$ ${fmtInt(p.estimated_monthly_rent)}` });
  if (isSale && p.rent_to_price_ratio != null)
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
  // Sello de dúplex (delta 01/09): marca ortogonal al tipo, solo con true.
  const typeLabel = PROPERTY_TYPE_LABEL[p.property_type] ?? "Propiedad";
  out.push(["Tipo", p.is_duplex === true ? `${typeLabel} · Dúplex` : typeLabel]);
  out.push(["Operación", OPERATION_LABEL[p.operation]]);
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
  if (p.condition && p.condition !== "unknown") out.push(["Estado", CONDITION_LABEL[p.condition]]);
  if (p.floor != null) out.push(["Piso", fmtInt(p.floor)]);
  if (p.year_built != null) out.push(["Año de construcción", String(p.year_built)]);
  // "unknown" es el no-informado de P3 (igual que en `condition`): se omite.
  if (p.heating && p.heating !== "unknown") out.push(["Calefacción", p.heating]);
  if (p.zone) out.push(["Zona", p.zone]);
  if (p.address) out.push(["Dirección", p.address]);
  return out;
}
