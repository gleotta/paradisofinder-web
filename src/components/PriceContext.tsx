import type { PriceContextInfo } from "@/lib/format";

/**
 * El precio al m² del inmueble, el de los avisos similares alrededor y el de
 * su comune (Italia, 18/11 — `price_context` de P2; German: "el sitio es un
 * buscador: señalar el precio de la zona y de lo que está a 1 km, nada más").
 * Las tres celdas están SIEMPRE: cuando una referencia falta, lo dice.
 * Sin lógica: todo llega armado de `priceContextInfo`.
 */

/** Tira compacta de la card: tres columnas bajo un título con la unidad. */
export function PriceContextStrip({ info }: { info: PriceContextInfo }) {
  return (
    <div className="it-ctx" data-testid="price-context">
      <span className="block-kicker">{info.title}</span>
      <dl className="it-ctx-grid">
        {info.cells.map((c) => (
          <div
            className={`it-ctx-cell${c.kind === "own" ? " it-ctx-cell--own" : ""}`}
            key={c.kind}
            data-kind={c.kind}
            title={c.value ? [c.label, c.note].filter(Boolean).join(" · ") : `${c.label}: ${c.missing ?? ""}`}
          >
            <dt>{c.short}</dt>
            <dd>{c.value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Recuadros de la ficha: valor grande con su unidad y la muestra debajo. */
export function PriceContextTiles({
  info,
  extra = null,
}: {
  info: PriceContextInfo;
  /** Cuarto recuadro opcional: la posición frente a los similares. */
  extra?: { label: string; value: string; note?: string | null } | null;
}) {
  return (
    <dl className="it-price-rows">
      {info.cells.map((c) => (
        <div className={`it-price-row${c.kind === "own" ? " it-price-row--own" : ""}`} key={c.kind} data-kind={c.kind}>
          <dt>{c.label}</dt>
          <dd>
            {c.value ? (
              <span className="it-price-value">
                {c.value}
                <small>{info.unit}</small>
              </span>
            ) : (
              <span className="it-price-missing">{c.missing}</span>
            )}
            {c.note && <span className="it-price-note">{c.note}</span>}
          </dd>
        </div>
      ))}
      {extra && (
        <div className="it-price-row it-price-row--wide" data-kind="position">
          <dt>{extra.label}</dt>
          <dd>
            <span className="it-price-value it-price-value--text">{extra.value}</span>
            {extra.note && <span className="it-price-note">{extra.note}</span>}
          </dd>
        </div>
      )}
    </dl>
  );
}
