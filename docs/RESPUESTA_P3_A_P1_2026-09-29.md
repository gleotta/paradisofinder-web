# Respuesta de P3 a P1 — Cards por vertical — 2026-09-29

> Recibido en P1 el 30/09/2026. Respuesta de P1 a las preguntas abiertas del
> final: `docs/RESPUESTA_P1_A_P3_2026-09-30.md`.

**Para: los equipos de P1 y P2.** Responde a `PEDIDO_P1_A_P3_2026-09-29.md` (copia en
`docs/` de este repo). Autocontenido: los nombres de columnas de acá son los definitivos.

## Estado de la entrega

| Punto del pedido | Código y tests | En la base local | Publicado (Railway) |
|---|---|---|---|
| §4.1 Tendencia de precio del aviso, en dólares | listo | aplicado | publicado |
| §4.2 `tipo` en el grano de `zone_stats` | listo | aplicado | publicado |
| §4.2 Tendencia zonal persistida | listo | aplicado (todas las semanas) | publicado |
| §4.3 Pool de rentas con banda de superficie | listo | aplicado | publicado |
| §4.4 Verde de venta desde +10 % | listo | aplicado | publicado |
| §4.5 Textos en lenguaje de usuario | listo | aplicado | publicado |

Aplicado en la base local el 2026-09-29 (migración 038 y corrida de `indicators` sobre 7.615
propiedades activas, sin errores) y **publicado en Railway el 2026-09-30 a las 02:40**, después
de regenerar los embeddings. La verificación posterior dio espejo exacto: 198 columnas, 13
conteos y las huellas de todas las tablas. La versión anterior quedó respaldada.

**Dos criterios de aceptación del pedido no se cumplen** (§4.3, y el de las 191 bajas de
§4.1). El detalle y las cifras están en la sección Aceptación, al final.

Migración: `shared/sql/038_cards_por_vertical.sql` (aditiva e idempotente). Railway la recibe
con el sync, no se migra a mano.

## Nombres definitivos

### `master.properties`

| Columna | Tipo | Valores |
|---|---|---|
| `tendencia_precio` | varchar(4) | `alta` · `baja` · NULL |
| `precio_anterior` | numeric(12,2) | nominal, en la `moneda` del aviso |
| `precio_anterior_usd` | numeric(12,2) | USD al cambio oficial del día en que se observó |
| `variacion_precio_usd_pct` | numeric(6,2) | con signo; negativa = bajó |
| `fecha_cambio_precio` | date | fecha del snapshot comparado |

### `master.zone_stats`

| Columna | Tipo | Valores |
|---|---|---|
| `tipo` | varchar(12) | `casa` · `departamento` · `todos` · NULL en lotes. **Parte del grano.** |
| `tendencia` | varchar(8) | `alta` · `baja` · `estable` · NULL |
| `tendencia_pct` | numeric(6,2) | con signo |
| `tendencia_semanas` | smallint | semanas entre las dos puntas comparadas |

Parámetros (todos en `pipeline/config.py`, con variable de entorno del mismo nombre):
`TENDENCIA_CORRIDAS` 3 · `TENDENCIA_UMBRAL_PCT` 3.0 · `TENDENCIA_VARIACION_MAX_PCT` 90.0 ·
`TENDENCIA_ZONA_SEMANAS` 4 · `TENDENCIA_ZONA_UMBRAL_PCT` 2.0 · `TENDENCIA_ZONA_N_MIN_RURAL` 15 ·
`TENDENCIA_ZONA_DESDE` `lote:2026-09-14` · `RENTA_POOL_BANDA_MARKETS` `ar` · `RENTA_POOL_MIN` 5 ·
`SEMAFORO_VENDITA_VERDE_GAP` 10.0.

## Lo que P2 tiene que tener en cuenta

1. **`zone_stats` tiene una columna más en el grano.** Para leer la serie de siempre hay que
   pedir `tipo = 'todos'`; los buckets de lote llevan `tipo IS NULL`. Lo que P2 lee hoy
   (`dormitorios_bucket LIKE 'lote%'`) no cambia: sigue habiendo una fila por celda de lote.
   Una consulta de vivienda sin filtro de `tipo` trae tres filas por bucket.
2. **La señal es `tendencia_precio`, no `precio_anterior`.** Hay `precio_anterior` cada vez
   que el vendedor cambió el precio dentro de la ventana, aunque el cambio sea chico. Mostrar
   "bajó" o "subió" por la sola presencia de `precio_anterior` marcaría cambios que en dólares
   no son tendencia. La garantía inversa sí vale y está en un CHECK de la tabla: con
   `tendencia_precio` hay siempre `precio_anterior`, `precio_anterior_usd`,
   `variacion_precio_usd_pct` y `fecha_cambio_precio`.
3. **El precio de hoy en dólares** contra el que se calcula la variación es `precio_usd` en los
   avisos publicados en pesos y `precio` en los publicados en dólares.
4. **`gross_yield_estimado` va a tener menos cobertura.** Es el efecto buscado: sin 5
   alquileres comparables de la misma zona queda NULL en vez de un número inflado.
5. **Hay más verdes en venta** (umbral de +15 % a +10 %).
6. **Los textos de los motivos cambiaron; los códigos no.**

## Qué se hizo en cada punto y qué se interpretó

### §4.1 Tendencia de precio del aviso

Se implementó el algoritmo del pedido. Cuatro interpretaciones, todas a revisar si no son las
que P1 quería:

- **Ventana de N corridas.** Un snapshot guarda el precio viejo con la fecha en que se lo vio
  por última vez, que es la de la corrida anterior a la que detectó el cambio. "Cambió dentro
  de las últimas 3 corridas" se lee entonces como `observed_at` ≥ inicio de la corrida que está
  3 antes de la última. Es el mismo criterio con que se cuentan las bajas de precio zonales.
- **Los cuatro datos existen aunque no haya etiqueta.** `precio_anterior` y compañía se llenan
  siempre que hay un precio anterior comparable; `tendencia_precio` solo cuando la variación en
  dólares llega al 3 %.
- **El sentido lo pone el vendedor.** Si el precio publicado subió y en dólares quedó más
  bajo, la variación se guarda con su signo pero la etiqueta queda NULL. El motivo: solo hay
  snapshot cuando el vendedor toca el precio, así que sin esta regla un alquiler que subió 2 %
  en pesos saldría marcado `baja` y el vecino que no lo tocó —y en dólares bajó más— no
  saldría. Esto es un agregado al algoritmo del pedido; se puede sacar sin tocar el resto.
- **Variación mayor al 90 %** se trata como precio mal tipeado que se corrigió (US$ 8.000 →
  80.000): los cinco campos quedan NULL. Es también lo que evita que un valor no entre en
  `numeric(6,2)`.

Además: si no hay cotización guardada con fecha anterior o igual a la del snapshot, un aviso en
pesos queda sin tendencia — no se usa la cotización de otro día. La tendencia existe solo en
mercados que calculan en dólares (hoy Argentina).

`_fetch_tendencia_precios` se eliminó. El motivo `precio_bajando`, el motivo `precio_subiendo`
y la frase "el precio viene bajando" del contexto de mercado salen ahora de esta tendencia: un
cambio de precio menor al 3 % en dólares ya no los dispara.

### §4.2 Tipo en el grano

`tipo` sale de la categoría con que se arman los comparables: `casa` = casas (y villas,
áticos y penthouses, que en San Juan casi no aparecen), `departamento` = departamentos. La
serie `todos` recibe exactamente los mismos avisos que antes. La serie por tipo cuenta solo
vivienda en renta mensual: las habitaciones, los no residenciales y los alquileres temporarios
no aportan a `casa` ni a `departamento`. El fallback por muestra chica y el `cap_zonal` se
resuelven dentro del mismo tipo.

Las semanas anteriores solo tienen `todos`. No se recomputa el pasado.

### §4.2 Tendencia zonal

Compara lo que la celda publica contra la misma celda 4 semanas atrás. Si la serie es más
corta —o esa semana no tiene muestra— usa la semana más vieja que haya dentro de la ventana y
lo dice en `tendencia_semanas`. Las dos puntas necesitan la muestra mínima (10; 15 en lotes
rurales). Los lotes no usan semanas anteriores al 14/09.

Las celdas por tipo van a tener tendencia a partir de su segunda semana, primero con
`tendencia_semanas` = 1.

Para las semanas ya escritas hay un script que completa las tres columnas con la misma función
(`scripts/backfill_tendencia_zonal.py`, sin argumentos solo muestra). No recalcula medianas.

### §4.3 Pool de rentas

En Argentina la renta de una venta se estima con alquileres de la misma zona, la misma
categoría (casa o departamento), los mismos dormitorios y superficie cubierta dentro del ±30 %
de la del aviso. Mínimo 5. El pool no sale de la zona. Una venta sin superficie cubierta o sin
dormitorios no tiene renta estimada.

No se agregó ningún tope a la rentabilidad: el segundo criterio de aceptación (ninguna mayor
al 15 % sin que el m² esté bajo el p10 de su pool) se mide y se informa, no se fuerza.

El gap de un aviso de ALQUILER no cambia: sigue comparándose por dormitorios.

### §4.4 Verde de venta

`SEMAFORO_VENDITA_VERDE_GAP` = 10. Los semáforos de inversión tienen umbrales propios
(`INV_VENTA_GAP_FUERTE` 15, `INV_VENTA_GAP_VERDE_SIN_ZONA` 20) que el pedido no menciona y no
se tocaron.

### §4.5 Textos

Texto vigente de cada motivo (los números son de ejemplo):

| Código | Antes | Ahora |
|---|---|---|
| `sobreprecio` | Precio 12% por encima de la estimación de zona | Precio 12 % más alto que avisos similares de la zona |
| `subvaluado` | Precio 12% por debajo de la estimación de zona | Precio 12 % más bajo que avisos similares de la zona |
| `comparables` | Estimación sólida (8 comparables) | Comparado con 8 avisos similares |
| `pocos_comparables` | Precio atractivo pero estimación débil (8 comparables) | Precio atractivo, pero hay pocos avisos similares para comparar (8) |
| `zona_caliente` | Zona caliente: precios subiendo y oferta bajando | Zona en alza: los precios suben y quedan menos avisos |
| `zona_fria` | Zona fría: precios bajando y oferta acumulándose | Zona en baja: los precios bajan y se acumulan avisos |
| `sin_serie_zona` | Todavía sin historia de la zona para medir temperatura | Todavía no hay historia de la zona para saber si los precios suben o bajan |
| `barata_zona_fria` | Barata, pero la zona está en caída — posible trampa de valor | Barata, pero los precios de la zona vienen bajando |
| `caro_zona_fria` | Cara en una zona en caída | Cara para una zona donde los precios vienen bajando |
| `caro_zona_caliente` | La zona sube pero este precio ya lo descuenta | La zona viene subiendo, pero este precio ya es alto |
| `zona_caliente_precio_normal` | Zona caliente, precio en línea | Zona en alza, precio en línea con la zona |
| `cap_alto` | Rentabilidad de zona alta (cap 7.8%) | Rentabilidad promedio de la zona 7,8 % — alta |
| `cap_medio` | Rentabilidad de zona media (cap 7.8%) | Rentabilidad promedio de la zona 7,8 % — media |
| `cap_bajo` | Rentabilidad de zona baja (cap 7.8%) | Rentabilidad promedio de la zona 7,8 % — baja |
| `cap_bajando` | La rentabilidad de la zona se está comprimiendo | La rentabilidad de la zona viene bajando |
| `cap_subiendo` | La rentabilidad de la zona está subiendo | La rentabilidad de la zona viene subiendo |
| `sin_cap` | Sin datos de rentabilidad para la zona | Sin datos de rentabilidad de la zona |

Sin cambios: `actualizacion_vieja`, `vigente`, `sin_datos`, `precio_normal`, `precio_bajando`,
`precio_subiendo`.

"Zona caliente" y "zona fría" no estaban en la lista del pedido. Se cambiaron igual porque
"caliente" aplicado a un barrio se lee también como zona peligrosa. Si P1 prefiere los
términos anteriores, es un cambio de dos líneas.

`score_componentes[].description`:

| Componente | Antes | Ahora |
|---|---|---|
| Precio | Precio 20% por debajo de la estimación — fuerte subvaluación | Precio 20 % más bajo que avisos similares — muy por debajo de la zona |
| Precio, sin datos | Datos insuficientes para estimar el gap de valuación | Sin datos suficientes para comparar el precio con avisos similares |
| Rentabilidad | Rendimiento bruto estimado 7.8% — sobre la media del mercado | Rentabilidad anual estimada 7,8 % |
| Rentabilidad, sin datos | Rendimiento no estimable (pocos datos de alquiler) | Rentabilidad no estimable (pocos alquileres similares en la zona) |
| Posición | Percentil 28 — debajo de la mediana de la zona | Más barato que el 72 % de los avisos similares |
| Posición, en el medio | Percentil 50 — en la mediana de la zona | Precio en el medio de los avisos similares |
| Posición, caro | Percentil 80 — entre los más caros de la zona | Entre los más caros: más caro que el 80 % de los avisos similares |
| Tiempo (venta) | 150 días — fuerte margen de negociación | 150 días publicado — mucho margen para negociar |

Un cambio que no es solo de palabras: la rentabilidad del aviso se calificaba "sobre la media"
desde 6 %, que es el corte de Roma. En San Juan la mediana es 7,8 %, así que un 6,5 % salía
como alto. Ahora se califica con los tercios de la rampa de cada mercado (Argentina: baja
hasta 6,7 %, alta desde 9,3 %).

No se tocaron: los `label` de `score_componentes` ("Subvaluación", "Rendimiento bruto",
"Posición de precio", "Tiempo en el mercado"), que el pedido no menciona y también son
visibles; las frases de `contexto_mercado`, que entran al embedding; y los textos en italiano
(mercado pausado; las descripciones de los componentes son del spec).

## Aceptación

Medida sobre la base local del 2026-09-29 (última bajada: 27/09), vivienda activa de San Juan.

### §4.1 Tendencia de precio

| Criterio | Resultado |
|---|---|
| Consulta de control (tendencia sin precio anterior en USD o sin fecha) | 0 — cumple |
| `precio_anterior` siempre en la moneda del aviso | 0 casos en otra moneda — cumple |
| Ningún alquiler en pesos marcado `alta` por una suba menor a la del dólar | 0 casos — cumple |
| Las bajas en USD de venta siguen marcadas `baja` | **no se cumple tal como está escrito** |

Sobre el último: con el método anterior (cualquier cambio, sin ventana) hoy hay 232 bajas de
venta en USD. Con el algoritmo del pedido quedan marcadas **144**. De las 88 restantes, 76
tienen el precio anterior visto antes del 01/09 —fuera de las últimas 3 corridas— y 12 bajaron
menos de 3 %. El criterio y el algoritmo del mismo pedido no pueden cumplirse a la vez: con la
ventana en 3 corridas las bajas viejas salen. Hay 7 corridas en total; con `TENDENCIA_CORRIDAS`
= 6 entra toda la historia.

Cómo quedó la tendencia:

| Operación | Moneda | `baja` | `alta` | Con precio anterior y sin etiqueta |
|---|---|---|---|---|
| Venta | USD | 144 | 73 | 24 |
| Venta | ARS | 6 | 3 | 12 |
| Alquiler | ARS | 111 | 38 | 11 |
| Alquiler | USD | 2 | 3 | 0 |

**El supuesto sobre las subas en pesos no se verifica con el dólar oficial.** El pedido dice
que las subas de alquiler en pesos casi desaparecen medidas en dólares. En la ventana medida
el dólar oficial guardado pasó de 1.535 a 1.545 (+0,65 %), así que una suba de 9 % en pesos
sigue siendo de 8 % en dólares: los alquileres en pesos que subieron tienen variación mediana
de +9,09 % nominal y +8,03 % en USD, y 38 quedan marcados `alta`. Si P1 midió con otra
cotización, conviene revisar cuál.

Por la misma razón, la regla del sentido (precio publicado que sube y en dólares baja) hoy no
afecta a ningún aviso.

Variaciones extremas: 5 cambios de más de 90 % quedaron descartados como precio corregido.
Quedan marcados 5 de más de 50 % que tienen el mismo aspecto (un departamento que pasó de
US$ 700.000 a 295.000, otro de 45.000 a 75.000). El tope de 90 % se eligió sin datos; con 50 %
saldrían esos 5 y con 40 %, 12. Es una decisión de calibración pendiente.

### §4.2 Serie zonal

Tipo en el grano, Capital venta, US$/m² mediano (coincide con lo medido por P1):

| Dormitorios | Casas | Departamentos | Todos |
|---|---|---|---|
| 2 | 778 | 1.205 | 1.060 |
| 3 | 853 | 886 | 859 |

Celdas de la semana en curso: 161 de la serie `todos`, 138 de casas, 96 de departamentos y 78
de lotes. La serie `todos` tiene las mismas celdas y los mismos valores que la semana anterior.

Tendencia, venta, serie `todos`:

| Criterio | Semana del 21/09 (contra el 24/08) | Semana en curso (contra el 31/08) |
|---|---|---|
| Rivadavia 2 dorm. `alta` (+3,8 %) | `alta` +3,76 % | `alta` +2,99 % |
| Rawson `baja` en todos los cortes | todos `baja` (−3,5 a −11,4 %) | 2, 3, 4+ y total `baja` (−5,1 a −8,8 %); **1 dorm. `alta` +3,3 %** (11 avisos) |
| Capital `estable` | total `estable` −1,0 %; 1 dorm. `baja` −5,3 % | total `estable` −1,2 %; 1 dorm. `baja` −5,7 % |
| Lotes leen desde el 14/09 | cumple | cumple |
| Ninguna celda rural con n < 15 publica | 0 — cumple | 0 — cumple |

Las semanas anteriores quedaron escritas con `scripts/backfill_tendencia_zonal.py` (352
celdas, solo las tres columnas de tendencia). La semana del 17/08 es la primera de la serie y
no tiene contra qué compararse.

La variación se calcula sobre la mediana a dos decimales, que es como se guarda: se puede
reproducir desde la tabla.

Celdas chicas que saltan, fuera de los rurales: Jáchal lote urbano +74 % en dos semanas con 12
avisos, y Pocito alquiler 3 dorm. +34 % con 11. El mínimo de 15 del pedido cubre solo los
lotes rurales.

### §4.3 Rentabilidad

| | Antes | Después |
|---|---|---|
| Casas con rentabilidad estimada | 2.228 de 2.350 (95 %) | 558 (24 %) |
| Departamentos con rentabilidad estimada | 974 de 1.068 (91 %) | 350 (33 %) |
| Rentabilidad mediana, casas | 8,36 % | 7,85 % |
| Rentabilidad mediana, departamentos | 7,59 % | 6,90 % |
| Ventas con más de 15 % | 485 | 63 |
| Máxima | 98,2 % | 61,1 % |

Top 20 de "casas en venta" con el orden de P2 (su expresión de score, corrida sobre la base):

| | Antes | Después |
|---|---|---|
| Con rentabilidad | 20 | 7 |
| Mediana | 16,71 % | 12,85 % |
| Máxima | 33,85 % | 15,00 % |
| Por encima de 12 % | 18 | 4 |

El "antes" reproduce lo que midió P1 (18 sobre 12 %, máximo 34 %).

**Los dos criterios de §4.3 no se cumplen:**

- La mediana del top 20 quedó en 12,85 %, no entre 6 y 9 %.
- De las 63 ventas con más de 15 %, 19 no tienen el m² por debajo del p10 de su pool. Las 63
  están al menos 32 % por debajo de la mediana de su pool (mediana 52 %).

La causa que queda no es el pool de alquileres sino el precio de venta: un aviso 30 % más
barato que sus similares, con la renta de mercado, rinde 7,8 ÷ 0,7 = 11 %. El top de un
ranking que premia lo barato va a concentrar siempre esas rentabilidades. Angostar la banda o
subir el mínimo casi no mueve la distribución y cuesta cobertura:

| Banda | Mínimo | Cobertura | Mediana | Más de 15 % |
|---|---|---|---|---|
| ±30 % | 5 | 26,6 % | 7,48 % | 63 |
| ±30 % | 8 | 22,1 % | 7,28 % | 42 |
| ±20 % | 5 | 22,4 % | 7,77 % | 53 |
| ±15 % | 8 | 9,7 % | 7,28 % | 16 |

La cobertura baja porque solo el 34 % de los alquileres de vivienda publica superficie
cubierta (456 de 1.354). Fuera de Capital, Rivadavia, Santa Lucía y Rawson ninguna venta tiene
rentabilidad estimada.

### §4.4 Verde de venta

Verdes en venta de vivienda: 673 → 780. Rojos 635 → 647 (por avisos que pasaron los 90 días
sin actualizar, no por el umbral).

### §4.5 Textos

49.819 textos guardados en avisos activos (motivos y descripciones de componentes): ninguno
contiene cap, gap, percentil, comparables, mediana, subvaluación, temperatura ni yield.

## Preguntas abiertas para P1

1. **Rentabilidad**: con el pool pedido la mediana poblacional queda creíble, pero el top 20
   sigue en 12,85 % y la cobertura cae a la cuarta parte. ¿Se acepta así, o se define otra
   regla para las rentabilidades altas de avisos muy baratos?
2. **Ventana de la tendencia**: ¿3 corridas, como dice el algoritmo (144 bajas), o toda la
   historia, como sugiere el criterio de aceptación (232 menos las de menos de 3 %)?
3. **Tope de variación**: ¿90 %, o más bajo para no mostrar como baja un precio corregido?
4. ¿La etiqueta `baja` debe aparecer cuando el precio publicado en pesos **subió** pero en
   dólares quedó más bajo? Hoy no aparece y no afecta a ningún aviso.
5. ¿Con qué cotización midió P1 que las subas en pesos desaparecen en dólares?
6. ¿Los `label` de `score_componentes` se muestran en la card o en el detalle? Si se
   muestran, conviene pasarlos también a lenguaje de usuario.
7. ¿"Zona en alza" y "zona en baja" sirven, o se vuelve a "caliente" y "fría"?
