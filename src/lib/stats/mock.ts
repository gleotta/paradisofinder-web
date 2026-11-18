import type { StatsReport, StatsTotals } from "./types";

/**
 * DATOS DE EJEMPLO de `/statistiche` (German, 18/11: "podés hacer un dashboard
 * con datos mock; se entiende que es para pruebas"). No son tráfico real: la
 * página lo dice arriba mientras `source` sea `mock`.
 *
 * Determinístico: cada día tiene su semilla (la fecha), así el mismo día da
 * siempre los mismos números y el período se corre solo con el calendario,
 * como un tablero de verdad. Lo único real es la columna de avisos en
 * catálogo por comune (conteo de la base de Italia del 18/11).
 *
 * Reemplazo: `getStatsReport` en `source.ts` (ver `docs/italia/STATISTICHE.md`).
 */

function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Búsquedas y contactos de un día: crecimiento del 9 % cada 30 días medido
 * hacia atrás desde el cierre del período (`daysBack`, así nunca se dispara),
 * ritmo semanal y ruido propio del día.
 */
function dayActivity(date: Date, daysBack: number): { searches: number; contacts: number } {
  const rnd = seeded(iso(date));
  const trend = 1.09 ** (-daysBack / 30);
  // Domingo y lunes buscan más; viernes y sábado, menos.
  const weekly = [1.18, 1.12, 1.0, 0.97, 0.95, 0.84, 0.88][date.getUTCDay()];
  const searches = Math.round(158 * trend * weekly * (0.86 + rnd() * 0.28));
  // La tasa de contacto también mejora un poco con el tiempo.
  const contacts = Math.round(searches * (0.05 - daysBack * 0.00012 + rnd() * 0.016));
  return { searches, contacts };
}

/** `recent` = el período en curso: algo más de fichas abiertas por búsqueda que el anterior. */
function totalsOf(days: { searches: number; contacts: number }[], recent: boolean): StatsTotals {
  const searches = days.reduce((s, d) => s + d.searches, 0);
  const contacts = days.reduce((s, d) => s + d.contacts, 0);
  return {
    searches,
    visitors: Math.round(searches / (recent ? 2.6 : 2.54)),
    detail_views: Math.round(searches * (recent ? 0.62 : 0.6)),
    contacts,
  };
}

/** Reparte `total` según `shares` (suman ≤ 1), redondeando. */
function split<T extends string>(total: number, shares: [T, number][]): [T, number][] {
  return shares.map(([key, share]) => [key, Math.round(total * share)]);
}

/** Avisos activos por comune en la base de Italia (conteo real del 18/11/2026). */
const LISTINGS: Record<string, number> = {
  roma: 63, milano: 32, pomezia: 21, trapani: 15, catania: 14, ardea: 6, trecastagni: 5, rho: 2, favignana: 2,
};

const ZONE_SHARES: [string, string, number][] = [
  ["roma", "Roma", 0.262], ["milano", "Milano", 0.214], ["bologna", "Bologna", 0.058],
  ["catania", "Catania", 0.052], ["firenze", "Firenze", 0.046], ["torino", "Torino", 0.041],
  ["pomezia", "Pomezia", 0.036], ["napoli", "Napoli", 0.034], ["trapani", "Trapani", 0.031],
  ["palermo", "Palermo", 0.027], ["favignana", "Favignana", 0.018], ["ardea", "Ardea", 0.014],
  ["rho", "Rho", 0.011], ["trecastagni", "Trecastagni", 0.007],
];

const RECENT: [string, number, number][] = [
  // consulta, minutos antes del cierre del período, resultados
  ["trilocale in vendita a Milano vicino alla metro fino a 450000 euro", 18, 6],
  ["appartamento in affitto a Bologna per studenti", 47, 0],
  ["villa con giardino e piscina in Sicilia", 95, 9],
  ["bilocale arredato in affitto a Roma zona Prati", 142, 3],
  ["casa indipendente a Pomezia con box", 201, 5],
  ["attico con terrazzo a Roma centro", 266, 2],
  ["monolocale in affitto a Milano fino a 900 euro", 318, 1],
  ["appartamento a Firenze in vendita con 3 camere", 402, 0],
  ["terreno edificabile vicino a Catania", 455, 2],
  ["quadrilocale a Torino fino a 300000 euro", 530, 0],
  ["casa al mare a Favignana", 611, 2],
  ["ufficio in affitto a Milano", 702, 1],
];

export function mockStatsReport(days: number, now: Date = new Date()): StatsReport {
  // El período cierra ayer (día completo), como haría el reporte real.
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DAY_MS);
  const dayAt = (back: number) => new Date(end.getTime() - back * DAY_MS);
  const current = Array.from({ length: days }, (_, i) => dayAt(days - 1 - i));
  const previous = Array.from({ length: days }, (_, i) => dayAt(2 * days - 1 - i));

  const back = (d: Date) => Math.round((end.getTime() - d.getTime()) / DAY_MS);
  const daily = current.map((d) => ({ date: iso(d), ...dayActivity(d, back(d)) }));
  const totals = totalsOf(daily, true);
  const previous_totals = totalsOf(previous.map((d) => dayActivity(d, back(d))), false);
  const n = totals.searches;

  const sale = Math.round(n * 0.61);
  const rent = n - sale;
  const scale = (base30: number) => Math.max(1, Math.round((base30 * days) / 30));

  return {
    source: "mock",
    generated_at: now.toISOString(),
    period: { days, from: daily[0].date, to: daily[daily.length - 1].date },
    totals,
    previous_totals,
    funnel: {
      searches: n,
      with_results: Math.round(n * 0.88),
      with_detail: Math.round(n * 0.37),
      with_contact: Math.round(n * 0.046),
    },
    daily,
    operations: [
      { operation: "sale", searches: sale },
      { operation: "rent", searches: rent },
    ],
    zones: ZONE_SHARES.map(([zone, name, share]) => ({
      zone, name, searches: Math.round(n * share), listings: LISTINGS[zone] ?? 0,
    })),
    unmet: [
      { place: "Bologna", operation: "sale" as const, property_type: "apartment", detail: "fino a € 300.000", searches: scale(64), listings_found: 0 },
      { place: "Firenze", operation: "rent" as const, property_type: "apartment", detail: "fino a € 1.500 al mese", searches: scale(51), listings_found: 0 },
      { place: "Torino", operation: "sale" as const, property_type: "apartment", detail: null, searches: scale(47), listings_found: 0 },
      { place: "Milano", operation: "rent" as const, property_type: "studio", detail: "fino a € 900 al mese", searches: scale(44), listings_found: 1 },
      { place: "Napoli", operation: "sale" as const, property_type: null, detail: "con 3 camere", searches: scale(38), listings_found: 0 },
      { place: "Roma", operation: "sale" as const, property_type: "villa", detail: "con giardino, fino a € 500.000", searches: scale(33), listings_found: 2 },
      { place: "Palermo", operation: "rent" as const, property_type: "apartment", detail: null, searches: scale(29), listings_found: 0 },
      { place: "Roma", operation: "rent" as const, property_type: "apartment", detail: "arredato, fino a € 1.200 al mese", searches: scale(27), listings_found: 2 },
      { place: "Catania", operation: "rent" as const, property_type: "apartment", detail: "con 3 camere", searches: scale(19), listings_found: 1 },
      { place: "Verona", operation: "sale" as const, property_type: "house", detail: null, searches: scale(16), listings_found: 0 },
    ],
    property_types: split(n, [
      ["apartment", 0.58], ["villa", 0.14], ["house", 0.09], ["retail", 0.06], ["attic", 0.05], ["land", 0.04], ["garage", 0.02],
    ]).map(([property_type, searches]) => ({ property_type, searches })),
    budgets: [
      {
        operation: "sale",
        bands: ([[0, 150_000, 0.076], [150_000, 250_000, 0.146], [250_000, 400_000, 0.167], [400_000, 600_000, 0.092], [600_000, null, 0.059]] as [number, number | null, number][])
          .map(([min, max, share]) => ({ min, max, searches: Math.round(sale * share) })),
      },
      {
        operation: "rent",
        bands: ([[0, 800, 0.136], [800, 1_200, 0.236], [1_200, 1_800, 0.161], [1_800, null, 0.087]] as [number, number | null, number][])
          .map(([min, max, share]) => ({ min, max, searches: Math.round(rent * share) })),
      },
    ],
    bedrooms: split(n, [["1", 0.079], ["2", 0.181], ["3", 0.128], ["4plus", 0.053]])
      .map(([bedrooms, searches]) => ({ bedrooms, searches })),
    features: split(n, [
      ["garden", 0.118], ["parking", 0.097], ["terrace", 0.084], ["near_transit", 0.071], ["elevator", 0.062],
      ["furnished", 0.051], ["pool", 0.034], ["sea_view", 0.022],
    ]).map(([feature, searches]) => ({ feature, searches })),
    top_listings: [
      { id: null, property_type: "apartment", zone_name: "Milano", summary: "2 locali · 65 m² · piano 1", price: 415_000, operation: "sale" as const, views: scale(412), contacts: scale(21) },
      { id: null, property_type: "apartment", zone_name: "Roma", summary: "5 locali · 187 m² · piano 3", price: 2_240_000, operation: "sale" as const, views: scale(377), contacts: scale(9) },
      { id: null, property_type: "apartment", zone_name: "Milano", summary: "3 locali · 85 m² · piano 4", price: 2_100, operation: "rent" as const, views: scale(341), contacts: scale(26) },
      { id: null, property_type: "villa", zone_name: "Trecastagni", summary: "6 locali · 240 m² · giardino", price: 480_000, operation: "sale" as const, views: scale(298), contacts: scale(12) },
      { id: null, property_type: "apartment", zone_name: "Catania", summary: "4 locali · 90 m² · piano 2", price: 1_500, operation: "rent" as const, views: scale(264), contacts: scale(19) },
      { id: null, property_type: "house", zone_name: "Pomezia", summary: "4 locali · 120 m² · box", price: 289_000, operation: "sale" as const, views: scale(231), contacts: scale(11) },
      { id: null, property_type: "attic", zone_name: "Roma", summary: "3 locali · 95 m² · terrazzo", price: 695_000, operation: "sale" as const, views: scale(207), contacts: scale(7) },
      { id: null, property_type: "apartment", zone_name: "Trapani", summary: "3 locali · 78 m² · piano 1", price: 95_000, operation: "sale" as const, views: scale(188), contacts: scale(10) },
    ],
    agencies: [
      { name: "Agenzia Roma Prati", listings: 24, views: scale(1_940), contacts: scale(58) },
      { name: "Agenzia Milano Navigli", listings: 18, views: scale(1_710), contacts: scale(64) },
      { name: "Agenzia Roma Eur", listings: 21, views: scale(1_280), contacts: scale(37) },
      { name: "Agenzia Pomezia", listings: 21, views: scale(860), contacts: scale(29) },
      { name: "Agenzia Catania Centro", listings: 14, views: scale(790), contacts: scale(33) },
      { name: "Agenzia Trapani", listings: 15, views: scale(540), contacts: scale(17) },
    ],
    recent_queries: RECENT.map(([query, minutesAgo, results]) => ({
      // Últimas horas del último día del período, en hora de Italia (UTC+1).
      query, results, at: new Date(end.getTime() + DAY_MS - 3_600_000 - minutesAgo * 60_000).toISOString(),
    })),
  };
}
