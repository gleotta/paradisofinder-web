import { fmtInt } from "@/lib/format";

/**
 * Piezas de `/statistiche` (18/11). Formas elegidas por el trabajo del dato:
 * un número → recuadro; partes ordenadas o un ranking → barras horizontales
 * de un solo color con el valor en la punta; una proporción por fila → medidor
 * sobre una pista del mismo tono; un todo en dos partes → barra segmentada.
 * El texto nunca lleva el color de la serie; cada valor está escrito, así que
 * nada depende del puntero.
 */

export function StatTile({
  label,
  value,
  previous,
  periodLabel,
}: {
  label: string;
  value: number;
  previous: number;
  periodLabel: string;
}) {
  const change = previous > 0 ? Math.round(((value - previous) / previous) * 100) : null;
  const sign = change == null ? "" : change > 0 ? "+" : change < 0 ? "−" : "";
  return (
    <div className="st-tile">
      <span className="st-tile-label">{label}</span>
      <span className="st-tile-value">{fmtInt(value)}</span>
      {change != null && (
        <span className="st-tile-delta">
          <b>
            <span aria-hidden="true">{change > 0 ? "▲" : change < 0 ? "▼" : "•"}</span> {sign}
            {Math.abs(change)}%
          </b>{" "}
          {periodLabel}
        </span>
      )}
    </div>
  );
}

export interface BarRow {
  label: string;
  value: number;
  /** Texto a la derecha del valor ("38 %"). */
  note?: string | null;
}

/** Barras horizontales de una sola serie; `max` las alinea a una escala común. */
export function BarList({ rows, unit, max }: { rows: BarRow[]; unit: string; max?: number }) {
  const top = Math.max(max ?? 0, ...rows.map((r) => r.value), 1);
  return (
    <ul className="st-bars">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${fmtInt(r.value)} ${unit}`}>
          <span className="st-bars-label">{r.label}</span>
          <span className="st-bars-plot">
            <span className="st-bar" style={{ flexBasis: `calc((100% - 92px) * ${(r.value / top).toFixed(4)})` }} />
            <span className="st-bars-value">
              {fmtInt(r.value)}
              {r.note && <small> · {r.note}</small>}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Proporciones por fila (embudo): barra sobre una pista del mismo tono, cifra al lado. */
export function MeterList({ rows }: { rows: { label: string; value: number; share: number }[] }) {
  return (
    <ul className="st-meters">
      {rows.map((r) => {
        const pct = Math.round(r.share * 100);
        return (
          <li key={r.label} title={`${r.label}: ${fmtInt(r.value)} (${pct}%)`}>
            <span className="st-meters-head">
              <span>{r.label}</span>
              <span className="st-meters-fig">
                <b>{fmtInt(r.value)}</b> · {pct}%
              </span>
            </span>
            <span className="st-meter" role="img" aria-label={`${pct}%`}>
              <span style={{ width: `${Math.max(1, r.share * 100).toFixed(2)}%` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Un todo en pocas partes: bloques con su porcentaje adentro y leyenda con las cifras. */
export function SegmentedBar({ parts, unit }: { parts: { label: string; value: number; slot: 1 | 2 }[]; unit: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="st-seg">
      <div className="st-seg-bar" role="img" aria-label={parts.map((p) => `${p.label} ${Math.round((p.value / total) * 100)}%`).join(", ")}>
        {parts.map((p) => {
          const share = p.value / total;
          return (
            <span
              key={p.label}
              className={`st-seg-block st-slot-${p.slot}`}
              style={{ flexGrow: Math.max(p.value, 0.0001) }}
              title={`${p.label}: ${fmtInt(p.value)} ${unit} (${Math.round(share * 100)}%)`}
            >
              {share >= 0.12 ? `${Math.round(share * 100)}%` : ""}
            </span>
          );
        })}
      </div>
      <ul className="st-legend">
        {parts.map((p) => (
          <li key={p.label}>
            <i className={`st-slot-${p.slot}`} aria-hidden="true" />
            {p.label} <span>{fmtInt(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
