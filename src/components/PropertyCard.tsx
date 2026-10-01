"use client";

import Link from "next/link";
import { memo, useState } from "react";
import type { Card } from "@/lib/p2/types";
import { AGE_FLAG_LABEL, LAND_CLASS_LABEL, LISTING_STATUS_LABEL, PROPERTY_TYPE_LABEL, PUBLISHER_LABEL } from "@/lib/labels";
import {
  cardChips,
  cardDates,
  cardVertical,
  clean,
  estimateInfo,
  fmtKm,
  mainPrice,
  positionInfo,
  pricePerSqm,
  priceTrendInfo,
  roomSpecsLine,
  secondaryPrice,
  specsLine,
  zoneName,
  zoneRefInfo,
} from "@/lib/format";
import { detailHref, EVENTS, trackCardClick, trackEvent, type CardOrigin } from "@/lib/track";
import ContactButton from "./ContactButton";
import ShareButton from "./ShareButton";
import { EstimateBlock, EstimateNotice, PositionBlock, TrendPill, ZoneBlock } from "./signals";

/** Chips visibles antes del "+N" (guía 29/09 §2.3). */
const MAX_CHIPS = 3;

/**
 * Card de resultado POR VERTICAL (29/09 —
 * `docs/GUIA_P1_2026-09-29_cards-por-vertical.md`; el porqué de cada decisión
 * está en `docs/PLAN_2026-09-29_cards-por-vertical.md`). P3 calcula, P2
 * expone, P1 muestra:
 *  - una sola comparación por card: el bloque de posición contra similares
 *    (porcentaje, barra de percentil, "ver similares"); SOLO VERDE, nunca
 *    rojo: verde con `deal_rating: green`, neutro todo lo demás;
 *  - flecha de tendencia del aviso sobre la foto; bloque Zona en Comprar,
 *    Lotes e Invertir (verde si la zona sube); en Invertir, además, "Esta
 *    propiedad · estimación", siempre neutro;
 *  - sin score, semáforos, contexto de mercado ni "Datos completos": siguen
 *    llegando y se ven explicados en el detalle;
 *  - cada bloque se renderiza SOLO si el campo llega (null = no informado):
 *    la card sale con lo que P2 manda hoy y va encendiendo bloques;
 *  - aviso de estimación en toda card; ninguna sigla ni nombre interno.
 *
 * Sigue valiendo la "card honesta" del 14/09 (T3/T4): precio original primero
 * y conversión solo con los campos de P2, nada de "None"/"null"/"unknown"
 * (`clean()`), lotes sin campos de vivienda, "Consultar" antes que "Ver aviso
 * original".
 *
 * ALTURA: los bloques miden lo que su contenido (decisión de German del
 * 29/09); las cards de una misma fila se emparejan estirándose en la grilla,
 * con las acciones ancladas abajo.
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
  /** Vertical vigente: decide el layout (junto con el aviso) y viaja al detalle. */
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
  const layout = cardVertical(card, vertical);
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
  const listingUrl = clean(card.listing_url);
  const sourceName = clean(card.sources?.[0]?.name);

  const trend = priceTrendInfo(card);
  const position = positionInfo(card);
  const zone = zoneRefInfo(card, layout);
  const estimate = layout === "invertir" ? estimateInfo(card) : null;
  const dates = cardDates(card);

  const chips = cardChips(card, layout);
  const visibleChips = allChips ? chips : chips.slice(0, MAX_CHIPS);
  const hiddenChips = chips.length - visibleChips.length;

  /* ---- etiquetas de antigüedad / vigencia (sobre la foto, sin color de alarma) ---- */
  const flags: string[] = [];
  if (card.listing_status === "stale") flags.push(LISTING_STATUS_LABEL.stale!);
  else if (card.age_flag && AGE_FLAG_LABEL[card.age_flag]) flags.push(AGE_FLAG_LABEL[card.age_flag]);
  const lowTier = card.quality_tier != null && card.quality_tier <= 1;

  return (
    <article
      className={`pcard${lowTier ? " pcard--muted" : ""}${isLand ? " pcard--land" : ""}`}
      data-testid="property-card"
      data-id={card.id}
      data-rank={rank ?? undefined}
      data-vertical={layout}
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
        <div className="pcard-top">
          {/* Izquierda: tendencia del aviso y sellos (similar, dúplex SOLO con true). */}
          <div className="pcard-badges">
            {trend && <TrendPill trend={trend} />}
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
          </div>
          {/* Derecha: clase del lote y antigüedad / vigencia. */}
          <div className="pcard-flags">
            {isLand && (
              <span className="pbadge pbadge--land" data-testid="land-class">
                {card.land_class ? LAND_CLASS_LABEL[card.land_class] : "Lote"}
              </span>
            )}
            {flags.map((label) => (
              <span className="pflag" key={label}>
                {label}
              </span>
            ))}
          </div>
        </div>
        {/* Compartir (15/09): sobre la foto, abajo a la derecha (arriba van sellos y flags). */}
        <ShareButton card={card} rank={rank} from={from} />
      </div>

      <div className="pcard-body">
        <div className="pcard-pricebox">
          <span className="pcard-price">{mainPrice(card)}</span>
          <span className="pcard-price-refs">{priceRefs || " "}</span>
        </div>

        <h3 className="pcard-title">
          <Link href={href} target="_blank" rel="noopener" onClick={onOpen}>
            {title}
          </Link>
        </h3>
        <p className="pcard-specs">{[distance, specs].filter(Boolean).join(" · ") || " "}</p>
        <p className="pcard-address" title={address ?? undefined}>
          {address || " "}
        </p>

        {position && (
          <PositionBlock
            info={position}
            similarsHref={`${href}#comparables`}
            onSimilarsClick={() => trackCardClick(card, from, rank, "similars")}
          />
        )}
        {zone && <ZoneBlock info={zone} />}
        {estimate && <EstimateBlock info={estimate} />}

        {dates && (
          <p className={`pcard-dates${dates.negotiate ? " pcard-dates--negotiate" : ""}`} title={dates.text}>
            {dates.text}
          </p>
        )}

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

        <div className="pcard-bottom">
          <EstimateNotice />

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
              {[sourceName, card.publisher ? PUBLISHER_LABEL[card.publisher] : null].filter(Boolean).join(" · ") || " "}
            </span>
          </div>
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
