# Respuesta de P2 a P1 — Cards por vertical — 2026-09-30 (actualizada 2026-10-01)

> Recibido en P1 el 01/10/2026. Lo que P1 hizo con esto y la respuesta a las
> preguntas abiertas del final: `docs/RESPUESTA_P1_A_P2_2026-10-01.md`; el
> registro de ejecución, en la guía `docs/GUIA_P1_2026-09-29_cards-por-vertical.md` §10.

**Para: los equipos de P1 y P3.** Responde a `PEDIDO_P1_A_P2_2026-09-29.md`
(copia en `docs/` de este repo). Autocontenido: los nombres de campos de acá
son los definitivos. El shape completo está en `API_CONTRACT.md` §4.5-§4.7.

**Actualización del 01/10.** P3 cambió cómo elige los comparables y publicó
la tendencia de zona de vivienda. P2 adoptó las reglas nuevas, y el detalle
ahora lista el conjunto entero. Lo nuevo está en la sección siguiente; el
resto del documento se corrigió donde había quedado viejo.

## Novedades del 01/10

1. ⚠️ **`comparables` del detalle ya no tiene tope de 30.** Lista todos los
   avisos del conjunto que se pueden mostrar, ordenados por precio en USD.
   En venta y lotes nada cambia en la práctica, porque el conjunto tiene
   como máximo 30. En alquiler un conjunto puede pasar de 30: hoy 58
   alquileres listan más de 30 comparables, con un máximo de 103 (de un
   conjunto de 274). La respuesta más grande pesa 32 KB. Si la sección "ver
   similares" tiene que ser corta, el recorte va del lado de P1.
   `count = listed + not_listed` sigue valiendo, y `not_listed` son solo los
   avisos que no se muestran (sin foto o sin superficie).
2. ⚠️ **`comparables_count` de un alquiler puede pasar de 30.** Pasa en 92
   alquileres visibles (máximo 274). Los textos que lo citan dicen el número
   real, por ejemplo "Precio 31 % más bajo que 80 alquileres similares en
   Capital".
3. **Otro conjunto de alquiler, y por lo tanto otros gaps y semáforos.**
   Antes, un alquiler se comparaba con los de los mismos dormitorios, hasta
   30 elegidos sin criterio de parecido. Ahora, si el aviso publica
   superficie cubierta y en su zona hay 5 o más alquileres con los mismos
   dormitorios y una superficie parecida (±30 %), se compara con esos. Si
   no, se compara con todos los de los mismos dormitorios, sin tope. Según
   P3 cambiaron de semáforo 150 alquileres y 131 ventas (en venta, solo por
   el desempate del corte en 30). Si P1 tiene capturas de referencia con
   gaps, ratings o `comparables_count`, van a diferir.
4. **La tendencia de zona de vivienda ya llega.** `zone_ref.trend` viene en
   el 89 % de las ventas, el 85 % de los alquileres y el 95 % de los lotes,
   con `trend_weeks` = 2 (13 alquileres tienen 1). Va a subir a 3 y a 4 con
   las próximas corridas. La pregunta abierta sobre esto se cerró.
5. **El pedido de P2 a P3 quedó resuelto** (ver "Pedido a P3").

Contrato: `API_CONTRACT.md` §4.7 y el ítem 16 del checklist de §8.

## Estado de la entrega

| Punto del pedido | Código y tests | Verificado contra la DB real | Publicado |
|---|---|---|---|
| §3.1 Tendencia del aviso (5 campos) | listo | sí | no: falta commit y deploy |
| §3.1 `estimated_monthly_rent_ars` | listo | sí | no |
| §3.2 `zone_ref` | listo | sí; tendencia de vivienda remedida el 01/10 | no |
| §3.3.1 Rating de alquiler | listo | sí; remedido el 01/10 | no |
| §3.3.2 Score de compra sin rentabilidad | listo | sí | no |
| §3.3.3 `area_sqm` null | listo | sí | no |
| §3.3.4 Comparables del detalle | listo, con las reglas de P3 del 01/10 | sí, en la base local y en Railway | no |
| §3.3.5 Vocabulario | listo | sí | no |
| §3.4 Guardias | listo | 30/09: release gate PASS 9/9, golden 138/138, batería FINDER-QA PASS, latencia PASS (p95 de `cards` 1,94 s). 01/10: release gate PASS 9/9, golden 138/138 | — |

Nada del contrato anterior cambió de nombre ni desapareció (lo verifica un
test contra la captura del 20/09). Hay **cuatro cambios de comportamiento**
que P1 tiene que mirar; están en la sección siguiente.

## Lo que P1 tiene que tener en cuenta

1. **`area_sqm` puede ser `null`** en cards y en comparables (antes `0`).
   Son 231 avisos visibles hoy.
2. **`comparables` del detalle trae el conjunto entero que se puede
   mostrar** (antes 3), ordenado por precio en USD, y al lado llega
   `comparables_pool`. En venta y lotes son hasta 30; en alquiler pueden ser
   más (hoy hasta 103). La lista puede ser más corta que
   `comparables_count`: ver "Comparables" más abajo.
3. **Alquiler caro: `valuation_gap_capped: true` con `deal_rating: "red"`.**
   La guía de P1 (§2.3) escribe "verificar el aviso" cuando `capped` es
   `true`. Con este cambio un alquiler más de 35 % por encima de sus
   similares llega con `capped: true`, gap −35 y rating `red`: el subtítulo
   de verificación tiene que depender de `deal_rating === "verify_data"`, no
   de `capped`. El "35 %+" sí sigue valiendo para los dos.
4. **Textos nuevos** en `score_components[].label` / `.description`,
   `secondary_indicators[]`, `deal_rating_reasons[].text` (los `code` no
   cambiaron) y `summary.order` del orden por percentil ("Más baratas entre
   avisos similares"). Si alguna prueba de P1 compara esos textos, cambian.

## Nombres definitivos

### Card y PropertyDetail

| Campo | Tipo | Valores |
|---|---|---|
| `price_trend` | string \| null | `up` · `down` · null |
| `previous_price` | number \| null | nominal, en `currency` |
| `previous_price_usd` | number \| null | USD al cambio del día observado |
| `price_change_pct` | number \| null | en USD, con signo; negativa = bajó |
| `price_changed_at` | string \| null | fecha ISO |
| `zone_ref` | objeto \| null | abajo |
| `estimated_monthly_rent_ars` | number \| null | solo alquiler; a la centena |
| `area_sqm` | int \| **null** | null sin superficie |

### `zone_ref`

```json
{
  "zone": "capital", "property_type": "house", "bucket": "4plus",
  "median_price_per_sqm": 821.21, "median_price_per_hectare": null, "median_price": null,
  "sample": 186, "fallback": null, "fallback_ref": null,
  "trend": "flat", "trend_pct": 1.5, "trend_weeks": 2,
  "cap_pct": 7.77, "week": "2026-09-28"
}
```

Igual a lo pedido, más `fallback_ref` (el nombre del nivel cuando hay
fallback, p.ej. `gran_san_juan`). `property_type`: `house` · `apartment` ·
`land` en lotes · null si la base todavía no tiene el tipo en la serie.
`trend`: `up` · `down` · `flat` · null.

### Detalle (`GET /property/{id}`)

| Campo | Qué es |
|---|---|
| `comparables[]` | todos los avisos del conjunto que se pueden mostrar, por precio en USD: hasta 30 en venta y lotes, sin tope en alquiler (hoy hasta 103). Cada uno suma `property_type`, `operation`, `bedrooms`, `covered_area_sqm` y `price_per_sqm` (USD/m² sobre la base con que se compara: cubierta en vivienda, total en lotes) |
| `comparables_pool` | `{scope, count, listed, not_listed}` o null. `scope`: `zone` · `adjacent_zones` · `macro_zone`. `count` = `comparables_count` de la card (en alquiler puede pasar de 30). `count = listed + not_listed`, con `not_listed` = los que no se muestran |

## Qué se hizo en cada punto y qué se interpretó

### §3.1 Tendencia del aviso

Se pasa tal cual la deja P3. Las cinco columnas se leen como opcionales: P2
mira el schema al arrancar y, si falta alguna, sirve null y vuelve a mirar
cada 5 minutos (no hace falta reiniciar cuando llega la migración). Como
avisó P3, la señal es `price_trend`: hay avisos con `previous_price` y sin
tendencia.

### §3.1 Renta estimada en pesos

`estimated_monthly_rent` (USD) × el cambio oficial de la corrida que calculó
los indicadores del aviso, **redondeado a la centena**. El redondeo no
estaba en el pedido: P3 guarda la renta en USD con dos decimales y, sin
redondear, una mediana de $ 600.000 volvía como $ 600.001.

### §3.2 `zone_ref`

Tres interpretaciones, a revisar si no son las que P1 quería:

- **Un valor de referencia por celda**, el mismo que P3 usa para calcular su
  tendencia: precio mensual en alquiler, hectárea en lotes rurales (que
  traen también el m²), m² en el resto. **Propia o fallback se decide sobre
  ese valor.** El pedido decía "con `fallback` ≠ null, servir los
  `fallback_*`", pero P3 marca fallback cuando le falta muestra para
  CUALQUIERA de las dos medianas: un alquiler de Capital con 31 avisos y
  mediana propia se habría servido con la de la macro zona solo porque
  pocos avisos publican superficie.
- **No se mezcla con la celda `todos`.** Si el tipo del aviso no tiene
  celda, `zone_ref` es null; y la tendencia es la de la celda del tipo.
- **Habitaciones y tarifas por día o semana: null.** Una mediana mensual no
  es su referencia.

En lotes es la misma celda que ya viajaba en `zone_stats_ref` (que sigue
llegando), con tipo, tendencia y semana.

### §3.3.1 Rating de alquiler

Alquiler con gap < −35 %: `red`, primer motivo `sobreprecio` con el texto
pedido. El motivo `sobreprecio` de P3 se reemplaza (traía el porcentaje real,
"62 % más alto", al lado de un −35 mostrado). Tampoco se le aplica el tope de
score 55, que era el de "dato dudoso". En venta y lotes no cambia nada.

### §3.3.2 Score de compra

La rentabilidad salió del score de `compraventa`; los otros cuatro pesos
conservan su proporción (0,471 / 0,235 / 0,176 / 0,118). El componente queda
en la vertical `investment`. **Ojo**: "Invertir" en P1 es una compra ordenada
por `gross_yield_desc`, no la vertical `investment`, así que tampoco trae el
componente; la rentabilidad se ve en `gross_yield_pct` y `zone_ref.cap_pct`.

### §3.3.4 Comparables

P2 reconstruye el mismo conjunto con el que P3 midió el precio. Reglas
vigentes desde el 01/10:

- **Venta de vivienda:** misma categoría y superficie cubierta ±30 %; en
  departamentos, además, el mismo tramo de dormitorios.
- **Lotes:** misma clase (urbano / rural; el rural, además, con o sin
  servicios) y superficie total ±30 %.
- **Alquiler de vivienda:** los mismos dormitorios. Si el aviso publica
  superficie cubierta y en su zona hay 5 o más alquileres dentro del
  ±30 %, el conjunto son esos (`scope: zone`). Si no, son todos los de los
  mismos dormitorios. Hoy 260 alquileres visibles usan la banda y 236 van
  por dormitorios.
- **Zona:** la del aviso; con menos de 3 avisos, también las zonas vecinas
  o la macro zona (por eso existe `scope`). La banda del alquiler nunca sale
  de la zona.
- **Tope:** con banda de superficie el conjunto tiene como máximo 30, los de
  superficie más parecida. Sin banda (alquiler por dormitorios) no tiene
  tope.

Dos cosas que el pedido no anticipaba:

- **El corte en 30 ahora es reproducible.** Hasta el 30/09 P3 desempataba
  con el orden en que recorría los avisos y P2 dependía de una columna
  auxiliar para copiarlo. Desde el 01/10 el desempate sale de los datos:
  superficie más parecida, después el aviso actualizado más recientemente en
  el portal y, por último, el id. P2 reproduce el conjunto de P3 en el 100 %
  de los avisos (ver "Aceptación").
- **El conjunto incluye avisos que no se muestran** (`quality_tier = 0`: sin
  foto o sin superficie). Cuentan en `count` y quedan en `not_listed`; no se
  listan, porque la regla del contrato es que tier 0 no se muestra nunca y
  su detalle da 404. En venta son el 1,2 % de los comparables y en lotes el
  3,5 %; **en alquiler, el 47 %**, porque el conjunto por dormitorios no
  exige superficie.

### §3.3.5 Vocabulario

Además de lo listado en el pedido se pasaron a lenguaje de usuario los
`label` de los componentes y de los topes, la etiqueta del orden por
percentil, el detalle que recibe el cliente MCP y la narrativa del chat: el
prompt pasó a `nar-2.1` y la guardia descarta la oración que diga "gap",
"percentil", "cap" o "P2"/"P3". La lista de palabras es la misma que usó P3.
Un gap recortado se redacta "más de 35 %", no "35 %".

Textos vigentes:

| Código | Antes | Ahora |
|---|---|---|
| `verificar_datos` | Gap de valuación fuera de ±35%: verificar datos del aviso | Diferencia muy grande con avisos similares: conviene verificar el aviso |
| `sobreprecio` (alquiler, gap < −35 %) | (era `verificar_datos`) | Muy por encima de alquileres similares |
| `pocos_comparables` | Menos de 5 comparables en la zona: sin gap de valuación | Hay menos de 5 avisos similares en la zona: no alcanza para comparar el precio |
| `sin_superficie_cubierta` | Sin superficie cubierta: no se evalúa el precio por m² | Sin superficie cubierta: no se puede comparar el precio por m² |
| `aviso_antiguo` | sin cambios | Publicado hace más de 6 meses — margen para negociar |

| Componente | Antes | Ahora |
|---|---|---|
| `gap_valuacion` (label) | Subvaluación | Precio frente a similares |
| `gap_valuacion` | Precio 18% por debajo de 12 comparables activos en Rivadavia | Precio 18 % más bajo que 12 avisos similares en Rivadavia |
| `gap_valuacion`, acotado | … (gap acotado a ±35%: verificar datos) | Precio más de 35 % más bajo que 7 avisos similares en Rawson: conviene verificar el aviso |
| `price_position` | Percentil 20: más barato que el 80% de 12 comparables en Rivadavia | Más barato que el 80 % de 12 avisos similares en Rivadavia |
| `price_position`, en el medio | Percentil 50: … | Precio en el medio de 12 avisos similares en Rivadavia |
| `price_position`, caro | Percentil 80: más barato que el 20% … | Más caro que el 80 % de 12 avisos similares en Rivadavia |
| `gross_yield` (label) | Rendimiento bruto | Rentabilidad estimada |
| `gap_zonal` (lotes) | m² 33% por debajo de la mediana de lotes urbanos en Santa Lucía (…) | m² 33 % más bajo que el valor típico de lotes urbanos en Santa Lucía (US$ 34/m², 440 avisos) |
| `gap_zonal`, con fallback | … (gran_san_juan, la zona no llega a la muestra mínima) | … (referencia de Gran San Juan: en la zona hay pocos avisos) |
| `tope_sin_comparables` (label) | Comparables insuficientes | Pocos avisos similares |
| `tope_gap_fuera_de_rango` (label) | Gap fuera de rango | Diferencia muy grande con similares |

En alquiler dice "alquileres similares" donde en venta dice "avisos
similares". No se tocó "Score máximo N" en los topes.

## Aceptación

Medida el 2026-09-30 sobre la base local con la corrida de P3 del 29/09
(5.513 avisos visibles). El rating de alquiler, los comparables y la
tendencia de zona se volvieron a medir el 01/10, con los datos que P3
publicó ese día; la base local y Railway tienen esos datos idénticos. Los
totales no coinciden con los del pedido porque aquél se midió con la base
del 21/09.

| Criterio | Resultado |
|---|---|
| §3.2 · 94 % de ventas y 84 % de alquileres con celda propia, el resto con fallback | **no se cumple tal como está escrito.** Ventas: 89 % propia, 9 % fallback, 2 % null. Alquileres: 85 % propia, 7 % fallback, 8 % null |
| §3.2 · todo lote visible trae su celda | cumple: 96 % propia, 4 % fallback |
| §3.3.1 · los alquileres con gap < −35 % pasan a `red`; los de > +35 % siguen `verify_data` | cumple. 01/10: 98 y 39, todos con el rating correcto (30/09: 116 y 32; el pedido contaba 138 y 42 el 21/09) |
| §3.3.2 · compra sin `gross_yield` | cumple: 0 de 2.457 |
| §3.3.2 · el top 20 de "casas en venta" conserva su orden | 18 de 20 avisos en común y 9 de 10 en el top 10; de los 153 pares en común, 133 conservan el orden. Salen dos que subían por rentabilidades de 13,6 % y 15 % |
| §3.3.3 · `area_sqm` null | cumple: 231 avisos |
| §3.3.4 · la lista del detalle es el conjunto de P3 y su mediana coincide con la estimación ± 1 % | cumple. 01/10: la mediana del conjunto completo reproduce la estimación en todas las viviendas que la tienen (1.998 ventas y 492 alquileres; desvío máximo 0,002 %). Donde todo el conjunto se puede mostrar (1.502 ventas, 225 alquileres), la lista ES el conjunto; en los demás falta solo lo que no se muestra |
| §3.3.4 · `comparables_count` coherente con la lista | cumple. 01/10: `comparables_pool.count` = `comparables_count` en los 4.989 avisos visibles con conjunto; `not_listed` dice cuántos no se muestran |
| §3.3.5 · sin jerga | cumple: 0 textos en una muestra de 300 cards por vertical |

Sobre §3.2: los null son avisos sin dormitorios (41 ventas, 35 alquileres),
que el mismo pedido manda a null, más 7 alquileres cuya celda no tiene
muestra ni fallback. La celda propia baja de 94 % a 89 % en venta porque con
el tipo en el grano las celdas son más chicas.

**Tendencia de zona (01/10).** `zone_ref.trend` viene en el 89 % de las
ventas, el 85 % de los alquileres y el 95 % de los lotes. Ventas: 1.788
`flat`, 332 `down`, 75 `up`. Alquileres: 329 `flat`, 53 `down`, 71 `up`.
Lotes: 1.623 `flat`, 157 `down`, 561 `up`. Los que no la tienen son de dos
clases: avisos cuya celda no llega a la muestra mínima y se sirven con la
mediana de un nivel más amplio, que no tiene tendencia (221 ventas, 37
alquileres), y avisos sin dormitorios, que no tienen `zone_ref` (41 y 42).
`cap_pct` viene en el 55 % de las ventas.

Tendencia del aviso, visibles (30/09): compra 128 `down` y 57 `up`;
alquiler 48 y 22; lotes 54 y 25.

Latencia: la búsqueda quedó igual que antes (casas en venta 38 → 31 ms de
consulta; alquiler 14 → 19 ms). Los comparables del detalle pasaron de 3,5 a
16 ms (mediana; p95 21 ms). El detalle con el conjunto más grande (274
avisos, 103 listados) responde en 57 ms y pesa 32 KB.

## Pedido a P3 — resuelto el 01/10

1. **Desempate del corte en 30 comparables.** P3 lo resolvió con un orden
   que sale de los datos (superficie más parecida, actualización más
   reciente en el portal, id) y lo publicó en Railway el 01/10 a las 00:56.
   P2 ya no depende de cómo graba P3 sus columnas internas.
2. Si cambia la selección de comparables, avisar: P2 tiene una copia en
   `app/core/comparables.py`, y su guardia compara todos los avisos contra
   lo que publica P3.

## Preguntas abiertas para P1

1. **Comparables de alquiler.** Casi la mitad del conjunto (47 %) no se
   puede mostrar (tier 0). ¿Alcanza con "80 similares, 40 a la vista" usando
   `not_listed`, o se prefiere otra cosa? Las alternativas son de P3 o de
   producto: que el conjunto de alquiler use solo avisos visibles (cambia
   los gaps), o mostrar los tier 0 como fila sin link (hoy la regla lo
   impide).
2. **Propia vs. fallback por el valor de referencia** (§3.2): ¿está bien, o
   se quiere el criterio literal del pedido?
3. **Redondeo a la centena** de la renta en pesos: ¿está bien?
4. La guía de P1 §8.6 (número y semáforo que no dicen lo mismo en lotes;
   gap con 4 comparables en un lote) no vino en este pedido y no se tocó.

La pregunta sobre la tendencia de zona en vivienda (usar mientras tanto la
de la celda `todos`) se cerró: P3 reconstruyó la serie por tipo y la
tendencia ya llega.
