"use client";

import { useState } from "react";
import type { Card } from "@/lib/p2/types";
import { PROPERTY_TYPE_LABEL } from "@/lib/labels";
import { mainPrice, zoneName } from "@/lib/format";
import { propertyShareUrl } from "@/lib/share";
import { EVENTS, trackEvent, type CardOrigin } from "@/lib/track";
import { useContactConfig } from "./ContactConfig";

/**
 * Compartir una propiedad (15/09): comparte su `share_url` — la URL pública del
 * detalle, cuyo Open Graph arma la tarjeta con foto, precio y señal en WhatsApp
 * e Instagram. En el celular abre el menú nativo (`navigator.share`); donde no
 * existe, copia el link. La URL queda expuesta en `data-share-url`.
 * Medido como `share_click` (solo en el log de P1: no entra en el enum de P2).
 */
export default function ShareButton({
  card,
  rank = null,
  from = "list",
  variant = "card",
}: {
  card: Pick<Card, "id" | "property_type" | "zone" | "price" | "currency" | "operation" | "rental_period">;
  rank?: number | null;
  from?: CardOrigin | "detail";
  variant?: "card" | "detail";
}) {
  const { siteUrl } = useContactConfig();
  const [copied, setCopied] = useState(false);
  const url = propertyShareUrl(siteUrl, card.id);
  const title = `${PROPERTY_TYPE_LABEL[card.property_type] ?? "Propiedad"} en ${zoneName(card.zone)} · ${mainPrice(card)}`;

  const onClick = async () => {
    const native = typeof navigator.share === "function";
    trackEvent(EVENTS.SHARE_CLICK, { property_id: card.id, rank, position: rank, from, method: native ? "native" : "copy" });
    if (native) {
      try {
        await navigator.share({ title, text: title, url });
        return;
      } catch (err) {
        // Cancelado por el usuario: nada más que hacer. Otro error: se copia.
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copiá el link de la propiedad", url);
    }
  };

  const label = copied ? "Link copiado" : "Compartir";
  return (
    <button
      type="button"
      className={`btn btn-ghost btn-share btn-share--${variant}`}
      onClick={onClick}
      data-share-url={url}
      aria-label={variant === "card" ? label : undefined}
      title={variant === "card" ? label : undefined}
    >
      <ShareGlyph />
      {variant === "detail" && <span aria-live="polite">{label}</span>}
      {variant === "card" && copied && (
        <span className="share-copied" role="status">
          Link copiado
        </span>
      )}
    </button>
  );
}

function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"
      />
    </svg>
  );
}
