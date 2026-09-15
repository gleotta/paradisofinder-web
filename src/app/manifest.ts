import type { MetadataRoute } from "next";

/**
 * Web App Manifest (15/09): nombre, colores e íconos para el acceso directo en
 * Android ("Agregar a la pantalla principal"). iPhone usa `apple-icon.png`.
 *
 * Los PNG viven en `public/icons/` y los genera `npm run icons` desde
 * `src/app/icon.svg`, junto con favicon.ico y apple-icon.png. Van en public/ y
 * no como `icon.tsx`: un `icon.tsx` en app/ agregaría un `<link rel="icon">`
 * por tamaño al <head> (estos solo los pide el manifest), y así todos los
 * rasters salen del mismo SVG con el mismo script.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FINDER · San Juan",
    short_name: "FINDER",
    description: "Inteligencia inmobiliaria para San Juan: escribí lo que buscás y FINDER te muestra oportunidades explicadas.",
    lang: "es-AR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: "#4D1480",
    background_color: "#F4EDF7",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
