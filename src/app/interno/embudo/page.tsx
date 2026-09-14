import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildFunnel, percentile, type DayFunnel } from "@/lib/server/funnel";
import { fmtInt } from "@/lib/format";

/**
 * Tablero interno de embudo (T7, 14/09): búsquedas → cards → card abierta →
 * consulta, por día, sobre `logs/events-*.jsonl`. Acceso con `METRICS_TOKEN`
 * (`?token=`); sin la variable configurada solo existe fuera de producción.
 * No se indexa (`robots` + `/interno/` en robots.txt).
 */
export const metadata: Metadata = { title: "Embudo (interno)", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

function allowed(token: string | undefined): boolean {
  const expected = process.env.METRICS_TOKEN?.trim();
  if (expected) return token === expected;
  return process.env.NODE_ENV !== "production";
}

function pct(n: number, base: number): string {
  if (!base) return "—";
  return `${Math.round((n / base) * 100)} %`;
}

function ms(v: number | null): string {
  return v == null ? "—" : `${fmtInt(v)} ms`;
}

function Row({ d, label }: { d: DayFunnel; label?: string }) {
  return (
    <tr>
      <td>{label ?? d.day}</td>
      <td>{fmtInt(d.searches)}</td>
      <td>
        {fmtInt(d.cards)} <span className="pct">{pct(d.cards, d.searches)}</span>
      </td>
      <td>
        {fmtInt(d.opened)} <span className="pct">{pct(d.opened, d.cards)}</span>
      </td>
      <td>
        {fmtInt(d.contact)} <span className="pct">{pct(d.contact, d.opened)}</span>
      </td>
      <td>{fmtInt(d.contact_clicks)}</td>
      <td>{fmtInt(d.source)}</td>
      <td>{ms(percentile(d.t_first_cards, 50))}</td>
      <td>{ms(percentile(d.t_first_cards, 95))}</td>
      <td>{fmtInt(d.zero)}</td>
      <td>{fmtInt(d.chips)}</td>
      <td>{fmtInt(d.clarifications)}</td>
      <td>{fmtInt(d.slow)}</td>
      <td>{fmtInt(d.errors)}</td>
    </tr>
  );
}

export default async function FunnelPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : undefined;
  if (!allowed(token)) notFound();
  const days = typeof sp.days === "string" && /^\d{1,3}$/.test(sp.days) ? Number(sp.days) : 30;
  const report = await buildFunnel(days);
  const t = report.totals;

  return (
    <main className="funnel-page container">
      <h1>Embudo de uso</h1>
      <p className="results-query">
        {report.files ? `${report.files} días de log (${report.from} → ${report.to}) · ${fmtInt(report.events)} eventos` : "Sin archivos de log todavía (EVENTS_LOG_DIR)."}
      </p>

      <div className="funnel-kpis">
        <div className="funnel-kpi">
          <div className="k">Búsquedas</div>
          <div className="v">{fmtInt(t.searches)}</div>
        </div>
        <div className="funnel-kpi">
          <div className="k">Con cards</div>
          <div className="v">{fmtInt(t.cards)}</div>
          <div className="pct">{pct(t.cards, t.searches)} de las búsquedas</div>
        </div>
        <div className="funnel-kpi">
          <div className="k">Abrieron una card</div>
          <div className="v">{fmtInt(t.opened)}</div>
          <div className="pct">{pct(t.opened, t.cards)} de las que vieron cards</div>
        </div>
        <div className="funnel-kpi">
          <div className="k">Consultaron</div>
          <div className="v">{fmtInt(t.contact)}</div>
          <div className="pct">{pct(t.contact, t.opened)} de las que abrieron · {fmtInt(t.contact_clicks)} clicks</div>
        </div>
        <div className="funnel-kpi">
          <div className="k">Primeras cards p50 / p95</div>
          <div className="v">{ms(percentile(t.t_first_cards, 50))}</div>
          <div className="pct">p95 {ms(percentile(t.t_first_cards, 95))} · n={fmtInt(t.t_first_cards.length)}</div>
        </div>
      </div>

      <div className="funnel-wrap">
        <table className="funnel-table">
          <thead>
            <tr>
              <th>Día (UTC)</th>
              <th>Búsquedas</th>
              <th>Cards</th>
              <th>Card abierta</th>
              <th>Consulta</th>
              <th>Clicks consulta</th>
              <th>Aviso original</th>
              <th>p50 cards</th>
              <th>p95 cards</th>
              <th>Cero</th>
              <th>Chips</th>
              <th>Aclaraciones</th>
              <th>Esperas &gt; 4 s</th>
              <th>Errores</th>
            </tr>
          </thead>
          <tbody>
            {report.days.map((d) => (
              <Row d={d} key={d.day} />
            ))}
            {report.days.length > 0 && <Row d={t} label="Total" />}
          </tbody>
        </table>
      </div>

      {Object.keys(report.byVertical).length > 0 && (
        <div className="funnel-wrap">
          <table className="funnel-table">
            <thead>
              <tr>
                <th>Vertical</th>
                <th>Búsquedas</th>
                <th>Cards</th>
                <th>Card abierta</th>
                <th>Consulta</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(report.byVertical)
                .sort((a, b) => b[1].searches - a[1].searches)
                .map(([v, r]) => (
                  <tr key={v}>
                    <td>{v}</td>
                    <td>{fmtInt(r.searches)}</td>
                    <td>
                      {fmtInt(r.cards)} <span className="pct">{pct(r.cards, r.searches)}</span>
                    </td>
                    <td>
                      {fmtInt(r.opened)} <span className="pct">{pct(r.opened, r.cards)}</span>
                    </td>
                    <td>
                      {fmtInt(r.contact)} <span className="pct">{pct(r.contact, r.opened)}</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="section-note" style={{ marginTop: 14 }}>
        Fuente: <code>logs/events-YYYY-MM-DD.jsonl</code> (EVENTS_LOG_DIR). Una búsqueda cuenta una vez por etapa (por <code>search_id</code>). Detalle por
        consulta: <code>node scripts/events-report.mjs</code>.
      </p>
    </main>
  );
}
