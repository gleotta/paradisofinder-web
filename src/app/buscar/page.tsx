import { Suspense } from "react";
import type { Metadata } from "next";
import ConversationView from "@/components/ConversationView";

export const metadata: Metadata = {
  title: "Resultados",
  robots: { index: false },
};

/**
 * Pantalla 2 — Resultados. La vista es conversacional y vive en el cliente
 * (la primera consulta va por /api/search; los refinamientos por SSE).
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
        <ConversationView />
      </Suspense>
    </main>
  );
}
