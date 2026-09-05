import type { PrimarySignal, RatingColor, Reason, ScoreComponent } from "@/lib/p2/types";

/**
 * Señales de P3 — regla de producto 4: NINGUNA señal sin explicación.
 * Los textos (`text`, `description`) vienen localizados por P3 y se muestran
 * tal cual. null = NO EVALUADO → el componente directamente no se renderiza.
 */

const SIG_CLASS: Record<RatingColor, string> = {
  green: "sig--green",
  yellow: "sig--yellow",
  red: "sig--red",
};

export function SignalBadge({ signal }: { signal: PrimarySignal }) {
  return (
    <span className={`signal ${SIG_CLASS[signal.color]}`}>
      <span className="dot" aria-hidden />
      <span className="signal-text">{signal.text}</span>
    </span>
  );
}

/** Chip de rating expandible: el color SIEMPRE viaja con sus reasons. */
export function RatingChip({
  label,
  color,
  reasons,
  title,
}: {
  label: string;
  color: RatingColor;
  reasons: Reason[] | null;
  /** Etiqueta completa cuando `label` es la corta de la card. */
  title?: string;
}) {
  return (
    <details className="rating">
      <summary className={`signal ${SIG_CLASS[color]}`} title={title}>
        <span className="dot" aria-hidden />
        {label}
      </summary>
      {reasons && reasons.length > 0 && (
        <div className="reasons">
          {reasons.map((r) => (
            <p key={r.code}>{r.text}</p>
          ))}
        </div>
      )}
    </details>
  );
}

function fmtRaw(c: ScoreComponent): string | null {
  if (c.raw_value == null) return null;
  const val = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(c.raw_value);
  return c.raw_unit === "%" ? `${val}%` : c.raw_unit ? `${val} ${c.raw_unit}` : val;
}

/** Score 0-100 — nunca el número solo: siempre con sus componentes (display directo de P3). */
export function ScoreDetails({
  score,
  components,
}: {
  score: number;
  components: ScoreComponent[];
}) {
  return (
    <details className="score">
      <summary>
        <span className="score-label">
          Score <b>{score}</b>
        </span>
        <span className="scorebar" aria-hidden>
          <span style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
        </span>
        <span className="why">¿por qué?</span>
      </summary>
      <div className="score-components">
        {components.map((c) => {
          const raw = fmtRaw(c);
          return (
            <div className="score-comp" key={c.key}>
              <b>{c.label}</b>
              {raw ? ` · ${raw}` : ""} — {c.description}
            </div>
          );
        })}
      </div>
    </details>
  );
}

export function ratingDotStyle(color: RatingColor): React.CSSProperties {
  const map: Record<RatingColor, string> = {
    green: "var(--sig-green-dot)",
    yellow: "var(--sig-yellow-dot)",
    red: "var(--sig-red-dot)",
  };
  return { background: map[color] };
}
