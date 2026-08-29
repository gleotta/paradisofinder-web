import SearchHero from "@/components/SearchHero";

/**
 * Pantalla 1 — Home conversacional (producto §3).
 * El chat es la interfaz primaria: campo de texto libre central; los chips de
 * oportunidad son atajos que alimentan la conversación. Sin selector de
 * vertical (P2 infiere la vertical del texto).
 */
export default function HomePage() {
  return (
    <main>
      <section className="hero container">
        <h1>
          Contame qué propiedad buscás <em>en San Juan</em>
        </h1>
        <p className="sub">
          Escribilo como se lo dirías a una persona. FINDER entiende texto libre y te muestra
          oportunidades explicadas, no solo avisos.
        </p>
        <SearchHero />
      </section>
    </main>
  );
}
