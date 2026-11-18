import type { Metadata } from "next";
import Link from "next/link";
import { fmtInt } from "@/lib/format";
import { buildFunnel, percentile, type DayFunnel } from "@/lib/server/funnel";
import { parsePeriod } from "@/lib/stats/source";
import { STATS_PERIODS } from "@/lib/stats/types";
import DailyChart from "@/components/stats/DailyChart";
import { MeterList, StatTile } from "@/components/stats/parts";

/**
 * Funnel (Italia, 18/11 — pedido de German: "el embudo sí se hace con datos
 * reales, se lee los logs y se accede con un link desde el footer, igual que
 * las estadísticas"). Es el embudo de uso del sitio —búsquedas → resultados
 * → ficha abierta → contacto con la agencia—, día por día, leído del log
 * propio de eventos (`EVENTS_LOG_DIR/events-YYYY-MM-DD.jsonl`, lo escribe
 * `/api/events`). DATOS REALES: sin registro, la página lo dice y no inventa.
 *
 * Reusa el cálculo de `/interno/embudo` (`buildFunnel`), que queda como
 * tablero interno de San Juan; esta es la versión del sitio italiano: en
 * italiano, con su diseño, sin la sección de análisis de inversión y sin
 * clave (decisión de German: el sitio de la demo es privado).
 */
export const metadata: Metadata = { title: "Funnel", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const dayShort = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", timeZone: "UTC" });
const dayLong = new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dayFull = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const valid = (iso: string | null): iso is string => !!iso && /^\d{4}-\d{2}-\d{2}$/.test(iso);

const VERTICAL_LABEL: Record<string, string> = { comprar: "Vendita", alquilar: "Affitto", lotes: "Terreni", invertir: "Investimento" };

function pct(n: number, base: number): string {
  return base ? `${Math.round((n / base) * 100)}%` : "—";
}

function seconds(ms: number | null): string {
  return ms == null ? "—" : `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(ms / 1000)} s`;
}

export default async function FunnelPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const days = parsePeriod((await searchParams).p);
  const report = await buildFunnel(days);
  const t: DayFunnel = report.totals;
  const rows = report.days.filter((d) => valid(d.day));
  const chrono = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  const recent = [...chrono].reverse();
  const empty = report.events === 0;
  const verticals = Object.entries(report.byVertical)
    .filter(([, v]) => v.searches > 0)
    .sort((a, b) => b[1].searches - a[1].searches);

  return (
    <main className="st-page container" data-testid="funnel" data-events={report.events}>
      <header className="st-head">
        <div>
          <h1>Funnel</h1>
          <p>
            Dalla ricerca al contatto con l&apos;agenzia, giorno per giorno. Sono i dati reali del sito, letti dal
            registro delle visite.
          </p>
        </div>
        <nav className="st-periods" aria-label="Periodo">
          {STATS_PERIODS.map((p) => (
            <Link key={p} href={p === 30 ? "/funnel" : `/funnel?p=${p}`} aria-current={p === days ? "page" : undefined}>
              {p} giorni
            </Link>
          ))}
        </nav>
      </header>

      {empty ? (
        <p className="st-empty" role="status" data-testid="funnel-empty">
          <b>Non ci sono ancora dati.</b> Il registro si riempie con le prime ricerche fatte sul sito: prova a
          cercare un immobile e torna su questa pagina.
        </p>
      ) : (
        <>
          <p className="st-period-line">
            {valid(report.from) && valid(report.to)
              ? `Dal ${dayFull.format(utc(report.from))} al ${dayFull.format(utc(report.to))} · `
              : ""}
            {report.files === 1 ? "1 giorno con visite" : `${fmtInt(report.files)} giorni con visite`} ·{" "}
            {fmtInt(report.events)} eventi registrati
          </p>

          <section className="st-tiles" aria-label="Numeri del periodo">
            <StatTile label="Ricerche" value={t.searches} previous={0} periodLabel="" />
            <StatTile label="Con annunci mostrati" value={t.cards} previous={0} periodLabel="" />
            <StatTile label="Con una scheda aperta" value={t.opened} previous={0} periodLabel="" />
            <StatTile label="Con un contatto all'agenzia" value={t.contact} previous={0} periodLabel="" />
          </section>

          <div className="st-grid st-grid--wide-left">
            <section className="st-card">
              <h2>Ricerche al giorno</h2>
              {chrono.length >= 2 ? (
                <DailyChart
                  unit="Ricerche"
                  points={chrono.map((d) => ({
                    label: dayShort.format(utc(d.day)),
                    title: dayLong.format(utc(d.day)),
                    value: d.searches,
                    display: fmtInt(d.searches),
                  }))}
                />
              ) : (
                <p className="st-lead st-lead--plain">
                  C&apos;è un solo giorno con visite: il grafico compare dal secondo giorno. I numeri sono nella
                  tabella qui sotto.
                </p>
              )}
            </section>

            <section className="st-card">
              <h2>Dalla ricerca al contatto</h2>
              <p className="st-lead">Ogni ricerca conta una volta per passo.</p>
              <MeterList
                rows={[
                  { label: "Ricerche", value: t.searches, share: t.searches ? 1 : 0 },
                  { label: "Con annunci mostrati", value: t.cards, share: t.cards / (t.searches || 1) },
                  { label: "Con una scheda aperta", value: t.opened, share: t.opened / (t.searches || 1) },
                  { label: "Con un contatto all'agenzia", value: t.contact, share: t.contact / (t.searches || 1) },
                ]}
              />
            </section>
          </div>

          <section className="st-card st-card--full">
            <h2>Giorno per giorno</h2>
            <div className="st-scroll">
              <table className="st-table" data-testid="funnel-days">
                <thead>
                  <tr>
                    <th>Giorno</th>
                    <th className="num">Ricerche</th>
                    <th className="num st-col-extra">Con annunci</th>
                    <th className="num">Scheda aperta</th>
                    <th className="num">Contatto</th>
                    <th className="num st-col-extra">Clic sul contatto</th>
                    <th className="num st-col-extra">Senza corrispondenze</th>
                    <th className="num st-col-extra">Primi risultati (mediana)</th>
                    <th className="num st-col-extra">Primi risultati (95%)</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((d) => (
                    <tr key={d.day}>
                      <td>{dayLong.format(utc(d.day))}</td>
                      <td className="num">{fmtInt(d.searches)}</td>
                      <td className="num st-col-extra">
                        {fmtInt(d.cards)} <small className="st-inline">{pct(d.cards, d.searches)}</small>
                      </td>
                      <td className="num">
                        {fmtInt(d.opened)} <small className="st-inline">{pct(d.opened, d.searches)}</small>
                      </td>
                      <td className="num">
                        {fmtInt(d.contact)} <small className="st-inline">{pct(d.contact, d.searches)}</small>
                      </td>
                      <td className="num st-col-extra">{fmtInt(d.contact_clicks)}</td>
                      <td className="num st-col-extra">{fmtInt(d.zero)}</td>
                      <td className="num st-col-extra">{seconds(percentile(d.t_first_cards, 50))}</td>
                      <td className="num st-col-extra">{seconds(percentile(d.t_first_cards, 95))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="st-grid">
            <section className="st-card">
              <h2>Vendita e affitto</h2>
              {verticals.length ? (
                <table className="st-table">
                  <thead>
                    <tr>
                      <th>Contratto</th>
                      <th className="num">Ricerche</th>
                      <th className="num st-col-extra">Con annunci</th>
                      <th className="num">Scheda aperta</th>
                      <th className="num">Contatto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verticals.map(([key, v]) => (
                      <tr key={key}>
                        <td>{VERTICAL_LABEL[key] ?? "Non indicato"}</td>
                        <td className="num">{fmtInt(v.searches)}</td>
                        <td className="num st-col-extra">{fmtInt(v.cards)}</td>
                        <td className="num">{fmtInt(v.opened)}</td>
                        <td className="num">{fmtInt(v.contact)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="st-lead st-lead--plain">Ancora nessuna ricerca con il contratto indicato.</p>
              )}
            </section>

            <section className="st-card">
              <h2>Come ha risposto il sito</h2>
              <table className="st-table">
                <tbody>
                  <tr>
                    <td>Tempo fino ai primi risultati (mediana)</td>
                    <td className="num">{seconds(percentile(t.t_first_cards, 50))}</td>
                  </tr>
                  <tr>
                    <td>Tempo fino ai primi risultati (95% delle ricerche)</td>
                    <td className="num">{seconds(percentile(t.t_first_cards, 95))}</td>
                  </tr>
                  <tr>
                    <td>Ricerche senza corrispondenze esatte</td>
                    <td className="num">{fmtInt(t.zero)}</td>
                  </tr>
                  <tr>
                    <td>Attese oltre 4 secondi</td>
                    <td className="num">{fmtInt(t.slow)}</td>
                  </tr>
                  <tr>
                    <td>Chiarimenti scelti dal visitatore</td>
                    <td className="num">{fmtInt(t.clarifications)}</td>
                  </tr>
                  <tr>
                    <td>Filtri modificati dal visitatore</td>
                    <td className="num">{fmtInt(t.chips)}</td>
                  </tr>
                  <tr>
                    <td>Errori</td>
                    <td className="num">{fmtInt(t.errors)}</td>
                  </tr>
                </tbody>
              </table>
            </section>
          </div>

          <p className="st-foot">
            Fonte: registro degli eventi del sito, un file per giorno (giorni in UTC). I contatti sono i clic su
            «Chiama l&apos;agenzia»; «Clic sul contatto» li conta tutti, anche più di uno nella stessa ricerca. «Con
            annunci mostrati» comprende le ricerche senza corrispondenze esatte in cui il sito ha proposto annunci
            simili.
          </p>
        </>
      )}
    </main>
  );
}
