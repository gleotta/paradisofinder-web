"use client";

import { EVENTS, trackEvent } from "@/lib/track";

/**
 * "Publicá tu propiedad" (MVP beta, 05/09): contacto por WhatsApp para
 * inmobiliarias y dueños que quieran publicar en FINDER. El `href` lo arma el
 * server con `CONTACT_WHATSAPP` (ver `src/lib/server/contact.ts`); sin número
 * configurado no se renderiza nada. El click se trackea como
 * `publish_contact_click` con la pantalla de origen.
 */
export default function PublishCta({
  href,
  variant,
}: {
  href: string | null;
  variant: "header" | "home" | "footer";
}) {
  if (!href) return null;
  const linkProps = {
    href,
    target: "_blank",
    rel: "noopener noreferrer",
    onClick: () => trackEvent(EVENTS.PUBLISH_CONTACT, { screen: variant }),
  } as const;

  if (variant === "header") {
    return (
      <a className="btn btn-ghost btn-sm publish-cta" {...linkProps} title="Escribinos por WhatsApp">
        <WaIcon />
        <span className="publish-cta-long">Publicá tu propiedad</span>
        <span className="publish-cta-short">Publicá</span>
      </a>
    );
  }

  if (variant === "home") {
    return (
      <section className="publish-block" aria-labelledby="publish-title">
        <div>
          <h2 id="publish-title">¿Sos inmobiliaria o vendés tu propiedad?</h2>
          <p>
            Publicá tus avisos en FINDER y aparecé en las búsquedas con señales explicadas.
            Escribinos y lo coordinamos por WhatsApp.
          </p>
        </div>
        <a className="btn btn-magenta" {...linkProps}>
          <WaIcon /> Quiero publicar
        </a>
      </section>
    );
  }

  return (
    <a className="footer-publish" {...linkProps}>
      <WaIcon /> ¿Querés publicar tu propiedad? Escribinos por WhatsApp
    </a>
  );
}

function WaIcon() {
  return (
    <svg className="wa-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 1.8a8.2 8.2 0 1 1-4.2 15.3l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8Zm-3 4.4c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.2 5 4.4 2.5 1 3 .8 3.5.7.5 0 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3l-2-1c-.3-.1-.5-.2-.7.2l-.9 1.1c-.2.2-.3.2-.6.1a6.8 6.8 0 0 1-3.4-3c-.2-.4 0-.5.2-.7l.5-.6.3-.5c.1-.2 0-.4 0-.5L10.5 9c-.2-.6-.5-.5-.7-.5H9Z"
      />
    </svg>
  );
}
