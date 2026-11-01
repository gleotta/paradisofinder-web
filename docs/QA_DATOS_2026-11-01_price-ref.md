# QA de datos — `price_ref` (referencia de precio por radio) — 2026-11-01

**Para: German.** Prueba de calidad de lo nuevo que llega a P1 con la entrega de
P3 del 31/10 (`ref_*`) expuesta por P2 como `price_ref` (contrato §4.8), sobre
el P2 del Docker local (`localhost:8000`) con la base local de P3 del 31/10.
Universo: **5.346 avisos**, todo lo que devuelve `/search/structured` para
`sale` (2.345), `rent` (532) y `land` (2.469), bajado de a 100 (55 llamadas).
Cruce con `master.properties` de P3 (7.447 activos de San Juan) por id.
Script y salida cruda: `qa_price_ref.py` / `qa_price_ref.txt` de la sesión
(apéndice al final).

## Veredicto

**Estamos bien con lo nuevo.** `price_ref` llega en el 99,5 % de los avisos,
sin una sola violación de contrato, idéntico a lo que P3 calculó (5.321 de
5.321) y, en los niveles de zona, idéntico a la mediana de `zone_ref` (2.262 de
2.262). El valor del radio describe mejor el precio de un aviso que la zona,
como P3 midió: poco en vivienda, mucho en lotes urbanos. Lo que falla está
**aguas arriba** y ya estaba: avisos con precio o superficie mal cargados en el
portal, que el sistema ya marca como "verificar el aviso". No hay nada que
pedirle a P2 ni a P3 por esta prueba.

## 1. Cobertura (grupo × nivel elegido por P3)

| Grupo | radio 1 km | radio 3 km | radio 5 km | zona | macro zona | provincia | sin `price_ref` | total |
|---|---|---|---|---|---|---|---|---|
| Venta de vivienda | 1.298 | — | — | 865 | 140 | 33 | 9 | 2.345 |
| Alquiler de vivienda | 182 | — | — | 294 | 30 | 21 | 5 | 532 |
| Lote urbano | 1.086 | 306 | 187 | 663 | 1 | — | 11 | 2.254 |
| Lote rural | — | — | — | 116 | 99 | — | 0 | 215 |
| **Total** | **2.566** | **306** | **187** | **1.938** | **270** | **54** | **25** | **5.346** |

Coincide con la distribución que P2 anunció (r1 2.384 en m² y 182 en mes; r2
493; zona 1.528 / 294 / 116). Los 25 sin `price_ref`: 20 son parte indivisa,
cesión o boleto (`shared_or_partial`, traen `zone_ref` y no `price_ref`, como
se decidió) y 5 no tienen ninguna de las dos. Los radios 3 y 5 km solo
aparecen en lotes urbanos, como dice la cascada.

## 2. Validez del contrato: ninguna violación

Sobre los 5.321 con `price_ref`: unidad según el grupo (m² en venta y lotes
urbanos, mes en alquiler, hectárea en rural), `level` en el vocabulario,
`radius_km` ∈ {1, 3, 5} y `place` null con radio, `place` presente y
`radius_km` null en los niveles de zona, `sample` ≥ 10 en todos (mínimo
exacto 10), `value` > 0, `bucket` en el conjunto permitido, alquiler nunca con
radio y bucket `todos` (la cascada manda zona), `place` = zona del aviso en
nivel `zona`, y `macro_zona` / `provincia` solo cuando `zone_ref.fallback`
dice lo mismo. **0 violaciones en 13 reglas.**

## 3. Paridad

- **Con `zone_ref`** (niveles zona, macro zona y provincia): valor y muestra
  idénticos en **2.262 de 2.262**. Ningún aviso con `price_ref` y sin
  `zone_ref`.
- **P2 ↔ P3** (columnas `ref_*` de la base): nivel, km, valor, unidad,
  muestra, bucket y lugar idénticos en **5.321 de 5.321**; null en los dos en
  los 25 restantes. P2 sirve tal cual, no reinterpreta nada.
- En la base: `radio_computed_at` 31/10 21:31 > `indicators_computed_at`
  26/10; 0 avisos con radios viejos. 264 activos sin referencia (238
  `fuera_de_serie`: casas y departamentos de parte indivisa o temporarios,
  oficinas, locales, 60 terrenos sin clase; 26 `calculado` sin muestra en
  ningún nivel), como informó P3.

## 4. Plausibilidad: precio propio del aviso contra la referencia

Desvío |propio / referencia − 1|, por grupo y nivel (menos es mejor):

| Grupo · nivel | n | mediana | p75 | p90 |
|---|---|---|---|---|
| Venta de vivienda · todos | 2.109 | 25,8 % | 45,2 % | 72,1 % |
| · radio 1 km | 1.204 | **24,4 %** | 41,8 % | 65,5 % |
| · zona | 763 | 26,2 % | 48,6 % | 79,0 % |
| Alquiler · todos | 251 | 21,7 % | 40,0 % | 73,3 % |
| · radio 1 km | 100 | **20,0 %** | 38,3 % | 64,8 % |
| · zona | 128 | 22,1 % | 35,0 % | 83,1 % |
| Lote urbano · todos | 2.243 | 32,9 % | 62,1 % | 101,4 % |
| · radio 1 km | 1.086 | **25,7 %** | 49,6 % | 79,8 % |
| · radio 3 km | 306 | 42,9 % | 66,7 % | 123,7 % |
| · radio 5 km | 187 | 38,0 % | 61,2 % | 107,8 % |
| · zona | 663 | 45,4 % | 77,8 % | 162,8 % |
| Lote rural · todos | 215 | **69,0 %** | 148,1 % | 481,2 % |

Lectura: el radio 1 km queda más cerca del precio del aviso que la zona en
los tres grupos donde se muestra, poco en vivienda (24 % contra 26 %) y mucho
en lotes urbanos (26 % contra 45 %). Es lo que P3 midió. En **lotes rurales la
referencia no sirve** (mediana 69 %, un cuarto de los avisos a más del 148 %,
el 36 % a más de 3×): confirma la decisión de no mostrar la hectárea.

Radio contra zona (ratio valor del radio / mediana zonal): venta mediana 1,02
(p10 0,77 · p90 1,38), alquiler 1,00 (0,87 · 1,20), lotes urbanos 1,03 (0,54 ·
2,25; 348 avisos a más del doble o menos de la mitad). El radio dice algo
distinto de la zona en uno de cada cinco avisos de vivienda y en uno de cada
cuatro lotes: ese es el valor de haberlo calculado.

## 5. Lo que falla (y no es de `price_ref`)

Avisos cuyo precio propio está a más de 3× o menos de ⅓ de su referencia:
venta 70 de 2.109 (3,3 %), alquiler 6 de 251, lotes urbanos 242 de 2.243
(10,8 %), rurales 77 de 215. Mirados uno por uno, son **errores del aviso en
el portal**, previos y ya visibles en el "US$ X/m²" de la card:

| Aviso | Qué dice | Qué pasa |
|---|---|---|
| `895d28f7` lote urbano, Zonda | 588 m² a **US$ 12.000.000** (m² US$ 20.408; ref 20) | precio mal cargado |
| `1a960420` lote urbano, Chimbas | **69 m²** a US$ 300.000 (m² 4.348; ref 29) | superficie mal cargada |
| `7c4a9591` lote urbano, Rivadavia | 7.470 m² a **US$ 5.000** (m² 0,67; ref 79) | precio o superficie mal cargados |
| `17f6a37c` casa, Capital | 243 m² a **$ 1.000.000** (US$ 645; m² US$ 2,65; ref 861) | precio en pesos por mes o incompleto; tier 1 |
| `8df88ddf` casa, San Martín | **8.679 m² cubiertos** a US$ 38.000 | superficie mal cargada |
| `dfe82d4b` departamento, Capital, "alquiler" | **US$ 43.000** por mes (ref US$ 484) | es una venta clasificada como alquiler |
| `6fdd73e6` lote rural, Pocito | **66 m²** a US$ 250.000 (ha US$ 37,9 millones) | superficie mal cargada |

De los 70 extremos de venta, 47 ya llevan `deal_rating: verify_data` y 31 son
tier ≤ 1; de los 242 de lotes urbanos, 87 son tier ≤ 1. P3 los detecta en la
comparación con similares (por eso "verificar el aviso"); `price_ref` no los
empeora ni los tapa: la card muestra el m² del aviso y la referencia al lado,
y la diferencia se ve.

## 6. Lo que P1 muestra, con estos datos

| Grupo | Con referencia visible | "sin distinguir dormitorios" (solo detalle) |
|---|---|---|
| Venta de vivienda | 2.336 de 2.345 (99,6 %) | 512 (22 %) |
| Lote urbano | 2.243 de 2.254 (99,5 %) | — |
| Alquiler | 0 (decisión 15: sin bloque Zona; 527 traen el mes) | — |
| Lote rural | 0 (hectárea oculta; 215 la traen) | — |

Rangos de `value`: venta m² US$ 359–3.056 (mediana 865); lotes urbanos m²
US$ 4–380 (mediana 29); alquiler US$ 194–2.650 por mes (mediana 452); rural
ha US$ 30.000–98.667. Nada absurdo en los extremos.

## 7. Observaciones que se anotan, sin pedido

- **56 avisos activos tier ≥ 1 de P3 no salen por `/search/structured`** con
  `vertical` sale / rent / land (41 terrenos, 10 departamentos, 3
  habitaciones, 2 casas). Probablemente terrenos sin clase y temporarios /
  habitaciones que no entran en esas tres verticales. No toca a `price_ref`;
  queda anotado por si alguna vez importa el conteo.
- Los avisos con precio o superficie mal cargados (§5) son del portal de
  origen; el sistema ya los marca. Si German quiere que la card los esconda
  o los degrade más, es una decisión de producto, no de datos.
- Lote rural: confirmado con datos que la hectárea de la zona no describe el
  precio (§4). Decisión de P1 del 01/11 ratificada.

## Apéndice — salida cruda del script
```
UNIVERSO: 5346 cards de /search/structured (sale 2345, rent 532, land 2469)

1. COBERTURA grupo × nivel
                        radio 1 km    radio 3 km    radio 5 km          zona    macro_zona     provincia sin price_ref   total
venta vivienda                1298             0             0           865           140            33             9    2345
alquiler vivienda              182             0             0           294            30            21             5     532
lote urbano                   1086           306           187           663             1             0            11    2254
lote rural                       0             0             0           116            99             0             0     215
total                         2566           306           187          1938           270            54            25    5346
por unidad: {('macro_zona', 'hectare'): 99, ('macro_zona', 'month'): 30, ('macro_zona', 'sqm'): 141, ('provincia', 'month'): 21, ('provincia', 'sqm'): 33, ('radio 1 km', 'month'): 182, ('radio 1 km', 'sqm'): 2384, ('radio 3 km', 'sqm'): 306, ('radio 5 km', 'sqm'): 187, ('zona', 'hectare'): 116, ('zona', 'month'): 294, ('zona', 'sqm'): 1528}

2. VALIDEZ (violaciones)
violaciones: ninguna

3. PARIDAD con zone_ref en los niveles de zona
{'casos': 2262} []
zone_ref null con price_ref: 0 · price_ref null con zone_ref: 20

4. PARIDAD P2 ↔ P3 (columnas ref_* de la base local)
{'iguales': 5321, 'null en ambos': 25}
P3 activos tier>=1: 5402 · de ellos no vienen en /search/structured: 56 (tipos: [('terreno', 41), ('appartamento', 10), ('stanza', 3), ('casa_indipendente', 2)])
P3 sin ref (activos): [(('fuera_de_serie', 'casa_indipendente'), 88), (('fuera_de_serie', 'terreno'), 60), (('fuera_de_serie', 'appartamento'), 51), (('fuera_de_serie', 'oficina'), 14), (('calculado', 'terreno'), 10), (('fuera_de_serie', 'local_comercial'), 8)]

5. PLAUSIBILIDAD: precio propio del aviso vs price_ref (|propio/ref − 1|)
grupo · nivel                          n   mediana     p75     p90
venta vivienda · todos              2109    25.8 %  45.2 %  72.1 %
venta vivienda · radio 1 km         1204    24.4 %  41.8 %  65.5 %
venta vivienda · zona                763    26.2 %  48.6 %  79.0 %
venta vivienda · macro_zona          119    33.7 %  60.0 %  95.2 %
venta vivienda · provincia            23    32.9 %  59.7 %  73.8 %
alquiler vivienda · todos            251    21.7 %  40.0 %  73.3 %
alquiler vivienda · radio 1 km       100    20.0 %  38.3 %  64.8 %
alquiler vivienda · zona             128    22.1 %  35.0 %  83.1 %
alquiler vivienda · macro_zona        14    30.0 %  48.7 %  56.0 %
alquiler vivienda · provincia          9    47.7 %  59.4 %  62.3 %
lote urbano · todos                 2243    32.9 %  62.1 % 101.4 %
lote urbano · radio 1 km            1086    25.7 %  49.6 %  79.8 %
lote urbano · radio 3 km             306    42.9 %  66.7 % 123.7 %
lote urbano · radio 5 km             187    38.0 %  61.2 % 107.8 %
lote urbano · zona                   663    45.4 %  77.8 % 162.8 %
lote urbano · macro_zona               1    25.9 %  25.9 %  25.9 %
lote rural · todos                   215    69.0 % 148.1 % 481.2 %
lote rural · zona                    116    68.6 % 121.6 % 331.7 %
lote rural · macro_zona               99    69.0 % 175.9 % 512.6 %
extremos (>3× o <⅓) en venta vivienda: 70 de 2109 (3.3 %); peores: [(0.0, '17f6a37c-937a-44d3-801a-873c5a9c94b4', 'capital', '3', 'zona'), (0.01, '8df88ddf-dedd-4fbf-8bb6-23762260c3a4', 'san_martin', '2', 'macro_zona'), (0.01, '5ffa0d3d-56e2-45fa-940a-f4f01150d86e', 'santa_lucia', '2', 'zona')]
extremos (>3× o <⅓) en alquiler vivienda: 6 de 251 (2.4 %); peores: [(88.87, 'dfe82d4b-778b-41ea-9d15-37a75a54c3b4', 'capital', '3', 'zona'), (0.17, '33cab694-9af5-4e7f-ac41-115a0ca8d360', 'santa_lucia', '4plus', 'zona'), (0.26, '53d3fa9d-dd7a-4acc-9529-a14833407cc9', 'rivadavia', '4plus', 'zona')]
extremos (>3× o <⅓) en lote urbano: 242 de 2243 (10.8 %); peores: [(999.42, '895d28f7-3f64-4786-b9a7-4ad61d201239', 'zonda', 'lote_urbano', 'radio 5 km'), (152.23, '1a960420-a73b-4e17-b940-91f46cce2528', 'chimbas', 'lote_urbano', 'zona'), (0.01, '7c4a9591-69d2-4992-b176-87e7933d8097', 'rivadavia', 'lote_urbano', 'zona')]
extremos (>3× o <⅓) en lote rural: 77 de 215 (35.8 %); peores: [(972.22, '6fdd73e6-bb9c-42d6-9f04-e926ecc94788', 'pocito', 'lote_rural', 'zona'), (641.51, '5d2441af-4500-4b0e-ba85-d4bf77bf286c', 'chimbas', 'lote_rural_srv', 'zona'), (513.92, 'bf850a8c-1415-416d-92df-144c3d351c3d', 'rivadavia', 'lote_rural', 'macro_zona')]

6. RADIO vs ZONA (en los avisos con nivel radio y zone_ref con mediana): ratio radio/zona
venta vivienda       n= 1298 mediana=1.02 p10=0.77 p90=1.38 · >2× o <½: 39 · sin mediana zonal: 0
alquiler vivienda    n=  182 mediana=1.00 p10=0.87 p90=1.20 · >2× o <½: 2 · sin mediana zonal: 0
lote urbano          n= 1579 mediana=1.03 p10=0.54 p90=2.25 · >2× o <½: 348 · sin mediana zonal: 0

7. SIN price_ref: qué son
por tipo: Counter({'land': 11, 'house': 8, 'apartment': 6}) · flags: Counter({'shared_or_partial': 20}) · rental_period: Counter({None: 25}) · con zone_ref: 20

8. LO QUE P1 MUESTRA
venta vivienda       con referencia visible: 2336 de 2345 (99.6 %) · 'sin distinguir dormitorios': 512
alquiler vivienda    con referencia visible: 0 de 532 (0.0 %) · 'sin distinguir dormitorios': 27
lote urbano          con referencia visible: 2243 de 2254 (99.5 %) · 'sin distinguir dormitorios': 0
lote rural           con referencia visible: 0 de 215 (0.0 %) · 'sin distinguir dormitorios': 0
alquiler: referencia en 'mes' que P1 no muestra (decisión 15): 527
lote rural: referencia en hectárea que P1 oculta (139 %): 215

9. RANGO DE VALORES por grupo (unidad de price_ref)
venta vivienda       n= 2336 min=359 p1=467 mediana=865 p99=1,789 max=3,056 · sample min=10
alquiler vivienda    n=  527 min=194 p1=239 mediana=452 p99=2,650 max=2,650 · sample min=10
lote urbano          n= 2243 min=4 p1=7 mediana=29 p99=233 max=380 · sample min=10
lote rural           n=  215 min=30,000 p1=30,000 mediana=38,961 p99=98,667 max=98,667 · sample min=10
```
