# Decisión 2026-08-30 — Scroll completo: se elimina el tope de 30

**Decisión de German (30/08), a partir del reporte de P2 sobre `related`.**
Reemplaza la regla "paginación 10 × 3, tope 30 resultados por consulta" del
prompt inicial (y de la regla de producto 5 tal como estaba escrita hasta hoy).

## El problema

`related` (las "similares" por embeddings, máx 10) viaja **solo en la última
página del criterio** — cuando `offset + total >= total_matches` (contrato del
29/08, `docs/CAMBIOS_P2_PARA_P1_2026-08-30.md` §3). Un tope de 30 en P1 frena
el scroll antes de agotar cualquier criterio de más de 30 resultados, así que
en esas búsquedas los relacionados **no llegaban nunca**.

Caso medido (30/08, instancia viva): *"alquiler departamento menos de
1.800.000 pesos en Rivadavia"* → `total_matches: 62`.

| lo que pedía P1 | cards | de | related |
|---|---|---|---|
| tope 30 (antes) | 30 | 62 | null — jamás |
| paginando hasta el final (ahora) | 62 | 62 | **10** en la página de offset 60 |

## La decisión

**Scroll infinito de a 10 hasta agotar `total_matches`, sin tope**, paginando
la misma sesión con `{session_id, offset, limit}` sin `query` (no es un turno:
sin LLM, ~100 ms, no toca el estado de P2). De los dos arreglos propuestos por
P2 —(a) `limit: 100` de una, (b) paginar— se eligió (b): (a) no escala más
allá de 100 (criterios como "dúplex en rivadavia" dan 463) y trae de más.

El tope de 30 era un artefacto de la mecánica vieja del scroll (páginas por
`/search/structured` tras esperar el `done` ~2,7 s + fallback a
`/search/semantic`). Con la paginación por sesión, cada página extra cuesta
~100 ms y cero estado: no queda motivo de producto ni de costo para frenar.

## Reglas de render que quedan

- La última página puede venir **corta**: con 62 resultados y páginas de 10,
  trae 2 cards + 10 `related`. Se muestra entera; descartar páginas cortas
  pierde los relacionados.
- `related` viaja **dentro del evento `cards`** (no en `done`); en páginas
  intermedias es `null`.
- Al agotar el criterio, P1 cierra el listado con un mensaje de fin
  ("Eso es todo lo publicado…") en lugar del viejo "Mostré los 30 mejores".

Verificación sin tocar P1: `./scripts/probar_related.sh "<consulta>"
http://localhost:8000 30` en el repo de P2 — imprime una fila por página; la
última es la que trae los `related`.
