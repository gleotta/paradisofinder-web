"use client";

/** Piezas interactivas de la Pantalla 3 (detalle): galería, contacto y tracking. */

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Card, Source } from "@/lib/p2/types";
import { PUBLISHER_LABEL } from "@/lib/labels";
import { clean } from "@/lib/format";
import { adoptTrackingSearch, detailHref, EVENTS, trackCardClick, trackEvent, type CardOrigin } from "@/lib/track";
import ContactButton from "./ContactButton";

/**
 * Emite "apertura de detalle" una vez por visita (cubre entradas directas por
 * URL). Como el detalle abre en pestaña NUEVA (05/09), el contexto de la
 * búsqueda llega por la URL (`?s=&r=&from=`) y se adopta acá antes de emitir:
 * así este evento y los clicks en contacto/aviso original quedan unidos a la
 * consulta que los originó.
 */
export function DetailTracker({
  propertyId,
  searchId,
  rank,
  from,
  vertical = null,
}: {
  propertyId: string;
  searchId: string | null;
  rank: number | null;
  from: CardOrigin | null;
  vertical?: string | null;
}) {
  // En dev, StrictMode monta dos veces y duplicaba el evento: se emite una vez
  // por propiedad (el ref sobrevive al remount simulado).
  const firedFor = useRef<string | null>(null);
  useEffect(() => {
    adoptTrackingSearch(searchId, vertical);
    if (firedFor.current === propertyId) return;
    firedFor.current = propertyId;
    let referrer: string | null = null;
    try {
      referrer = document.referrer ? new URL(document.referrer).pathname : null;
    } catch {
      /* referrer ilegible: se omite */
    }
    trackEvent(EVENTS.DETAIL_OPENED, {
      property_id: propertyId,
      rank,
      from: from ?? (searchId ? "list" : "direct"),
      referrer,
    });
  }, [propertyId, searchId, rank, from, vertical]);
  return null;
}

/**
 * Galería con TODAS las fotos del aviso (P2 manda hasta 24; hasta el 05/09 se
 * mostraban 4): foto principal con flechas y contador, tira de miniaturas
 * completa con scroll propio, teclado ← →. Las fotos que fallan (404 o
 * hotlink bloqueado) se descartan y queda el degradado de la marca.
 */
export function Gallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const stripRef = useRef<HTMLDivElement>(null);

  const usable = photos.filter((p) => !broken.has(p));
  const count = usable.length;
  const idx = count > 0 ? Math.min(active, count - 1) : 0;
  const main = usable[idx];
  const markBroken = (src: string) => setBroken((prev) => new Set(prev).add(src));
  const go = (delta: number) => {
    if (count > 1) setActive((idx + delta + count) % count);
  };

  useEffect(() => {
    if (count < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, count]);

  // La miniatura activa se mantiene a la vista dentro de la tira (vertical en
  // desktop, horizontal en mobile) sin mover la página.
  useEffect(() => {
    const strip = stripRef.current;
    const el = strip?.children[idx] as HTMLElement | undefined;
    if (!strip || !el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    const left = el.offsetLeft;
    const right = left + el.offsetWidth;
    if (top < strip.scrollTop) strip.scrollTop = top;
    else if (bottom > strip.scrollTop + strip.clientHeight) strip.scrollTop = bottom - strip.clientHeight;
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
  }, [idx]);

  if (!main) return null;

  return (
    <div className={`gallery${count < 2 ? " gallery--single" : ""}`}>
      <div className="gallery-main">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={main}
          alt={`${alt} — foto ${idx + 1} de ${count}`}
          onError={() => markBroken(main)}
          onClick={() => go(1)}
        />
        {count > 1 && (
          <>
            <button
              type="button"
              className="gallery-nav gallery-nav--prev"
              onClick={() => go(-1)}
              aria-label="Foto anterior"
            >
              ‹
            </button>
            <button
              type="button"
              className="gallery-nav gallery-nav--next"
              onClick={() => go(1)}
              aria-label="Foto siguiente"
            >
              ›
            </button>
            <span className="gallery-count" aria-live="polite">
              {idx + 1} / {count}
            </span>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="gallery-side">
          <div className="gallery-strip" ref={stripRef} role="list" aria-label="Todas las fotos">
            {usable.map((src, i) => (
              <button
                key={src}
                type="button"
                role="listitem"
                className={`gallery-thumb${i === idx ? " gallery-thumb--active" : ""}`}
                onClick={() => setActive(i)}
                aria-label={`Foto ${i + 1} de ${count}`}
                aria-current={i === idx ? "true" : undefined}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" loading="lazy" onError={() => markBroken(src)} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Contacto del detalle (T4): el botón "Consultar" es el mismo de la card
 * (WhatsApp de la inmobiliaria → WhatsApp de FINDER → teléfono → aviso), con
 * el mensaje precargado y `contact_click` medido; debajo, los canales
 * secundarios que el aviso informa (teléfono, web), también medidos.
 */
export function ContactActions({ card, rank }: { card: Card; rank: number | null }) {
  const track = (channel: string) =>
    trackEvent(EVENTS.CONTACT_CLICK, { property_id: card.id, channel, target: "agency", from: "detail", rank, position: rank });
  const phone = clean(card.contact?.phone);
  const web = clean(card.contact?.web);

  return (
    <>
      <h2>Consultar</h2>
      <p className="pub">{card.publisher ? PUBLISHER_LABEL[card.publisher] : "Publicante no informado"}</p>
      <div className="contact-actions">
        <ContactButton card={card} rank={rank} from="detail" variant="detail" />
        {phone && (
          <a className="btn btn-ghost" href={`tel:${phone.replace(/\s/g, "")}`} onClick={() => track("phone")}>
            Llamar · {phone}
          </a>
        )}
        {web && (
          <a className="btn btn-ghost" href={web} target="_blank" rel="noopener noreferrer" onClick={() => track("web")}>
            Sitio del publicante
          </a>
        )}
      </div>
    </>
  );
}

/** Procedencia: la fuente del aviso siempre visible, con click trackeado. */
export function SourceLinks({
  propertyId,
  sources,
  listingUrl,
  rank = null,
}: {
  propertyId: string;
  sources: Source[] | null;
  listingUrl: string | null;
  rank?: number | null;
}) {
  const track = (url: string | null) =>
    trackEvent(EVENTS.SOURCE_CLICK, { property_id: propertyId, url, from: "detail", rank, position: rank });

  const named = (sources ?? []).filter((s) => clean(s.name));
  if (!named.length && !listingUrl) return null;
  return (
    <div className="contact-meta">
      {named.map((s) => (
        <p key={`${s.name}-${s.id}`}>
          Fuente: {clean(s.url) ? (
            <a href={s.url!} target="_blank" rel="noopener noreferrer" onClick={() => track(s.url)}>
              {s.name} ↗
            </a>
          ) : (
            s.name
          )}
        </p>
      ))}
      {listingUrl && (
        <p>
          <a href={listingUrl} target="_blank" rel="noopener noreferrer" onClick={() => track(listingUrl)}>
            Ver aviso original ↗
          </a>
        </p>
      )}
    </div>
  );
}

/** Comparable clickeable: también abre en pestaña nueva y hereda la búsqueda. */
export function MiniCardLink({
  id,
  searchId,
  children,
}: {
  id: string;
  searchId: string | null;
  children: React.ReactNode;
}) {
  return (
    <a
      className="minicard"
      href={detailHref(id, { searchId, from: "comparable" })}
      target="_blank"
      rel="noopener"
      onClick={() => trackCardClick({ id, opportunity_score: null }, "comparable", null)}
    >
      {children}
    </a>
  );
}

const noop = () => () => {};
const hasHistory = () => window.history.length > 1;
const serverSnapshot = () => null;

/**
 * El detalle abre en pestaña nueva (05/09): ahí no hay historial al que
 * volver, así que se ofrece una búsqueda nueva. Se decide con el historial
 * del browser (null en SSR e hidratación → el espacio queda reservado).
 */
export function BackLink() {
  const canGoBack = useSyncExternalStore(noop, hasHistory, serverSnapshot);
  if (canGoBack === false) {
    return (
      <Link href="/" className="backlink">
        ← Nueva búsqueda
      </Link>
    );
  }
  return (
    <button
      type="button"
      className="backlink"
      style={canGoBack === null ? { visibility: "hidden" } : undefined}
      onClick={() => history.back()}
    >
      ← Volver a los resultados
    </button>
  );
}
