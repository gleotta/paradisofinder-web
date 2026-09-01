"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { chipsForVertical, composeQuery, OPPORTUNITY_CHIPS } from "@/lib/chips";
import {
  readStoredVertical,
  storeVertical,
  subscribeVertical,
  type VerticalId,
} from "@/lib/vertical";
import { EVENTS, trackEvent } from "@/lib/track";
import VerticalSelector from "./VerticalSelector";

/**
 * Placeholder y ejemplos por vertical — Set C "curado", elegido por German el
 * 01/09: cada frase luce un superpoder DISTINTO del lenguaje natural, y todas
 * están validadas contra P2 real (extraen filtros/orden de verdad y devuelven
 * resultados). Ejemplos de lo que extraen: "quincho" → filtro `bbq_area`;
 * "mucho tiempo publicada, para negociar" → days_on_market > 90 + orden por
 * antigüedad; "al menos 20% por debajo del precio de su zona" → filtro
 * `valuation_gap_pct >= 20`; "para refaccionar" → condition; "amueblado",
 * "cochera", "patio", "pileta", "monoambiente", "m2" → filtros duros;
 * "Villa Krause" → Rawson. Son neutros de operación a propósito (el selector
 * compone el vertical); los del estado sin selección sí nombran la operación.
 */
const PLACEHOLDER: Record<"none" | VerticalId, string> = {
  none: 'Por ejemplo: "casa para una familia con chicos, con patio y cochera en Rivadavia, hasta 120 mil dólares"',
  alquilar: 'Por ejemplo: "casa con patio en Rawson para mudarme con mi perro"',
  comprar:
    'Por ejemplo: "casa para una familia con chicos, con patio y cochera en Rivadavia, hasta 120 mil dólares"',
  invertir: 'Por ejemplo: "depto céntrico de hasta 60 mil dólares que se alquile fácil y rinda bien"',
};

const EXAMPLES: Record<"none" | VerticalId, string[]> = {
  none: [
    "depto para alquilar cerca de la universidad por menos de 400 mil",
    "casa en Rivadavia con mucho tiempo publicada, para negociar precio",
    "casas al menos 20% por debajo del precio de su zona",
  ],
  alquilar: [
    "depto amueblado cerca de la universidad por menos de 400 mil",
    "depto de 2 ambientes luminoso en Capital que acepte mascotas, hasta 450 mil",
    "monoambiente amueblado céntrico",
  ],
  comprar: [
    "casa con pileta y quincho para recibir gente en Santa Lucía",
    "casa en Rivadavia con mucho tiempo publicada, para negociar precio",
    "duplex a estrenar en Villa Krause",
  ],
  invertir: [
    "casas al menos 20% por debajo del precio de su zona",
    "casa para refaccionar bien ubicada, para revender con ganancia",
    "lo más barato por m2 en Capital",
  ],
};

/**
 * Input central de la home + selector de vertical + chips de oportunidad.
 * El selector (01/09) arranca en la preferencia guardada y viaja como `v` en
 * la URL de resultados; la frase se compone en el server. Máximo un chip
 * activo (toggle), combinable con el texto — y lo que escribe el usuario
 * predomina sobre cualquier selección de UI.
 */
export default function SearchHero() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [activeChip, setActiveChip] = useState<string | null>(null);
  // La preferencia guardada se lee como store externo (SSR renderiza null,
  // sin mismatch); lo que el usuario toca en ESTA pestaña la pisa.
  const stored = useSyncExternalStore(subscribeVertical, readStoredVertical, () => null);
  const [picked, setPicked] = useState<VerticalId | null | undefined>(undefined);
  const vertical = picked === undefined ? stored : picked;

  function pickVertical(v: VerticalId | null) {
    setPicked(v);
    storeVertical(v);
    trackEvent(EVENTS.VERTICAL_SELECTED, { vertical: v, screen: "home" });
    // Los chips se filtran por vertical: si el activo deja de mostrarse, se apaga.
    if (activeChip && !chipsForVertical(v).some((c) => c.id === activeChip)) {
      setActiveChip(null);
    }
  }

  function toggleChip(id: string) {
    const next = activeChip === id ? null : id;
    setActiveChip(next);
    trackEvent(EVENTS.OPPORTUNITY_CHIP, { chip: id, active: next === id, screen: "home" });
  }

  /** Navega a resultados con el texto dado + chip activo + vertical elegido. */
  function goSearch(rawText: string) {
    const chip = OPPORTUNITY_CHIPS.find((c) => c.id === activeChip) ?? null;
    const query = composeQuery(rawText, chip);
    if (!query) return;
    const params = new URLSearchParams({ q: query });
    if (chip) params.set("chip", chip.id);
    if (vertical) params.set("v", vertical);
    router.push(`/buscar?${params.toString()}`);
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    goSearch(text);
  }

  /** Ejemplo clickeado: se pone en el input y BUSCA directo (German, 01/09). */
  function pickExample(q: string) {
    setText(q);
    trackEvent(EVENTS.EXAMPLE_CLICK, { query: q, vertical });
    goSearch(q);
  }

  return (
    <div>
      <VerticalSelector className="vseg--hero" value={vertical} onChange={pickVertical} />

      <form className="searchbox" onSubmit={submit} role="search">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER[vertical ?? "none"]}
          aria-label="Qué propiedad buscás"
          autoFocus
        />
        <button type="submit" className="btn btn-magenta" disabled={!text.trim() && !activeChip}>
          Buscar
        </button>
      </form>

      <div className="chips-row" role="group" aria-label="Atajos de oportunidad">
        {chipsForVertical(vertical).map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`chip${activeChip === chip.id ? " chip--active" : ""}`}
            aria-pressed={activeChip === chip.id}
            title={chip.hint}
            onClick={() => toggleChip(chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="examples">
        <span>Probá con algo así:</span>
        <div className="examples-list">
          {EXAMPLES[vertical ?? "none"].map((q) => (
            <button key={q} type="button" className="example-q" onClick={() => pickExample(q)}>
              “{q}”
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
