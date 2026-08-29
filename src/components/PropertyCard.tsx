"use client";

import Link from "next/link";
import { useState } from "react";
import type { Card } from "@/lib/p2/types";
import {
  ATTRIBUTE_LABEL,
  CONDITION_LABEL,
  PROPERTY_TYPE_LABEL,
  PUBLISHER_LABEL,
  RATING_LABEL,
  ROOM_CLASS_LABEL,
  type AttributeKey,
} from "@/lib/labels";
import {
  dealReasons,
  fmtDaysOnMarket,
  fmtPct,
  mainPrice,
  pricePerSqm,
  roomSpecsLine,
  secondaryPrice,
  specsLine,
} from "@/lib/format";
import { EVENTS, trackEvent } from "@/lib/track";
import { RatingChip, ScoreDetails, SignalBadge } from "./signals";

/**
 * Card de resultado según las reglas de display de la spec §5:
 * precio original SIEMPRE primero, señal principal explicada, ratings con sus
 * reasons (null = no evaluado → se omite), atributos solo si vienen, procedencia
 * visible. Nada se recalcula: display directo de lo que manda P2/P3.
 */
export default function PropertyCard({
  card,
  similar = false,
}: {
  card: Card;
  similar?: boolean;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const isRoom = card.property_type === "room";
  const title = `${PROPERTY_TYPE_LABEL[card.property_type] ?? "Propiedad"} en ${card.zone ?? "San Juan"}`;
  const secondary = secondaryPrice(card);
  const sqm = pricePerSqm(card);
  const specs = isRoom ? roomSpecsLine(card) : specsLine(card);

  const attrs: string[] = [];
  for (const key of Object.keys(ATTRIBUTE_LABEL) as AttributeKey[]) {
    if (card[key] === true) attrs.push(ATTRIBUTE_LABEL[key]);
  }
  if (isRoom && card.room_class) attrs.unshift(ROOM_CLASS_LABEL[card.room_class]);
  if (card.condition && card.condition !== "unknown") attrs.push(CONDITION_LABEL[card.condition]);
  if (card.operation === "sale" && card.gross_yield_pct != null) {
    attrs.push(`Renta est. ${fmtPct(card.gross_yield_pct)}`);
  }

  const showRatings =
    card.deal_rating != null ||
    (card.operation === "sale" && (card.resale_investment_rating != null || card.rental_investment_rating != null));

  return (
    <article className="pcard">
      <div className="pcard-photo">
        {card.photo_url && !photoFailed ? (
          // Las fotos vienen de portales arbitrarios: <img> plano, sin whitelist de dominios.
          // Con datos reales varias 404 o bloquean el hotlink → se cae al degradado.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.photo_url} alt={title} loading="lazy" onError={() => setPhotoFailed(true)} />
        ) : null}
        {similar && (
          <span className="sim-badge">
            {card.relevance_score != null
              ? `Similar · ${Math.round(card.relevance_score * 100)}%`
              : "Similar"}
          </span>
        )}
      </div>

      <div className="pcard-body">
        <div className="pcard-pricerow">
          <span className="pcard-price">{mainPrice(card)}</span>
          {secondary && <span className="pcard-price-sec">{secondary}</span>}
          {sqm && <span className="pcard-sqm">{sqm}</span>}
        </div>

        {/* La apertura de detalle se trackea en el mount de la página de detalle
            (cubre también entradas directas por URL, sin doble conteo). */}
        <h3 className="pcard-title">
          <Link href={`/propiedad/${encodeURIComponent(card.id)}`}>{title}</Link>
        </h3>
        {card.address && <p className="pcard-address">{card.address}</p>}
        {specs && <p className="pcard-specs">{specs}</p>}

        {card.primary_signal && <SignalBadge signal={card.primary_signal} />}

        {card.opportunity_score != null && card.score_components && card.score_components.length > 0 && (
          <ScoreDetails score={card.opportunity_score} components={card.score_components} />
        )}

        {showRatings && (
          <div className="ratings-row">
            {card.deal_rating && (
              <RatingChip
                label={RATING_LABEL.deal_rating}
                color={card.deal_rating}
                reasons={dealReasons(card)}
              />
            )}
            {card.operation === "sale" && card.resale_investment_rating && (
              <RatingChip
                label={RATING_LABEL.resale_investment_rating}
                color={card.resale_investment_rating}
                reasons={card.resale_investment_reasons}
              />
            )}
            {card.operation === "sale" && card.rental_investment_rating && (
              <RatingChip
                label={RATING_LABEL.rental_investment_rating}
                color={card.rental_investment_rating}
                reasons={card.rental_investment_reasons}
              />
            )}
          </div>
        )}

        {(attrs.length > 0 || (card.semantic_qualities?.length ?? 0) > 0) && (
          <div className="attr-chips">
            {attrs.map((a) => (
              <span className="attr" key={a}>
                {a}
              </span>
            ))}
            {card.semantic_qualities?.map((q) => (
              <span className="attr attr--soft" key={q}>
                {q}
              </span>
            ))}
          </div>
        )}

        {card.market_context && <p className="market-context">{card.market_context}</p>}

        <div className="pcard-foot">
          {card.sources?.[0] && <span>{card.sources[0].name}</span>}
          {card.publisher && <span>· {PUBLISHER_LABEL[card.publisher]}</span>}
          {card.days_on_market != null && <span>· {fmtDaysOnMarket(card.days_on_market)}</span>}
          {card.listing_url && (
            <a
              className="source-link"
              href={card.listing_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent(EVENTS.SOURCE_CLICK, { property_id: card.id, url: card.listing_url })}
            >
              Ver aviso original ↗
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
