import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PropertyCard from "@/components/PropertyCard";
import LandingTracker from "@/components/LandingTracker";
import { fmtInt } from "@/lib/format";
import {
  catalogEntries,
  comboQuery,
  comboSlug,
  comboTitle,
  getLanding,
  isPublishedSlug,
  parseSlug,
  relatedCombos,
} from "@/lib/seo";
import { siteUrl } from "@/lib/server/contact";

/**
 * Página SEO zona × tipo × operación (T6, 14/09), p. ej.
 * `/departamentos-en-alquiler-en-capital-san-juan`: título, descripción,
 * conteo REAL de P2, hasta 12 cards (las mismas de resultados, con
 * "Consultar") y un buscador precargado que lleva a la búsqueda completa con
 * mapa. Solo existen las combinaciones del catálogo (≥ 5 avisos); el resto es
 * 404. El contenido se cachea 1 h por slug (`getLanding`).
 */

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const combo = parseSlug(slug);
  if (!combo || !isPublishedSlug(slug)) return { title: "Página no encontrada", robots: { index: false } };
  const data = await getLanding(slug).catch(() => null);
  const title = comboTitle(combo);
  const count = data?.total ?? catalogEntries().find((e) => e.slug === slug)?.count ?? null;
  const description = `${count != null ? `${fmtInt(count)} ${count === 1 ? "aviso" : "avisos"} de ${combo.type.label.toLowerCase()} ${combo.op.label} en ${combo.zone.name}` : `${combo.type.label} ${combo.op.label} en ${combo.zone.name}`}, San Juan, con precio explicado, señales de oportunidad y contacto directo. FINDER compara cada aviso con su zona.`;
  const url = `${siteUrl()}/${slug}`;
  return {
    title: `${title}${count != null ? ` (${fmtInt(count)} avisos)` : ""}`,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", locale: "es_AR", siteName: "paradisofinder.com" },
  };
}

export default async function LandingPage({ params }: { params: Params }) {
  const { slug } = await params;
  const combo = parseSlug(slug);
  if (!combo || !isPublishedSlug(slug)) notFound();
  const live = await getLanding(slug);
  if (live && live.total === 0) notFound();
  // Sin respuesta de P2 (rate limit / caída): la página sigue existiendo con
  // el conteo del catálogo y el buscador; las cards llegan en la próxima visita.
  const data = live ?? { total: catalogEntries().find((e) => e.slug === slug)?.count ?? 0, cards: [], fetched_at: "" };

  const title = comboTitle(combo);
  const query = comboQuery(combo);
  const searchHref = `/buscar?${new URLSearchParams({ q: query, v: combo.type.vertical === "land" ? "lotes" : combo.op.slug === "venta" ? "comprar" : "alquilar" }).toString()}`;
  const related = relatedCombos(combo);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    url: `${siteUrl()}/${slug}`,
    description: `${fmtInt(data.total)} avisos de ${combo.type.label.toLowerCase()} ${combo.op.label} en ${combo.zone.name}, San Juan.`,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "FINDER San Juan", item: `${siteUrl()}/` },
        { "@type": "ListItem", position: 2, name: title, item: `${siteUrl()}/${slug}` },
      ],
    },
  };

  return (
    <main className="landing-page container">
      <LandingTracker slug={slug} total={data.total} shown={data.cards.length} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1>{title}</h1>
      <p className="landing-lead" data-testid="landing-count">
        {fmtInt(data.total)} {data.total === 1 ? "aviso publicado" : "avisos publicados"} {live ? "hoy" : "recientemente"} en {combo.zone.name}. FINDER
        compara cada uno con su zona y te explica el precio
        {data.cards.length > 0
          ? `: acá van ${data.cards.length === data.total ? "todos" : `los ${data.cards.length} mejor puntuados`}.`
          : ". Los avisos se están actualizando: buscá con el mapa o volvé en un rato."}
      </p>

      <form className="landing-search" action="/buscar" method="get" role="search">
        <input type="text" name="q" defaultValue={query} aria-label="Afiná la búsqueda" />
        <input type="hidden" name="v" value={combo.type.vertical === "land" ? "lotes" : combo.op.slug === "venta" ? "comprar" : "alquilar"} />
        <button type="submit" className="btn btn-magenta">
          Buscar con mapa
        </button>
      </form>

      <div className="cards-grid" data-testid="landing-cards">
        {data.cards.map((card, i) => (
          <PropertyCard key={card.id} card={card} rank={i + 1} vertical={combo.type.vertical === "land" ? "lotes" : combo.op.slug === "venta" ? "comprar" : "alquilar"} />
        ))}
      </div>

      {(data.total > data.cards.length || !live) && (
        <p className="landing-more">
          <Link className="btn btn-ghost" href={searchHref}>
            Ver los {fmtInt(data.total)} resultados con mapa →
          </Link>
        </p>
      )}

      {(related.sameSearch.length > 0 || related.sameZone.length > 0) && (
        <nav className="landing-links" aria-label="Otras búsquedas">
          {related.sameSearch.length > 0 && (
            <>
              <h2>
                {combo.type.label} {combo.op.label} en otras zonas
              </h2>
              <ul>
                {related.sameSearch.map((c) => (
                  <li key={comboSlug(c)}>
                    <Link href={`/${comboSlug(c)}`}>{c.zone.name}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {related.sameZone.length > 0 && (
            <>
              <h2 style={{ marginTop: 18 }}>Más en {combo.zone.name}</h2>
              <ul>
                {related.sameZone.map((c) => (
                  <li key={comboSlug(c)}>
                    <Link href={`/${comboSlug(c)}`}>
                      {c.type.label} {c.op.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </nav>
      )}
    </main>
  );
}
