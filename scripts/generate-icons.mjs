#!/usr/bin/env node
/**
 * Íconos de marca (15/09) a partir de UNA fuente vectorial, `src/app/icon.svg`
 * (cuadrado violeta redondeado + "f" blanca + punto magenta, en `<g id="glyph">`):
 *
 *   src/app/favicon.ico                  16 + 32 + 48 px (entradas PNG dentro del ICO)
 *   src/app/apple-icon.png               180 px, fondo lleno sin transparencia, letra con margen
 *   public/icons/icon-192.png            manifest, purpose "any" (el SVG tal cual)
 *   public/icons/icon-512.png            ídem
 *   public/icons/icon-maskable-512.png   manifest, purpose "maskable" (fondo lleno,
 *                                        letra dentro de la zona segura del 80 %)
 *
 *   npm run icons
 *
 * Usa `sharp`, que ya está en node_modules como dependencia opcional de Next
 * (no se agrega nada al package.json). Los archivos generados se versionan:
 * el build de Docker no corre este script (`scripts/` está en .dockerignore).
 * Si cambia icon.svg, correrlo de nuevo y commitear todo junto.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const source = readFileSync(path.join(root, "src/app/icon.svg"), "utf8");

const VIEWBOX = 64;
// Fondo lleno (apple-icon, maskable): la letra al 80 % queda con margen propio
// y su punto más lejano del centro (el borde del punto magenta) a ~23 unidades,
// dentro del radio seguro de maskable (40 % de 64 = 25,6).
const FULL_BLEED_SCALE = 0.8;

const glyph = source.match(/<g id="glyph">[\s\S]*?<\/g>/)?.[0];
const background = source.match(/<rect[^>]*fill="(#[0-9A-Fa-f]{6})"/)?.[1];
if (!glyph || !background) {
  console.error('icon.svg: falta <g id="glyph"> o el <rect> de fondo con fill="#RRGGBB"');
  process.exit(1);
}

const fullBleedSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEWBOX}" height="${VIEWBOX}" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">
  <rect width="${VIEWBOX}" height="${VIEWBOX}" fill="${background}"/>
  <g transform="translate(32 32) scale(${FULL_BLEED_SCALE}) translate(-32 -32)">${glyph}</g>
</svg>`;

/** Rasteriza el SVG directo al tamaño pedido (sin reducir desde uno grande). */
function render(svg, size, { opaque = false } = {}) {
  let img = sharp(Buffer.from(svg), { density: (72 * size) / VIEWBOX }).resize(size, size);
  if (opaque) img = img.flatten({ background });
  return img.png({ compressionLevel: 9 }).toBuffer();
}

/** ICO con entradas PNG: encabezado de 6 bytes + 16 por entrada + los PNG. */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // tipo: ícono
  header.writeUInt16LE(images.length, 4);
  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;
  images.forEach(({ size, data }, i) => {
    const at = i * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, at); // ancho (0 = 256)
    directory.writeUInt8(size >= 256 ? 0 : size, at + 1); // alto
    directory.writeUInt8(0, at + 2); // colores de paleta: ninguno
    directory.writeUInt8(0, at + 3); // reservado
    directory.writeUInt16LE(1, at + 4); // planos
    directory.writeUInt16LE(32, at + 6); // bits por píxel
    directory.writeUInt32LE(data.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, directory, ...images.map((img) => img.data)]);
}

const outputs = [
  {
    file: "src/app/favicon.ico",
    data: ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await render(source, size) })))),
  },
  { file: "src/app/apple-icon.png", data: await render(fullBleedSvg, 180, { opaque: true }) },
  { file: "public/icons/icon-192.png", data: await render(source, 192) },
  { file: "public/icons/icon-512.png", data: await render(source, 512) },
  { file: "public/icons/icon-maskable-512.png", data: await render(fullBleedSvg, 512, { opaque: true }) },
];

for (const { file, data } of outputs) {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, data);
  const md5 = createHash("md5").update(data).digest("hex");
  console.log(`${file.padEnd(36)} ${String(data.length).padStart(7)} bytes  md5 ${md5}`);
}
