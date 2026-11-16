# Respuesta de P3 a P1 — Cards sin comparación de precio — 2026-10-03

**Para: los equipos de P1 y P2.** Responde a `PEDIDO_P1_A_P3_2026-10-03.md` (copia en
`docs/` de este repo). Autocontenido: los nombres de columnas y parámetros de acá son los
definitivos. Todas las cifras salen de la base local de P3 del 2026-10-04, antes y después de
la corrida de `indicators` que aplicó los cambios. El universo es el mismo del pedido:
vivienda activa de San Juan con `quality_tier >= 1` (1.750 casas y 708 departamentos en
venta; 187 casas y 345 departamentos en alquiler), salvo donde se dice otra cosa.

## Estado de la entrega

| Punto del pedido | Código y tests | En la base local | Publicado (Railway) |
|---|---|---|---|
| 1. Departamentos sin cubierta: la total como base | listo | aplicado | **no** |
| 2. Vivienda sin dormitorios: conjunto por banda sola | listo | aplicado | **no** |
| 3. Casas sin cubierta | **decidido (a) por German el 04/10**: sin comparación, nada que implementar | — | — |
| 4. Mínimo de 5 comparables, con ampliación de zona hasta 5 | listo | aplicado | **no** |

Aplicado en la base local el 2026-10-04 (migración 039 y corrida de `indicators` sobre 7.615
propiedades activas, sin errores). **No está publicado en Railway**: el sync lo decide
German y hasta entonces P2 sigue viendo lo del 01/10. Migración:
`shared/sql/039_cards_sin_comparacion.sql` (aditiva e idempotente; Railway la recibe con el
sync).

**Los tres criterios de aceptación del pedido se cumplen** (detalle en la sección
Aceptación). Hay una decisión de P3 que P1 no pidió y conviene que mire: los
departamentos medidos sobre la total **no entran al m² de la serie zonal** (sección
"Serie zonal"), porque incluirlos fabricaba tendencias.

## Nombres definitivos

### `master.properties`

| Columna | Tipo | Valores | Qué dice |
|---|---|---|---|
| `superficie_base_total` | boolean | `TRUE` · NULL | El aviso no publica cubierta y su m² (`precio_m2`), su banda de comparables y su entrada al conjunto de otros son sobre `superficie` (la total). Solo departamentos. |
| `pool_sin_dormitorios` | boolean | `TRUE` · NULL | El conjunto (`num_comparables`) se armó por banda de superficie ±30 % sola porque el aviso no publica dormitorios. Texto sugerido: "avisos similares en superficie". |

Nunca `FALSE`: NULL es "regla de siempre, o sin base / sin conjunto", igual que los flags
de ingesta del 13/09. Se recalculan en cada corrida de `indicators`, junto con el gap.

Parámetros (todos en `pipeline/config.py`, con variable de entorno):
`COMPARABLE_MIN` 5 (env `COMP_MIN`; era 3) · `SUPERFICIE_BASE_TOTAL_FALLBACK`
`ar:residenziale_compatto` · `POOL_SIN_DORMITORIOS` true · `ZONE_STATS_INCLUYE_BASE_TOTAL`
false.

## Lo que P2 tiene que tener en cuenta

1. **Su copia de la selección de comparables cambia otra vez.** Mínimo 5 (ampliación de
   zona y gap), base total en departamentos sin cubierta, conjunto por banda sola sin
   dormitorios. Está escrito para pegarle a un agente en
   `PROMPT_P2_COMPARABLES_2026-10-03.md`. Hasta que P2 lo aplique, `comparables_pool.count`
   no va a coincidir con `comparables_count` en los avisos marcados.
2. **Ya no hace falta filtrar `num_comparables >= 5` del lado de P2.** En lo que se
   publique no existe un aviso argentino activo con `gap_valuacion` y menos de 5. (Roma
   conserva 84 con gap sobre 3 o 4: es un mercado pausado que no se recalcula y German
   confirmó el 04/10 que no sigue.)
3. **Dos columnas nuevas** para exponer en el detalle y la card: `superficie_base_total` y
   `pool_sin_dormitorios`. P1 las pide en su pedido a P2 del 03/10.
4. **El `precio_m2` de un departamento con `superficie_base_total` es sobre la total.** Al
   lado de `zone_ref` (que sigue sobre cubierta) va a verse un poco más bajo de lo que
   sería sobre cubierta. Es la aproximación que P1 aceptó para el gap; en la card el texto
   lo puede decir.
5. **Cambian gaps y semáforos en lo publicado**, no solo en los avisos que ganan gap:
   257 viviendas visibles cambian de semáforo (detalle en Aceptación) y 1.176 avisos
   mueven el score 1 punto o más. Si P2 tiene capturas de referencia, van a diferir.
6. **`gross_yield_estimado` gana cobertura en departamentos** (346 → 459): los que ahora
   tienen base de superficie entran al pool de rentas con banda.

## Qué se hizo en cada punto y qué se interpretó

### 1. Departamentos sin superficie cubierta: la total como base

Cuando un departamento (categoría `residenziale_compatto`: `appartamento` y sus variantes
viejas) no publica cubierta mayor a 0 pero sí total mayor a 0, la total es su base: para
su propio `precio_m2`, para su banda de ±30 % y para entrar como candidato al conjunto de
otros (P1 lo prefería así; ver pregunta abierta 1). Las casas, los lotes y las
habitaciones no cambian: una casa sin cubierta sigue sin base, sin conjunto y sin gap.

Lo que se midió antes de decidir, sobre los 641 departamentos en venta que publican las dos
superficies:

| total ÷ cubierta | Valor |
|---|---|
| Mediana | 1,00 |
| Percentil 75 | 1,20 |
| Percentil 90 | 1,55 |
| Con total ≥ 1,3 × cubierta | 119 (19 %) |
| Con total menor que la cubierta (error de carga) | 14 |

En 4 de cada 5 departamentos la total está dentro de la banda de la cubierta: la
aproximación que P1 describe se sostiene, con una cola del 19 % donde la total es mucho más
grande (terrazas, cocheras sumadas, o el lote de un dúplex en consorcio). En las casas la
mediana es 2,66: por eso quedan afuera.

Efecto sobre los 177 departamentos en venta sin cubierta y con total (P1 contó 171 sobre
la base del 03/10):

| | Antes | Después |
|---|---|---|
| Con conjunto y gap | 0 | 165 (los 12 restantes no juntan 5 similares ni en la macro zona) |
| Con rentabilidad estimada | 0 | 107 |
| Gap mediana del grupo | — | +2,2 % (los que publican cubierta: +0,5 %) |
| Semáforo del grupo | — | 63 verde · 53 amarillo · 49 rojo (38 / 32 / 30 %; los de cubierta: 34 / 39 / 26 %) |
| Rentabilidad mediana | — | 7,36 % (los de cubierta: 7,00 %) |

El grupo queda un poco más barato por m² que el de cubierta, que es lo esperable si su
denominador es algo más grande; la diferencia es chica y no hay un sesgo sistemático a
verde.

Interpretación de la "columna booleana": `TRUE` o NULL, nunca `FALSE` (convención de los
flags del 13/09). Si P1 prefiere `FALSE` explícito en los que usan cubierta, es un cambio
de un renglón; avisen.

### 2. Vivienda sin dormitorios: conjunto por banda de superficie, sin tramo

Donde el conjunto exige dormitorios —venta de departamentos (mismo tramo) y alquiler de
vivienda (mismos dormitorios)— un aviso que no los publica arma su conjunto con la banda de
superficie ±30 % sola, de su categoría, con la ampliación de zona de siempre (en alquiler,
primero la banda en su zona si junta 5, como el conjunto mixto del 30/09). Entran
candidatos con cualquier cantidad de dormitorios, también sin dormitorios. La marca
`pool_sin_dormitorios = TRUE` se escribe cuando efectivamente hubo conjunto.

Dos asimetrías, a propósito:

- **el aviso sin dormitorios no entra al conjunto de uno que sí los publica.** "Sin dato"
  no es un tramo; meterlo en el conjunto de un 2 dormitorios reabriría la mezcla de
  productos que el 03/09 cerró;
- **el pool de rentas de una venta no se relaja.** Una venta sin dormitorios sigue sin renta
  estimada ni rentabilidad: ese pool se endureció el 29/09 justamente para no heredar
  rentas de otro producto.

Efecto: 31 departamentos en venta sin dormitorios (26 con cubierta, 5 con total) → 30 con
gap; 32 alquileres de vivienda sin dormitorios → 32 con gap. Sin dormitorios **y** sin
superficie no hay conjunto, como antes.

### 3. Casas sin superficie cubierta: decisión (a)

**German decidió (a) el 2026-10-04.** No hay comparación aproximada: una casa que no
publica cubierta queda sin base de m², sin conjunto, sin gap y sin percentil, y la card
sigue diciendo "Sin superficie cubierta: no se puede comparar el precio por m²". No se
agrega columna ni cambia nada en P2. Lo que sigue es el registro de lo que se midió para
decidirlo, sobre las 229 casas en venta sin cubierta (tier ≥ 1; P1 contó 225):

**Cobertura.** 225 publican dormitorios. Con el mínimo de 5 casas de los mismos
dormitorios: 206 lo juntan en su zona, 15 con las vecinas, 3 con la macro zona, 1 no lo
junta; 4 no tienen dormitorios. La opción (b) daría referencia a **224 de 229**.

**Calidad de esa referencia.** Se midió en las 1.485 casas en venta que publican cubierta,
tienen gap por m² y además juntan 5 por dormitorios en su zona, comparando lo que diría
cada regla sobre el mismo aviso:

| | Valor |
|---|---|
| Diferencia absoluta entre el gap por dormitorios y el gap por m² | mediana 23,5 puntos · p75 45,7 · p90 85,3 |
| Mismo signo (las dos dicen "más barato" o las dos "más caro") | 77 % |
| Mismo color de semáforo | 62 % |
| Verde por dormitorios que **no** es verde por m² | 156 (10,5 %) |
| Dispersión del precio dentro del pool por dormitorios (desvío absoluto mediano) | 33 % |

Es lo que P1 anticipó: en una casa el tamaño pesa más que los dormitorios. Una de cada
cuatro referencias por dormitorios se aleja más de 45 puntos de la de m², y una de cada
diez pintaría de verde algo que el m² no.

**Costo de implementar (b):** un modo nuevo de selección (dormitorios exactos sin banda,
solo para casas en venta sin base de superficie), una marca (`comparacion_aproximada` o
similar: el valor **no** iría en `gap_valuacion`, para que ningún lector lo confunda con el
gap de siempre), exclusión del percentil, del score y del verde, tests, contrato, el port
de P2 y el texto de P1. Del lado de P3, un día de trabajo; del lado de P2, el port y la
exposición.

**Por qué (a):** un número que discrepa del de m² en el 38 % de los casos donde se pueden
medir los dos no mejora la card; la frase "sin superficie cubierta: no se puede comparar el
precio por m²" es verdad y no induce. Si más adelante se quisiera (b), iría como campo
aparte y marcado, nunca dentro de `gap_valuacion`.

### 4. Ampliar la zona hasta juntar 5 y calcular el gap desde 5

`COMPARABLE_MIN` pasa de 3 a 5 y sigue decidiendo las dos cosas: con menos de 5 en la zona
se agregan las vecinas, con menos de 5 en zona + vecinas la macro zona, y con menos de 5
al final `gap_valuacion`, `percentil_precio`, `precio_estimado_m2` y la estimación del
alquiler quedan NULL (score con componente neutro). Vale para **todos** los pools: vivienda,
habitaciones y lotes. El umbral de 5 del conjunto de alquiler con banda ya existía.

Efecto en los que tenían gap sobre 3 o 4:

| | Tenían gap sobre 3-4 | Ampliaron y conservan gap | Quedan sin gap |
|---|---|---|---|
| Vivienda en venta (32 casas, 22 departamentos) | 54 | 49 | 5 (casas) |
| Vivienda en alquiler (11 casas, 3 departamentos) | 14 | 7 | 7 (6 casas, 1 departamento) |
| Lotes (145 venta, 9 alquiler) | 154 | 103 | 51 |

Los lotes no estaban en el pedido pero el mínimo es del contrato con P2, no de la
vertical: un gap de lote sobre 3 comparables tampoco llegaba a la card.

## Serie zonal: los departamentos con base total no aportan al m²

Esto no estaba en el pedido y es una decisión de P3 que P1 puede revertir con un
parámetro (`ZONE_STATS_INCLUYE_BASE_TOTAL`).

En la primera corrida los 177 departamentos entraron también al `precio_m2_mediana` de
`zone_stats`. La serie es de tiempo y su m² está definido sobre cubierta desde el primer
snapshot; cambiarle la composición de golpe compara la celda de esta semana (con ellos)
contra la de hace 4 (sin ellos) y eso fabrica tendencias. Medido:

| Celda | Antes | Con los departamentos de base total |
|---|---|---|
| Santa Lucía · venta · departamento · 2 dormitorios | 0,0 % (estable, n 17) | **+16,7 % (alta, n 27)** |
| Capital · venta · departamento · 1 dormitorio | −1,05 % (estable) | −2,22 % (baja) |
| Capital · venta · departamento · 2 dormitorios | 0,00 % (estable) | −2,12 % (baja) |
| Rivadavia · venta · departamento · todos | −0,13 % (estable) | −2,40 % (baja) |
| Rawson · venta · departamento · todos | +2,06 % (alta) | −0,32 % (estable) |

14 celdas cambiaban de tendencia en total, y la mitad eran venta de departamentos. "Una
tendencia que falta es mejor que una inventada" (respuesta de P1 del 30/09): los
departamentos con base total siguen contando en el stock y en el precio mediana de su
celda, y en el conjunto de comparables (que es lo que P1 pidió), pero no en el m² de la
serie. Con eso la serie quedó idéntica a la anterior: las únicas dos celdas que cambiaron
de tendencia en la corrida final lo hicieron por la cotización del día (1.545 → 1.540),
Albardón lote urbano (+1,81 → +2,03 %, estable → alta) y Capital alquiler 4+ (−2,03 →
−1,71 %, baja → estable).

Observación para P1, de paso: con el umbral en 2 %, un movimiento del dólar oficial del
0,3 % entre corridas alcanza para cambiar de tendencia una celda de lotes o de alquiler en
pesos. El pedido de P1 del 30/09 (muestra ≥ 15 y ≥ 3 semanas) no cubre ese caso.

## Aceptación

**Punto 1 — "los departamentos en venta con gap pasan de 489 a más de 620".** Pasan a
**681** (de 708: del 69 % al 96 %). Los 192 nuevos: 160 por la base total, 25 por el
conjunto sin dormitorios, 5 por las dos cosas, 2 porque candidatos nuevos completaron su
banda.

**Punto 1 — "la mediana del US$/m² de Capital por tramo no se mueve más de 3 %".**
Medido sobre el m² de los departamentos activos en venta de Capital (tier ≥ 1), que es lo
que ven los conjuntos; la serie zonal no se mueve por lo dicho arriba:

| Tramo | Antes (n) | Después (n) | Variación |
|---|---|---|---|
| 1 dormitorio | 1.236,8 (63) | 1.222,2 (93) | −1,2 % |
| 2 dormitorios | 1.200,0 (107) | 1.180,7 (135) | −1,6 % |
| 3 dormitorios | 887,9 (111) | 900,0 (145) | +1,4 % |
| 4 o más | 949,0 (19) | 949,0 (24) | 0,0 % |
| Sin dato | 1.385,7 (15) | 1.390,5 (20) | +0,3 % |

**Punto 4 — "ningún aviso activo con `gap_valuacion` y `num_comparables < 5`".** Cero en
San Juan, incluidos lotes. Los 68 de vivienda: 56 pasan a 5 o más, 12 a null.

**Lo que cambia en lo que P2 va a publicar** (vivienda tier ≥ 1, 3.001 avisos):

| Operación | Cambio de semáforo | Cuántos |
|---|---|---|
| Venta | amarillo → verde | 98 |
| Venta | amarillo → rojo | 68 |
| Venta | rojo → amarillo | 14 |
| Venta | verde → amarillo | 11 |
| Venta | verde → rojo | 1 |
| Alquiler | amarillo → verde | 23 |
| Alquiler | verde → amarillo | 17 |
| Alquiler | rojo → amarillo | 15 |
| Alquiler | amarillo → rojo | 10 |

257 en total. Casi todos son avisos que no tenían gap y ahora sí (eran amarillos por "sin
datos"). Entre los departamentos en venta que ya tenían gap, 395 lo mueven medio punto o
más (mediana 2,9 puntos) porque entraron candidatos nuevos a su banda, y 44 cambian de
color. En alquiler de departamentos se mueven 191 gaps (mediana 5,9 puntos; 41 cambian de
color): los que ahora tienen superficie pasan al conjunto con banda cuando lo juntan, y
entran como candidatos a las bandas de otros.

## Preguntas abiertas del pedido

**1. ¿El punto 1 cambia el gap de los departamentos que sí publican cubierta?** Sí, entran
al conjunto de otros con la total como base, como P1 prefería. Las medianas de Capital se
movieron como mucho 1,6 % (tabla de arriba) y en el resto del mercado nada supera el 3 %.
El costo concreto: 395 departamentos con cubierta mueven su gap (mediana 2,9 puntos) y 44
cambian de color.

**2. ¿Punto 3: (a) o (b)?** (a), decidido por German el 2026-10-04. El costo de (b) queda
en la sección 3 como registro.

## Pendiente del lado de P3

- **Publicar en Railway** (lo decide German; hasta entonces P2 ve lo del 01/10).
- **El pedido de P1 del 30/09 aprobado el 01/10** (`RESPUESTA_P1_A_P3_CARDS_2026-09-30.md`:
  muestra ≥ 15 y ≥ 3 semanas para la tendencia zonal, rentabilidad en NULL cuando el gap de
  una venta supera +35 %, tope de variación 40 % y los `label` en lenguaje de usuario) se
  implementó el mismo 04/10, después de esta respuesta: ver
  `RESPUESTA_P3_A_P1_CARDS_2026-10-04.md`. Va en el mismo sync.
