import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "./globals.css";
import "./italia.css";
import localFont from "next/font/local";
import { IS_ITALIA, MARKET, MARKET_CONFIG, SITE_OG_IMAGE } from "@/lib/market";
import { ItaliaFooter, ItaliaHeader } from "@/markets/italia/Chrome";
import { ContactConfigProvider } from "@/components/ContactConfig";
import PublishCta from "@/components/PublishCta";
import { finderWhatsAppDigits, publishWhatsAppHref, siteUrl } from "@/lib/server/contact";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // El dock fijo respeta env(safe-area-inset-bottom) en iPhone.
  viewportFit: "cover",
  // Color de la barra del navegador en el teléfono: el de la cabecera.
  ...(IS_ITALIA ? { themeColor: "#0B2545" } : {}),
};

const SITE = siteUrl();

// Tipografías del mercado italia (`src/fonts/`, servidas desde el propio
// sitio: la CSP no admite fuentes de terceros). Sin preload: san_juan no las
// pide nunca; en italia entran con el primer texto que las usa.
const inter = localFont({ src: "../fonts/inter-latin.woff2", weight: "400 700", variable: "--font-inter", display: "swap", preload: false, adjustFontFallback: false });
const jakarta = localFont({ src: "../fonts/jakarta-latin.woff2", weight: "600 800", variable: "--font-jakarta", display: "swap", preload: false, adjustFontFallback: false });

const METADATA_ITALIA: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "finder Italia — case in vendita e in affitto",
    template: "%s — finder Italia",
  },
  description:
    "Scrivi la casa che cerchi con parole tue: finder trova gli immobili in vendita e in affitto e ti dice come si colloca il prezzo rispetto alla zona.",
  // og:image del sitio (`public/og-italia.png`, la genera `npm run icons`). La
  // ficha pone la suya (la foto del aviso); el resto de las páginas hereda esta.
  openGraph: {
    siteName: MARKET_CONFIG.siteName,
    locale: MARKET_CONFIG.ogLocale,
    type: "website",
    images: [{ url: SITE_OG_IMAGE, width: 1200, height: 630, alt: "finder Italia — case in vendita e in affitto" }],
  },
  twitter: { card: "summary_large_image", images: [SITE_OG_IMAGE] },
  // demo: fuera de los buscadores
  robots: { index: false, follow: false },
};

const METADATA_SAN_JUAN: Metadata = {
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

export const metadata: Metadata = IS_ITALIA ? METADATA_ITALIA : METADATA_SAN_JUAN;

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
  if (IS_ITALIA) {
    return (
      <html
        lang={MARKET_CONFIG.lang}
        data-market={MARKET}
        data-theme={MARKET_CONFIG.theme}
        className={`${inter.variable} ${jakarta.variable}`}
      >
        <body>
          <ContactConfigProvider value={contact}>
            <ItaliaHeader />
            {children}
            <ItaliaFooter />
          </ContactConfigProvider>
        </body>
      </html>
    );
  }
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
