import type { MetadataRoute } from "next";
import { catalogEntries, catalogGeneratedAt } from "@/lib/seo";
import { siteUrl } from "@/lib/server/contact";

/**
 * sitemap.xml (T6): la home y las páginas zona × tipo × operación con ≥ 5
 * avisos según `src/data/seo-catalog.json` (`scripts/seo-catalog.mjs`). Los
 * detalles de propiedad no van (miles, rotan): se descubren desde las landings.
 */
export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const generated = new Date(catalogGeneratedAt());
  const lastModified = Number.isNaN(generated.getTime()) ? new Date() : generated;
  return [
    { url: `${base}/`, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    ...catalogEntries().map((e) => ({
      url: `${base}/${e.slug}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: e.count >= 50 ? 0.8 : 0.6,
    })),
  ];
}
