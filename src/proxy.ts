import { NextResponse, type NextRequest } from "next/server";

/**
 * Dos cosas, en este orden:
 *
 * 1. Redirección de dominio (15/09): `finder.paradisoestate.com` → 301 a
 *    `https://paradisofinder.com` con el mismo path y query. Va antes que todo
 *    y por eso el matcher es `/:path*`, sin exclusiones: la redirección tiene
 *    que alcanzar también a /api, a los assets, a los íconos y a los prefetch
 *    del router (con el matcher anterior esas rutas se seguían sirviendo desde
 *    el dominio viejo).
 *    - Host: detrás del edge de Railway manda `x-forwarded-host` (primer valor);
 *      si no está, `host`. Minúsculas, sin `:puerto` e igualdad exacta: nada más
 *      se redirige (localhost, el `*.up.railway.app`, el healthcheck de Railway).
 *    - Destino fijo en el código, NO `SITE_URL`: si esa variable quedara cargada
 *      con el host viejo, el sitio entraría en loop.
 *    - `Cache-Control: private`: paradisofinder.com pasa por Cloudflare, que
 *      cachea assets (`/_next/static`, `/favicon.ico`). Un 301 pedido ahí con un
 *      `x-forwarded-host` falsificado no puede quedar guardado para todos: sería
 *      un loop. `max-age` de un día para que un error no quede fijo en los browsers.
 *
 * 2. Content-Security-Policy con nonce por request (guía oficial de Next:
 *    `content-security-policy.md`), solo en páginas HTML. Next inyecta el nonce
 *    en sus scripts inline cuando ve el header en la request; por eso viaja
 *    también como `x-nonce` y exige render dinámico (el layout hace
 *    `await connection()`). Las rutas API, los assets, los íconos/manifest y los
 *    prefetch `purpose: prefetch` salen sin CSP (el nonce sería un costo inútil);
 *    esas exclusiones antes estaban en el matcher y ahora van acá, después de la
 *    redirección.
 *
 *    Qué permite y por qué:
 *    - script-src: solo scripts con nonce + `strict-dynamic` (los chunks que esos
 *      cargan). En dev, `unsafe-eval` para el debugging de React.
 *    - style-src `unsafe-inline`: el SSR emite atributos `style=""` (puntos de
 *      rating, backlink) y Leaflet inyecta estilos; CSP no distingue nonce ahí.
 *    - img-src abierto: las fotos vienen de portales arbitrarios y los tiles de
 *      OpenStreetMap. Es el único origen externo de la app.
 *    - connect-src `self`: el browser solo habla con el server de P1
 *      (topología A: jamás con P2).
 *    - frame-ancestors `none` + base-uri/form-action `self`.
 */
const OLD_HOST = "finder.paradisoestate.com";
const CANONICAL_ORIGIN = "https://paradisofinder.com";

/** Rutas que no son HTML: sin CSP. `/icons/` son los PNG del manifest (public/). */
const NO_CSP_PREFIX = /^\/(?:api|_next\/static|_next\/image|icons)(?:\/|$)/;
const ICON_FILES = new Set(["/favicon.ico", "/icon.svg", "/apple-icon.png", "/manifest.webmanifest"]);

function requestHost(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
  const host = forwarded || request.headers.get("host") || "";
  return host.toLowerCase().replace(/:\d+$/, "");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (requestHost(request) === OLD_HOST) {
    // pathname y search se asignan sobre el origen fijo (no `new URL(path, base)`):
    // un path como `//otro.host/x` resuelto contra la base cambiaría el destino.
    // Next vuelve a serializar la query antes del proxy (quita sus parámetros
    // internos con URLSearchParams): los espacios llegan como `+` y un `+` real
    // como `%2B`, así que pasar `+` a `%20` devuelve la query tal como se pidió.
    const target = new URL(CANONICAL_ORIGIN);
    target.pathname = pathname;
    target.search = search.replace(/\+/g, "%20");
    const redirect = NextResponse.redirect(target, 301);
    redirect.headers.set("Cache-Control", "private, max-age=86400");
    return redirect;
  }

  // `next-router-prefetch` no se puede mirar acá: Next lo borra de la request antes
  // del proxy (adapter, FLIGHT_HEADERS). Esos prefetch del router llevan la CSP,
  // que en una respuesta RSC (fetch, no documento) no tiene efecto.
  const isPrefetch = request.headers.get("purpose") === "prefetch";
  if (isPrefetch || NO_CSP_PREFIX.test(pathname) || ICON_FILES.has(pathname)) {
    return NextResponse.next();
  }

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
  // Todo: la redirección de dominio no puede tener agujeros (ver arriba).
  matcher: "/:path*",
};
