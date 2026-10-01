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

---

## B6. Búsqueda por viewport del mapa

Ya planificada en `docs/PLAN_2026-08-31_busqueda-por-mapa.md`; bloqueada
porque la whitelist de `filters[]` de P2 no acepta `latitude`/`longitude`.

---

## B7. Comparables por radio (5 km a la redonda)

**Origen.** German, 29/09: además de la zona, ver cómo está la propiedad
contra las que la rodean en un radio (5 km, a definir). Hoy el pool de
comparables de P3 es por zona = departamento; con pin hay coordenadas en el
76 % de las ventas y el 79 % de los alquileres activos, así que un pool por
distancia es viable para la mayoría. Es un cambio en `_select_comparables`
de P3 (pool por radio con el mismo mínimo de 5), y P2/P1 no cambian salvo
para decir "contra N avisos a menos de 5 km" en la descripción del
componente. Regla que se mantiene: **la referencia siempre en dólares.**

**Para retomar:** después de la Fase 2 del plan (no tocar el pool dos veces)
y con una decisión sobre el radio y sobre qué pasa en las zonas alejadas,
donde 5 km pueden no juntar 5 comparables.

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
