import SearchHero from "@/components/SearchHero";

/**
 * Pantalla 1 — Home (producto §3, ajustada por el cambio del 29/08:
 * búsqueda simple, ya no conversacional — ver
 * `docs/DECISION_2026-08-29_busqueda-simple.md`).
 * Campo de texto libre central; los chips de oportunidad son atajos que
 * alimentan la búsqueda. Sin selector de vertical: P2 la infiere del texto.
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
