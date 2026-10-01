# Plan 2026-09-29 — Card por vertical: Alquilar y Comprar primero

**Qué es este documento: el REGISTRO DE DECISIONES** (evidencia medida en §0,
las 21 decisiones cerradas con German el 29/09 en §1, la card objetivo en §2).
**No es la guía de ejecución.** Para ejecutar, un documento por proyecto:

| Proyecto | Documento |
|---|---|
| P1 (este repo) | `docs/GUIA_P1_2026-09-29_cards-por-vertical.md` |
| P2 (finder-core) | `docs/PEDIDO_P1_A_P2_2026-09-29.md` (se copia al repo de P2) |
| P3 (finder-pipeline) | `docs/PEDIDO_P1_A_P3_2026-09-29.md` (se copia al repo de P3) |

Las fases de §3 y la tabla de §4 fueron la primera versión del plan y quedaron
**superadas por esas tres guías**; se conservan como historia. Origen: sesión del 28-29/09 para redefinir qué muestra
la card según la vertical. Objetivo final: **un video demo con una consulta de
venta** cuyos resultados muestren valor real para decidir. El estado del
inmueble quedó diferido al backlog (`docs/BACKLOG.md`, B1).

Regla que gobierna todo (spec §5, reglas duras): P1 no calcula ni interpreta;
lo que la card muestra lo trae P2 con las piezas de P3. Por eso el plan tiene
una fase de P1 solo (lo que ya llega y no se muestra) y dos pedidos chicos.

## 0. Evidencia (28/09, P2 local `:8000`, DB `finder-pipeline-db-1`, corrida 2026-09-21)

Vivienda activa visible (casas y departamentos, tier ≥ 1, alquiler mensual).

| Indicador | Venta (2.456) | Alquiler (532) |
|---|---|---|
| Gap con ≥ 5 comparables | 79 % | 90 % |
| Gap fuera de ±35 % → `deal_rating: verify_data` | 32 % | 34 % |
| De esos, caros de verdad (gap < −35 %) | 18 % | 26 % |
| Renta mensual estimada (`estimated_monthly_rent`, en USD) | 96 % | 92 % |
| Yield bruto, mediana de la población | 7,8 % | — |
| Yield > 12 % en las 20 primeras de "casas en venta" | 18 de 20 (máx. 34 %) | — |
| Publicado hace más de un año | 34 % | 25 % |
| Con baja de precio en `master.price_snapshots` (mediana −7,9 %) | 305 | 149 |
| Celdas zona × dormitorios con ≥ 10 avisos: cobertura del inventario | 94 % | 84 % |
| Expensas, año de construcción | 0 % | 0 % |
| `quality_tier` | solo 0 · 1 · 2 (el sello "Datos completos" de P1 exige 3: nunca aparece) | |

Por qué el yield sale inflado: `renta_mensual_estimada` en venta es la mediana
de alquileres de la misma zona, tipo y dormitorios **sin banda de superficie ni
calidad**; una casa de 3 dorm. a US$ 48.500 en Capital hereda la renta de
casas de US$ 1.000/mes y muestra "Renta est. 22,4 %". Y como `gross_yield`
pesa 0,15 en el score de venta, las baratas suben con los yields más irreales.

Lo que ya existe y no se muestra: `zone_stats` de vivienda (6 semanas, por
zona, operación y bucket de dormitorios: mediana de precio y de m², muestra,
altas, bajas, bajas de precio, cap zonal) — P2 solo la lee para lotes;
`price_snapshots` (precio anterior de cada cambio) — P2 solo lo convierte en
la frase "el precio viene bajando".

## 1. Decisiones asumidas

1. **Comprar sin yield ni Reventa/Renta.** Los tres pasan a Invertir. Comprar
   es para quien va a vivir: precio, m² contra la zona, gap con comparables,
   negociación, crédito. (Score: ver decisión 19, ya no se muestra en ninguna
   card.)
2. **Alquilar con referencia en pesos** ("similares en la zona: $ X, N
   avisos") y **"muy por encima de similares" para gap < −35 %** en vez de
   "verificar datos"; `verify_data` queda solo para lo sospechosamente barato
   (gap > +35 %). En venta no se toca todavía.
3. **"Bajó de precio" es el primer pedido a P2**: mayor valor comercial por
   menor costo.
4. **Video:** el yield se esconde en Comprar ya (Fase 0). P3 arregla el pool
   de rentas después (Fase 2), y recién ahí Invertir lo vuelve a mostrar.
5. **Estado:** como chip solo los extremos declarados (a estrenar, en
   construcción, a refaccionar); "excelente/bueno" no se muestra. Todo lo demás,
   backlog B1.
6. **Sello "Datos completos": se elimina.** Tier 2 sigue significando "con
   mapa", no hace falta sello.
7. **Tags del LLM** (`semantic_qualities`): máximo uno en la card y solo si no
   hay atributos duros; "luminoso"/"amplio" no deciden nada.
8. **La referencia es SIEMPRE en dólares** (moneda de cálculo de AR desde el
   22/08; German, 29/09). Mostrar en pesos es presentación; ninguna
   comparación, tendencia ni gap se hace sobre pesos nominales. Medido el
   29/09: las subas de alquiler en pesos son 9,8 % en 27 días, o sea inflación,
   no tendencia. **Errata (30/09):** "o sea inflación" fue un supuesto, no
   una medición. Con el dólar oficial que guarda P3 (1.520 → 1.545 entre el
   21/08 y el 29/09, +1,6 %), una suba de 9 % en pesos sigue siendo de 8 % en
   dólares, y 38 alquileres quedan `alta` con razón
   (`docs/RESPUESTA_P3_A_P1_2026-09-29.md`). La decisión no cambia.
9. **"En alta / en baja" lo calcula P3, no P1 ni P2** (German, 29/09).
   Comparando el precio en USD de la propiedad contra el de las últimas N
   corridas (N entre 1 y 3, criterio a definir con German), con la cotización
   del día en que se observó cada precio. La propiedad llega marcada; P2 pasa
   los campos tal cual; P1 los muestra.
10. **Alquiler: la comparación es por precio mensual en USD contra la misma
   zona, tipo y dormitorios**, no por m² (decisión de P3 del 20/08: el m²
   cubierto falta en el 19 % de los alquileres y el inquilino piensa en el
   mensual). En venta sí es por m² sobre cubierta.
11. **Cómo se muestra la posición contra la zona (German, 29/09):** en la card
   la **tendencia** (en alta / en baja) y la **posición** como porcentaje o
   percentil con un gráfico chico; la referencia absoluta va al detalle.
   Comparables por radio (5 km) → backlog B7.
12. **Solo verde, nunca rojo (German, 29/09, decisión comercial):** ninguna
   inmobiliaria quiere ver su aviso en rojo. Se resalta en verde lo bueno para
   el usuario — posición más de 10 % por debajo de similares, y la flecha "en
   baja" —; todo lo demás (en línea, por encima, "verificar datos", "en alta")
   va neutro en la paleta de la marca, sin color de alarma. El número sigue
   diciendo la verdad ("12 % por encima"), solo no se pinta. Consecuencia para
   P3: el semáforo pasa a ser binario para la card (verde / neutro) con umbral
   +10 %; `deal_rating` sigue llegando completo para el detalle y la analítica.
13. **Barra de percentil sin texto en el medio (German, 29/09):** solo "más
   barato" y "más caro" en los extremos, la marca dice el resto.
14. **"Ver similares" en la card (German, 29/09):** link dentro del bloque de
   posición que abre los comparables. Hoy `GET /property/{id}` de P2 devuelve
   3 comparables por cercanía de precio en la misma zona y tipo
   (`get_comparables`, `LIMIT 3`), no el pool que usó P3 (dormitorios, banda
   de superficie, hasta 30). Fase 0: el link va al bloque de comparables del
   detalle tal como está. Fase 1 (P2): `get_comparables` con la MISMA regla
   del pool de P3 y límite 30. Pool exacto (ids persistidos por P3) → backlog
   B8.
15. **Sección "Zona" en la card, SOLO en Comprar (German, 29/09):** nombre de
   la zona, "m²" con el valor de la zona para ese tipo de propiedad y esos
   dormitorios (sin más texto: se entiende que es del tipo del aviso), y la
   tendencia de la zona: en suba = verde; estable o en baja = neutro. **En
   Alquilar no va**: ahí lo que va es la comparación contra las otras unidades
   de la zona (bloque de posición) y nada más. La tendencia zonal la calcula
   P3 sobre `zone_stats` (hoy `clasificar_temperatura_zona`, umbral ±2 %,
   ventana configurable, sin persistir) y llega marcada; P2 la pasa en
   `zone_ref`; P1 la muestra. Requisito confirmado por German: la base del m²
   es distinta por tipo de propiedad y por dormitorios → P3 tiene que sumar
   `tipo` al grano de `zone_stats` (hoy mezcla casas y departamentos). Medido
   el 29/09 con 6 semanas (17/08 → 21/09): Rivadavia 2 dorm. +3,8 % el m²,
   Rawson −5 a −10 % en todos los cortes, Capital plana.
16. **Lotes = Comprar con clase (German, 29/09):** la card de Lotes es la de
   Comprar con las mismas reglas 12 a 15, más lo que ya distingue el contrato
   del 13/09: sello "Lote urbano" / "Lote rural" sobre la foto; precio por m²
   en urbano y por hectárea en rural; superficie del lote y medidas si el
   aviso las da; posición contra lotes de la MISMA clase (P3 nunca compara
   urbano contra rural; rural partido por servicios declarados); chips solo
   con lo declarado (servicios y cuáles, loteo y nombre, apto construcción,
   zonificación); sección Zona con "m² US$ X" en urbano y "ha US$ X" en rural
   y la tendencia de la celda de su clase. Sin yield ni Reventa/Renta (no
   existen en lotes). Serie zonal de lotes: nace el 07/09, la primera semana
   es parcial (la bajada de lotes empezó el 13/09): la tendencia se lee desde
   el 14/09. Medido el 29/09: 63 lotes activos con baja de precio y 32 con
   suba; Santa Lucía urbano +2,4 % el m² en la última semana, Capital,
   Rivadavia y Pocito estables.
17. **Invertir = Comprar más rentabilidad en la sección Zona (German,
   29/09):** a la Zona de Comprar se le suman (a) el m² del aviso contra el m²
   de la zona con la diferencia en porcentaje, verde solo si está 10 % o más
   por debajo; (b) el **cap de zona** (`zone_stats.cap_zonal`: renta mediana
   anual ÷ precio mediano, por zona y dormitorios, solo con muestra ≥ 10 de
   los dos lados; hoy Capital 3 dorm. 7,8 %, 4+ 8,1 %, Rivadavia 2 dorm.
   6,4 %; Pocito y Santa Lucía sin cap en varios cortes); (c) el **alquiler
   estimado** de la propiedad (`estimated_monthly_rent`, mediana de
   alquileres similares de P3, en dólares) con la rentabilidad bruta que
   resulta. Vuelven los semáforos **Reventa** y **Renta** de P3 como dos
   pastillas, verde solo cuando son verdes, neutras si no. Orden de la
   vertical: por rentabilidad (`gross_yield_desc`). **Depende de la Fase 2.2
   de P3** (pool de rentas con banda de superficie): hoy la renta estimada
   de una casa barata hereda la de casas caras y da rentabilidades de 13 %
   o más; hasta ese arreglo, Invertir no sale al video.
18. **Lenguaje para el usuario y aviso de estimación (German, 29/09):** en
   la card no aparece ninguna sigla ni nombre interno (P2, P3, gap, cap,
   score components, "referencia en dólares"). Invertir dice "Podría
   alquilarse a ≈ US$ X/mes · según alquileres similares publicados en la
   zona", "Rentabilidad anual estimada X %" (un año de alquiler estimado ÷
   precio de este aviso; verde solo si iguala o supera el promedio de la
   zona) y "promedio de la zona Y %" (fijo para la zona, no depende del
   aviso). Los semáforos de inversión se leen "Para revender · …" y "Para
   alquilar · …". Toda card lleva el aviso "Valores estimados a partir de
   avisos publicados, no de operaciones concretadas. Son orientativos."
   Los textos de motivos que vienen de P3 se muestran tal cual (regla dura),
   así que el vocabulario de P3 también tiene que ser de usuario: va al
   pedido ("cap" → "rentabilidad promedio de la zona").
19. **Sin score visible en ninguna vertical (German, 29/09).** Reemplaza a
   la decisión 1: la card no muestra el `opportunity_score` en Alquilar,
   Comprar, Lotes ni Invertir. El dato sigue llegando de P2 (nada cambia en
   el contrato): ordena la lista y se muestra explicado en el detalle. En
   Invertir tampoco van las pastillas "Para revender" / "Para alquilar"
   (`resale_investment_rating`, `rental_investment_rating`): siguen llegando y
   quedan para el detalle. **Colores del bloque Zona:** el bloque es siempre
   neutro (lila); el color va solo en las pastillas: tendencia de zona (verde
   en suba), m² del aviso contra la zona (verde 10 % o más por debajo) y
   rentabilidad estimada (verde si iguala o supera el promedio de la zona).
   Regla general que queda: **un solo bloque con fondo verde por card, el de
   posición contra similares**; todo lo demás colorea pastillas.
20. **Una sola comparación por card (German, 29/09).** La Zona muestra el
   m² de la zona para el mismo tipo y dormitorios como referencia, SIN
   porcentaje. La única comparación es la del bloque de posición, contra los
   comparables de P3 (misma zona, tipo, dormitorios y superficie ±30 %). En
   Invertir se quitó la línea "este aviso X % por debajo de la zona". Motivo,
   medido el 29/09 con la casa de Salta pasando Chile (US$ 600/m², 250 m²
   cubiertos): comparables 707 US$/m² → 15 % por debajo; casas de 3 dorm. en
   Capital sin filtro de tamaño 857 → 30 % por debajo; celda zonal mezclada
   859 → 30 %. La diferencia entre 15 y 30 no es el tipo sino el tamaño: en
   Capital las casas grandes cuestan menos por m² que las chicas, y el pool
   de P3 filtra por superficie. Dos bases distintas no pueden convivir en
   la misma card. Los m² de zona del mockup en Comprar e Invertir ya son por
   tipo y dormitorios (casas 3 dorm. Capital 857, 4 dorm. 809, deptos 2
   dorm. Rivadavia 1.193, deptos 3 dorm. Capital 888), que es lo que P3 va a
   publicar cuando sume el tipo al grano de `zone_stats`.
21. **Zona y estimación en dos bloques (German, 29/09; ajusta 17 y 19).**
   El bloque **Zona** lleva solo valores de la zona: m² para el mismo tipo y
   dormitorios, y en Invertir la **rentabilidad promedio de la zona**
   (`cap_zonal`); **el bloque entero va en verde cuando la zona está en
   suba**, neutro si no. Debajo, en Invertir, un segundo bloque **"Esta
   propiedad · estimación", siempre neutro**: "Rentabilidad anual estimada
   X %" y "Podría alquilarse a ≈ US$ Y/mes", con la aclaración de que sale de
   alquileres similares publicados y de que la rentabilidad es un año de ese
   alquiler ÷ el precio del aviso. Sin porcentaje contra la zona (decisión
   20) y sin pastillas de inversión (decisión 19).

Mockup con avisos reales: https://claude.ai/artifact/WhK4y4TBe6DamiTtTb6geA
(privado, de German). **Alquilar: decisiones cerradas el 29/09** con las
reglas 8 a 14; el bloque de posición va con alto automático, sin tamaño fijo
(German, 29/09). Compra-venta: pendiente de cerrar.

## 2. Card objetivo

Orden de arriba a abajo. "Fase" dice cuándo puede verse.

### Alquilar (inquilino, no inversor)

| Línea | Fuente | Fase |
|---|---|---|
| **$ 430.000 /mes** (≈ US$ 278) | `price`, `currency`, `rental_period`, `price_usd` | hoy |
| Posición: **"31 % por debajo de similares en Rivadavia, 2 dorm."** + barra chica con el percentil (P3 = "entre los más baratos de 30") | `valuation_gap_pct`, `price_percentile`, `comparables_count`, `deal_rating` con la regla nueva | 0 (P1) · 1 (P2) |
| Tendencia: sello **En baja: antes US$ 300 (mostrado $ 480.000)** / **En alta** | `price_trend`, `previous_price_usd`, `price_change_pct` — los calcula P3 | 2 (P3) + 1 (P2 los pasa) |
| Detalle: "Similares en la zona: US$ 405 ($ 630.000), 30 avisos" | `estimated_monthly_rent` + conversión a pesos de P2 | 1 |
| Actualizado hace 2 días · (publicado hace 3 meses, margen para negociar) solo si > 60 días | `days_since_update`, `days_on_market` | 0 |
| Chips duros: Amoblado · Cochera · Patio · Barrio cerrado · Ascensor · A estrenar | atributos, `condition` extremos | 0 |
| Score con su primera razón, abajo y más chico | `opportunity_score`, `score_components` | 0 |
| Consultar · Ver aviso original · fuente | sin cambios | hoy |

Sin: chips Reventa/Renta, yield, contexto de mercado (repite la señal), tags
del LLM, "Datos completos".

### Comprar (para vivir)

| Línea | Fuente | Fase |
|---|---|---|
| **US$ 100.000** · US$ 667/m² | `price`, `price_per_sqm` | hoy |
| m² de zona, 4 dorm. en Rivadavia: **US$ 1.059** (312 avisos) | `zone_ref.median_price_per_sqm`, `sample`, `fallback` | 1 |
| Señal de precio: "34 % por debajo de 30 comparables en Rivadavia" | `primary_signal` / componente `gap_valuacion` | hoy |
| Tendencia: sello **En baja: antes US$ 110.000 (−9 %)** / **En alta** | `price_trend`, `previous_price_usd`, `price_change_pct` — los calcula P3 | 2 (P3) + 1 (P2 los pasa) |
| Publicado hace 40 días · actualizado hace 2 | fechas | hoy |
| Chips: Apto crédito · Cochera · Patio · Quincho · Pileta · A refaccionar | atributos, `condition` extremos | 0 |
| Score con su primera razón (el gap) | `opportunity_score`, `score_components` **sin `gross_yield`** | 0 (P1 oculta el chip) · 1 (P2 saca el componente) |
| Consultar · Ver aviso original · fuente | sin cambios | hoy |

Sin: "Renta est. X %", Reventa/Renta, tags del LLM, "Datos completos".
**Invertir** = Comprar + yield + cap zonal + Reventa/Renta, después de la Fase 2.

## 3. Fases (versión inicial, SUPERADA por las tres guías)

### Fase 0 — P1 solo, sin depender de P2 ni P3 (estimado: 2-3 días)

Todo con campos que ya llegan. Archivos: `src/components/PropertyCard.tsx`,
`src/lib/format.ts`, `src/lib/labels.ts`, `src/app/propiedad/[id]/page.tsx`,
`src/lib/p2/mocks.ts`, `src/app/globals.css` (ranuras de alto fijo),
prueba nueva `tests/e2e/card-vertical.spec.ts`.

1. La card recibe la vertical vigente y `operation`, y elige el layout
   Alquilar / Comprar (Invertir y Lotes conservan el actual por ahora).
2. Comprar: sin chip "Renta est.", sin RatingChips Reventa/Renta. El
   desplegable del score sigue listando lo que manda P2 (incluido `gross_yield`
   hasta la Fase 1): regla 4, ninguna señal sin explicación.
3. Alquilar: posición contra similares = porcentaje desde `valuation_gap_pct`
   con "similares en <zona>, N dorm." + barra chica de percentil desde
   `price_percentile` (0 = el más barato, 100 = el más caro de los
   `comparables_count`). El `verify_data` con gap negativo se etiqueta "muy
   por encima de similares" **en P1 solo como etiqueta**, sin cambiar el color
   ni el score que manda P2 (eso es Fase 1). La referencia absoluta
   (`estimated_monthly_rent`, en USD) va al detalle, no a la card.
4. Fechas: "actualizado" siempre; "publicado" solo si supera 60 días en
   alquiler / 90 en venta, con el texto "margen para negociar".
5. Chips: atributos duros + `condition` solo en `new`, `under_construction`,
   `needs_renovation`; `semantic_qualities` máximo 1 y solo si no hay duros.
6. Sacar "Datos completos" (card y detalle) y el bloque de "indicadores
   secundarios" del detalle (repite fechas y gap del score).
7. Detalle: mismo criterio por vertical en "Lectura de FINDER" e "Indicadores
   de mercado" (yield, renta estimada y relación alquiler/precio solo en
   Invertir).
8. Mocks: `estimated_monthly_rent` en alquiler, yields altos en venta, un
   `verify_data` con gap negativo en alquiler, para que las pruebas cubran
   cada rama. Pruebas mobile 380 px primero.

**Aceptación:** en "casas en venta en rivadavia" ninguna card muestra "Renta
est." ni Reventa/Renta; en "departamentos en alquiler en capital" toda card
con `estimated_monthly_rent` muestra la línea de similares; ningún
"Datos completos"; `npm run test:e2e` verde contra mocks y contra el P2 local.

### Fase 1 — Pedido a P2 (chico; hace falta para el video)

Pedido escrito: `docs/GUIA_CAMBIOS_2026-09-29_cards-por-vertical.md` §3 (autocontenido; se copia al repo de P2 como `PEDIDO_P1_A_P2_2026-09-29.md`). Lo de abajo es la versión inicial; manda la guía.

1. **Tendencia de precio, pasada tal cual desde P3** (no calculada en P2):
   `price_trend` (`up` · `down` · `null`), `previous_price_usd`,
   `price_change_pct`, `price_changed_at`, leídos de las columnas nuevas de
   P3 (Fase 2). Sin P3, los cuatro campos van `null`. P2 NO hace el join sobre
   `price_snapshots`: la tendencia es de P3 (decisión 9).
2. **`zone_ref`** en la card: `{median_price, median_price_per_sqm, sample,
   fallback, bucket}` de la semana vigente de `zone_stats` por zona, operación
   y bucket de dormitorios del aviso (mismo patrón que el CTE de lotes;
   `fallback` dice si es macro zona o provincia). Aceptación: 94 % de las
   ventas y 84 % de los alquileres con celda propia; el resto con `fallback`.
3. **`estimated_monthly_rent_ars`** en alquiler, para el detalle: conversión
   con la tasa de la corrida (`master.exchange_rates`), nunca en P1. La
   comparación sigue en USD (decisión 8); los pesos son solo presentación.
4. **Score de `compraventa` sin `gross_yield`** (renormalizar pesos); queda en
   `affitti_investimento`. Aceptación: el top 20 de "casas en venta" no cambia
   de forma sustancial en gap y percentil, y `score_components` no trae
   `gross_yield` en la vertical de compra.
5. **`deal_rating` en alquiler:** gap < −35 % deja de ser `verify_data`
   (es un aviso caro, no un dato dudoso) y pasa a `red` con motivo
   `sobreprecio`; `verify_data` solo para gap > +35 %. La card lo muestra
   neutro (decisión 12); el detalle y la analítica conservan el color.
   Aceptación: los 138 alquileres con gap < −35 % pasan de `verify_data` a
   `red`; los 42 con gap > +35 % siguen `verify_data`.
6. **Comparables del detalle con la regla del pool de P3** (decisión 14):
   `get_comparables` pasa de "misma zona y tipo, 3 más cercanos por precio" a
   la misma selección que usa P3 para el gap (zona, tipo, dormitorios; banda de
   superficie ±30 % en venta), con límite 30 y ordenados por precio en USD.
   Aceptación: para un aviso con `comparables_count = 30`, el detalle lista 30
   y la mediana de sus precios coincide con la referencia del gap.

Sin cambios de contrato en lo demás; todo aditivo (`extra="forbid"` no aplica
a la respuesta).

### Fase 2 — Pedido a P3 (la tendencia hace falta para el video; el pool, para Invertir)

Pedido escrito: `docs/GUIA_CAMBIOS_2026-09-29_cards-por-vertical.md` §4 (autocontenido; se copia al repo de P3 como `PEDIDO_P1_A_P3_2026-09-29.md`). Lo de abajo es la versión inicial; manda la guía.

1. **Tendencia de precio por propiedad, en USD** (decisiones 8 y 9): columnas
   nuevas en `master.properties` — `tendencia_precio` (`alta` · `baja` ·
   NULL), `precio_anterior_usd`, `variacion_precio_pct`, `fecha_cambio_precio`
   — calculadas en el step indicators comparando el `precio_usd` actual contra
   el de las **últimas N corridas** (N entre 1 y 3, a definir con German), con
   cada precio anterior convertido a USD **a la cotización del día en que se
   observó** (`master.exchange_rates`), nunca al cambio de hoy. Un cambio en
   pesos que en dólares queda dentro del umbral no es tendencia. Umbral y N
   son configuración de P3 (`config.py`, env), como todo lo demás. Reemplaza
   a `_fetch_tendencia_precios`, que hoy compara nominal en la misma moneda y
   solo alimenta la frase "el precio viene bajando". Estado de los datos al
   29/09 (nominal, misma moneda, vivienda activa): venta USD 191 bajas y 93
   subas, mediana ±7 %; alquiler ARS 71 bajas y 34 subas nominales, mediana
   7,7 % / 9,8 % — en dólares las subas en pesos van a desaparecer casi todas.
   Aceptación: ninguna propiedad marcada `alta` por una suba en pesos menor a
   la variación del dólar oficial entre las dos observaciones; las 191 bajas
   en USD de venta siguen marcadas `baja`.
2. **Pool de rentas para `renta_mensual_estimada` en venta con banda de
   superficie ±30 %** además de zona, tipo y dormitorios (la misma banda que
   ya usa el pool de venta). Aceptación: la mediana del yield del top 20 de
   "casas en venta" baja de 12 % a la vecindad del 7,8 % poblacional; ningún
   yield > 15 % sin un motivo `pocos_comparables_renta` o similar.

### Fase 3 — Video

Después de Fase 0 y Fase 1 en el stage. Guion sobre una consulta de venta
real, por ejemplo "casas en venta en rivadavia hasta 100 mil dólares". Gate
antes de grabar, sobre el top 20 de esa consulta:

- ningún "None"/"unknown"; ningún "Renta est."; ningún "Verificar datos" en
  el top 10;
- referencia de m² de zona visible en todas las cards con celda propia;
- al menos una card "En baja" en el top 20 (verificar con la DB del día; si
  no hay, elegir otra consulta). Depende de la Fase 2.1 de P3: si no llega a
  tiempo, el video sale sin tendencia y se graba de nuevo después;
- detalle con comparables, mapa y "Consultar" funcionando.

## 4. Impacto por capa (versión inicial, SUPERADA por las tres guías)

| Cambio | P1 | P2 | P3 | Tamaño |
|---|---|---|---|---|
| Card por vertical (Fase 0) | sí | — | — | chico |
| Tendencia en alta / en baja | render | pasar 4 campos | columnas nuevas, N corridas, en USD a la cotización del día observado | medio |
| `zone_ref` | render | leer `zone_stats` vivienda | ya existe | chico-medio |
| Renta estimada en pesos | render | conversión con tasa de la corrida | — | chico |
| Score de compra sin yield | — | pesos por vertical | — | chico |
| Alquiler caro = rojo, no verify | etiqueta | regla de scoring | — | chico |
| Pool de rentas con banda de superficie | — | — | `_select_comparables` para affitto en venta | medio |

## 5. Fuera de este plan

Estado del inmueble (fotos, rúbrica de texto, calificador del pool), panel
de zona con tendencia, orden/filtro por tendencia, expensas, cards de
Invertir y Lotes, búsqueda por viewport, comparables por radio (5 km):
`docs/BACKLOG.md`.
