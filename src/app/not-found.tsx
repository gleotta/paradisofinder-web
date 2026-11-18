import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container" style={{ padding: "72px 20px" }}>
      <div className="zero-state" style={{ margin: "0 auto" }}>
        <h3>Questa pagina non esiste (o l&apos;annuncio non c&apos;è più)</h3>
        <p>
          È possibile che l&apos;immobile non sia più in pubblicazione. Torna alla ricerca e ti mostro quello che è disponibile oggi.
        </p>
        <Link className="btn btn-magenta" href="/">
          Vai alla ricerca
        </Link>
      </div>
    </main>
  );
}
