import sharp from "sharp";
import { stat } from "node:fs/promises";
import { getProperty } from "@/lib/p2/client";
import { clean } from "@/lib/format";
import { cachePath, readCacheFile, writeCacheFile } from "@/lib/server/cache-dir";

/**
 * og:image propia (15/09): `GET /og/propiedad/<id>.jpg` → la primera foto del
 * aviso, bajada UNA vez del portal, llevada a 1200×630 y servida desde
 * paradisofinder.com. La tarjeta de WhatsApp/Instagram deja de depender de que
 * el portal sirva la foto, y el portal deja de ver ese tráfico en sus logs.
 *  - 1200×630 JPEG (~100 KB): las originales pesan ~850 KB, más de lo que
 *    WhatsApp acepta para la vista previa.
 *  - Disco: `<CACHE_DIR>/og/<id>.jpg` (volumen `/data` en Railway), 7 días.
 *  - `.jpg` en la URL + Cache-Control público: Cloudflare la cachea en el borde
 *    por extensión, así que P1 casi no la vuelve a servir.
 *  - Sin foto, propiedad inexistente o `removed` → 404.
 *  - `GET /og/propiedad/<id>.t.jpg` (03/10): la misma foto como MINIATURA de
 *    352×264 (~12 KB) para las filas de "Avisos similares" del detalle, que
 *    P2 manda sin foto (pedida). Misma caché en disco, con sufijo `.t`.
 */
const MAX_AGE_MS = 7 * 24 * 3_600_000;
const MAX_BYTES = 15 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{1,100}$/;
const inflight = new Map<string, Promise<Buffer | null>>();

type Variant = "og" | "thumb";
const SIZE: Record<Variant, { width: number; height: number; quality: number }> = {
  og: { width: 1200, height: 630, quality: 80 },
  thumb: { width: 352, height: 264, quality: 72 },
};
const file = (id: string, variant: Variant) => cachePath("og", variant === "thumb" ? `${id}.t.jpg` : `${id}.jpg`);

function notFound() {
  return new Response("Imagen no disponible", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}

async function fromDisk(id: string, variant: Variant): Promise<Buffer | null> {
  const path = file(id, variant);
  if (!path) return null;
  try {
    if (Date.now() - (await stat(path)).mtimeMs > MAX_AGE_MS) return null;
  } catch {
    return null;
  }
  return readCacheFile(path);
}

async function download(url: string): Promise<Buffer | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
  const body = Buffer.from(await res.arrayBuffer());
  return body.length > MAX_BYTES ? null : body;
}

async function build(id: string, variant: Variant): Promise<Buffer | null> {
  const data = await getProperty(id);
  const photo = clean(data?.property.photo_url) ?? clean(data?.property.photos?.[0]);
  if (!photo || !/^https?:\/\//i.test(photo)) return null;
  const original = await download(photo);
  if (!original) return null;
  const { width, height, quality } = SIZE[variant];
  const jpeg = await sharp(original)
    .rotate()
    .resize(width, height, { fit: "cover" })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
  await writeCacheFile(file(id, variant), jpeg);
  return jpeg;
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file: name } = await params;
  const variant: Variant = name.endsWith(".t.jpg") ? "thumb" : "og";
  const id = variant === "thumb" ? name.slice(0, -6) : name.endsWith(".jpg") ? name.slice(0, -4) : "";
  if (!ID.test(id)) return notFound();

  let jpeg = await fromDisk(id, variant);
  if (!jpeg) {
    const key = `${id}.${variant}`;
    let pending = inflight.get(key);
    if (!pending) {
      pending = build(id, variant)
        .catch((err) => {
          console.warn(`[og] ${key}: ${err instanceof Error ? err.message : String(err)}`);
          return null;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    jpeg = await pending;
  }
  if (!jpeg) return notFound();

  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(jpeg.length),
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
    },
  });
}
