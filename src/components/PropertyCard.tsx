"use client";

import Link from "next/link";
import { memo, useState } from "react";
import type { Card } from "@/lib/p2/types";
import {
  ATTRIBUTE_LABEL,
  CONDITION_LABEL,
  PROPERTY_TYPE_LABEL,
  PUBLISHER_LABEL,
  RATING_LABEL,
  RATING_LABEL_SHORT,
  ROOM_CLASS_LABEL,
  type AttributeKey,
} from "@/lib/labels";
import {
  dealReasons,
  fmtInt,
  fmtPct,
  mainPrice,
  pricePerSqm,
  roomSpecsLine,
  secondaryPrice,
  specsLine,
  zoneName,
} from "@/lib/format";
import { detailHref, EVENTS, trackCardClick, trackEvent, type CardOrigin } from "@/lib/track";
import { RatingChip, ScoreDetails, SignalBadge } from "./signals";

/** Chips visibles antes del "+N": 3 + "+N" entran en las 2 filas fijas de la ranura. */
const MAX_CHIPS = 3;

/**
 * Card de resultado según las reglas de display de la spec §5:
 * precio original SIEMPRE primero, señal principal explicada, ratings con sus
 * reasons (null = no evaluado → se omite), atributos solo si vienen, procedencia
 * visible. Nada se recalcula: display directo de lo que manda P2/P3.
 *
 * Layout (rediseño 05/09): foto 4:3 sobre un "passe-partout" lila (las fotos
 * de los portales llegan con márgenes blancos; `mix-blend-mode: multiply` los
 * vuelve lila en vez de blanco-sobre-blanco), precio serif + referencia en una
 * línea, título, ficha técnica, dirección, señal (2 líneas máx.), score,
 * ratings, hasta 3 chips + "+N", contexto de mercado (2 líneas) y pie.
 *
 * ALTURA UNIFORME (pedido de German, 05/09): cada bloque es una "ranura" de
 * alto fijo que se renderiza aunque el dato falte (vacía, invisible). Así dos
 * cards con el mismo ancho miden EXACTAMENTE lo mismo, en cualquier fila, sin
 * depender de cuántos datos trae cada aviso. Lo único que puede crecer es lo
 * que el usuario abre (¿por qué?, reasons, +N).
 */
function PropertyCardBase({
  card,
  similar = false,
  searchId = null,
  rank = null,
}: {
  card: Card;
  similar?: boolean;
  /** Corrida de búsqueda que la mostró (analítica); viaja al detalle por la URL. */
  searchId?: string | null;
  /** Posición en el listado (1 = primera), o en el bloque de similares. */
  rank?: number | null;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const [allChips, setAllChips] = useState(false);
  // El detalle abre en pestaña NUEVA (decisión 05/09) y hereda el contexto de
  // la búsqueda por la URL (`?s=&r=`); el click se registra acá, en la pestaña
  // que conoce la consulta, el ranking y el score.
  const from: CardOrigin = similar ? "related" : "list";
  const href = detailHref(card.id, { searchId, rank, from });
  const onOpen = () => trackCardClick(card, from, rank);
  const isRoom = card.property_type === "room";
  const title = `${PROPERTY_TYPE_LABEL[card.property_type] ?? "Propiedad"} en ${zoneName(card.zone)}`;
  const secondary = secondaryPrice(card);
  const sqm = pricePerSqm(card);
  const specs = isRoom ? roomSpecsLine(card) : specsLine(card);
  const priceRefs = [secondary, sqm].filter(Boolean).join(" · ");

  const attrs: string[] = [];
  for (const key of Object.keys(ATTRIBUTE_LABEL) as AttributeKey[]) {
    if (card[key] === true) attrs.push(ATTRIBUTE_LABEL[key]);
  }
  if (isRoom && card.room_class) attrs.unshift(ROOM_CLASS_LABEL[card.room_class]);
  if (card.condition && card.condition !== "unknown") attrs.push(CONDITION_LABEL[card.condition]);
  if (card.operation === "sale" && card.gross_yield_pct != null) {
    attrs.push(`Renta est. ${fmtPct(card.gross_yield_pct)}`);
  }
  const chips = [
    ...attrs.map((label) => ({ label, soft: false })),
    ...(card.semantic_qualities ?? []).map((label) => ({ label, soft: true })),
  ];
  const visibleChips = allChips ? chips : chips.slice(0, MAX_CHIPS);
  const hiddenChips = chips.length - visibleChips.length;

  const showRatings =
    card.deal_rating != null ||
    (card.operation === "sale" && (card.resale_investment_rating != null || card.rental_investment_rating != null));

  return (
    <article className="pcard">
      <div className="pcard-photo">
        <Link href={href} target="_blank" rel="noopener" onClick={onOpen} tabIndex={-1} aria-hidden>
          {card.photo_url && !photoFailed ? (
            // Las fotos vienen de portales arbitrarios: <img> plano, sin whitelist de dominios.
            // Con datos reales varias 404 o bloquean el hotlink → se cae al degradado.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.photo_url} alt="" loading="lazy" onError={() => setPhotoFailed(true)} />
          ) : null}
        </Link>
        {/* Sellos sobre la foto: similar (related) y dúplex (delta 01/09: SOLO con true). */}
        {(similar || card.is_duplex === true) && (
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
          </div>
        )}
      </div>

      <div className="pcard-body">
        <div className="pcard-pricebox">
          <span className="pcard-price">{mainPrice(card)}</span>
          <span className="pcard-price-refs">{priceRefs || "\u00a0"}</span>
        </div>

        <h3 className="pcard-title">
          <Link href={href} target="_blank" rel="noopener" onClick={onOpen}>
            {title}
          </Link>
        </h3>
        <p className="pcard-specs">{specs || "\u00a0"}</p>
        <p className="pcard-address" title={card.address ?? undefined}>
          {card.address || "\u00a0"}
        </p>

        {card.primary_signal ? (
          <SignalBadge signal={card.primary_signal} />
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

        <p className={`market-context${card.market_context ? "" : " market-context--empty"}`}>
          {card.market_context || "\u00a0"}
        </p>

        <div className="pcard-foot">
          <span className="pcard-foot-meta">
            {[
              card.sources?.[0]?.name,
              card.publisher ? PUBLISHER_LABEL[card.publisher] : null,
              card.days_on_market != null ? `${fmtInt(card.days_on_market)} días` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {card.listing_url && (
            <a
              className="source-link"
              href={card.listing_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent(EVENTS.SOURCE_CLICK, { property_id: card.id, url: card.listing_url })}
            >
              Ver aviso ↗
            </a>
          )}
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
