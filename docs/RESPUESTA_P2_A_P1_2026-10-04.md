# Respuesta de P2 a P1 — Similares con foto, Zona sin dormitorios y comparación sin superficie cubierta — 2026-10-04

**Para: el equipo de P1.** Responde a `PEDIDO_P1_A_P2_2026-10-03.md` y
adopta lo que P3 entregó por el pedido de P1 del mismo día
(`RESPUESTA_P3_A_P1_2026-10-03.md`). Autocontenido: los nombres de campos de
acá son los definitivos y están en `API_CONTRACT.md` (§4.1, §4.6, §4.7 e
ítems 17-22 del checklist). Las cifras son de la base del 2026-10-04, con la
corrida de P3 del 03/10 que ya está publicada: 5.513 avisos visibles.

**Estado: implementado y probado en P2, sin desplegar.** Todo es aditivo;
los cambios de comportamiento van marcados ⚠️.

## Decisiones tomadas

1. ⚠️ **Los departamentos en venta sin superficie cubierta muestran su
   comparación.** P3 los mide por la superficie total y P2 deja de
   ocultarlo. Detalle en la sección 1.
2. **Dos campos nuevos en la card y el detalle:** `total_area_basis` y
   `comparables_by_area_only`. Sección 2.
3. **Los puntos 1 a 3 del pedido se aceptaron como estaban:** `photo_url` en
   cada similar, `zone_ref` para vivienda sin dormitorios y comparación de
   alquiler sin superficie cubierta. Sección 3.
4. **El mínimo para comparar es 5, también en P3.** P3 amplía la zona hasta
   juntar 5 similares; P2 no cambia su mínimo. Sección 3.

---

## 1. Departamentos en venta sin superficie cubierta

Desde el 03/10, P3 mide por la superficie total a un departamento que no
publica cubierta: le calcula el precio por m², le arma el conjunto de
similares y le calcula el porcentaje contra ellos. Son 177 departamentos en
venta visibles. P2 los marcaba con "Sin superficie cubierta: no se puede
comparar el precio por m²" aunque el detalle listara sus similares. Ahora
los sirve como a cualquier otro aviso.

| Campo de la card | Antes | Ahora, con `total_area_basis: true` |
|---|---|---|
| `price_per_sqm` | null | `price_usd / area_sqm`, sobre la total |
| `valuation_gap_pct`, `price_percentile` | null | los de P3, con las reglas de siempre (5 o más similares, porcentaje acotado a ±35) |
| `deal_rating` | null, con el motivo "Sin superficie cubierta…" | el de P3, o `verify_data` si la diferencia pasa de ±35 % |
| `opportunity_score` | 60 como máximo | sin ese tope |
| `covered_area_sqm`, `has_covered_area` | null y `false` | igual: el aviso sigue sin cubierta |

Cómo quedaron los 177:

| `deal_rating` | Antes | Ahora |
|---|---|---|
| `green` | 0 | 44 |
| `yellow` | 0 | 53 |
| `red` | 0 | 11 |
| `verify_data` | 0 | 57 |
| null | 177 | 12 (tienen menos de 5 similares: motivo `pocos_comparables`) |

Con esto los departamentos en venta con comparación son 681 de 707 (la meta
del pedido a P3 era más de 620). En el score, 54 de los 177 pasan de 60 y 24
llegan a 75 o más.

Un ejemplo: departamento de 1 dormitorio en Capital, 54 m² totales,
US$ 49.000 (`ac233f21-67c8-459c-b85b-bd63b5b2f6fb`). Antes llegaba sin m² ni
comparación y con score 60. Ahora: US$ 907 el m², 26 % más bajo que 30
avisos similares (referencia: US$ 1.222 el m²), `green`, score 86.

**Lo que P1 tiene que tener en cuenta.**

- Con `total_area_basis: true`, rotular el m² ("m² sobre superficie total").
- `has_covered_area` sigue en `false` en estos avisos aunque haya m² y
  comparación: no usarlo para ocultar el bloque de posición.
- El m² sobre la total es una aproximación. En el 19 % de los departamentos
  que publican las dos superficies, la total supera a la cubierta en más de
  un 30 %, y esos avisos se ven más baratos por m² de lo que son. Por eso 57
  de los 165 con comparación (35 %) quedan en `verify_data`, contra el 28 %
  de los departamentos con cubierta. La card ya dice "conviene verificar el
  aviso" en esos casos.
- `zone_ref` sigue midiendo el m² sobre cubierta: al lado del m² de la zona,
  el de estos avisos puede verse algo más bajo.

---

## 2. Campos nuevos

Valen `true` o null, nunca `false`. Van en la card y en el detalle.

| Campo | Qué dice | Avisos visibles |
|---|---|---|
| `total_area_basis` | El aviso no publica superficie cubierta y se midió sobre la total (`area_sqm`): su m², su conjunto de similares y su entrada al conjunto de otros. Solo departamentos | 258 (177 en venta, 81 en alquiler) |
| `comparables_by_area_only` | El aviso no publica dormitorios y su conjunto se armó por superficie ±30 % sola, con avisos de cualquier cantidad de dormitorios. Texto sugerido: "avisos similares en superficie" | 63 (31 en venta, 32 en alquiler) |

Y en cada similar del detalle, `comparables[].photo_url` (punto 1 del pedido).

---

## 3. El pedido del 03/10, punto por punto

| Punto del pedido | Qué quedó |
|---|---|
| 1. `photo_url` en cada similar | Hecho. Es la primera foto del aviso, la misma de su card. En una muestra de 100 detalles (más de 1.000 similares), ninguno null y todas `https://`. |
| 2. `zone_ref` para vivienda sin dormitorios | Hecho: la celda de todos los dormitorios de su tipo, con `bucket: "todos"` y sus reglas de fallback. De los 100 primeros departamentos en venta de Capital, 100 traen `zone_ref`. En toda la base lo traen el 100 % de las ventas de vivienda y el 98,7 % de los alquileres (7 alquileres quedan sin celda: ni muestra ni fallback). Esta semana llega sin `trend`: desde el 04/10 P3 publica la tendencia solo con muestra y serie suficientes, y ninguna celda por tipo la trae todavía. |
| 2. `bedrooms: 0` | Trae `bucket: "todos"`. P3 no lo cuenta como monoambiente de 1 dormitorio: lo agrupa con los avisos sin dato. Es un solo aviso, el que citaba el pedido. |
| 3. Comparación de alquiler sin superficie cubierta | ⚠️ Hecho: en alquiler la comparación no exige cubierta, y el motivo "Sin superficie cubierta…" y su tope de score ya no existen en alquileres. De los 532 alquileres de vivienda que lista la búsqueda, 509 traen comparación (antes 411). Los 98 recuperados: 22 `green`, 38 `yellow`, 35 `red`, 3 `verify_data`. Los 23 que quedan sin comparación dicen "Hay menos de 5 avisos similares…". El pedido decía 484 y 387: se midió antes de la corrida nueva de P3. |
| 4. Comparación con 3 o 4 similares | Lo resolvió P3: amplía la zona hasta juntar 5. P2 mantiene su mínimo de 5 y hoy no existe ningún aviso con comparación calculada y menos de 5 similares. Un conjunto de 1 a 4 se sigue listando en el detalle, sin comparación. |
| Pregunta 1: ¿mismo deploy? | Sí: sale todo junto, con las reglas nuevas de similares de P3. |
| Pregunta 2: ¿alguna razón contra la celda `todos`? | Ninguna. Es coherente con el conjunto de un aviso sin dormitorios, que también reúne avisos de cualquier cantidad de dormitorios. |

---

## 4. Similares: lo que cambió por las reglas de P3

- El conjunto del detalle tiene exactamente `comparables_count` avisos en
  los 5.513 avisos visibles, con las reglas nuevas: mínimo de 5, departamento
  sin cubierta medido por la total, y sin dormitorios por superficie sola.
- En un similar medido por la total, `covered_area_sqm` es null, `area_sqm`
  trae el valor y `price_per_sqm` va sobre la total.
- `scope` en `adjacent_zones` o `macro_zone` aparece más seguido: la zona se
  amplía hasta juntar 5.
- **Hasta el deploy**, en los avisos afectados por las reglas nuevas
  `comparables_pool.count` puede no coincidir con `comparables_count`: P3 ya
  publicó sus números y la versión desplegada de P2 arma el conjunto con las
  reglas anteriores.
