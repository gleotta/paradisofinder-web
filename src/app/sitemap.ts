import type { MetadataRoute } from "next";
import { catalogEntries, catalogGeneratedAt } from "@/lib/seo";
import { siteUrl } from "@/lib/server/contact";
import { sitemapProperties } from "@/lib/server/property-sitemap";
import { propertyShareUrl } from "@/lib/share";

/**
 * sitemap.xml (T6): la home, las páginas zona × tipo × operación con ≥ 5
 * avisos según `src/data/seo-catalog.json` (`scripts/seo-catalog.mjs`) y, desde
 * el 15/09, `/propiedad/<id>` de los avisos activos con `quality_tier >= 2`
 * (lastmod = `listing_updated_at`). Las propiedades salen de un snapshot que se
 * refresca en segundo plano (`src/lib/server/property-sitemap.ts`): este
 * request nunca espera a P2.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const generated = new Date(catalogGeneratedAt());
  const lastModified = Number.isNaN(generated.getTime()) ? new Date() : generated;
  const properties = await sitemapProperties();
  return [
    { url: `${base}/`, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    ...catalogEntries().map((e) => ({
      url: `${base}/${e.slug}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: e.count >= 50 ? 0.8 : 0.6,
    })),
    ...properties.map((p) => ({
      url: propertyShareUrl(base, p.id),
      ...(p.lastmod ? { lastModified: p.lastmod } : {}),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
