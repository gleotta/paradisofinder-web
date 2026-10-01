import type { DealRating, PrimarySignal, RatingColor } from "@/lib/p2/types";
import { ESTIMATE_BLOCK_NOTE, ESTIMATE_NOTICE } from "@/lib/labels";
import type { PositionInfo, ZoneRefInfo } from "@/lib/format";

/**
 * Señales de P3 — regla de producto 4: NINGUNA señal sin explicación.
 * Los textos (`text`, `description`) vienen localizados por P3 y se muestran
 * tal cual. null = NO EVALUADO → el componente directamente no se renderiza.
 *
 * Desde el 29/09 (`docs/GUIA_P1_2026-09-29_cards-por-vertical.md`) la card no
 * muestra score ni semáforos: usa los bloques de posición, tendencia, zona y
 * estimación de más abajo. La señal principal y los semáforos con sus motivos
 * viven en el detalle.
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

/* ------------------------------------------------------------------ */
/* Cards por vertical (guía 29/09): solo verde, nunca rojo (C1).       */
/* Los textos y el tono llegan armados de `src/lib/format.ts`; acá     */
/* solo se dibujan. Sin dato, el componente no se renderiza.           */
/* ------------------------------------------------------------------ */

const ARROW: Record<"up" | "down" | "flat", string> = {
  up: "M12 19V5M5 12l7-7 7 7",
  down: "M12 5v14M5 12l7 7 7-7",
  flat: "M5 12h14",
};

function Arrow({ dir, size = 14 }: { dir: "up" | "down" | "flat"; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={ARROW[dir]} />
    </svg>
  );
}

/** Flecha de tendencia del aviso, sobre la foto: "en baja" verde, "en alta" en tinta de marca. */
export function TrendPill({ trend }: { trend: { dir: "up" | "down"; label: string } }) {
  return (
    <span className={`trend-pill trend-pill--${trend.dir}`} data-testid="price-trend" data-trend={trend.dir} title={trend.label}>
      <Arrow dir={trend.dir} size={15} />
      <span className="trend-pill-text">{trend.label}</span>
    </span>
  );
}

/**
 * Bloque de posición contra similares: porcentaje grande, frase, contra qué
 * se comparó, barra de percentil sin texto en el medio (C7) y "ver similares"
 * (C8). Es el único bloque que compara el aviso (C3).
 */
export function PositionBlock({
  info,
  similarsHref,
  onSimilarsClick,
}: {
  info: PositionInfo;
  /** Comparables del detalle; sin link, el bloque va sin "ver similares". */
  similarsHref?: string;
  onSimilarsClick?: () => void;
}) {
  return (
    <div
      className={`posblock${info.green ? " posblock--green" : ""}`}
      data-testid="position"
      data-tone={info.green ? "green" : "neutral"}
    >
      <div className="posblock-head">
        <span className="posblock-pct">{info.pct}</span>
        <span className="posblock-text">{info.head}</span>
      </div>
      <span className="posblock-sub">
        {info.sub}
        {info.note ? ` · ${info.note}` : ""}
        {similarsHref && (
          <>
            {" · "}
            <a href={similarsHref} target="_blank" rel="noopener" onClick={onSimilarsClick} data-testid="similars-link">
              ver similares
            </a>
          </>
        )}
      </span>
      {info.percentile != null && (
        <div className="posbar" data-testid="position-bar">
          <div className="posbar-track" aria-hidden>
            <span className="posbar-mark" style={{ left: `${info.percentile}%` }} />
          </div>
          <div className="posbar-ends">
            <span>más barato</span>
            <span>más caro</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Bloque Zona: valores de la zona, sin porcentaje contra el aviso; verde solo si la zona sube. */
export function ZoneBlock({ info }: { info: ZoneRefInfo }) {
  return (
    <div
      className={`zoneblock${info.green ? " zoneblock--green" : ""}`}
      data-testid="zone-ref"
      data-tone={info.green ? "green" : "neutral"}
    >
      <div className="zoneblock-main">
        <span className="block-kicker">{info.title}</span>
        {info.value && (
          <span className="zoneblock-value">
            {info.value}
            {info.widened && <small> (zona ampliada)</small>}
          </span>
        )}
        {info.yieldLine && <span className="zoneblock-yield">{info.yieldLine}</span>}
      </div>
      {info.trend && (
        <span className="zoneblock-trend" data-trend={info.trend.dir}>
          <Arrow dir={info.trend.dir} />
          {info.trend.label}
        </span>
      )}
    </div>
  );
}

/** Invertir: "Esta propiedad · estimación", siempre neutro. */
export function EstimateBlock({ info }: { info: { yieldLine: string | null; rentLine: string | null } }) {
  return (
    <div className="estblock" data-testid="estimate" data-tone="neutral">
      <span className="block-kicker">Esta propiedad · estimación</span>
      {info.yieldLine && <span className="estblock-yield">{info.yieldLine}</span>}
      {info.rentLine && <span className="estblock-rent">{info.rentLine}</span>}
      <span className="estblock-note">{ESTIMATE_BLOCK_NOTE}</span>
    </div>
  );
}

/** Aviso de estimación (C10): texto exacto, en toda card y al pie de "Lectura de FINDER". */
export function EstimateNotice() {
  return (
    <p className="estimate-notice" data-testid="estimate-notice">
      {ESTIMATE_NOTICE}
    </p>
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
