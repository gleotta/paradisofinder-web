import Link from "next/link";
import { searchHref } from "@/lib/market";

/**
 * Cabecera y pie del mercado italia (17/11). El sitio se presenta como el de
 * la propia inmobiliaria: sin "Beta", sin "Publicá tu propiedad", sin
 * referencia al portal de origen. Marca provisoria: "finder Italia".
 * Las clases `site-header` / `site-footer` se conservan: el resto del layout
 * (mapa fijo, dock) mide la cabecera con `--header-h`.
 */
function nav(q: string, v: "comprar" | "alquilar"): string {
  return searchHref(new URLSearchParams({ q, v }));
}

export function ItaliaHeader() {
  return (
    <header className="site-header it-header">
      <div className="container">
        <Link href="/" className="it-wordmark" aria-label="finder Italia — home">
          <span className="it-wordmark-dot" aria-hidden />
          <span className="it-wordmark-name">finder</span>
          <span className="it-wordmark-market">Italia</span>
        </Link>
        <nav className="it-nav" aria-label="Principale">
          <Link href={nav("immobili in vendita", "comprar")}>Vendita</Link>
          <Link href={nav("immobili in affitto", "alquilar")}>Affitto</Link>
        </nav>
      </div>
    </header>
  );
}

export function ItaliaFooter() {
  return (
    <footer className="site-footer it-footer">
      <div className="container">
        <span>
          Per ogni immobile puoi scrivere o chiamare l&apos;agenzia che lo segue direttamente dalla scheda.
        </span>
        <span>
          I confronti di prezzo sono stime calcolate sugli annunci pubblicati: servono a orientarsi, non
          sostituiscono una perizia.
        </span>
        {/* Para la inmobiliaria (German, 18/11): links en el pie, sin clave.
            Statistiche = resoconto de demanda (hoy con datos de ejemplo);
            Funnel = embudo de uso con los datos reales del log de eventos. */}
        <nav className="it-footer-links" aria-label="Per l'agenzia">
          <Link href="/statistiche">Statistiche</Link>
          <Link href="/funnel">Funnel</Link>
        </nav>
      </div>
    </footer>
  );
}
