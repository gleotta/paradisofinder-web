import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Caché en disco de P1 (15/09): el snapshot de propiedades del sitemap y las
 * og:image propias. `CACHE_DIR` (default `.cache`, relativo al cwd; en Docker y
 * Railway `/data/cache`, en el volumen, así sobrevive a los deploys).
 * `CACHE_DIR=` (vacío) desactiva el disco: todo queda en memoria.
 * Si el disco falla, se avisa una vez y se sigue sin él: nunca rompe una respuesta.
 */
export function cachePath(...parts: string[]): string | null {
  const raw = process.env.CACHE_DIR;
  const base = raw === undefined ? ".cache" : raw.trim();
  return base ? path.join(base, ...parts) : null;
}

let warned = false;

function warnOnce(action: string, file: string, err: unknown) {
  if (warned) return;
  warned = true;
  console.warn(`[cache] No pude ${action} ${file}; sigo sin disco. (${err instanceof Error ? err.message : String(err)})`);
}

export async function readCacheFile(file: string | null): Promise<Buffer | null> {
  if (!file) return null;
  try {
    return await readFile(file);
  } catch (err) {
    if ((err as { code?: string }).code !== "ENOENT") warnOnce("leer", file, err);
    return null;
  }
}

/** Escritura atómica (tmp + rename): un lector nunca ve un archivo a medias. */
export async function writeCacheFile(file: string | null, data: string | Buffer): Promise<void> {
  if (!file) return;
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(tmp, data);
    await rename(tmp, file);
  } catch (err) {
    warnOnce("escribir", file, err);
  }
}
