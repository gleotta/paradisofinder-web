import type { DealRating, PrimarySignal, RatingColor, Reason, ScoreComponent } from "@/lib/p2/types";
import { DEAL_RATING_LABEL } from "@/lib/labels";

/**
 * Señales de P3 — regla de producto 4: NINGUNA señal sin explicación.
 * Los textos (`text`, `description`) vienen localizados por P3 y se muestran
 * tal cual. null = NO EVALUADO → el componente directamente no se renderiza.
 */

const SIG_CLASS: Record<DealRating, string> = {
  green: "sig--green",
  yellow: "sig--yellow",
  red: "sig--red",
  // Contrato 13/09: no son colores sino avisos ("verificar datos", "sin actualizar").
  verify_data: "sig--verify",
  outdated: "sig--outdated",
};

export function SignalBadge({ signal }: { signal: PrimarySignal }) {
  return (
    <span className={`signal ${SIG_CLASS[signal.color] ?? "sig--yellow"}`}>
      <span className="dot" aria-hidden />
      <span className="signal-text">{signal.text}</span>
    </span>
  );
}

/**
 * Chip de rating expandible: el color SIEMPRE viaja con sus reasons. Con
 * `verify_data`/`outdated` la etiqueta pasa a ser la del aviso ("Verificar
 * datos", "Sin actualizar") — es lo que el usuario tiene que leer.
 */
export function RatingChip({
  label,
  color,
  reasons,
  title,
}: {
  label: string;
  color: DealRating;
  reasons: Reason[] | null;
  /** Etiqueta completa cuando `label` es la corta de la card. */
  title?: string;
}) {
  const special = color === "verify_data" || color === "outdated" ? DEAL_RATING_LABEL[color] : null;
  return (
    <details className="rating">
      <summary className={`signal ${SIG_CLASS[color] ?? "sig--yellow"}`} title={special ? `${title ?? label}: ${special}` : title}>
        <span className="dot" aria-hidden />
        {special ?? label}
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

/**
 * Score 0-100 — nunca el número solo (T3): la primera razón (el componente de
 * mayor peso, tal como lo manda P2) va visible al lado, y el desplegable
 * muestra todos los componentes, incluidos los `tope_*` (peso 0) con el motivo.
 */
export function ScoreDetails({
  score,
  components,
}: {
  score: number;
  components: ScoreComponent[];
}) {
  const first = [...components].sort((a, b) => b.weight - a.weight)[0];
  return (
    <details className="score">
      <summary>
        <span className="score-row">
          <span className="score-label">
            Score <b>{score}</b>
          </span>
          <span className="scorebar" aria-hidden>
            <span style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
          </span>
          <span className="why">¿por qué?</span>
        </span>
        {first && <span className="score-reason">{first.description}</span>}
      </summary>
      <div className="score-components">
        {components.map((c) => {
          const raw = fmtRaw(c);
          return (
            <div className={`score-comp${c.weight === 0 ? " score-comp--cap" : ""}`} key={c.key}>
              <b>{c.label}</b>
              {raw ? ` · ${raw}` : ""} — {c.description}
            </div>
          );
        })}
      </div>
    </details>
  );
}

export function ratingDotStyle(color: DealRating): React.CSSProperties {
  const map: Record<DealRating, string> = {
    green: "var(--sig-green-dot)",
    yellow: "var(--sig-yellow-dot)",
    red: "var(--sig-red-dot)",
    verify_data: "var(--sig-verify-dot)",
    outdated: "var(--sig-outdated-dot)",
  };
  return { background: map[color] ?? map.yellow };
}

export function isRatingColor(v: unknown): v is RatingColor {
  return v === "green" || v === "yellow" || v === "red";
}
