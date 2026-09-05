import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy con nonce por request (guía oficial de Next:
 * `content-security-policy.md`). Next inyecta el nonce en sus scripts inline
 * cuando ve el header en la request; por eso viaja también como `x-nonce` y
 * exige render dinámico (el layout hace `await connection()`).
 *
 * Qué permite y por qué:
 *  - script-src: solo scripts con nonce + `strict-dynamic` (los chunks que esos
 *    cargan). En dev, `unsafe-eval` para el debugging de React.
 *  - style-src `unsafe-inline`: el SSR emite atributos `style=""` (puntos de
 *    rating, backlink) y Leaflet inyecta estilos; CSP no distingue nonce ahí.
 *  - img-src abierto: las fotos vienen de portales arbitrarios y los tiles de
 *    OpenStreetMap. Es el único origen externo de la app.
 *  - connect-src `self`: el browser solo habla con el server de P1
 *    (topología A: jamás con P2).
 *  - frame-ancestors `none` + base-uri/form-action `self`.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Páginas HTML solamente: las rutas API, los assets y los prefetches no
      // necesitan CSP (y el nonce sería un costo inútil).
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
