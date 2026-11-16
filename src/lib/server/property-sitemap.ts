import "server-only";

import { P2Error, searchStructured } from "@/lib/p2/client";
import type { Card } from "@/lib/p2/types";
import { cachePath, readCacheFile, writeCacheFile } from "./cache-dir";

/**
 * Propiedades del sitemap (15/09): `/propiedad/<id>` de los avisos ACTIVOS con
 * `quality_tier >= 2`, con `lastmod = listing_updated_at`. Son las páginas que
 * Google indexa de verdad: miles, contra las ~73 landings de zona.
 *
 * P2 no tiene endpoint de listado, así que se recorre `POST /search/structured`
 * por vertical (sale, rent, land) de a 100: ~56 llamadas para ~5.500 avisos.
 * Ese endpoint comparte el rate limit de búsqueda (30/min por IP, y todo P1 sale
 * con una IP), así que NO se hace por request: hay un snapshot en memoria y en
 * disco (`<CACHE_DIR>/property-sitemap.json`) que se refresca en segundo plano
 * cada `SITEMAP_REFRESH_HOURS` (6), a `SITEMAP_P2_RPM` llamadas por minuto (12:
 * el resto del cupo queda para los usuarios). Si un refresco falla, sigue el
 * snapshot anterior. Sin snapshot todavía, el sitemap sale sin propiedades y el
 * primer pedido dispara el refresco.
 *
 * Vigencia: las búsquedas de P2 no traen `stale` (salvo el orden por antigüedad,
 * que acá no se usa) y `removed` nunca llega; igual se filtra
 * `listing_status === "active"`. Un aviso que pasa a stale o removed sale del
 * sitemap en el refresco siguiente.
 */
export interface SitemapProperty {
  id: string;
  /** `listing_updated_at` (YYYY-MM-DD) o null si P2 no la informa. */
  lastmod: string | null;
}

interface Snapshot {
  generated_at: string;
  items: SitemapProperty[];
}

const VERTICALS = ["sale", "rent", "land"] as const;
const PAGE = 100;
const FILE = () => cachePath("property-sitemap.json");

let snapshot: Snapshot | null = null;
let diskChecked = false;
let refreshing: Promise<void> | null = null;

function envNumber(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function indexable(card: Card): boolean {
  return (card.quality_tier ?? 0) >= 2 && (card.listing_status ?? "active") === "active";
}

async function page(vertical: (typeof VERTICALS)[number], offset: number) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await searchStructured({ vertical, limit: PAGE, offset });
    } catch (err) {
      // 429: se agotó el cupo del minuto (lo comparten los usuarios); esperar y reintentar.
      if (err instanceof P2Error && err.status === 429 && attempt < 3) {
        await sleep(60_000);
        continue;
      }
      // Conexión (visto 15/09: `fetch failed` justo después de arrancar): reintento corto.
      if (!(err instanceof P2Error) && attempt < 3) {
        await sleep(5_000);
        continue;
      }
      throw err;
    }
  }
}

async function refresh(): Promise<void> {
  const started = Date.now();
  const gap = 60_000 / envNumber("SITEMAP_P2_RPM", 12);
  const found = new Map<string, string | null>();
  let calls = 0;
  for (const vertical of VERTICALS) {
    for (let offset = 0; ; offset += PAGE) {
      if (calls > 0) await sleep(gap);
      calls++;
      const res = await page(vertical, offset);
      for (const card of res.cards) {
        if (indexable(card)) found.set(card.id, card.listing_updated_at ?? null);
      }
      if (res.cards.length < PAGE || offset + PAGE >= res.total_matches) break;
    }
  }
  snapshot = {
    generated_at: new Date().toISOString(),
    items: [...found].map(([id, lastmod]) => ({ id, lastmod })),
  };
  await writeCacheFile(FILE(), JSON.stringify(snapshot));
  console.log(
    `[sitemap] ${snapshot.items.length} propiedades · ${calls} llamadas a P2 · ${Math.round((Date.now() - started) / 1000)} s`,
  );
}

/** Propiedades del snapshot vigente; si está vencido, lo refresca en segundo plano. */
export async function sitemapProperties(): Promise<SitemapProperty[]> {
  if (!diskChecked) {
    diskChecked = true;
    const raw = await readCacheFile(FILE());
    if (raw && !snapshot) {
      try {
        snapshot = JSON.parse(raw.toString("utf8")) as Snapshot;
      } catch {
        /* archivo corrupto: se regenera */
      }
    }
  }
  const age = snapshot ? Date.now() - Date.parse(snapshot.generated_at) : Infinity;
  if (!(age < envNumber("SITEMAP_REFRESH_HOURS", 6) * 3_600_000) && !refreshing) {
    refreshing = refresh()
      .catch((err) => {
        const cause = (err as { cause?: unknown }).cause;
        console.warn(`[sitemap] refresco fallido, sigue el snapshot anterior: ${String(err)}${cause ? ` (${String(cause)})` : ""}`);
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return snapshot?.items ?? [];
}
