/**
 * URLs públicas de una propiedad (15/09). Una sola fuente para:
 *  - `share_url`: lo que comparte el botón de la card y del detalle, el link del
 *    mensaje de "Consultar" y la canonical del detalle. Sin `?s=&r=`: esos son de
 *    la pestaña que abrió el detalle, no del link que se manda a otra persona.
 *  - la og:image propia, servida desde el dominio (`src/app/og/propiedad/[file]/route.ts`).
 */
function origin(siteUrl: string): string {
  return siteUrl.replace(/\/$/, "");
}

export function propertyShareUrl(siteUrl: string, id: string): string {
  return `${origin(siteUrl)}/propiedad/${encodeURIComponent(id)}`;
}

export function propertyOgImageUrl(siteUrl: string, id: string): string {
  return `${origin(siteUrl)}/og/propiedad/${encodeURIComponent(id)}.jpg`;
}
