"use client";

import Link from "next/link";
import { memo, useState } from "react";
import type { Card } from "@/lib/p2/types";
import {
  AGE_FLAG_LABEL,
  ATTRIBUTE_LABEL,
  CONDITION_LABEL,
  LAND_CLASS_LABEL,
  LAND_ZONING_LABEL,
  LISTING_STATUS_LABEL,
  PROPERTY_TYPE_LABEL,
  PUBLISHER_LABEL,
  RATING_LABEL,
  RATING_LABEL_SHORT,
  ROOM_CLASS_LABEL,
  type AttributeKey,
} from "@/lib/labels";
import {
  clean,
  dealReasons,
  fmtAgo,
  fmtKm,
  fmtPct,
  landServicesLabel,
  mainPrice,
  pricePerSqm,
  roomSpecsLine,
  secondaryPrice,
  specsLine,
  zoneName,
} from "@/lib/format";
import { detailHref, EVENTS, trackCardClick, trackEvent, type CardOrigin } from "@/lib/track";
import ContactButton from "./ContactButton";
import ShareButton from "./ShareButton";
import { RatingChip, ScoreDetails, SignalBadge } from "./signals";

/** Chips visibles antes del "+N": 3 + "+N" entran en las 2 filas fijas de la ranura. */
const MAX_CHIPS = 3;

/**
 * Card de resultado según las reglas de display de la spec §5 y la "card
 * honesta" del 14/09 (T3/T4 — `docs/DECISION_2026-09-14_qa-produccion.md`):
 *  - precio original SIEMPRE primero, conversión entre paréntesis con los
 *    campos de P2 (`price_usd` / `price_ars`), nunca calculada acá;
 *  - NADA de "None"/"null"/"unknown": todo string pasa por `clean()` y la
 *    línea que no tiene dato no se muestra (la ranura queda vacía);
 *  - dos fechas: "publicado hace X" (`days_on_market`, señal de negociación) y
 *    "actualizado hace Y" (`days_since_update`, frescura); etiquetas visibles
 *    de `age_flag` y `listing_status: stale`; `deal_rating` con `verify_data`
 *    / `outdated`; `quality_tier` alto = sello "Datos completos", bajo = solo
 *    menos énfasis visual (nunca "calidad baja");
 *  - lotes: m² de lote, precio/m² de lote, clase, servicios (solo `true`),
 *    loteo, sin campos de vivienda; `distance_km` cuando el orden es cercanía;
 *  - score SIEMPRE con su primera razón; desplegable con todos los componentes;
 *  - botón "Consultar" propio y medido antes que "Ver aviso original".
 *
 * ALTURA UNIFORME (pedido de German, 05/09): cada bloque es una "ranura" de
 * alto fijo que se renderiza aunque el dato falte (vacía, invisible).
 */
function PropertyCardBase({
  card,
  similar = false,
  searchId = null,
  rank = null,
  vertical = null,
}: {
  card: Card;
  similar?: boolean;
  /** Corrida de búsqueda que la mostró (analítica); viaja al detalle por la URL. */
  searchId?: string | null;
  /** Posición en el listado (1 = primera), o en el bloque de similares. */
  rank?: number | null;
  /** Vertical vigente (viaja al detalle para la analítica). */
  vertical?: string | null;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const [allChips, setAllChips] = useState(false);
  // El detalle abre en pestaña NUEVA (decisión 05/09) y hereda el contexto de
  // la búsqueda por la URL (`?s=&r=&v=`); el click se registra acá, en la
  // pestaña que conoce la consulta, el ranking y el score.
  const from: CardOrigin = similar ? "related" : "list";
  const href = detailHref(card.id, { searchId, rank, from, vertical });
  const onOpen = () => trackCardClick(card, from, rank);
  const isRoom = card.property_type === "room";
  const isLand = card.property_type === "land";
  const title = `${PROPERTY_TYPE_LABEL[card.property_type] ?? "Propiedad"} en ${zoneName(card.zone)}`;
  const address = clean(card.address);
  const secondary = secondaryPrice(card);
  const sqm = pricePerSqm(card);
  const specs = isRoom ? roomSpecsLine(card) : specsLine(card);
  const distance = card.distance_km != null ? `a ${fmtKm(card.distance_km)}` : null;
  const priceRefs = [secondary ? `(${secondary})` : null, sqm].filter(Boolean).join(" · ");
  const photoUrl = clean(card.photo_url);
  const marketContext = clean(card.market_context);
  const listingUrl = clean(card.listing_url);
  const sourceName = clean(card.sources?.[0]?.name);

  /* ---- chips de atributos (solo lo informado en true / con valor real) ---- */
  const attrs: string[] = [];
  if (isLand) {
    if (card.land_class) attrs.push(LAND_CLASS_LABEL[card.land_class]);
    const services = landServicesLabel(card);
    if (services) attrs.push(services);
    if (card.in_subdivision === true) {
      const name = clean(card.subdivision_name);
      attrs.push(name ? `En loteo ${name}` : "Dentro de loteo");
    }
    if (card.buildable === true) attrs.push("Apto construcción");
    if (card.land_zoning && LAND_ZONING_LABEL[card.land_zoning]) attrs.push(LAND_ZONING_LABEL[card.land_zoning]);
  } else {
    for (const key of Object.keys(ATTRIBUTE_LABEL) as AttributeKey[]) {
      if (card[key] === true) attrs.push(ATTRIBUTE_LABEL[key]);
    }
    if (isRoom && card.room_class) attrs.unshift(ROOM_CLASS_LABEL[card.room_class]);
    if (card.condition && card.condition !== "unknown" && CONDITION_LABEL[card.condition]) {
      attrs.push(CONDITION_LABEL[card.condition]);
    }
    if (card.operation === "sale" && card.gross_yield_pct != null) {
      attrs.push(`Renta est. ${fmtPct(card.gross_yield_pct)}`);
    }
  }
  const soft = (card.semantic_qualities ?? []).map(clean).filter((s): s is string => !!s);
  const chips = [...attrs.map((label) => ({ label, soft: false })), ...soft.map((label) => ({ label, soft: true }))];
  const visibleChips = allChips ? chips : chips.slice(0, MAX_CHIPS);
  const hiddenChips = chips.length - visibleChips.length;

  /* ---- etiquetas de antigüedad / vigencia / calidad (sobre la foto) ---- */
  const flags: { label: string; tone: "warn" | "ok" }[] = [];
  if (card.listing_status === "stale") flags.push({ label: LISTING_STATUS_LABEL.stale!, tone: "warn" });
  else if (card.age_flag && AGE_FLAG_LABEL[card.age_flag]) flags.push({ label: AGE_FLAG_LABEL[card.age_flag], tone: "warn" });
  if ((card.quality_tier ?? 0) >= 3) flags.push({ label: "Datos completos", tone: "ok" });
  const lowTier = card.quality_tier != null && card.quality_tier <= 1;

  /* ---- fechas ---- */
  const dates = [
    card.days_on_market != null ? `publicado ${fmtAgo(card.days_on_market)}` : null,
    card.days_since_update != null ? `actualizado ${fmtAgo(card.days_since_update)}` : null,
  ].filter(Boolean);

  const showRatings =
    card.deal_rating != null ||
    (card.operation === "sale" && (card.resale_investment_rating != null || card.rental_investment_rating != null));

  return (
    <article
      className={`pcard${lowTier ? " pcard--muted" : ""}${isLand ? " pcard--land" : ""}`}
      data-testid="property-card"
      data-id={card.id}
      data-rank={rank ?? undefined}
    >
      <div className="pcard-photo">
        <Link href={href} target="_blank" rel="noopener" onClick={onOpen} tabIndex={-1} aria-hidden>
          {photoUrl && !photoFailed ? (
            // Las fotos vienen de portales arbitrarios: <img> plano, sin whitelist de dominios.
            // Con datos reales varias 404 o bloquean el hotlink → se cae al degradado.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" loading="lazy" onError={() => setPhotoFailed(true)} />
          ) : null}
        </Link>
        {/* Sellos: similar (related), dúplex (SOLO con true), lote. */}
        {(similar || card.is_duplex === true || isLand) && (
          <div className="pcard-badges">
            {similar && (
              <span className="pbadge pbadge--sim">
                {/* P2 manda relevance_score > 1 en algunas related (visto 05/09: "104%"):
                    el porcentaje solo se muestra cuando está en 0–1. */}
                {card.relevance_score != null && card.relevance_score <= 1
                  ? `Similar · ${Math.round(card.relevance_score * 100)}%`
                  : "Similar"}
              </span>
            )}
            {card.is_duplex === true && <span className="pbadge">Dúplex</span>}
            {isLand && <span className="pbadge pbadge--land">Lote</span>}
          </div>
        )}
        {flags.length > 0 && (
          <div className="pcard-flags">
            {flags.map((f) => (
              <span className={`pflag pflag--${f.tone}`} key={f.label}>
                {f.label}
              </span>
            ))}
          </div>
        )}
        {/* Compartir (15/09): sobre la foto, abajo a la derecha (arriba van sellos y flags). */}
        <ShareButton card={card} rank={rank} from={from} />
      </div>

      <div className="pcard-body">
        <div className="pcard-pricebox">
          <span className="pcard-price">{mainPrice(card)}</span>
          <span className="pcard-price-refs">{priceRefs || " "}</span>
        </div>

        <h3 className="pcard-title">
          <Link href={href} target="_blank" rel="noopener" onClick={onOpen}>
            {title}
          </Link>
        </h3>
        <p className="pcard-specs">{[distance, specs].filter(Boolean).join(" · ") || " "}</p>
        <p className="pcard-address" title={address ?? undefined}>
          {address || " "}
        </p>

        {card.primary_signal && clean(card.primary_signal.text) ? (
          <SignalBadge signal={{ ...card.primary_signal, text: clean(card.primary_signal.text)! }} />
        ) : (
          <div className="slot-empty slot-empty--signal" aria-hidden />
        )}

        {card.opportunity_score != null && card.score_components && card.score_components.length > 0 ? (
          <ScoreDetails score={card.opportunity_score} components={card.score_components} />
        ) : (
          <div className="slot-empty slot-empty--score" aria-hidden />
        )}

        <div className="ratings-row">
          {showRatings ? (
            <>
              {card.deal_rating && (
                <RatingChip
                  label={RATING_LABEL_SHORT.deal_rating}
                  title={RATING_LABEL.deal_rating}
                  color={card.deal_rating}
                  reasons={dealReasons(card)}
                />
              )}
              {card.operation === "sale" && card.resale_investment_rating && (
                <RatingChip
                  label={RATING_LABEL_SHORT.resale_investment_rating}
                  title={RATING_LABEL.resale_investment_rating}
                  color={card.resale_investment_rating}
                  reasons={card.resale_investment_reasons}
                />
              )}
              {card.operation === "sale" && card.rental_investment_rating && (
                <RatingChip
                  label={RATING_LABEL_SHORT.rental_investment_rating}
                  title={RATING_LABEL.rental_investment_rating}
                  color={card.rental_investment_rating}
                  reasons={card.rental_investment_reasons}
                />
              )}
            </>
          ) : null}
        </div>

        <div className={`attr-chips${allChips ? " attr-chips--open" : ""}`}>
          {visibleChips.map((c) => (
            <span className={`attr${c.soft ? " attr--soft" : ""}`} key={c.label}>
              {c.label}
            </span>
          ))}
          {hiddenChips > 0 && (
            <button type="button" className="attr attr--more" onClick={() => setAllChips(true)}>
              +{hiddenChips}
            </button>
          )}
        </div>

        <p className={`market-context${marketContext ? "" : " market-context--empty"}`}>
          {marketContext || " "}
        </p>

        <p className="pcard-dates">{dates.join(" · ") || " "}</p>

        <div className="pcard-actions">
          <ContactButton card={card} rank={rank} from={from} />
          {listingUrl && (
            <a
              className="source-link"
              href={listingUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                trackEvent(EVENTS.SOURCE_CLICK, { property_id: card.id, rank, position: rank, url: listingUrl, from })
              }
            >
              Ver aviso original ↗
            </a>
          )}
        </div>

        <div className="pcard-foot">
          <span className="pcard-foot-meta">
            {[sourceName, card.publisher ? PUBLISHER_LABEL[card.publisher] : null].filter(Boolean).join(" · ") || " "}
          </span>
        </div>
      </div>
    </article>
  );
}

/**
 * Memoizada: mientras el resumen de la búsqueda llega por streaming, el padre
 * re-renderiza en cada frame. Sin esto se rearmaban las 20 cards cada vez.
 */
export default memo(PropertyCardBase);
