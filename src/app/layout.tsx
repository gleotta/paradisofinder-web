import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "./globals.css";
import { ContactConfigProvider } from "@/components/ContactConfig";
import PublishCta from "@/components/PublishCta";
import { finderWhatsAppDigits, publishWhatsAppHref, siteUrl } from "@/lib/server/contact";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // El dock fijo respeta env(safe-area-inset-bottom) en iPhone.
  viewportFit: "cover",
};

const SITE = siteUrl();

export const metadata: Metadata = {
  // Base de canonical / Open Graph / sitemap (T6): `SITE_URL` del server.
  metadataBase: new URL(SITE),
  title: {
    default: "FINDER · San Juan (beta) — paradisofinder.com",
    template: "%s — FINDER San Juan",
  },
  description:
    "Inteligencia inmobiliaria para San Juan: escribí lo que buscás y FINDER te muestra oportunidades explicadas, con señales y comparables. Versión beta.",
  openGraph: {
    siteName: "paradisofinder.com",
    locale: "es_AR",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

/**
 * MVP beta (05/09 — `docs/DECISION_2026-09-05_mvp-beta.md`): la etiqueta Beta
 * acompaña a la marca en todas las pantallas, el pie lo explica, y el botón
 * "Publicá tu propiedad" (WhatsApp, `CONTACT_WHATSAPP`) invita a inmobiliarias
 * y dueños a sumar sus avisos. El mismo número es el fallback del botón
 * "Consultar" de cada card (T4, 14/09) y baja al árbol por contexto.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render por request en TODAS las páginas: el número de WhatsApp se lee del
  // env al momento, no queda horneado en el build de la home/resultados.
  await connection();
  const publishHref = publishWhatsAppHref();
  const contact = { finderWhatsApp: finderWhatsAppDigits(), siteUrl: SITE };
  return (
    <html lang="es-AR">
      <body>
        <ContactConfigProvider value={contact}>
          <header className="site-header">
            <div className="container">
              <div className="brand">
                <Link href="/" className="wordmark">
                  paradiso<b>finder</b>
                  <span className="dot">.</span>com
                </Link>
                <span className="beta-tag" title="Versión beta: estamos ajustando la búsqueda y las señales">
                  Beta
                </span>
              </div>
              <div className="header-right">
                <span className="market-tag">San Juan · Argentina</span>
                <PublishCta href={publishHref} variant="header" />
              </div>
            </div>
          </header>
          {children}
          <footer className="site-footer">
            <div className="container">
              <span>
                FINDER · Mercado San Juan · <strong>versión beta</strong>
              </span>
              <span>
                Señales e indicadores precomputados sobre avisos públicos. Cada dato enlaza a su
                aviso original. En esta beta podés encontrar datos incompletos o señales en ajuste.
              </span>
              <PublishCta href={publishHref} variant="footer" />
            </div>
          </footer>
        </ContactConfigProvider>
      </body>
    </html>
  );
}
