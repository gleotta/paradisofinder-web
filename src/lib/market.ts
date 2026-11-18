/**
 * Mercado del deployment (17/11 — rama `italia`).
 *
 * Un deployment de P1 atiende UN mercado, igual que P2 (`MARKET_CITTA`). Se
 * elige en el BUILD con `NEXT_PUBLIC_MARKET` (default `san_juan`): es una
 * constante en el server y en el browser, sin contexto ni fetch, y el código
 * del otro mercado no viaja al cliente.
 *
 *   san_juan  paradisofinder.com — es-AR, USD/ARS, cuatro verticales.
 *   italia    demoitalia.paradisofinder.com — it-IT, EUR. Se presenta como el
 *             sitio de la propia inmobiliaria: solo Vendita y Affitto, sin
 *             inversión, sin lotes como vertical, sin landings SEO, sin link
 *             al aviso de origen; el contacto es la agencia del inmueble.
 *
 * Este módulo es el único que sabe qué cambia entre uno y otro. Los TEXTOS
 * van por `t()` (`src/lib/i18n.ts`), el aspecto por los tokens de
 * `src/app/italia.css` (`html[data-market="italia"]`).
 */

export type MarketId = "san_juan" | "italia";
export type ThemeId = "default" | "blu" | "era";

// Esta rama (`italia`) es SOLO el sitio de Italia (decisión de German, 18/11):
// el default es italia y los textos de resultados, card y ficha están escritos
// en italiano directamente. San Juan vive en sus ramas de siempre.
export const MARKET: MarketId = process.env.NEXT_PUBLIC_MARKET === "san_juan" ? "san_juan" : "italia";
export const IS_ITALIA = MARKET === "italia";

export interface MarketConfig {
  id: MarketId;
  /** `lang` del documento y locale de `Intl`. */
  lang: string;
  /** Locale de Open Graph. */
  ogLocale: string;
  /** Origen público cuando no hay `SITE_URL`. */
  defaultSiteUrl: string;
  siteName: string;
  /** Paleta: `blu` (propuesta) o `era` en italia; `default` en san_juan. */
  theme: ThemeId;
  /** Rutas públicas (las de italia se reescriben en `src/proxy.ts`). */
  routes: { search: string; property: string };
  /** Centro y zoom del mapa sin resultados. */
  map: { center: [number, number]; zoom: number };
  modules: {
    /** Vertical Invertir + panel de análisis de inversión. */
    invest: boolean;
    /** Lotes como vertical propia del selector. */
    landVertical: boolean;
    /** Landings SEO (`/[slug]`) y propiedades en el sitemap. */
    seoLandings: boolean;
    /** "Publicá tu propiedad" y etiqueta Beta. */
    publishCta: boolean;
    /** Link al aviso en el portal de origen. */
    sourceLink: boolean;
  };
}

const CONFIGS: Record<MarketId, MarketConfig> = {
  san_juan: {
    id: "san_juan",
    lang: "es-AR",
    ogLocale: "es_AR",
    defaultSiteUrl: "https://paradisofinder.com",
    siteName: "paradisofinder.com",
    theme: "default",
    routes: { search: "/buscar", property: "/propiedad" },
    map: { center: [-31.5375, -68.5364], zoom: 11 },
    modules: { invest: true, landVertical: true, seoLandings: true, publishCta: true, sourceLink: true },
  },
  italia: {
    id: "italia",
    lang: "it-IT",
    ogLocale: "it_IT",
    defaultSiteUrl: "https://demoitalia.paradisofinder.com",
    siteName: "finder Italia",
    theme: process.env.NEXT_PUBLIC_THEME === "era" ? "era" : "blu",
    routes: { search: "/cerca", property: "/immobile" },
    map: { center: [42.5, 12.5], zoom: 6 },
    modules: { invest: false, landVertical: false, seoLandings: false, publishCta: false, sourceLink: false },
  },
};

export const MARKET_CONFIG: MarketConfig = CONFIGS[MARKET];

/** URL de resultados del mercado (`/buscar?…` · `/cerca?…`). */
export function searchHref(params: URLSearchParams | string): string {
  const qs = typeof params === "string" ? params : params.toString();
  return qs ? `${MARKET_CONFIG.routes.search}?${qs}` : MARKET_CONFIG.routes.search;
}

/** og:image del sitio de italia (1200x630): `public/og-italia.png`, la genera
 *  `npm run icons` desde `scripts/og-italia.svg`. La hereda toda página que no
 *  ponga la suya; la ficha usa la foto del aviso y cae en esta si no hay. */
export const SITE_OG_IMAGE = "/og-italia.png";
