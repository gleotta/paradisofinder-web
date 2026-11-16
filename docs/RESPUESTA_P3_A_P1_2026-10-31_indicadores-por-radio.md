# Respuesta de P3 a P1 — Indicadores por radio (lo que rodea al aviso) — 2026-10-31

**Para: los equipos de P1 y P2.** Responde a `PEDIDO_P1_A_P3_2026-10-31_indicadores-por-radio.md`
(copia en `docs/` de este repo). Autocontenido: los nombres de columnas y parámetros de acá
son los definitivos. Todas las cifras salen de la base local de P3 del 2026-10-31, sobre el
estado que dejó la última corrida de `indicators` (26/10) más la corrida de radios. Universo:
avisos activos de San Juan (7.447).

## Estado de la entrega

| Punto del pedido | Código y tests | En la base local | Publicado (Railway) |
|---|---|---|---|
| 1. Migración 040 + cálculo como función pura + tests | listo (61 tests) | aplicado | **no** |
| 2. `docs/DATA_CONTRACT.md` regenerado (§9c y columnas) | listo | — | — |
| 3. Corrida completa + bloque "radios" en `reporte_corrida.py` | listo (sección 8) | corrido | **no** |
| 4. Esta respuesta, con la cobertura medida | — | — | — |
| **Agregado: valor representativo (`ref_*`)**, uno por aviso para mostrar | listo | aplicado | **no** |

**No está publicado en Railway**: el sync lo decide German, y hasta entonces P2 no ve las
columnas. Migración: `shared/sql/040_indicadores_por_radio.sql` (aditiva e idempotente;
Railway la recibe con el sync).

## Lo que tienen que mostrar: el valor representativo (`ref_*`)

Zona, radio 1 y radio 2 son **tres referencias por aviso**, y mostrar las tres en una card es
demasiado. **German decidió el 31/10 que P3 elija una** y que P2 y P1 muestren esa. P2 la
devuelve en la Card como **`price_ref`**, y **`price_ref` reemplaza a `zone_ref` como
referencia de precio**: la card muestra un solo número, el de `price_ref`, diciendo de dónde
sale. Puede venir de un radio o de la zona; para P1 da igual. La mediana de `zone_ref` no se
muestra más, tampoco como respaldo cuando `price_ref` falta: sin `price_ref`, la card no
muestra referencia de precio. **Es lo único que cambia**: la tendencia de la zona, la rentabilidad
de la zona y todo lo demás que hoy sale de `zone_ref` se sigue mostrando igual.

Cómo se eligió la regla: los radios no incluyen al propio aviso, así que se puede medir, para
cada aviso, qué referencia queda más cerca de su precio. Desvío mediano entre el precio del
aviso y cada referencia, sobre los mismos avisos (menos es mejor):

| Vertical | Zona | R2 | R1 | Gana |
|---|---|---|---|---|
| Venta de vivienda (m²) | 29,5 % | 30,1 % | **27,6 %** | R1 |
| Alquiler, R1 en su propio bucket | 20,0 % | 20,0 % | **18,8 %** | R1 |
| Alquiler, R1 caído a `todos` | **25,0 %** | 27,3 % | 39,6 % | zona |
| Lotes urbanos (m²) | 54,8 % | 43,8 % | **28,7 %** | R1 |

La zona incluye al propio aviso en su mediana, lo que la favorece; aun así pierde. En venta,
cuando falta R1, el R2 tampoco le gana a la zona (37,4 % contra 36,6 %), y en el alquiler sin
dormitorios R1 y zona empatan (42,6 % y 41,2 %).

**La regla** (`RADIO_SAN_JUAN_REFERENCIA`, el primer nivel con valor):

| Vertical | Cascada | Valor (`ref_unidad`) |
|---|---|---|
| Venta de vivienda | R1 → zona | USD/m² (`m2`) |
| Alquiler de vivienda | R1 **solo si usó el bucket propio** → zona | renta mensual en USD (`mes`) |
| Lote urbano | R1 → R2 → zona | USD/m² (`m2`) |
| Lote rural | zona | USD/ha (`ha`) |

"Zona" es la misma celda del `zone_ref` de P2 o, si la zona no llega a la muestra, su fallback.
En ese caso `ref_nivel` dice `macro_zona` o `provincia` y `ref_lugar` trae el nombre.

| Columna | Tipo | Qué guarda |
|---|---|---|
| `ref_nivel` | varchar(12) | `r1` · `r2` · `zona` · `macro_zona` · `provincia` · NULL (sin referencia) |
| `ref_valor` | numeric(14,2) | el valor a mostrar, en la moneda de cálculo (USD en AR) |
| `ref_unidad` | varchar(4) | `m2` · `mes` · `ha` |
| `ref_n` | integer | avisos que lo respaldan |
| `ref_bucket` | varchar(20) | el bucket de la celda: propio o `todos`; en lotes, su clase |
| `ref_lugar` | varchar(50) | nombre de la zona, macro zona o provincia; NULL en `r1` / `r2` (el radio está en `radio1_km` / `radio2_km`) |

Lo que tiene que hacer P2 para exponerlo está en `PROMPT_P2_RADIOS_2026-10-31.md`.

Texto sugerido según `ref_nivel`: `r1` "a menos de 1 km", `r2` "a menos de 3 km" (o 5, según
`radio2_km`), `zona` / `macro_zona` / `provincia` "en {ref_lugar}". Con `ref_bucket = 'todos'`
la comparación es contra todos los tamaños del tipo, no contra los del mismo tamaño.

**A diferencia de las columnas de radio, `ref_*` existe también sin coordenadas**: sale de la
zona. Distribución en la corrida del 31/10: R1 3.159, zona 2.985, R2 532 (todos lotes urbanos),
macro zona 422, provincia 85; sin referencia 264 (238 fuera de serie y 26 sin muestra en
ningún nivel).

Sobre todos los avisos, mostrar `ref_valor` en lugar de la zona sola (§8d de
`reporte_corrida.py`, que lo vuelve a medir en cada corrida):

| Vertical | Desvío con `ref_valor` | Con la zona sola |
|---|---|---|
| Venta de vivienda | **29,9 %** | 31,0 % |
| Alquiler de vivienda | 25,0 % | 25,0 % |
| Lote urbano | **41,5 %** | 63,5 % |
| Lote rural | 139,3 % | 139,3 % |

En vivienda la mejora es chica, porque ninguna referencia acierta el precio de un aviso puntual
mejor que un 25-30 %: dentro de cada celda los precios varían mucho. **En lotes urbanos la
mejora es grande.** **En lotes rurales ninguna referencia sirve**: la hectárea mediana de la
zona se aparta 139 % del precio típico de un lote rural. P1 debería decidir si la muestra.

## Un cambio de forma respecto del pedido: script aparte, por provincia

El pedido decía calcular los radios dentro del step `indicators`, en el mismo `UPDATE` y con
`indicators_computed_at`. **German decidió otra cosa el 31/10**: los radios son un **script
aparte**, que se corre **después** de `indicators`, y es **solo de la provincia de San Juan**.
Cuando se sume otra provincia, **tendrá su propio script de radios**.

| | Qué es |
|---|---|
| `scripts/indicadores_radio_san_juan.py` | El script de San Juan. Lo único que se corre. |
| `pipeline/indicadores_radio.py` | La cuenta, común y sin ninguna provincia adentro (`ParametrosRadio`). |
| `pipeline/config.py`, bloque "INDICADORES POR RADIO" | Las reglas comunes y, aparte, el bloque de San Juan. Una provincia nueva suma su bloque y su script. |

Secuencia: `main.py indicators` → `scripts/indicadores_radio_san_juan.py` → `main.py embeddings`.

Qué implica para P2:

- La marca de tiempo de los radios es **`radio_computed_at`**, no `indicators_computed_at`.
  Si `radio_computed_at` es anterior a `indicators_computed_at`, el script no se corrió
  después de la última corrida de `indicators`.
- El script **no toca `updated_at`** (si lo moviera, regeneraría los embeddings de todas las
  activas) ni nada de lo que escribe `indicators`.
- En los mercados que no tienen script (hoy Roma), todas las columnas quedan NULL, también
  `radio_estado`.

## Nombres definitivos (`master.properties`)

Son las 26 del pedido, más tres: `r1_n_muestra_renta` / `r2_n_muestra_renta` y
`radio_computed_at`. Con las seis de `ref_*` (arriba), la migración agrega 35 columnas.

| Columna | Tipo | Qué guarda |
|---|---|---|
| `radio_estado` | varchar(20) | `calculado` · `sin_coordenadas` · `ubicacion_baja` · `fuera_de_serie` |
| `radio_clase` | varchar(10) | `urbana` · `rural` (de `zones.macro_zona`) |
| `radio1_km` / `radio2_km` | numeric(4,1) | 1,0 / 3,0 o 5,0 |
| `r1_bucket` / `r2_bucket` | varchar(20) | bucket usado: el propio o `todos` (lotes: siempre el propio) |
| `r1_n_vecinos` / `r2_n_vecinos` | integer | oferta alrededor: activos del mismo tipo y operación en el radio, cualquier bucket, con o sin precio |
| `r1_n_muestra` / `r2_n_muestra` | integer | con precio, en el bucket usado |
| `r1_n_muestra_m2` / `r2_n_muestra_m2` | integer | con precio y superficie, en el bucket usado |
| `r1_precio_mediana` / `r2_precio_mediana` | numeric(12,2) | USD; en alquiler, la renta mensual mediana |
| `r1_precio_m2_mediana` / `r2_precio_m2_mediana` | numeric(12,2) | USD/m² |
| `r1_precio_m2_p25` / `r2_precio_m2_p25` | numeric(12,2) | USD/m² |
| `r1_precio_m2_p75` / `r2_precio_m2_p75` | numeric(12,2) | USD/m² |
| `r1_precio_ha_mediana` / `r2_precio_ha_mediana` | numeric(14,2) | solo lotes rurales |
| **`r1_n_muestra_renta` / `r2_n_muestra_renta`** | integer | **nuevo**: alquileres con precio de la misma celda en el radio (solo venta de vivienda). Sin él no se distingue "no hay alquileres" de "hay 9". |
| `r1_renta_mensual_mediana` / `r2_renta_mensual_mediana` | numeric(10,2) | solo venta de vivienda; USD, igual que `renta_mensual_estimada` |
| `r1_gross_yield` / `r2_gross_yield` | numeric(5,2) | solo venta de vivienda, en % |
| **`radio_computed_at`** | timestamptz | **nuevo**: cuándo escribió el script |

Parámetros (`pipeline/config.py`, todos con variable de entorno):

- Comunes: `RADIO_MIN_MUESTRA` 10 (default `ZONE_STATS_MIN_MUESTRA`) y
  `RADIO_CONFIANZA_ADMITIDA` `alta,media`.
- San Juan: `RADIO_SAN_JUAN_R1_KM` 1, `RADIO_SAN_JUAN_R2_KM_URBANA` 3,
  `RADIO_SAN_JUAN_R2_KM_RURAL` 5, `RADIO_SAN_JUAN_MACRO_URBANA` `gran_san_juan` y
  `RADIO_SAN_JUAN_REFERENCIA` (la cascada del valor representativo, sin variable de entorno).

Los nombres llevan la provincia (`RADIO_SAN_JUAN_*` en lugar de `RADIO1_KM`, …) porque cada
provincia tiene sus radios.

## Cómo se leyeron las reglas (y dónde hubo que decidir)

1. **Centro.** Tal cual el pedido. Orden de `radio_estado`: lo que el aviso *es* antes que
   dónde está. Un local sin coordenadas es `fuera_de_serie`, no `sin_coordenadas`. Un aviso
   con coordenadas pero sin confianza cuenta como `ubicacion_baja`.
2. **Vecinos.** Solo `alta` y `media`, nunca el propio aviso. El pool nunca cruza mercado ni
   moneda.
3. **Bucket propio o `todos`.** "No llega al mínimo" se mide sobre el **valor de referencia**
   de la celda, el mismo que usan la tendencia zonal de P3 y el `zone_ref` de P2: la renta en
   alquiler, la hectárea en lotes rurales y el m² en el resto. Una venta con 10 precios pero
   9 m² en su bucket pasa a `todos`. Con `todos`, toda la celda sale de `todos` (precio, m² y
   rentas), nunca mezclada.
4. **Lotes.** No tienen `todos` (en `zone_stats` tampoco lo tienen), así que un lote rural sin
   muestra queda NULL. Su "tipo" es la clase: los lotes urbanos y los rurales no se juntan ni
   en la muestra ni en `n_vecinos` (un rural jamás junto a un urbano). Rural con servicios y
   rural sin servicios son buckets distintos del mismo tipo: la muestra se parte, la oferta
   alrededor no.
5. **Mismas bases.** La cuenta es la de `calcular_zone_stats` + `aplicar_minimo_muestra`; un
   test de paridad lo verifica sobre el mismo conjunto. La cotización es la que usó la última
   corrida de `indicators` (la última guardada en `exchange_rates`); el script no consulta la
   API.
6. **`is_shared_or_partial`: una diferencia con la serie zonal.** El pedido lo lista entre
   "los avisos que no aportan a la serie zonal", pero **hoy sí aportan a `zone_stats`**: la
   serie no los filtra. En los radios se excluyen, como pide el pedido: el precio de una parte
   indivisa o de un boleto no es el de un inmueble entero. Son 17 avisos con coordenadas
   buenas, así que la diferencia de base es chica. Si P1 prefiere que la serie zonal también
   los saque, es un pedido aparte: cambia `zone_stats` y sus tendencias.
7. **Rentabilidad del radio, con las guardas del cap zonal.** `rK_gross_yield` queda NULL si
   la superficie mediana de los alquileres y la de las ventas difieren más de 30 %
   (`CAP_ZONAL_SUPERFICIE_BANDA`, la guarda del cap zonal) o si pasa de 100 %. La renta se
   guarda igual. Sin la guarda de superficie, en el radio 2 pasaban 615 rentabilidades más,
   con mediana de 10,7 % (contra 7,8 % de las que quedan) y casas de 4+ dormitorios de
   Rivadavia a 24,3 %: es el mismo caso que en 2026-08 llevó a poner esa guarda en el cap
   zonal.

## Aceptación

| Qué | Esperado | Medido el 31/10 | |
|---|---|---|---|
| `radio_estado = 'calculado'` | ~5.200 | **5.043**. Los 5.198 con coordenadas buenas menos 155 fuera de serie (lotes sin clase, no residenciales, parte indivisa, temporarios, habitaciones). Resto: 2.161 `sin_coordenadas`, 5 `ubicacion_baja`, 238 `fuera_de_serie` en total. | ✓ |
| Radio 1 con `r1_n_muestra >= 10` | ≥ 90 % Capital, ≥ 80 % Rivadavia, Rawson y Pocito por debajo | Capital **96,4 %**, Rivadavia **88,1 %**, Rawson 55,5 %, Pocito 37,9 % | ✓ |
| Radio 2 con `r2_n_muestra >= 10` en el Gran San Juan | ≥ 95 % en las seis | Capital 99,3 · Rivadavia 97,6 · Santa Lucía 95,7 · **Rawson 91,0 · Chimbas 87,8 · Pocito 85,1** | ✗ en tres; ver abajo |
| Radio 2 en rurales (5 km) | Albardón, Zonda, Caucete, Ullum, 9 de Julio entre 70 y 95 % | Albardón 78,5 · Zonda 88,0 · Caucete 75,5 · 9 de Julio 74,3 · **Ullum 58,7** | ✗ en Ullum |
| Calingasta, Iglesia, Jáchal, Valle Fértil | mayormente NULL | Iglesia y Jáchal 0 %; Calingasta 48,9 % y Valle Fértil 35,3 % (casi todo lotes urbanos agrupados) | ✓ |
| Ningún vecino `baja` en ningún pool | 0 | **0**. Control independiente en SQL sobre los 1.266 departamentos calculados: `r1_n_vecinos` coincide en todos, y había 118 casos de vecino `baja` a menos de 1 km, ninguno contado. | ✓ |
| Idempotencia | dos corridas iguales | Huella md5 de las 28 columnas de valores idéntica entre dos corridas seguidas (solo cambia `radio_computed_at`) | ✓ |
| Tiempo | ≤ 1 min sumado a `indicators` | **0 s sumados a `indicators`**: es otro script. El script entero tarda 8-12 s (3,5 s de cálculo, el resto la escritura). | ✓ |
| Lo demás no cambia | ni un decimal | Huella md5 de `master.properties` (precio_m2, gap, percentil, comparables, renta y rentabilidad estimadas, scores, componentes, semáforos, tendencia, `indicators_computed_at`, `updated_at`, `embedding_generated_at`) y de `zone_stats`: **idéntica antes y después** | ✓ |

### Por qué Rawson, Chimbas y Pocito no llegan al 95 % en el radio 2

Los números de P1 (Rawson 97 %, Pocito 94 %, Chimbas 96 %) eran **vecinos del mismo tipo**,
es decir `r2_n_vecinos`. La aceptación pide **muestra en el bucket usado**. La diferencia la
hacen dos grupos:

| Zona | Vivienda | Lotes urbanos | Lotes rurales | Alquiler de lotes |
|---|---|---|---|---|
| Rawson | 93,3 % | 98,6 % | 0 % (36 avisos) | 4 avisos |
| Chimbas | 97,2 % | 94,3 % | 5,6 % (18) | 5 |
| Pocito | **81,0 %** | 98,2 % | 0 % (36) | 3 |
| Todo el Gran San Juan | 98,1 % venta · 96,4 % alquiler | 99,5 % (venta) | 0,8 % (1 de 118) | 22 |

- **Lotes rurales en zonas urbanas**: les toca el radio 2 de 3 km porque su zona es urbana, y
  en 3 km casi nunca hay 10 lotes rurales del mismo bucket. Tampoco llegan a 5 km en las
  zonas rurales (2 % en la periferia): el lote rural está demasiado disperso para un radio, y
  para él sigue valiendo la zona. Si P1 quiere probar con el radio 2 por clase de lote (5 km
  para todo lote rural, esté donde esté), es un cambio chico, pero va contra "urbana / rural
  sale de lo que ya existe" del pedido. Lo dejamos como pregunta.
- **Pocito, vivienda**: es una zona extensa y una parte de sus avisos queda en los bordes, a
  más de 3 km del resto. No es un problema de datos.
- **Alquiler de lotes**: son pocos y no llegan a 10 en ningún radio.

Ullum (58,7 %) está por debajo por la misma dispersión: 46 avisos calculados, 28 de ellos lotes.

## Qué dicen los números

- **El radio 1 dice algo distinto de la zona donde hay densidad**, que era el objetivo. En
  departamentos de 2 dormitorios en venta en Capital, la zona da US$ 1.222/m²; el radio 1 va
  de 1.193 (p10) a 2.941 (p90) según el aviso. La cola alta es real: el complejo Catamarán
  (torres 9, 10 y 12, Av. Córdoba y Paula Albarracín), departamentos nuevos a US$
  2.500-4.000/m², que levantan el barrio y que la mediana de Capital no ve.
- **El radio 2 queda cerca de la zona** (en esa misma celda, mediana 1.229), como se esperaba
  de "lo que rodea al barrio sin llegar a la ciudad".
- **Bucket.** En el radio 1, 3.344 avisos usan su propio bucket y 1.699 caen a `todos`; en el
  radio 2 caen a `todos` solo 455.
- **Rentabilidad del entorno** (2.193 ventas de vivienda calculadas): radio 1, renta en 749 y
  rentabilidad en 368 (mediana 6,6 %); radio 2, renta en 1.643 y rentabilidad en 1.028
  (mediana 7,8 %, p90 10,3 %).

## Fuera de alcance (como pidió P1)

No se tocaron el pool de comparables, el gap ni `zone_stats`; no hay serie ni tendencia por
radio, ni exposición en P2.

## Preguntas abiertas para P1

1. **Lotes rurales, valor representativo**: ¿se muestra la hectárea de la zona, sabiendo que
   se aparta 139 % del precio típico de un lote rural?
2. **Lotes rurales, radios**: ¿se quedan con la zona (hoy casi siempre NULL en el radio 2) o se
   prueba el radio 2 por clase de lote?
3. **`is_shared_or_partial`**: ¿la serie zonal también tiene que excluirlos? Hoy los incluye.
