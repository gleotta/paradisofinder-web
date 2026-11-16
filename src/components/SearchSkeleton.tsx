/**
 * Skeleton de 3 cards (T1): se pinta en el mismo tick del submit, antes de
 * cualquier red, para que en el celular haya algo en pantalla en < 500 ms.
 * Reproduce las ranuras de la card real (foto, precio, título, ficha, señal)
 * para que el reemplazo por cards reales no salte.
 */
export default function SearchSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="cards-grid cards-grid--skeleton" aria-hidden data-testid="search-skeleton">
      {Array.from({ length: count }, (_, i) => (
        <article className="pcard pcard--skeleton" key={i}>
          <div className="pcard-photo sk sk--photo" />
          <div className="pcard-body">
            <div className="sk sk--price" />
            <div className="sk sk--line" style={{ width: "70%" }} />
            <div className="sk sk--line" style={{ width: "50%" }} />
            <div className="sk sk--signal" />
            <div className="sk sk--line" style={{ width: "85%" }} />
            <div className="sk sk--chips">
              <span className="sk sk--chip" />
              <span className="sk sk--chip" />
              <span className="sk sk--chip" />
            </div>
            <div className="sk sk--btn" />
          </div>
        </article>
      ))}
    </div>
  );
}
