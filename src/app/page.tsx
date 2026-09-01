import SearchHero from "@/components/SearchHero";

/**
 * Pantalla 1 — Home (producto §3, ajustada por el cambio del 29/08:
 * búsqueda simple, ya no conversacional — ver
 * `docs/DECISION_2026-08-29_busqueda-simple.md`).
 * Campo de texto libre central; los chips de oportunidad son atajos que
 * alimentan la búsqueda. Selector de vertical Alquilar · Comprar · Invertir
 * desde el 01/09 (`docs/DECISION_2026-09-01_selector-vertical.md`): queda como
 * preferencia, pero lo que escribe el usuario predomina y re-sincroniza el
 * botón. Sin selección, P2 infiere del texto como antes.
 */
export default function HomePage() {
  return (
    <main>
      <section className="hero container">
        <h1>
          Buscá tu próxima propiedad <em>en San Juan</em>
        </h1>
        <p className="sub">
          Escribí lo que buscás en tus palabras. FINDER entiende texto libre y te muestra
          oportunidades explicadas, no solo avisos.
        </p>
        <SearchHero />
      </section>
    </main>
  );
}
