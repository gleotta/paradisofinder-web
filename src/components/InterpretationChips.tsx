"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Summary } from "@/lib/p2/types";
import {
  assumptionModel,
  bedroomsPhrase,
  budgetFromChip,
  budgetPhrase,
  chipsFromSummary,
  LAND_CLASS_OPTIONS,
  nearPhrase,
  ORDER_OPTIONS,
  TYPE_OPTIONS,
  ZONE_OPTIONS,
  zonePhrase,
  type ChipModel,
} from "@/lib/interpretation";
import { EVENTS, trackEvent } from "@/lib/track";

/**
 * "Entendí: …" — chips de interpretación (T2, 14/09). Un chip por filtro DURO
 * de `summary.hard_filters` (etiqueta de P2 tal cual); cada uno se puede
 * QUITAR (×) y los de zona, presupuesto, dormitorios, tipo y clase de lote
 * se pueden EDITAR tocándolos. La nota de asunción es un chip aparte, tocable
 * para invertirla; el orden es un chip con menú.
 *
 * P1 no interpreta nada: cada acción se traduce a la frase que P2 entiende
 * como refinamiento en la MISMA sesión (`src/lib/interpretation.ts`), y P2
 * devuelve el summary nuevo, que re-pinta los chips.
 */
export interface RefineMeta {
  kind: "remove" | "edit" | "order" | "assumption";
  field?: string;
  label?: string;
  from?: unknown;
  to?: unknown;
  order_code?: string;
}

export default function InterpretationChips({
  summary,
  disabled,
  onRefine,
  onFlipAssumption,
  isRent,
}: {
  summary: Summary;
  disabled: boolean;
  /** Frase de refinamiento → `runSearch(phrase, {keepSession})`. */
  onRefine: (phrase: string, meta: RefineMeta) => void;
  /** Invertir la asunción de operación (override en sesión). */
  onFlipAssumption: (to: "alquilar" | "comprar") => void;
  isRent: boolean;
}) {
  const chips = chipsFromSummary(summary);
  const note = assumptionModel(summary.assumption_note);
  // El editor abierto queda atado al summary que lo abrió: un summary nuevo
  // (búsqueda relanzada) lo cierra solo, sin efecto ni setState en cascada.
  const [editState, setEditState] = useState<{ summary: Summary; key: string | null } | null>(null);
  const editing = editState && editState.summary === summary ? editState.key : null;
  const setEditing = useCallback((key: string | null) => setEditState({ summary, key }), [summary]);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Cerrar el editor al hacer click afuera o con Escape.
  useEffect(() => {
    if (!editing) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setEditing(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditing(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [editing, setEditing]);

  const remove = (chip: ChipModel) => {
    if (!chip.removePhrase) return;
    trackEvent(EVENTS.CHIP_REMOVED, { field: chip.field, label: chip.label, value: chip.value });
    onRefine(chip.removePhrase, { kind: "remove", field: chip.field, label: chip.label, from: chip.value });
  };

  const edit = (chip: ChipModel, phrase: string, to: unknown) => {
    setEditing(null);
    trackEvent(EVENTS.CHIP_EDITED, { field: chip.field, from: chip.value, to, phrase });
    onRefine(phrase, { kind: "edit", field: chip.field, label: chip.label, from: chip.value, to });
  };

  const currentOrder = summary.order_code ?? null;

  return (
    <div className="interp" ref={wrapRef} data-testid="interpretation">
      <span className="interp-label">Entendí:</span>
      <div className="interp-chips" role="list" aria-label="Filtros aplicados">
        {chips.map((chip) => {
          const open = editing === chip.key;
          const editable = chip.edit !== null;
          return (
            <span className={`ichip${open ? " ichip--open" : ""}`} role="listitem" key={chip.key} data-field={chip.field}>
              {editable ? (
                <button
                  type="button"
                  className="ichip-main ichip-main--edit"
                  onClick={() => setEditing(open ? null : chip.key)}
                  disabled={disabled}
                  aria-expanded={open}
                  aria-label={`${chip.label} — editar`}
                >
                  {chip.label}
                  <span className="ichip-caret" aria-hidden>
                    ▾
                  </span>
                </button>
              ) : (
                <span className="ichip-main">{chip.label}</span>
              )}
              {chip.removePhrase && (
                <button
                  type="button"
                  className="ichip-x"
                  onClick={() => remove(chip)}
                  disabled={disabled}
                  aria-label={`Quitar ${chip.label}`}
                  title={chip.removePhrase}
                >
                  ×
                </button>
              )}
              {open && <Editor chip={chip} onApply={(phrase, to) => edit(chip, phrase, to)} />}
            </span>
          );
        })}

        {note && (
          <span className={`ichip ichip--note${note.flipTo ? " ichip--action" : ""}`} role="listitem" data-field="assumption">
            {note.flipTo ? (
              <button
                type="button"
                className="ichip-main ichip-main--edit"
                disabled={disabled}
                onClick={() => {
                  trackEvent(EVENTS.ASSUMPTION_FLIPPED, { note: summary.assumption_note, to: note.flipTo });
                  onFlipAssumption(note.flipTo!);
                }}
                title={summary.assumption_note ?? undefined}
              >
                {note.text} · <u>{note.flipLabel}</u>
              </button>
            ) : (
              <span className="ichip-main" title={summary.assumption_note ?? undefined}>
                {note.text}
              </span>
            )}
          </span>
        )}

        {summary.order && (
          <span className={`ichip ichip--order${editing === "order" ? " ichip--open" : ""}`} role="listitem" data-field="order">
            <button
              type="button"
              className="ichip-main ichip-main--edit"
              onClick={() => setEditing(editing === "order" ? null : "order")}
              disabled={disabled}
              aria-expanded={editing === "order"}
              aria-label={`Orden: ${summary.order} — cambiar`}
            >
              Orden: {summary.order}
              <span className="ichip-caret" aria-hidden>
                ▾
              </span>
            </button>
            {editing === "order" && (
              <OrderEditor
                current={currentOrder}
                isRent={isRent}
                onPick={(code, phrase) => {
                  setEditing(null);
                  trackEvent(EVENTS.ORDER_CHANGED, { from: currentOrder, to: code, phrase });
                  onRefine(phrase, { kind: "order", from: currentOrder, to: code, order_code: code });
                }}
              />
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------------- editores inline ---------------- */

function Editor({ chip, onApply }: { chip: ChipModel; onApply: (phrase: string, to: unknown) => void }) {
  switch (chip.edit) {
    case "zone":
      return <ZoneEditor chip={chip} onApply={onApply} />;
    case "budget":
      return <BudgetEditor chip={chip} onApply={onApply} />;
    case "bedrooms":
      return (
        <div className="ichip-pop" role="group" aria-label="Dormitorios mínimos">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              className={`chip chip--action${chip.value === n ? " chip--active" : ""}`}
              onClick={() => onApply(bedroomsPhrase(n), n)}
            >
              {n}+
            </button>
          ))}
        </div>
      );
    case "type":
      return (
        <div className="ichip-pop" role="group" aria-label="Tipo de propiedad">
          {TYPE_OPTIONS.map((t) => (
            <button
              type="button"
              key={t.value}
              className={`chip chip--action${chip.value === t.value ? " chip--active" : ""}`}
              onClick={() => onApply(t.phrase, t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      );
    case "land_class":
      return (
        <div className="ichip-pop" role="group" aria-label="Clase de lote">
          {LAND_CLASS_OPTIONS.map((t) => (
            <button
              type="button"
              key={t.value}
              className={`chip chip--action${chip.value === t.value ? " chip--active" : ""}`}
              onClick={() => onApply(t.phrase, t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      );
    default:
      return null;
  }
}

function ZoneEditor({ chip, onApply }: { chip: ChipModel; onApply: (phrase: string, to: unknown) => void }) {
  const current = Array.isArray(chip.value) ? String(chip.value[0] ?? "") : "";
  return (
    <div className="ichip-pop">
      <label className="ichip-field">
        <span>Zona</span>
        <select
          autoFocus
          defaultValue={current}
          onChange={(e) => {
            const code = e.target.value;
            if (code && code !== current) onApply(zonePhrase(code), [code]);
          }}
          aria-label="Elegir zona"
        >
          <option value="" disabled>
            Elegí un departamento
          </option>
          <optgroup label="Gran San Juan">
            {ZONE_OPTIONS.filter((z) => z.macro === "gran_san_juan").map((z) => (
              <option key={z.code} value={z.code}>
                {z.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Resto de la provincia">
            {ZONE_OPTIONS.filter((z) => z.macro !== "gran_san_juan").map((z) => (
              <option key={z.code} value={z.code}>
                {z.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
    </div>
  );
}

function BudgetEditor({ chip, onApply }: { chip: ChipModel; onApply: (phrase: string, to: unknown) => void }) {
  const init = budgetFromChip(chip);
  const [amount, setAmount] = useState(init.amount ? String(init.amount) : "");
  const [currency, setCurrency] = useState<"USD" | "ARS">(init.currency);
  const n = Number(amount.replace(/\D/g, ""));
  const apply = () => {
    if (!n) return;
    onApply(budgetPhrase(n, currency, init.kind), { amount: n, currency, kind: init.kind });
  };
  return (
    <form
      className="ichip-pop ichip-pop--budget"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <label className="ichip-field">
        <span>{init.kind === "min" ? "Desde" : "Hasta"}</span>
        <input
          autoFocus
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={currency === "USD" ? "90000" : "500000"}
          aria-label="Monto"
        />
      </label>
      <select value={currency} onChange={(e) => setCurrency(e.target.value as "USD" | "ARS")} aria-label="Moneda">
        <option value="USD">US$</option>
        <option value="ARS">$ pesos</option>
      </select>
      <button type="submit" className="btn btn-magenta btn-sm" disabled={!n}>
        Aplicar
      </button>
    </form>
  );
}

function OrderEditor({
  current,
  isRent,
  onPick,
}: {
  current: string | null;
  isRent: boolean;
  onPick: (code: string, phrase: string) => void;
}) {
  const [place, setPlace] = useState("");
  return (
    <div className="ichip-pop ichip-pop--order" role="group" aria-label="Cambiar el orden">
      {ORDER_OPTIONS.filter((o) => !(o.saleOnly && isRent)).map((o) =>
        o.phrase ? (
          <button
            type="button"
            key={o.code}
            className={`chip chip--action${current === o.code ? " chip--active" : ""}`}
            onClick={() => onPick(o.code, o.phrase!)}
            aria-pressed={current === o.code}
          >
            {o.label}
          </button>
        ) : (
          <form
            key={o.code}
            className="ichip-near"
            onSubmit={(e) => {
              e.preventDefault();
              if (place.trim()) onPick(o.code, nearPhrase(place));
            }}
          >
            <input
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="Cerca de… (ej. la universidad, Plaza 25)"
              aria-label="Cerca de qué lugar"
            />
            <button type="submit" className="btn btn-ghost btn-sm" disabled={!place.trim()}>
              Ordenar por cercanía
            </button>
          </form>
        ),
      )}
    </div>
  );
}
