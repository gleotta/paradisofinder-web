/**
 * Statistiche — contrato de datos de la página `/statistiche` (Italia, 18/11).
 *
 * Es el reporte de demanda y respuesta para la inmobiliaria: qué busca la
 * gente, dónde no hay oferta, qué inmuebles se miran y cuáles generan
 * contactos. HOY lo llena un generador de datos de ejemplo (`mock.ts`,
 * `source: "mock"`); el destino es que lo arme P2 con lo que ya registra en
 * su observabilidad (`source: "p2"`). El plan y lo que falta en P2 están en
 * `docs/italia/STATISTICHE.md`. La página no sabe de dónde vienen los datos:
 * solo conoce este contrato, así que el cambio de fuente es `source.ts`.
 *
 * Los códigos (tipos, operación, comuni) son los de la API de P2; las
 * etiquetas en italiano las pone la página.
 */

export type StatsOperation = "sale" | "rent";

export interface StatsTotals {
  /** Búsquedas ejecutadas (turnos de búsqueda, no páginas). */
  searches: number;
  /** Visitantes distintos (`visitor_id`). */
  visitors: number;
  /** Fichas abiertas. */
  detail_views: number;
  /** Clics en "Chiama l'agenzia". */
  contacts: number;
}

export interface StatsReport {
  /** `mock` = datos de ejemplo (la página lo avisa); `p2` = observabilidad real. */
  source: "mock" | "p2";
  generated_at: string;
  period: {
    days: number;
    /** Fechas ISO (YYYY-MM-DD), ambas incluidas. */
    from: string;
    to: string;
  };
  totals: StatsTotals;
  /** El período inmediatamente anterior, de la misma duración. */
  previous_totals: StatsTotals;
  /** Embudo por búsqueda: cada búsqueda cuenta una vez por etapa (por `search_id`). */
  funnel: { searches: number; with_results: number; with_detail: number; with_contact: number };
  daily: { date: string; searches: number; contacts: number }[];
  operations: { operation: StatsOperation; searches: number }[];
  /** Demanda por comune (búsquedas que lo nombran) contra los avisos activos en catálogo. */
  zones: { zone: string; name: string; searches: number; listings: number }[];
  /** Criterios buscados con cero o muy pocos avisos. */
  unmet: {
    place: string;
    operation: StatsOperation;
    property_type: string | null;
    /** Detalle del criterio tal como se muestra ("fino a € 300.000", "con 3 camere"). */
    detail: string | null;
    searches: number;
    listings_found: number;
  }[];
  property_types: { property_type: string; searches: number }[];
  /** Presupuesto declarado, por bandas (`max: null` = sin tope). */
  budgets: { operation: StatsOperation; bands: { min: number; max: number | null; searches: number }[] }[];
  bedrooms: { bedrooms: "1" | "2" | "3" | "4plus"; searches: number }[];
  /** Características pedidas (códigos de filtro de P2). */
  features: { feature: string; searches: number }[];
  top_listings: {
    id: string | null;
    property_type: string;
    zone_name: string;
    summary: string;
    price: number;
    operation: StatsOperation;
    views: number;
    contacts: number;
  }[];
  agencies: { name: string; listings: number; views: number; contacts: number }[];
  recent_queries: { query: string; at: string; results: number }[];
}

export const STATS_PERIODS = [7, 30, 90] as const;
export type StatsPeriodDays = (typeof STATS_PERIODS)[number];
