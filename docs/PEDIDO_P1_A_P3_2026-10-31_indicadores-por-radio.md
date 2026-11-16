# Pedido de P1 a P3 — Indicadores por radio (lo que rodea al aviso) — 2026-10-31

**Para: el equipo de P3 (finder-pipeline). Autocontenido: se copia tal cual al
repo de P3. P2 y P1 no cambian en esta etapa.**

Origen: German, 31/10 (backlog de P1, B7). Además de los indicadores de la
zona (`master.zone_stats`: m² mediano, precio mediano, alquiler mediano),
quiere los mismos indicadores calculados con **lo que rodea a cada aviso**,
en dos radios. La decisión de los radios está tomada (abajo, con la medición
que la respalda). Este pedido es solo **P3: columnas nuevas en
`master.properties`, el cálculo en el step `indicators` y una corrida
completa**. Qué expone P2 y qué muestra P1 se define después, sobre los
datos ya calculados. Regla que vale: P3 calcula, P2 expone, P1 muestra.

Solo San Juan: `citta = 'san_juan'`. Roma no existe más.

## Decisión: dos radios

| Radio | Qué es | Km |
|---|---|---|
| **Radio 1** | el barrio: ~10 cuadras a la redonda | **1 km**, para todos los avisos |
| **Radio 2** | lo que rodea al barrio, sin llegar a ser la ciudad entera | **3 km** si la zona del aviso es urbana · **5 km** si es rural |

**Urbana / rural sale de lo que ya existe:** `master.zones.macro_zona`.
`gran_san_juan` (capital, rivadavia, rawson, santa_lucia, chimbas, pocito) =
**urbana**; `periferia` y `alejado` = **rural**. Nada nuevo que mantener.

**Por qué estos números** (medido el 31/10 sobre la base local: avisos
activos de San Juan con coordenadas de confianza alta o media, vecinos del
mismo tipo y operación):

- A **1 km** tienen 10 o más vecinos el 97 % de los avisos de Capital, 88 %
  en Rivadavia, 79 % en Santa Lucía, 60 % en Rawson, 44 % en Pocito, 19 % en
  Albardón y casi ninguno en Caucete, Ullum o Calingasta. Es el único radio
  que dice algo distinto de la zona; solo no alcanza.
- A **3 km** llegan a 10 casi todos los del Gran San Juan (Rawson 97 %,
  Pocito 94 %, Chimbas 96 %) sin convertirse en la ciudad: alrededor de un
  aviso de Capital, 3 km contienen el 36 % de todos los avisos de su tipo en
  la provincia.
- A **5 km** desde Capital entra el **64 %** de la provincia: esa mediana ya
  es la del Gran San Juan, no la de una vecina. Por eso 5 km queda solo para
  las zonas rurales, donde recién ahí se junta muestra (Albardón 89 %,
  Caucete 78 %, Ullum 74 %, 9 de Julio 75 %).
- Calingasta, Iglesia, Jáchal y Valle Fértil no juntan 10 ni a 5 km. Ahí el
  radio queda **NULL** y sigue valiendo la zona, como hoy. No se inventa.

## Reglas del cálculo

1. **Centro.** El aviso tiene `latitudine`/`longitudine` y
   `location_confidence IN ('alta', 'media')`. Con `baja`, sin confianza o
   sin coordenadas, todas las columnas de radio quedan NULL y
   `radio_estado` dice por qué. Un aviso `media` (±250 m) sirve como centro:
   el error es chico frente a 1 km.
2. **Vecinos.** Avisos activos de San Juan, distintos del propio, **también
   con coordenadas de confianza alta o media**. Esto es importante: los de
   confianza `baja` están en el centroide de la zona; si entran al pool,
   todo aviso cercano al centroide ve un barrio que no existe.
3. **Misma celda que la serie zonal.** El pool de un aviso es el de su celda
   de `zone_stats`: misma `operazione`, mismo tipo zonal (`tipo_zonal`: casa
   con casa, departamento con departamento; lotes por su clase,
   `clave_lote`) y su bucket (`bucket_zonal`). Si el bucket propio no llega
   al mínimo dentro del radio, se usa el bucket `todos` del mismo tipo (como
   `zone_ref` hace hoy) y `rK_bucket` dice cuál se usó. `sin_dato` va
   directo a `todos`. Los avisos que no aportan a la serie zonal
   (habitaciones, no residenciales, rentas no mensuales,
   `is_shared_or_partial`) no se calculan: `radio_estado = 'fuera_de_serie'`.
4. **Mismas bases que la serie zonal.** Moneda de cálculo (USD en AR,
   `convertir_a_moneda_calculo`), superficie de `_superficie_indicador`
   (cubierta en vivienda, total en lotes), el departamento medido sobre la
   total no aporta al m² (`ZONE_STATS_INCLUYE_BASE_TOTAL`), precio > 0,
   mediana y cuartiles como en `calcular_zone_stats`. Nada se recalcula
   distinto: es la misma cuenta sobre otro recorte.
5. **Mínimo de muestra: 10** (`RADIO_MIN_MUESTRA`, default
   `ZONE_STATS_MIN_MUESTRA`). Precio mediano con `n_muestra >= 10`, m² con
   `n_muestra_m2 >= 10`; lo que no llega queda NULL. Los `n` se guardan
   siempre (la verdad cruda). **No hay fallback entre radios**: el radio 2 ya
   es el fallback del 1, y más allá del 2 está la zona. Con 5 avisos una
   mediana salta con un solo precio raro; el 5 de `COMPARABLE_MIN` es para el
   pool de comparables, que es otra cosa y no se toca acá.
6. **Distancia.** Haversine o equirectangular en km (a −31,5° un grado de
   longitud son ~94,7 km, uno de latitud ~111,2 km). Un filtro previo por
   caja (±0,046° lat, ±0,054° lon para 5 km) evita el todos-contra-todos:
   son ~5.400 centros y la cuenta entera tiene que sumar menos de un minuto
   a la corrida. Conviene armar el índice una vez por corrida (como
   `inversion_zonas`) y pasarlo a `compute_indicators`.
7. **Rentabilidad del radio** (solo venta de vivienda): alquiler mensual
   mediano de los **alquileres** de la misma celda dentro del radio, con el
   mismo mínimo, y `rK_gross_yield = renta_mediana × 12 / precio_mediana ×
   100`. Es la lectura "rentabilidad de la zona" llevada al radio; no es el
   `gross_yield_estimado` del aviso, que sigue saliendo de su pool de rentas.
8. **Sin serie, por ahora.** Se guarda el valor vigente en cada corrida, sin
   historia ni tendencia. Si hace falta tendencia por radio, se pide aparte.

## Columnas nuevas en `master.properties` (migración `040_indicadores_por_radio.sql`)

| Columna | Tipo | Qué guarda |
|---|---|---|
| `radio_estado` | varchar | `calculado` · `sin_coordenadas` · `ubicacion_baja` · `fuera_de_serie` |
| `radio_clase` | varchar | `urbana` · `rural` (de `macro_zona`) |
| `radio1_km` | numeric | 1.0 |
| `radio2_km` | numeric | 3.0 o 5.0 |
| `r1_bucket` / `r2_bucket` | varchar | bucket usado: el propio o `todos` |
| `r1_n_vecinos` / `r2_n_vecinos` | integer | activos del mismo tipo y operación en el radio, cualquier bucket (oferta alrededor) |
| `r1_n_muestra` / `r2_n_muestra` | integer | con precio, en el bucket usado |
| `r1_n_muestra_m2` / `r2_n_muestra_m2` | integer | con precio y superficie |
| `r1_precio_mediana` / `r2_precio_mediana` | numeric | USD |
| `r1_precio_m2_mediana` / `r2_precio_m2_mediana` | numeric | USD/m² |
| `r1_precio_m2_p25` / `r2_precio_m2_p25` | numeric | USD/m² |
| `r1_precio_m2_p75` / `r2_precio_m2_p75` | numeric | USD/m² |
| `r1_precio_ha_mediana` / `r2_precio_ha_mediana` | numeric | solo lotes rurales |
| `r1_renta_mensual_mediana` / `r2_renta_mensual_mediana` | numeric | solo venta de vivienda; misma moneda que `renta_mensual_estimada` |
| `r1_gross_yield` / `r2_gross_yield` | numeric | solo venta de vivienda, en % |

Se escriben en el mismo `UPDATE` de `_update_property_indicators`, con
`indicators_computed_at`. Las constantes van en `pipeline/config.py`:
`RADIO1_KM = 1`, `RADIO2_KM_URBANA = 3`, `RADIO2_KM_RURAL = 5`,
`RADIO_MIN_MUESTRA`, `RADIO_MACRO_URBANA = {"gran_san_juan"}`, y la
confianza admitida `{"alta", "media"}`, todas con override por entorno como
las demás.

## Entrega

1. Migración 040 + cálculo como función pura (`calcular_indicadores_radio`
   o similar) con tests en `tests/test_indicators.py`: centro sin
   coordenadas, centro `baja`, vecino `baja` que no entra, bucket propio
   que cae a `todos`, radio 2 de 3 y de 5 km según `macro_zona`, mínimo que
   deja NULL, lote rural con hectárea, venta con y sin rentas alrededor.
2. `docs/DATA_CONTRACT.md` regenerado con las columnas y su semántica (es lo
   que P2 va a leer cuando le toque).
3. Corrida completa de `python main.py indicators` en local y después en
   producción, y un bloque "radios" en `scripts/reporte_corrida.py`.
4. Respuesta en `docs/RESPUESTA_P3_A_P1_2026-10-31.md` con la tabla de
   cobertura de abajo medida sobre la corrida real.

## Aceptación

Sobre la base local del 31/10 (o posterior), avisos activos de San Juan:

| Qué | Esperado |
|---|---|
| `radio_estado = 'calculado'` | ~5.200 avisos (los de confianza alta + media con coordenadas: 4.429 + 769 al 31/10) |
| Radio 1 con `r1_n_muestra >= 10` | ≥ 90 % en Capital; ≥ 80 % en Rivadavia; Rawson y Pocito por debajo (60 % y 44 % medidos por tipo, un poco menos por bucket) |
| Radio 2 con `r2_n_muestra >= 10` | ≥ 95 % en las seis zonas de `gran_san_juan` (3 km) |
| Radio 2 en rurales (5 km) | Albardón, Zonda, Caucete, Ullum, 9 de Julio entre 70 % y 95 %; Calingasta, Iglesia, Jáchal y Valle Fértil mayormente NULL, y eso está bien |
| Ningún vecino con `location_confidence = 'baja'` en ningún pool | 0 |
| Idempotencia | dos corridas seguidas sin cambios en los datos dan las mismas columnas |
| Tiempo | el step `indicators` no suma más de un minuto por el cálculo de radios |
| Lo demás | `gap_valuacion`, `percentil_precio`, `num_comparables`, `zone_stats` y los scores no cambian ni en un decimal |

## Fuera de alcance (no hacer en esta ronda)

- Cambiar el pool de comparables (`_select_comparables`) o el gap a un pool
  por radio. Sigue por zona. Es la parte original de B7 y se decide después,
  sin tocar el pool dos veces.
- Exponerlo en P2 (`zone_ref` por radio) y mostrarlo en P1. Siguiente etapa,
  con estos datos ya calculados.
- Serie histórica y tendencia por radio.
- Radio como filtro de búsqueda ("a menos de 2 km de la UNSJ"): es B11 de P1
  y va por P2.
