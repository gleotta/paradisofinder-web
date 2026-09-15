"use client";

import type { Card } from "@/lib/p2/types";
import { PROPERTY_TYPE_LABEL } from "@/lib/labels";
import { clean, mainPrice, zoneName } from "@/lib/format";
import { propertyShareUrl } from "@/lib/share";
import { EVENTS, trackEvent, type CardOrigin } from "@/lib/track";
import { useContactConfig } from "./ContactConfig";

/**
 * Botón "Consultar" (T4, 14/09): el contacto ocurre EN FINDER y se mide.
 * Canal: WhatsApp de la inmobiliaria si P2 lo trae en `contact.whatsapp`; si
 * no, el WhatsApp de FINDER (`CONTACT_WHATSAPP`); si tampoco, el teléfono del
 * aviso (`tel:`), su web, o el aviso original. Siempre hay botón.
 * El mensaje va precargado con referencia del aviso, tipo/zona/precio y el
 * link al detalle en paradisofinder.com.
 */
export type ContactChannel = "whatsapp" | "phone" | "web" | "listing";
export type ContactTarget = "agency" | "finder" | "listing";

export function contactMessage(card: Card, siteUrl: string): string {
  const type = PROPERTY_TYPE_LABEL[card.property_type] ?? "Propiedad";
  const src = card.sources?.[0];
  const ref = src ? `${clean(src.name) ?? "aviso"} ${clean(src.id) ?? ""}`.trim() : null;
  const parts = [
    `Hola, vi este aviso en paradisofinder.com y quiero consultar:`,
    `${type} en ${zoneName(card.zone)} · ${mainPrice(card)}`,
    ref ? `Ref. ${ref}` : null,
    siteUrl ? propertyShareUrl(siteUrl, card.id) : null,
  ].filter(Boolean);
  return parts.join("\n");
}

export function resolveContact(
  card: Card,
  finderWhatsApp: string | null,
  siteUrl: string,
): { href: string; channel: ContactChannel; target: ContactTarget; external: boolean } | null {
  const text = encodeURIComponent(contactMessage(card, siteUrl));
  const agencyWa = clean(card.contact?.whatsapp)?.replace(/\D/g, "");
  if (agencyWa && agencyWa.length >= 8) {
    return { href: `https://wa.me/${agencyWa}?text=${text}`, channel: "whatsapp", target: "agency", external: true };
  }
  if (finderWhatsApp) {
    return { href: `https://wa.me/${finderWhatsApp}?text=${text}`, channel: "whatsapp", target: "finder", external: true };
  }
  const phone = clean(card.contact?.phone);
  if (phone) return { href: `tel:${phone.replace(/\s/g, "")}`, channel: "phone", target: "agency", external: false };
  const web = clean(card.contact?.web);
  if (web) return { href: web, channel: "web", target: "agency", external: true };
  const listing = clean(card.listing_url);
  if (listing) return { href: listing, channel: "listing", target: "listing", external: true };
  return null;
}

export default function ContactButton({
  card,
  rank = null,
  from = "list",
  variant = "card",
}: {
  card: Card;
  rank?: number | null;
  from?: CardOrigin | "detail";
  variant?: "card" | "detail";
}) {
  const { finderWhatsApp, siteUrl } = useContactConfig();
  const target = resolveContact(card, finderWhatsApp, siteUrl);
  if (!target) return null;
  const onClick = () =>
    trackEvent(EVENTS.CONTACT_CLICK, {
      property_id: card.id,
      rank,
      position: rank,
      channel: target.channel,
      target: target.target,
      from,
      score: card.opportunity_score,
      price_usd: card.price_usd,
    });
  const label = target.channel === "phone" ? "Llamar" : "Consultar";
  return (
    <a
      className={`btn btn-magenta btn-consult${variant === "detail" ? " btn-consult--detail" : ""}`}
      href={target.href}
      onClick={onClick}
      {...(target.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      aria-label={`${label} por ${target.channel === "whatsapp" ? "WhatsApp" : target.channel === "phone" ? "teléfono" : "el aviso"}`}
      data-channel={target.channel}
      data-target={target.target}
    >
      {target.channel === "whatsapp" && <WaGlyph />}
      {label}
    </a>
  );
}

function WaGlyph() {
  return (
    <svg className="wa-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 1.8a8.2 8.2 0 1 1-4.2 15.3l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8Zm-3 4.4c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.2 5 4.4 2.5 1 3 .8 3.5.7.5 0 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.2-.7.2l-.9 1.1c-.2.2-.3.2-.6.1a6.8 6.8 0 0 1-3.4-3c-.2-.4 0-.5.2-.7l.5-.6.3-.5c.1-.2 0-.4 0-.5L10.5 9c-.2-.6-.5-.5-.7-.5H9Z"
      />
    </svg>
  );
}
