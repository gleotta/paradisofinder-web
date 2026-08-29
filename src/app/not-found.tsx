import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container" style={{ padding: "72px 20px" }}>
      <div className="zero-state" style={{ margin: "0 auto" }}>
        <h3>Esa página no existe (o el aviso ya no está)</h3>
        <p>
          Puede que la propiedad se haya despublicado. Volvé a la búsqueda y te muestro lo que hay
          disponible hoy.
        </p>
        <Link className="btn btn-magenta" href="/">
          Ir a buscar
        </Link>
      </div>
    </main>
  );
}
