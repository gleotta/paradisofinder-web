import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/server/contact";

/**
 * robots.txt (T6): todo indexable salvo la API, los resultados de búsqueda
 * (dinámicos y con `noindex` propio) y el tablero interno. `SITE_URL` se lee
 * por request, no en el build (Docker construye sin env).
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/buscar", "/interno/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
