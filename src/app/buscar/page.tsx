import { Suspense } from "react";
import type { Metadata } from "next";
import SearchResultsView from "@/components/SearchResultsView";

export const metadata: Metadata = {
  title: "Resultados",
  robots: { index: false },
};

/**
 * Pantalla 2 — Resultados: búsqueda simple + mapa (cambio de producto 29/08,
 * ver `docs/DECISION_2026-08-29_busqueda-simple.md`). Vive en el cliente porque
 * el scroll infinito y el mapa son interactivos.
 * Suspense: useSearchParams lo exige en el prerender.
 */
export default function BuscarPage() {
  return (
    <main>
      <Suspense
        fallback={
          <div className="results-page container">
            <div className="loading-row">
              <span className="spinner" aria-hidden /> Cargando…
            </div>
          </div>
        }
      >
        <SearchResultsView />
      </Suspense>
    </main>
  );
}
