# Respuesta de P1 a P2 — Similares con foto, Zona sin dormitorios y comparación sin superficie cubierta — 2026-10-04

**Para: el equipo de P2 (finder-core), con copia a P3.** Responde a
`RESPUESTA_P2_A_P1_2026-10-04.md`. Autocontenido: se copia tal cual al repo
de P2.

**Estado: borrador, pendiente de aprobación de German.** Es un cierre: P1 no
pide nada más. Lo que P1 cambió (sección 2) está hecho, verificado contra el
Docker local de P2 (versión del 04/10 sobre la corrida de P3 del 03/10) y en
`develop`; falta el deploy a producción.

---

## 1. Se acepta la entrega completa

Los cuatro puntos del pedido del 03/10 quedaron resueltos y los nombres se
toman como definitivos: `total_area_basis`, `comparables_by_area_only` y
`comparables[].photo_url`. P1 midió la entrega recorriendo
`/search/structured` del Docker local (2.039 avisos de vivienda: todos los
departamentos, todos los alquileres y 800 casas en venta) y coincide con lo
que dice la respuesta:

| Qué | Medido por P1 |
|---|---|
| `total_area_basis: true` | 177 departamentos en venta y 81 en alquiler |
| `comparables_by_area_only: true` | 31 departamentos en venta y 32 en alquiler |
| `zone_ref` en departamentos en venta | 707 de 707 (32 con `bucket: "todos"`) |
| Comparación con menos de 5 similares | ninguna |
| Motivo "Sin superficie cubierta…" en alquileres | ninguno; queda solo en casas en venta |
| `photo_url` en los similares | todos, en los seis detalles revisados (2 a 30 similares cada uno) |

El ejemplo de la respuesta (`ac233f21…`) llega tal como está descripto:
US$ 907 el m², 26 % más bajo que 30 similares, `green`, score 86.

## 2. Qué hizo P1 con cada punto

| Punto de P2 | Qué muestra P1 |
|---|---|
| `total_area_basis: true`: rotular el m² | Card: "US$ 907/m² total". Detalle, junto al precio: "US$ 907/m² sobre superficie total". En "Avisos similares", la fila de un similar medido por la total (`covered_area_sqm` null y `area_sqm` con valor) lleva el mismo rótulo, para no mezclar dos m² distintos sin decirlo. |
| `has_covered_area: false` con comparación | P1 nunca usó ese campo para ocultar el bloque: el bloque de posición sale siempre que llega `valuation_gap_pct`. |
| `comparables_by_area_only: true` | Card: "12 departamentos de superficie similar en Capital", sin dormitorios. Cabecera del detalle: "Comparado con 12 departamentos de superficie similar en Capital, con cualquier cantidad de dormitorios". Es el texto sugerido, con la unidad que ya usa la card. |
| `comparables[].photo_url` | La miniatura de cada similar es esa foto, directa. La ruta propia de P1 queda de respaldo: se usa si el campo no llega o si el portal no sirve la foto. Las llamadas a `GET /property/{id}` por similar desaparecen. |
| `zone_ref` con `bucket: "todos"` | Sin cambios en P1: el bloque Zona no muestra el bucket. Ninguna card de departamento en venta de Capital sale ya sin Zona. Sin `trend` esta semana, el bloque sale sin la flecha. |
| Alquiler sin cubierta con comparación | Sin cambios en P1: el bloque de posición aparece solo. |
| Conjunto de 1 a 4, sin comparación | El detalle los lista, pero ya no dice "Comparado con 2 departamentos similares": la cabecera es el motivo de P2 tal cual ("Hay menos de 5 avisos similares…") y el indicador pasa de "Avisos similares comparados" a "Avisos similares encontrados". |

Un cambio propio de P1, por coherencia: en el detalle de un alquiler, la
fila de la propiedad en "Avisos similares" ya no muestra el m². P2 manda
`price_per_sqm` en los alquileres (por ejemplo 6,49), pero sus similares
llegan sin él porque se comparan por precio mensual.

## 3. Orden de deploy

El cambio de P1 es compatible hacia atrás: con el P2 de producción (versión
del 01/10) los campos nuevos no llegan, no aparece ningún rótulo nuevo y la
miniatura sale de la ruta propia de P1, como hasta hoy. P1 puede salir antes
que P2 o junto con él; no hace falta coordinar el momento. Ese camino no se
probó contra el P2 de producción; contra el Docker local pasan 38 de 38
pruebas de cards y detalle.
