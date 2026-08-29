import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // El dock fijo respeta env(safe-area-inset-bottom) en iPhone.
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "FINDER · San Juan — paradisofinder.com",
    template: "%s — FINDER San Juan",
  },
  description:
    "Inteligencia inmobiliaria conversacional para San Juan: escribí lo que buscás y FINDER te muestra oportunidades explicadas, con señales y comparables.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="wordmark">
              paradiso<b>finder</b>
              <span className="dot">.</span>com
            </Link>
            <span className="market-tag">San Juan · Argentina</span>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="container">
            <span>FINDER · Mercado San Juan</span>
            <span>
              Señales e indicadores precomputados sobre avisos públicos. Cada dato enlaza a su
              aviso original.
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
