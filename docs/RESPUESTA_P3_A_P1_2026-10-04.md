# Respuesta de P3 a P1 — Cards por vertical, segunda vuelta — 2026-10-04

**Para: los equipos de P1 y P2.** Responde a `RESPUESTA_P1_A_P3_CARDS_2026-09-30.md`
(aprobada por German el 01/10; copia en `docs/` de este repo), que aceptaba la entrega del
29/09 y pedía cuatro cambios. Los cuatro están hechos. Autocontenido.

Todas las cifras salen de la base local de P3 del 2026-10-04, **ya con el pedido del 03/10
aplicado** (`RESPUESTA_P3_A_P1_2026-10-03.md`): por eso los totales no coinciden con los que
P1 midió el 29/09 sobre otra base, aunque los efectos sí.

## Estado de la entrega

| Punto de la respuesta de P1 | Código y tests | En la base local | Publicado (Railway) |
|---|---|---|---|
| §1 Rentabilidad en NULL cuando el gap de la venta supera +35 % | listo | aplicado | **no** |
| §3 Tope de variación de la tendencia del aviso: 40 % | listo | aplicado | **no** |
| §6 `label` de `score_componentes` en lenguaje de usuario | listo | aplicado | **no** |
| §B Tendencia zonal solo con muestra ≥ 15 y ≥ 3 semanas | listo | aplicado (semana en curso y semanas pasadas) | **no** |
| §2, §4, §5, §7 | nada que cambiar, como dice P1 | — | — |

Aplicado el 2026-10-04 con una corrida de `indicators` (7.615 propiedades, sin errores) y el
backfill de la tendencia zonal sobre las semanas ya escritas (276 filas). Sin migración: son
reglas y parámetros. **No está publicado**: va en el mismo sync que la entrega del 03/10,
cuando German lo decida.

Parámetros (en `pipeline/config.py`, con variable de entorno del mismo nombre):
`YIELD_PRECIO_DUDOSO_GAP` 35.0 · `TENDENCIA_VARIACION_MAX_PCT` 40.0 (era 90) ·
`TENDENCIA_ZONA_N_MIN` 15 · `TENDENCIA_ZONA_SEMANAS_MIN` 3. `TENDENCIA_ZONA_N_MIN_RURAL` (15)
queda, hoy redundante.

## §1 Rentabilidad con precio dudoso

Regla, tal como la pidió P1: cuando `gap_valuacion` de una venta supera +35 %,
`gross_yield_estimado` y `relacion_renta_precio` quedan NULL; `renta_mensual_estimada` se
conserva. El umbral es una constante de P3 que tiene que seguir igual al de `verificar_datos`
de P2: si uno cambia, cambia el otro.

Una interpretación: la descripción del componente de rentabilidad en `score_componentes`
decía "Rentabilidad no estimable (pocos alquileres similares en la zona)" cuando el valor era
NULL. En estos avisos eso sería falso (la renta sí se estimó), así que el texto es otro:
"Rentabilidad no publicada: el precio está muy por debajo de avisos similares y conviene
verificarlo". El componente del score toma el neutro 50, como cualquier dato faltante.

| Ventas de vivienda visibles | Antes | Después |
|---|---|---|
| Con rentabilidad | 1.010 | 878 |
| Mediana | 7,50 % | 7,12 % |
| Máxima | 61,09 % | 18,67 % |
| Más de 12 % | 139 | 33 |
| Más de 15 % | 65 | 3 |
| Top 20 por rentabilidad (lo que abre Invertir sin zona) | 21,0 a 61,1 % (mediana 25,4 %) | 12,9 a 18,7 % (mediana 13,9 %) |

135 ventas conservan la renta estimada sin publicar rentabilidad. La máxima y el "más de
15 %" coinciden con lo que P1 midió el 29/09 (18,67 % y 3).

## §3 Tope de variación: 40 %

`TENDENCIA_VARIACION_MAX_PCT` pasa de 90 a 40: una variación mayor en dólares se trata como
corrección de un precio mal cargado y los cinco campos de la tendencia quedan NULL. Hoy hay
451 avisos con etiqueta (315 `baja`, 136 `alta`) y la variación más grande publicada es
exactamente 40,00 %. Los que salen por el tope son los 12 que P1 listó (4 bajas, 8 subas).

## §6 Labels

Los cuatro `label` en español cambiaron tal como P1 los propuso; los `key` y los textos en
italiano no.

| `key` | `label` |
|---|---|
| `gap_valuacion` | Precio frente a similares |
| `gross_yield` | Rentabilidad estimada |
| `price_position` | Posición entre similares |
| `time_on_market` | Tiempo publicado |

## §B Tendencia zonal con muestra y serie suficientes

Dos condiciones nuevas, las dos de P1: **15 o más en las dos puntas, en toda celda** (antes
10, y 15 solo en lotes rurales) y **al menos 3 semanas entre las puntas**. La celda sigue
publicando sus medianas con 10; esto decide solo si además publica tendencia. La punta de
comparación sigue siendo la más vieja dentro de la ventana de 4 semanas; si la más vieja
que tiene muestra está a menos de 3 semanas, no hay tendencia.

Las semanas ya escritas se rehicieron con el mismo criterio (`scripts/backfill_tendencia_zonal.py`,
276 filas), así que la historia que P2 pudiera leer es consistente con la semana en curso.

Efecto en la semana en curso (28/09):

| | Antes | Después |
|---|---|---|
| Celdas con tendencia | 179 (37 alta · 38 baja · 104 estable) | 55 (13 alta · 13 baja · 29 estable) |
| De lotes (serie de 2 semanas) | 22 | 0 |
| Por tipo `casa` / `departamento` (serie de 2 semanas) | 87 | 0 |
| Con menos de 15 avisos en la punta actual | 34 (10 alta) | 0 |

Es lo que P1 anticipó: los lotes y las celdas por tipo recuperan la tendencia en la corrida
del lunes 05/10, cuando su serie llega a 3 semanas. Lo que queda hoy son celdas `todos` de
vivienda con 15 o más avisos y 4 semanas de serie. Entre las que pierden la tendencia están
Jáchal lote urbano (+74 %), Rivadavia sin dato de dormitorios (+12,3 % con 10) y Rawson 1
dormitorio (+3,3 % con 11).

Aceptación, los tres puntos del pedido:

| Criterio | Resultado |
|---|---|
| Ninguna celda con tendencia y muestra menor a 15 en alguna punta | 0 (se verificó la punta actual y la de referencia, en todas las semanas) |
| Ninguna celda con tendencia y `tendencia_semanas` < 3 | 0 |
| Rivadavia 2 dormitorios conserva `alta` | sí: +2,99 %, n 103, 4 semanas |
| Rawson 2, 3, 4+ y total conservan `baja` | sí: −5,49 / −8,79 / −5,31 / −5,11 %, n 59 / 89 / 44 / 203 |

Observación que ya estaba en la respuesta del 03/10 y sigue vigente: con el umbral en 2 %,
un movimiento del dólar oficial del 0,3 % entre corridas alcanza para cambiar de tendencia
una celda de lotes o de alquiler en pesos. Las dos condiciones nuevas no cubren ese caso; si
P1 lo quiere cubrir, es otro parámetro (por ejemplo, un umbral más alto en las celdas cuyo
valor de referencia viene convertido).

## Para P2 (copia)

- `gross_yield_estimado` y `relacion_renta_precio` vienen NULL en 135 ventas que sí tienen
  `renta_mensual_estimada`: es la regla de §1, no un dato faltante. La lectura de P1 en
  `PEDIDO_P1_A_P2_2026-09-29.md` (§3.2, rentabilidad promedio de la zona) no cambia.
- La lectura de la tendencia (`alta` → `up`, `baja` → `down`, `estable` → `flat`) no cambia.
  Esta semana va a llegar `trend = null` en todas las celdas por tipo y de lotes; desde el
  05/10 vuelven con `trend_weeks = 3`.
- Los `label` cambiaron; los `key` no. Si P2 los mapea por `key`, no hay nada que hacer.
