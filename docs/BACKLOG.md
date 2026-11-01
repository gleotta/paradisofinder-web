# Backlog de producto — P1 (FINDER · San Juan)

Temas **diferidos con decisión explícita de German**, con la evidencia que los
sostiene y lo que hace falta para retomarlos. No es una lista de bugs ni de
tareas en curso: lo que está en marcha vive en su `PLAN_*` o `DECISION_*`.
Cada ítem dice de dónde salió, por qué se difirió, qué necesita para arrancar
y dónde está la evidencia. Iniciado el 2026-09-29.

---

## B1. Estado del inmueble por fotos — diferido el 2026-09-29

**Origen.** Análisis de indicadores por vertical del 28-29/09
(`docs/PLAN_2026-09-29_cards-por-vertical.md`, §0). German preguntó cómo se
determina el estado si el texto no lo dice o no es fiable.

**Problema medido (DB local, semana 2026-09-21, vivienda activa tier ≥ 1).**

| | Venta | Alquiler |
|---|---|---|
| Avisos con estado informado (columna `stato`, sale del enrich por LLM sobre el texto) | 37 % de 2.456 | 25 % de 532 |
| Óptimo o bueno (marketing: nadie publica "regular") | 591 | 84 |
| A estrenar o en construcción (fiable) | 235 | 49 |
| A refaccionar (fiable) | 92 | 0 |
| Celdas zona × dormitorios × estado con ≥ 10 avisos | 27, cubren el 24 % | 2, cubren el 5 % |

El estado sí pesa en el precio: casas en Capital, US$/m² mediano a refaccionar
692 · óptimo 920 · a estrenar 1.000; departamentos 867 · 1.087 · 1.296. Un
escalón de 15 a 25 % en cada extremo. **Como eje del cubo zonal no sirve**
(24 % / 5 % de cobertura); sirve como calificador del pool de comparables y
como chip cuando es fiable.

**Propuesta (no aprobada, para retomar).**

1. Clasificador de visión sobre **3 fotos por aviso** (hay 12 en promedio, el
   94 % tiene 3 o más), con rúbrica de 4 clases + "sin evidencia": obra sin
   terminar · deterioro visible · terminaciones viejas · reforma o construcción
   reciente. Salida: clase, confianza y la foto que lo justifica. **Nunca pisa
   un extremo declarado en el texto.**
2. Piloto de **100 avisos de venta**, los mismos con dos modelos, auditados a
   ojo por German (lo manual es la validación, no el etiquetado). Si el
   acuerdo en los extremos supera el 85 %, corrida completa por Batch.
3. P3: paso nuevo + columnas `estado_fotos`, `estado_fotos_confianza`,
   `estado_fotos_evidencia`; P2: tres campos en la card; P1: chip "Estado según
   fotos" con la confianza; P3: calificador del pool (excluir extremos del pool
   de una propiedad normal y al revés).

**Costo y tiempo (precios de la API de Claude vigentes al 2026-09-29; P3 usa
hoy OpenAI `gpt-4o-mini` por `.env`, el proveedor `anthropic` ya está
soportado en `providers/llm_api.py`).**

| Escenario | Imágenes | Modelo | Costo, una pasada |
|---|---|---|---|
| Venta sin estado en los extremos, 3 fotos | 6.300 | Sonnet 5 · Batch | ≈ US$ 12 |
| Venta sin estado en los extremos, 3 fotos | 6.300 | Opus 5 · Batch | ≈ US$ 30 |
| Todo el inventario de vivienda, 3 fotos | 9.000 | Sonnet 5 · Batch | ≈ US$ 17 |
| Todo el inventario de vivienda, 3 fotos | 9.000 | Opus 5 · Batch | ≈ US$ 42 |
| Todo el inventario, las 12 fotos | 36.000 | Opus 5 · Batch | ≈ US$ 165 |
| Mantenimiento semanal (altas nuevas), 3 fotos | ≈ 750 | Opus 5 | < US$ 5 |
| Piloto de 100 avisos, dos modelos | 600 | ambos | < US$ 3 |

Batch procesa dentro de las 24 h; en sincrónico con 10 llamadas en paralelo,
los 3.000 avisos salen en menos de media hora. Lo que el modelo NO ve:
instalaciones, estructura y lo que el vendedor no fotografió.

**Sub-ítems que van juntos.**

- **B1a. Rúbrica estricta de estado por texto.** Solo cuatro valores fiables
  (a estrenar, en construcción, reciclado, a refaccionar); "excelente/bueno"
  pasa a sin dato. En el enrich de P3 + reproceso. Cubre un 10-15 % sin mentir.
  En el texto de venta: "a estrenar" 133 · refacción/demolición 105 ·
  reciclado 101 · "excelente estado" 168, sobre 2.456.
- **B1b. Estado como calificador del pool de comparables** (P3,
  `_select_comparables`): excluir extremos del pool de una propiedad normal y
  al revés. Mantiene el pool denso.

**Para retomar:** decisión de German sobre el piloto (modelo y presupuesto), y
la Fase 2 del plan de cards cerrada (pool de rentas), para no tocar el pool
dos veces.

---

## B2. Panel de zona en la cabecera de resultados

**Origen.** Mismo análisis. `master.zone_stats` de vivienda tiene 6 semanas
(17/08 → 21/09) con stock, medianas por bucket de dormitorios, altas, bajas,
bajas de precio y `cap_zonal`; P2 solo la lee para lotes.

La **referencia por card** (m² mediano de zona en Comprar, alquiler mediano de
similares en Alquilar) entra en el plan (Fase 1). Queda acá el **panel
completo** ("en Rivadavia hay 684 casas en venta, 28 altas y 16 bajas esta
semana, 10 bajaron de precio") y la tendencia: hay que definir con datos
cuándo una serie de 6 semanas dice algo (Capital venta: stock 1.374 → 1.434,
m² 929 → 919 en seis semanas — todavía plano).

**Para retomar:** Fase 1 hecha (P2 ya leería `zone_stats` de vivienda);
decidir umbrales de "sube/baja" con German.

---

## B3. Orden y filtro por tendencia ("bajaron de precio")

**Origen.** Fase 2 del plan: P3 marca `tendencia_precio` por propiedad y P2 la pasa a la card. Lo que sigue es
poder pedirlo: "casas que bajaron de precio en Rivadavia" → orden
`price_drop_desc` y filtro por `price_changed_at` en la whitelist de P2, chip
en la barra de P1. Hoy hay 305 ventas y 149 alquileres activos con baja
registrada (mediana −7,9 %).

**Para retomar:** Fase 1 en producción y una semana de datos para ver cuántas
bajas nuevas entran por semana.

---

## B4. Expensas

**Origen.** Para el inquilino es el segundo número después del alquiler.
`spese_condominiali` está en **0 %** en San Juan. Hay que verificar si
compraensanjuan publica expensas en algún campo o solo en el texto; si sí, es
un cambio de crawler/parser en P3. Si no, no hay dato posible.

---

## B5. Cards de Invertir y Lotes

**Origen.** Este ciclo define Alquilar y Comprar. **Invertir** hereda yield,
cap zonal y los semáforos Reventa/Renta, pero solo después de la Fase 2 (pool
de rentas con banda de superficie): hoy 18 de las 20 primeras casas en venta
muestran un yield mayor a 12 % con máximo 34 %, contra un 7,8 % mediano de
la población. **Lotes** hay que revisarlo con el mismo método (cobertura real
por campo contra la DB).

**Estado al 31/10.** Las cards de Invertir y Lotes salieron con la regla 13
(en producción desde el 01/10). Lo que queda de Invertir — de dónde sale la
rentabilidad y qué tan creíble es — pasa a B9.

---

## B6. Búsqueda por viewport del mapa

Ya planificada en `docs/PLAN_2026-08-31_busqueda-por-mapa.md`; bloqueada
porque la whitelist de `filters[]` de P2 no acepta `latitude`/`longitude`.
German la volvió a pedir el 31/10. Comparte geometría con B11 (buscar cerca
de un punto) y con B12 (qué se ve en el mapa).

---

## B7. Comparables e indicadores por radio (1 a 5 km)

**Origen.** German, 29/09: además de la zona, ver cómo está la propiedad
contra las que la rodean en un radio (5 km, a definir). Hoy el pool de
comparables de P3 es por zona = departamento; con pin hay coordenadas en el
76 % de las ventas y el 79 % de los alquileres activos, así que un pool por
distancia es viable para la mayoría. Es un cambio en `_select_comparables`
de P3 (pool por radio con el mismo mínimo de 5), y P2/P1 no cambian salvo
para decir "contra N avisos a menos de 5 km" en la descripción del
componente. Regla que se mantiene: **la referencia siempre en dólares.**

**Ampliado el 31/10 (German).** No solo el conjunto de similares: también
los **indicadores** de la propiedad (m² mediano, alquiler mediano,
rentabilidad promedio) calculados con lo que hay alrededor, en un radio de
**1 km o 5 km** (a definir). Notas para decidir:

- El radio solo sirve con ubicación confiable: con `location_confidence:
  high` sí; con `medium` (±250 m) 1 km todavía sirve; con `low` (solo la
  zona) o sin coordenadas, no — ahí sigue valiendo la zona.
- Una forma de no elegir un solo número: empezar en 1 km y ampliar hasta 5 km
  hasta juntar el mínimo de 5, como P3 ya amplía la zona cuando no alcanza
  (`comparables_pool.scope`). La card y el detalle dirían el radio usado.
- Es la misma geometría que B11 (buscar cerca de un lugar).

**Decidido el 31/10 (German), solo la parte de indicadores.** Dos radios:
**1 km** para todos y **3 km** en zonas urbanas (`macro_zona =
gran_san_juan`) / **5 km** en rurales (`periferia`, `alejado`); mínimo 10;
vecinos solo con confianza alta o media; sin fallback entre radios (más allá
del radio 2 sigue la zona). La medición que lo respalda (a 5 km desde Capital
entra el 64 % de la provincia: ya no es una vecina) y el pedido a P3 —
columnas `r1_*`/`r2_*` en `master.properties` y corrida completa — están en
`docs/PEDIDO_P1_A_P3_2026-10-31_indicadores-por-radio.md` (copiado al repo de
P3).

**Entregado por P3 el 31/10**
(`docs/RESPUESTA_P3_A_P1_2026-10-31_indicadores-por-radio.md`): migración 040,
script aparte por provincia (`radio_computed_at`), cobertura medida, y el
agregado que decidió German ese día: **un valor representativo por aviso
(`ref_*`)**, elegido por P3 con una cascada por vertical (venta r1 → zona;
alquiler r1 solo en su tramo → zona; lote urbano r1 → r2 → zona; lote rural
zona). P2 lo sirve como **`price_ref`** (contrato §4.8,
`docs/PROMPT_P3_A_P2_2026-10-31_price-ref.md`) y **reemplaza a la mediana de
`zone_ref`** como referencia de precio: un solo número, diciendo de dónde
sale; sin `price_ref`, sin referencia (nunca `zone_ref` de respaldo). P1 lo
muestra desde el 01/11 (guía §13). Las tres preguntas abiertas de P3 las
resolvió P1 sin pedirle nada (guía §13.3): hectárea rural oculta, radios
rurales con la zona, `is_shared_or_partial` anotado abajo. **A P3 no se le
contesta: la entrega está cerrada (German, 01/11).** En producción falta el
sync de P3 y el deploy de P2; P1 sale después de los dos.

**Pendiente anotado (no es pedido):** excluir `is_shared_or_partial` de la
serie zonal (`zone_stats`), que hoy los cuenta (17 avisos con coordenadas);
va con la próxima vez que P3 toque `zone_stats` (respuesta C3).

**Para retomar (comparables por radio):** después de la Fase 2 del plan (no
tocar el pool dos veces); el gap sigue por zona.

---

## B8. "Ver similares" con el pool exacto de P3

**Origen.** German, 29/09: desde la card, "ver similares" tiene que mostrar
las propiedades contra las que se calculó la posición. P3 calcula el gap
sobre un pool (zona, tipo, dormitorios, banda de superficie, hasta 30) pero
**no persiste los ids** de ese pool; P2 solo puede reconstruirlo aplicando la
misma regla (Fase 1 del plan, `get_comparables`), que coincide en la mayoría
de los casos pero no está garantizado (la corrida de P3 y la lectura de P2 no
son el mismo instante).

**Para retomar:** pedir a P3 que guarde `comparables_ids` (JSONB, ≤ 30) en
`master.properties` en el step indicators; P2 los lee y `get_comparables`
devuelve exactamente esos. Chico en P3, chico en P2.

---

## B9. Inteligencia para la búsqueda de inversiones — agregado el 2026-10-31

**Origen.** German, 31/10: mejorar la capa de inteligencia de la búsqueda de
inversiones.

**Lo que hay hoy.** Invertir = compra de vivienda ordenada por
`gross_yield_desc` (el vertical `investment` de P2 no es alcanzable; regla
10). La rentabilidad es bruta y es una sola cuenta de P3: un año del
alquiler estimado con alquileres similares publicados ÷ precio del aviso. La
card de Invertir muestra "Rentabilidad promedio de la zona"
(`zone_ref.cap_pct`) y el bloque "Esta propiedad · estimación" (regla 13 d).

**Problemas medidos.**

- **Cobertura:** hay rentabilidad en el 24 % de las casas y el 33 % de los
  departamentos en venta; fuera de Capital, Rivadavia, Santa Lucía y Rawson,
  en ninguno. "invertir en Pocito" sale ordenado por un dato que ningún aviso
  tiene. La guía (§9) dejó abierta la pregunta de qué muestra Invertir en
  esas zonas.
- **Calidad:** el tope de Invertir abría con rentabilidades imposibles (hasta
  61 %). P3 dejó de publicar la rentabilidad cuando el precio está más de
  35 % por debajo de similares (`RESPUESTA_P3_A_P1_2026-10-04.md` §1): la
  máxima baja a 18,7 % y el top 20 a 13,9 % de mediana. Al 04/10 estaba en
  la base local, no en Railway.
- **Una sola dimensión:** no hay apreciación (tendencia de zona, B2/B3), ni
  costos (expensas en 0 %, B4), ni vacancia o tiempo hasta alquilar, ni los
  semáforos Reventa/Renta que preveía B5.

**A definir con German (ideas, nada aprobado).**

1. Qué es "una buena inversión" para FINDER: renta, reventa (comprar debajo
   de similares — `valuation_gap_pct` ya existe), apreciación de la zona, o
   una combinación con sus motivos a la vista (regla 4).
2. Qué muestra Invertir donde no hay rentabilidad.
3. Rentabilidad bruta o neta (la neta necesita expensas y supuestos de
   vacancia e impuestos, declarados).
4. Si Lotes entra como inversión (m² y ha de zona ya existen).

P3 calcula, P2 expone, P1 muestra. **Para retomar:** respuesta a 1 y 2, y
medir antes en la DB local cuánta cobertura tendría cada opción por zona
(como en B1).

---

## B10. Inversiones por MCP — agregado el 2026-10-31

**Origen.** German, 31/10: integrar la inteligencia de inversiones con MCP.

**Lo que hay hoy.** P2 ya tiene un server MCP en `POST /mcp` (Streamable
HTTP, sin `X-API-Key`, con rate limit propio, para Claude.ai y ChatGPT;
`docs/MCP_INTEGRATION.md` del repo de P2, actualizado al 26/08) con tres
tools: `finder_create_session`, `finder_search` (acepta `vertical:
invertir`) y `finder_property_detail`. Devuelve texto armado para el LLM
(`app/core/card_format.py`, canal `llm`) y el cliente narra.

**Hallazgo del 31/10 (en el código de P2).** El link al detalle que arma el
MCP es `{FINDER_FRONTEND_URL}/dettaglio/<id>` (`app/adapters/mcp.py`,
`_detail_url`). P1 no tiene `/dettaglio`: el detalle es `/propiedad/<id>`, y
el 301 del dominio viejo conserva el path, así que ese link termina en un
404. Se arregla sin ronda con P2: un redirect `/dettaglio/:id` →
`/propiedad/:id` en P1. (El texto del score del MCP todavía arma
"Opportunity Score: N/100", que P1 sacó de su vocabulario.)

**Lo que faltaría (a definir, depende de B9).** Tools de inversión que hoy no
existen: rentabilidad y m² de una zona (`zone_ref`/`zone_stats`), comparar
2-3 propiedades, los similares de una propiedad, oportunidades de una zona
con sus motivos. El MCP expone lo que la capa calcule; no inventa
indicadores.

**Para retomar:** el redirect de `/dettaglio` se puede hacer ya; las tools
nuevas, con B9 definido.

---

## B11. Búsqueda por cercanía a un lugar — agregado el 2026-10-31

**Origen.** German, 31/10: buscar por referencia, "cerca de tal lugar".

**Lo que ya funciona (contrato del 13/09).** "cerca de X" → `near`, resuelto
contra un catálogo de puntos de interés de P2 (UNSJ, hospitales, plazas,
terminal, estadio, dique…) y los centroides de zona; orden `distance_asc`;
`distance_km` en la card y el detalle ("a 1,2 km"); aclaración
`place_unknown` cuando no lo ubica. En P1, "Entendí: …" permite quitar o
cambiar la cercanía (`nearPhrase`).

**Lo que falta.**

1. **Radio como filtro.** Hoy `near` ordena, no recorta: "a menos de 2 km
   de la UNSJ" no existe (no hay filtro de distancia en la whitelist).
2. **Catálogo cerrado.** Una dirección, una calle o un comercio que no está
   en el catálogo da `place_unknown`. Opciones: geocodificar (servicio
   externo: costo y términos) o ampliar el catálogo.
3. **Categorías.** "cerca de un colegio", "cerca de la ruta 40": cualquiera
   de una clase, no un punto.
4. **Mapa.** `/search/map` no lista `near` entre lo que acepta, y P1 no
   dibuja el punto de referencia.

**Para retomar:** radio por default (el mismo de B7), si se geocodifica y con
qué servicio.

---

## B12. Mapa coloreado por precio u oportunidad — agregado el 2026-10-31

**Origen.** German, 31/10: que los pines del mapa tengan color según la
vertical — alquiler y venta por precio, inversión por oportunidad.

**Restricciones vigentes.**

- Regla 13 (a): **solo verde, nunca rojo.** Un semáforo rojo/amarillo en el
  mapa contradiría la card. El precio es un dato, no un juicio: una escala
  de un solo tono (lila → violeta) no choca con la regla. La oportunidad sí
  es un juicio: el verde sale de P3 (`deal_rating: green`), P1 no fija
  umbrales.
- Precios comparables solo por `price_usd`; en alquiler, solo con el mismo
  `rental_period` (un pin sin período queda sin color).
- Regla 4: el color necesita leyenda. Y no depender solo del color
  (etiqueta de precio en el pin, como Airbnb).

**Lo que hay.** El pin de `/search/map` trae `price`, `currency`, `price_usd`,
`rental_period`, `property_type` y `operation`: alcanza para colorear por
precio (`P2_PEDIDO_SEARCH_MAP.md` ya lo previó). No trae `deal_rating`,
`valuation_gap_pct`, `gross_yield_pct` ni `opportunity_score`: para colorear
por oportunidad, P2 tiene que sumar al pin al menos uno.

**A definir.**

1. Escala de precio: tramos del conjunto que se ve (decisión de
   presentación de P1) o `price_percentile` de P3 (caro contra similares, que
   ya es un juicio).
2. En venta, ¿precio total o por m²? El pin no trae superficie.
3. Qué es "oportunidad" en el mapa de Invertir (depende de B9).

**Para retomar:** respuestas a 1-3. El de precio se puede hacer sin P2.

---

## B13. Predicción — agregado el 2026-10-31, a futuro

**Origen.** German, 31/10: agregar predicción más adelante.

**Qué se podría predecir (a elegir uno para empezar).** Valor estimado de una
propiedad, evolución del m² de una zona, tiempo hasta venderse o alquilarse,
probabilidad de que baje de precio. (El alquiler esperado de una venta ya
existe como estimación: `estimated_monthly_rent`.)

**Requisito: historia.** `zone_stats` arranca el 17/08: al 31/10 son unas 11
semanas, y la tendencia por aviso todavía se calcula con 2. Una predicción
de precio defendible necesita bastante más (un año, por estacionalidad) y un
backtest antes de mostrarse. Se muestra como estimación, con su margen y el
aviso de estimación (`ESTIMATE_NOTICE`), nunca como dato.

**Para retomar:** B2 y B3 andando, una serie que alcance, y una sola
predicción para el piloto.

---

## B14. Destacados — agregado el 2026-10-31

**Origen.** German, 31/10: una sección de destacados.

**A definir primero: qué es un destacado.**

- **Pago:** una inmobiliaria o un dueño paga para que su aviso se vea más.
  La puerta de entrada ya existe: "Publicá tu propiedad" (WhatsApp).
- **Editorial:** FINDER elige, con datos de P3, lo que vale la pena ver
  (las oportunidades de la semana, las que bajaron de precio — B3) y lo
  muestra en la home.

**Restricciones vigentes.**

- La monetización figura **fuera de alcance** (`producto-p1.md`, CLAUDE.md):
  un destacado pago necesita una decisión que lo cambie.
- Un destacado nunca cambia el orden del criterio ni se cuenta en
  `total_matches` (regla 7). Va en su propio espacio y con la etiqueta
  "Destacado". Si no cumple lo que se buscó, es publicidad (B15).
- Hay que medirlo: impresiones y clicks por aviso (eventos nuevos). Quien
  paga va a pedir el reporte (B17).

**Lo que falta.** Dónde se marca el destacado y con qué vigencia (campo en
P2 o lista propia de P1), quién lo carga (no hay panel de administración ni
autenticación) y en qué lugares aparece (home, cabecera de resultados,
detalle).

---

## B15. Publicidad — agregado el 2026-10-31

**Origen.** German, 31/10: una sección de publicidad.

**A definir: de dónde sale.**

- **Venta directa:** banners de inmobiliarias, desarrolladoras, bancos
  (crédito hipotecario: el chip "Apto crédito" ya existe), mudanzas,
  escribanías. Imagen y link servidos por P1.
- **Red de anuncios** (tipo AdSense): menos trabajo de venta, menos control
  de lo que aparece.

**Restricciones vigentes.**

- Monetización fuera de alcance: misma decisión que B14.
- **La CSP:** `connect-src 'self'` y scripts con nonce. Un banner directo
  servido por P1 no la toca; una red de anuncios obliga a abrir
  `script-src`, `connect-src` y `frame-src` a terceros. Es una decisión de
  seguridad, no solo de diseño.
- Una red de anuncios pone cookies de terceros: aviso de consentimiento.
- La publicidad nunca imita una card ni va mezclada con resultados sin la
  etiqueta "Publicidad". Sin perder velocidad (`t_first_cards` se mide) ni
  aire en mobile (380 px).

**Para retomar:** decisión de monetizar, y elegir venta directa o red.

---

## B16. Usuarios registrados y alertas — agregado el 2026-10-31

**Origen.** German, 31/10: las alertas van cuando haya usuarios y la opción
de registrarse. Hoy autenticación, favoritos y alertas están fuera de
alcance.

**Qué entraría (a definir).** Registro, favoritos, búsquedas guardadas y
alertas ("avisame cuando aparezca…"): avisos nuevos que cumplen el criterio,
bajas de precio (B3) y oportunidades (B9). Por email o por WhatsApp (P2 ya
tiene canal de WhatsApp por Twilio).

**Lo que implica.**

- Hoy la sesión de P2 vive solo para una búsqueda (regla 1). Una búsqueda
  guardada es un criterio persistido que se vuelve a correr: es un cambio en
  P2.
- Un proceso que, con cada actualización de P3, compare las altas contra los
  criterios guardados y no repita avisos ya enviados.
- Datos personales: política de privacidad, baja de las alertas y la ley
  25.326 de protección de datos.

**Para retomar:** decisión de abrir el registro; con eso se ordenan
favoritos → búsquedas guardadas → alertas.

---

## B17. Panel de observabilidad — agregado el 2026-10-31, a futuro

**Origen.** German, 31/10: el panel de observabilidad completo, más
adelante.

**Lo que hay hoy.** El log propio de eventos (`logs/events-*.jsonl`, reporte
con `scripts/events-report.mjs`); el tablero `/interno/embudo` (búsquedas →
cards → card abierta → consulta, por día, con latencias, protegido con
`METRICS_TOKEN`); los eventos que P2 acepta de su enum cerrado (en Redis,
`finder:events`), y `/api/health?deep=1`.

**Lo que faltaría (a definir).** Un panel que junte P1, P2 y P3:

- **Producto:** consultas más frecuentes, sin resultados, aclaraciones, zonas
  y verticales más buscadas, embudo por vertical.
- **Técnica:** latencia de P2, errores, 404 de sesión, rate limit, uptime.
- **Datos:** frescura del crawler de P3 y cobertura de cada indicador por
  zona (lo que hoy se mide a mano, como en B1 y B9).
- **Negocio:** contactos por inmobiliaria e impresiones de destacados y
  publicidad (B14, B15).

**Restricción.** Con `connect-src 'self'` el browser no puede mandar eventos
a una herramienta externa (Amplitude y similares). Si se usa una, recibe los
eventos desde el server de P1, como hoy pasa con P2.

**Para retomar:** después de B14/B15 si se monetiza (el reporte para quien
paga define qué hay que medir).

---

## B18. Un portal nuevo como fuente (Inmoup) — agregado el 2026-10-31

**Origen.** German, 31/10: integrar otro portal; el candidato es Inmoup
(inmoup.com.ar, portal de Cuyo). *Nombre a confirmar: se dictó "IMOAP".*

**Lo que hay hoy.** En San Juan, P3 baja un solo portal: compraensanjuan
(`crawlers/compraensanjuan.py`; los demás crawlers del repo son del mercado
italiano, pausado). La cadena ya está pensada para varias fuentes: el aviso
se identifica por `(source, source_id)`, `deduplicate` consolida varios
avisos en una sola propiedad, y P3 tiene una skill `add-crawler` para sumar
un portal.

**Lo que implica (casi todo en P3).**

- **Crawler y parser** del portal nuevo, con sus fixtures.
- **Duplicados entre portales:** la misma casa publicada en los dos tiene que
  quedar como una sola propiedad, o el contador, los similares y las
  medianas de zona se inflan. Es la parte delicada.
- **Reglas que hoy son de compraensanjuan:** quién publica (cuenta comercial
  o personal), la baja que declara la fuente ("Suspendido:"/"Baja:") y el
  chequeo de vigencia de 24 h. Cada una necesita su equivalente.
- **Los indicadores se mueven:** más avisos cambian los conjuntos de
  similares, las medianas y la serie zonal. Conviene medir el antes y el
  después (como en las entregas de P3).
- **P1:** con dos avisos de una misma propiedad, decidir qué "Ver aviso
  original" y qué contacto se muestran, y si se dice de qué portal viene.
- **Términos de uso** del portal y su `robots.txt`.

**Para retomar:** medir antes cuántos avisos de San Juan tiene Inmoup y
cuántos ya están en compraensanjuan (si se superponen mucho, suma poco).
