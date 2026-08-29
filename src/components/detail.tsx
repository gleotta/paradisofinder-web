"use client";

/** Piezas interactivas de la Pantalla 3 (detalle): galería, contacto y tracking. */

import { useEffect, useState } from "react";
import type { ContactInfo, Publisher, Source } from "@/lib/p2/types";
import { PUBLISHER_LABEL } from "@/lib/labels";
import { EVENTS, trackEvent } from "@/lib/track";

/** Emite "apertura de detalle" una vez por visita (cubre entradas directas por URL). */
export function DetailTracker({ propertyId }: { propertyId: string }) {
  useEffect(() => {
    trackEvent(EVENTS.DETAIL_OPENED, { property_id: propertyId });
  }, [propertyId]);
  return null;
}

export function Gallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  // Con datos reales varias fotos de los portales 404 o bloquean el hotlink:
  // las que fallan se descartan y queda el degradado de la marca.
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const usable = photos.filter((p) => !broken.has(p));
  const markBroken = (src: string) => setBroken((prev) => new Set(prev).add(src));
  const main = usable[active] ?? usable[0];
  const thumbs = usable.slice(0, 5);

  return (
    <div className="gallery">
      <div className="gallery-main">
        {main && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={main} alt={alt} onError={() => markBroken(main)} />
        )}
      </div>
      {thumbs.length > 1 && (
        <div className="gallery-side">
          {thumbs.slice(0, 4).map((src, i) => (
            <button
              key={src}
              type="button"
              className={`gallery-thumb${i === active ? " gallery-thumb--active" : ""}`}
              onClick={() => setActive(i)}
              aria-label={`Foto ${i + 1} de ${thumbs.length}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading="lazy" onError={() => markBroken(src)} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function waLink(number: string): string {
  return `https://wa.me/${number.replace(/[^\d]/g, "")}`;
}

export function ContactActions({
  propertyId,
  contact,
  publisher,
}: {
  propertyId: string;
  contact: ContactInfo | null;
  publisher: Publisher | null;
}) {
  const track = (channel: string) =>
    trackEvent(EVENTS.CONTACT_CLICK, { property_id: propertyId, channel });

  const hasAny = contact && (contact.whatsapp || contact.phone || contact.web);

  return (
    <>
      <h2>Contacto</h2>
      <p className="pub">{publisher ? PUBLISHER_LABEL[publisher] : "Publicante no informado"}</p>
      {hasAny ? (
        <div className="contact-actions">
          {contact?.whatsapp && (
            <a
              className="btn btn-magenta"
              href={waLink(contact.whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("whatsapp")}
            >
              WhatsApp
            </a>
          )}
          {contact?.phone && (
            <a className="btn btn-ghost" href={`tel:${contact.phone.replace(/\s/g, "")}`} onClick={() => track("phone")}>
              Llamar · {contact.phone}
            </a>
          )}
          {contact?.web && (
            <a
              className="btn btn-ghost"
              href={contact.web}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("web")}
            >
              Sitio del publicante
            </a>
          )}
        </div>
      ) : (
        <p className="pub">El aviso no informa datos de contacto directo; entrá al aviso original.</p>
      )}
    </>
  );
}

/** Procedencia: la fuente del aviso siempre visible, con click trackeado. */
export function SourceLinks({
  propertyId,
  sources,
  listingUrl,
}: {
  propertyId: string;
  sources: Source[] | null;
  listingUrl: string | null;
}) {
  const track = (url: string | null) =>
    trackEvent(EVENTS.SOURCE_CLICK, { property_id: propertyId, url });

  if (!sources?.length && !listingUrl) return null;
  return (
    <div className="contact-meta">
      {sources?.map((s) => (
        <p key={`${s.name}-${s.id}`}>
          Fuente: {s.url ? (
            <a href={s.url} target="_blank" rel="noopener noreferrer" onClick={() => track(s.url)}>
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

export function BackLink() {
  return (
    <button type="button" className="backlink" onClick={() => history.back()}>
      ← Volver a los resultados
    </button>
  );
}
