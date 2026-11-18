"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import SearchSkeleton from "@/components/SearchSkeleton";
import { searchHref } from "@/lib/market";
import { EVENTS, trackEvent } from "@/lib/track";
import { readStoredVertical, storeVertical, subscribeVertical, VERTICALS, type VerticalId } from "@/lib/vertical";

/**
 * Buscador de la home de italia: selector Compra / Affitta, campo de texto
 * libre y ejemplos que buscan directo. Misma mecánica que `SearchHero` de
 * san_juan (la preferencia de vertical se guarda, lo escrito predomina, el
 * "Sto cercando…" aparece en el mismo tick del envío), sin los atajos de
 * oportunidad ni las verticales de inversión.
 *
 * Los ejemplos son consultas del golden italiano de P2
 * (`tests/extraction_evaluation/dataset_it.json`): están verificadas contra
 * el intérprete real.
 */
type Key = "none" | "comprar" | "alquilar";

const PLACEHOLDER: Record<Key, string> = {
  none: "Trilocale a Milano con ascensore, vicino al Duomo, fino a 450 mila euro",
  comprar: "Trilocale a Milano con ascensore, vicino al Duomo, fino a 450 mila euro",
  alquilar: "Bilocale arredato a Milano fino a 1.500 euro al mese",
};

const ESEMPI: Record<Key, string[]> = {
  none: [
    "Appartamento in affitto a Milano fino a 2.500 euro",
    "Villa con piscina in Sicilia",
    "Appartamento a Roma con 2 camere e box",
    "Terreno edificabile a Roma",
  ],
  comprar: [
    "Villa con piscina in Sicilia",
    "Appartamento a Roma con 2 camere e box",
    "Villa con giardino ad Ardea",
    "Terreno edificabile a Roma",
  ],
  alquilar: [
    "Appartamento a Milano fino a 2.500 euro",
    "Bilocale a Milano fino a 1.500 euro",
    "Appartamento a Roma con 2 camere",
    "Appartamento vicino al Duomo a meno di 2.500 euro",
  ],
};

/** Compra primero: es la búsqueda por defecto del sitio. */
const SELECTOR = [...VERTICALS].sort((a, b) => (a.id === "comprar" ? -1 : b.id === "comprar" ? 1 : 0));

function keyOf(v: VerticalId | null): Key {
  return v === "comprar" || v === "alquilar" ? v : "none";
}

export default function SearchHeroItalia() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [navigating, setNavigating] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stored = useSyncExternalStore(subscribeVertical, readStoredVertical, () => null);
  const [picked, setPicked] = useState<VerticalId | null | undefined>(undefined);
  const raw = picked === undefined ? stored : picked;
  // Una preferencia guardada de otra vertical (no existe en italia) no cuenta.
  const vertical = raw && VERTICALS.some((v) => v.id === raw) ? raw : null;
  const key = keyOf(vertical);

  function pickVertical(v: VerticalId) {
    const next = vertical === v ? null : v;
    setPicked(next);
    storeVertical(next);
    trackEvent(EVENTS.VERTICAL_SELECTED, { vertical: next, screen: "home" });
  }

  function goSearch(rawText: string) {
    const query = rawText.trim();
    if (!query) {
      // Sin texto, el botón lleva al campo en vez de quedar apagado.
      inputRef.current?.focus();
      return;
    }
    const params = new URLSearchParams({ q: query });
    if (vertical) params.set("v", vertical);
    setNavigating(query);
    router.push(searchHref(params));
  }

  function pickExample(q: string) {
    setText(q);
    trackEvent(EVENTS.EXAMPLE_CLICK, { query: q, vertical });
    goSearch(q);
  }

  return (
    <div className="it-search">
      <form
        className="it-searchbox"
        role="search"
        aria-label="Cerca un immobile"
        onSubmit={(e) => {
          e.preventDefault();
          goSearch(text);
        }}
      >
        <div className="it-seg" role="group" aria-label="Cosa vuoi fare">
          {SELECTOR.map((v) => (
            <button key={v.id} type="button" aria-pressed={vertical === v.id} onClick={() => pickVertical(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="it-searchrow">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER[key]}
            aria-label="Descrivi la casa che cerchi"
            autoFocus
          />
          <button type="submit" className="it-cta">
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <span>Cerca</span>
          </button>
        </div>
      </form>

      {navigating && (
        <div className="it-searching" aria-live="polite">
          <p data-testid="searching-line">
            <span className="spinner spinner--inline" aria-hidden /> Sto cercando… «{navigating}»
          </p>
          <SearchSkeleton count={2} />
        </div>
      )}

      <div className="it-examples">
        <p>Prova con una di queste</p>
        <div className="it-examples-list">
          {ESEMPI[key].map((q) => (
            <button key={q} type="button" onClick={() => pickExample(q)}>
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
