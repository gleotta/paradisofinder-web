"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="container" style={{ padding: "72px 20px" }}>
      <div className="zero-state" style={{ margin: "0 auto" }} role="alert">
        <h3>Algo salió mal</h3>
        <p>
          {/* 502/503 traen mensaje explícito de P2; el resto llega sanitizado (spec §6). */}
          {error.message && error.message !== "An error occurred in the Server Components render."
            ? error.message
            : "Error interno. Probá de nuevo en un momento."}
        </p>
        <button className="btn btn-magenta" onClick={reset}>
          Reintentar
        </button>
      </div>
    </main>
  );
}
