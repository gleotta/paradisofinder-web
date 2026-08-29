"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { composeQuery, OPPORTUNITY_CHIPS } from "@/lib/chips";
import { EVENTS, trackEvent } from "@/lib/track";

const EXAMPLES = [
  "casa con patio en Rawson hasta 80 mil dólares",
  "depto para alquilar en Capital",
  "algo para invertir y alquilar cerca del centro",
];

/**
 * Input central de la home + chips de oportunidad.
 * Máximo un chip activo (toggle), combinable con el texto — y lo que escribe
 * el usuario predomina sobre cualquier selección de UI.
 */
export default function SearchHero() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [activeChip, setActiveChip] = useState<string | null>(null);

  function toggleChip(id: string) {
    const next = activeChip === id ? null : id;
    setActiveChip(next);
    trackEvent(EVENTS.OPPORTUNITY_CHIP, { chip: id, active: next === id, screen: "home" });
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const chip = OPPORTUNITY_CHIPS.find((c) => c.id === activeChip) ?? null;
    const query = composeQuery(text, chip);
    if (!query) return;
    const params = new URLSearchParams({ q: query });
    if (chip) params.set("chip", chip.id);
    router.push(`/buscar?${params.toString()}`);
  }

  return (
    <div>
      <form className="searchbox" onSubmit={submit} role="search">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='Por ejemplo: "casa de 3 dormitorios en Rivadavia hasta 100 mil dólares"'
          aria-label="Qué propiedad buscás"
          autoFocus
        />
        <button type="submit" className="btn btn-magenta" disabled={!text.trim() && !activeChip}>
          Buscar
        </button>
      </form>

      <div className="chips-row" role="group" aria-label="Atajos de oportunidad">
        {OPPORTUNITY_CHIPS.map((chip) => (
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
          {EXAMPLES.map((q) => (
            <button key={q} type="button" className="example-q" onClick={() => setText(q)}>
              “{q}”
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
