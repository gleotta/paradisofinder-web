import type { Metadata } from "next";
import Link from "next/link";
import { fmtInt } from "@/lib/format";
import { OPERATION_LABEL, PROPERTY_TYPE_LABEL } from "@/lib/labels";
import { getStatsReport, parsePeriod } from "@/lib/stats/source";
import { STATS_PERIODS, type StatsOperation, type StatsReport } from "@/lib/stats/types";
import DailyChart from "@/components/stats/DailyChart";
import { BarList, MeterList, SegmentedBar, StatTile } from "@/components/stats/parts";

/**
 * Statistiche (Italia, 18/11 — pedido de German): el resoconto para la
 * inmobiliaria. Qué busca la gente, dónde hay demanda sin oferta, qué
 * inmuebles se miran y cuáles generan contactos. Se entra por el link del
 * pie; sin clave (decisión de German: "lo mismo es privada").
 *
 * HOY muestra DATOS DE EJEMPLO (`source: "mock"`) y lo dice arriba. La fuente
 * se cambia en `src/lib/stats/source.ts`; el plan para conectarla a la
 * observabilidad de P2 está en `docs/italia/STATISTICHE.md`.
 */
export const metadata: Metadata = {
  title: "Statistiche",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const TZ = "Europe/Rome";
const dayShort = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
const dayLong = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const dayFull = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const moment = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
const nf1 = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const euro = (n: number) => `€ ${fmtInt(n)}`;
const share = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");
const typeLabel = (code: string | null) =>
  (code && (PROPERTY_TYPE_LABEL as Record<string, string>)[code]) || "Immobile";
const inOperation = (op: StatsOperation) => (op === "rent" ? "in affitto" : "in vendita");

const FEATURE_LABEL: Record<string, string> = {
  garden: "Giardino",
  parking: "Box o posto auto",
  terrace: "Terrazzo",
  near_transit: "Vicino ai mezzi",
  elevator: "Ascensore",
  furnished: "Arredato",
  pool: "Piscina",
  sea_view: "Vista mare",
};
const BEDROOMS_LABEL: Record<string, string> = { "1": "1 camera", "2": "2 camere", "3": "3 camere", "4plus": "4 o più camere" };

/** "€ 250–400 mila" en venta, "€ 800–1.200" en alquiler: corto, para que la etiqueta entre entera. */
function bandLabel(min: number, max: number | null): string {
  const thousands = (max ?? min) >= 10_000;
  const n = (v: number) => (thousands ? fmtInt(v / 1000) : fmtInt(v));
  const unit = thousands ? " mila" : "";
  if (!min && max != null) return `Fino a € ${n(max)}${unit}`;
  if (max == null) return `Oltre € ${n(min)}${unit}`;
  return `€ ${n(min)}–${n(max)}${unit}`;
}

export default async function StatistichePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const days = parsePeriod((await searchParams).p);
  const r: StatsReport = await getStatsReport(days);
  const { totals: t, previous_totals: prev, funnel: f } = r;
  const vsPrevious = `rispetto ai ${days} giorni precedenti`;

  const zones = [...r.zones].sort((a, b) => b.searches - a.searches);
  const maxZone = Math.max(...zones.map((z) => z.searches), 1);
  const stated = (rows: { searches: number }[]) => rows.reduce((s, x) => s + x.searches, 0);
  const budget = (op: StatsOperation) => r.budgets.find((b) => b.operation === op)?.bands ?? [];
  const opSearches = (op: StatsOperation) => r.operations.find((o) => o.operation === op)?.searches ?? 0;

  return (
    <main className="st-page container" data-testid="statistiche" data-source={r.source}>
      <header className="st-head">
        <div>
          <h1>Statistiche</h1>
          <p>
            Cosa cercano i visitatori del sito, dove la domanda non trova annunci e quali immobili portano
            contatti alle agenzie.
          </p>
        </div>
        {/* Filtro único, arriba de todo lo que alcanza. */}
        <nav className="st-periods" aria-label="Periodo">
          {STATS_PERIODS.map((p) => (
            <Link key={p} href={p === 30 ? "/statistiche" : `/statistiche?p=${p}`} aria-current={p === days ? "page" : undefined}>
              {p} giorni
            </Link>
          ))}
        </nav>
      </header>

      <p className="st-period-line">
        Dal {dayFull.format(utc(r.period.from))} al {dayFull.format(utc(r.period.to))}
      </p>

      {r.source === "mock" && (
        <p className="st-demo" role="note" data-testid="statistiche-demo">
          <b>Dati dimostrativi.</b> I numeri di questa pagina sono di esempio e servono a mostrare come sarà il
          resoconto: non sono visite reali al sito. Di reale c&apos;è solo il numero di annunci in catalogo per
          comune.
        </p>
      )}

      <section className="st-tiles" aria-label="Numeri del periodo">
        <StatTile label="Ricerche" value={t.searches} previous={prev.searches} periodLabel={vsPrevious} />
        <StatTile label="Visitatori" value={t.visitors} previous={prev.visitors} periodLabel={vsPrevious} />
        <StatTile label="Schede aperte" value={t.detail_views} previous={prev.detail_views} periodLabel={vsPrevious} />
        <StatTile label="Contatti all'agenzia" value={t.contacts} previous={prev.contacts} periodLabel={vsPrevious} />
      </section>

      <div className="st-grid st-grid--wide-left">
        <section className="st-card">
          <h2>Ricerche al giorno</h2>
          <DailyChart
            unit="Ricerche"
            points={r.daily.map((d) => ({
              label: dayShort.format(utc(d.date)),
              title: dayLong.format(utc(d.date)),
              value: d.searches,
              display: fmtInt(d.searches),
            }))}
          />
          <details className="st-table-view">
            <summary>Vedi i dati in tabella</summary>
            <table className="st-table">
              <thead>
                <tr>
                  <th>Giorno</th>
                  <th className="num">Ricerche</th>
                  <th className="num">Contatti</th>
                </tr>
              </thead>
              <tbody>
                {r.daily.map((d) => (
                  <tr key={d.date}>
                    <td>{dayLong.format(utc(d.date))}</td>
                    <td className="num">{fmtInt(d.searches)}</td>
                    <td className="num">{fmtInt(d.contacts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>

        <section className="st-card">
          <h2>Dalla ricerca al contatto</h2>
          <p className="st-lead">Su 100 ricerche, quante arrivano a ogni passo.</p>
          <MeterList
            rows={[
              { label: "Ricerche", value: f.searches, share: 1 },
              { label: "Con annunci trovati", value: f.with_results, share: f.with_results / (f.searches || 1) },
              { label: "Con una scheda aperta", value: f.with_detail, share: f.with_detail / (f.searches || 1) },
              { label: "Con un contatto all'agenzia", value: f.with_contact, share: f.with_contact / (f.searches || 1) },
            ]}
          />
        </section>
      </div>

      <div className="st-grid">
        <section className="st-card">
          <h2>Domanda e offerta per comune</h2>
          <p className="st-lead">Quante ricerche nominano ogni comune e quanti annunci ci sono in catalogo.</p>
          <table className="st-table">
            <thead>
              <tr>
                <th>Comune</th>
                <th>Ricerche</th>
                <th className="num">Annunci</th>
                <th className="num st-col-extra">Ricerche per annuncio</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.zone}>
                  <td>{z.name}</td>
                  <td>
                    <span className="st-cellbar" title={`${z.name}: ${fmtInt(z.searches)} ricerche`}>
                      <span className="st-bar" style={{ flexBasis: `calc((100% - 52px) * ${(z.searches / maxZone).toFixed(4)})` }} />
                      <span>{fmtInt(z.searches)}</span>
                    </span>
                  </td>
                  <td className="num">{z.listings ? fmtInt(z.listings) : <span className="st-none">nessuno</span>}</td>
                  <td className="num st-col-extra">{z.listings ? nf1.format(z.searches / z.listings) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="st-card">
          <h2>Domanda senza offerta</h2>
          <p className="st-lead">
            Le richieste più frequenti che non hanno trovato annunci, o ne hanno trovati pochissimi: dove conviene
            acquisire immobili.
          </p>
          <table className="st-table">
            <thead>
              <tr>
                <th>Cosa cercavano</th>
                <th className="num">Ricerche</th>
                <th className="num">Annunci trovati</th>
              </tr>
            </thead>
            <tbody>
              {r.unmet.map((u) => (
                <tr key={`${u.place}-${u.operation}-${u.property_type}-${u.detail}`}>
                  <td>
                    {typeLabel(u.property_type)} {inOperation(u.operation)} a {u.place}
                    {u.detail && <small>{u.detail}</small>}
                  </td>
                  <td className="num">{fmtInt(u.searches)}</td>
                  <td className="num">{u.listings_found ? fmtInt(u.listings_found) : <span className="st-none">nessuno</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <h2 className="st-section-title">Cosa cercano</h2>
      <div className="st-grid st-grid--three">
        <section className="st-card">
          <h3>Vendita o affitto</h3>
          <SegmentedBar
            unit="ricerche"
            parts={r.operations.map((o) => ({
              label: OPERATION_LABEL[o.operation],
              value: o.searches,
              slot: o.operation === "sale" ? (1 as const) : (2 as const),
            }))}
          />
        </section>
        <section className="st-card">
          <h3>Tipologia</h3>
          <BarList
            unit="ricerche"
            rows={[...r.property_types]
              .sort((a, b) => b.searches - a.searches)
              .map((p) => ({ label: typeLabel(p.property_type), value: p.searches, note: share(p.searches, t.searches) }))}
          />
        </section>
        <section className="st-card">
          <h3>Camere</h3>
          <p className="st-lead">Tra le ricerche che indicano il numero di camere.</p>
          <BarList
            unit="ricerche"
            rows={r.bedrooms.map((b) => ({
              label: BEDROOMS_LABEL[b.bedrooms] ?? b.bedrooms,
              value: b.searches,
              note: share(b.searches, stated(r.bedrooms)),
            }))}
          />
        </section>
        <section className="st-card">
          <h3>Budget dichiarato · vendita</h3>
          <p className="st-lead">
            {share(stated(budget("sale")), opSearches("sale"))} delle ricerche di vendita indica una cifra.
          </p>
          <BarList
            unit="ricerche"
            rows={budget("sale").map((b) => ({ label: bandLabel(b.min, b.max), value: b.searches, note: share(b.searches, stated(budget("sale"))) }))}
          />
        </section>
        <section className="st-card">
          <h3>Budget dichiarato · affitto</h3>
          <p className="st-lead">
            {share(stated(budget("rent")), opSearches("rent"))} delle ricerche di affitto indica un canone mensile.
          </p>
          <BarList
            unit="ricerche"
            rows={budget("rent").map((b) => ({ label: bandLabel(b.min, b.max), value: b.searches, note: share(b.searches, stated(budget("rent"))) }))}
          />
        </section>
        <section className="st-card">
          <h3>Caratteristiche più richieste</h3>
          <BarList
            unit="ricerche"
            rows={[...r.features]
              .sort((a, b) => b.searches - a.searches)
              .map((x) => ({ label: FEATURE_LABEL[x.feature] ?? x.feature, value: x.searches, note: share(x.searches, t.searches) }))}
          />
        </section>
      </div>

      <div className="st-grid">
        <section className="st-card">
          <h2>Immobili più visti</h2>
          <table className="st-table">
            <thead>
              <tr>
                <th>Immobile</th>
                <th className="num">Visualizzazioni</th>
                <th className="num">Contatti</th>
                <th className="num st-col-extra">Ogni 100 visite</th>
              </tr>
            </thead>
            <tbody>
              {r.top_listings.map((l, i) => (
                <tr key={i}>
                  <td>
                    {typeLabel(l.property_type)} a {l.zone_name} · {euro(l.price)}
                    {l.operation === "rent" ? " al mese" : ""}
                    <small>{l.summary}</small>
                  </td>
                  <td className="num">{fmtInt(l.views)}</td>
                  <td className="num">{fmtInt(l.contacts)}</td>
                  <td className="num st-col-extra">{l.views ? nf1.format((l.contacts / l.views) * 100) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="st-card">
          <h2>Contatti per agenzia</h2>
          <table className="st-table">
            <thead>
              <tr>
                <th>Agenzia</th>
                <th className="num">Annunci</th>
                <th className="num">Visualizzazioni</th>
                <th className="num">Contatti</th>
              </tr>
            </thead>
            <tbody>
              {[...r.agencies]
                .sort((a, b) => b.contacts - a.contacts)
                .map((a) => (
                  <tr key={a.name}>
                    <td>{a.name}</td>
                    <td className="num">{fmtInt(a.listings)}</td>
                    <td className="num">{fmtInt(a.views)}</td>
                    <td className="num">{fmtInt(a.contacts)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="st-card st-card--full">
        <h2>Ultime ricerche</h2>
        <p className="st-lead">Scritte dai visitatori, parola per parola.</p>
        <table className="st-table">
          <thead>
            <tr>
              <th>Ricerca</th>
              <th className="num">Annunci trovati</th>
              <th className="num">Quando</th>
            </tr>
          </thead>
          <tbody>
            {r.recent_queries.map((q) => (
              <tr key={q.at}>
                <td>«{q.query}»</td>
                <td className="num">{q.results ? fmtInt(q.results) : <span className="st-none">nessuno</span>}</td>
                <td className="num">{moment.format(new Date(q.at))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="st-foot">
        Una ricerca conta una volta per ogni passo. I contatti sono i clic su «Chiama l&apos;agenzia». Aggiornato il{" "}
        {moment.format(new Date(r.generated_at))}.
      </p>
    </main>
  );
}
