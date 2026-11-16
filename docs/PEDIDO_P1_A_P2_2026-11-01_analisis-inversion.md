# Pedido de P1 a P2 — Análisis de inversión (pipeline en tres pasos) y tools MCP de inversión — 2026-11-01

**Para: el equipo de P2 (finder-core). Autocontenido: se copia tal cual al repo
de P2 cuando German lo apruebe.** Estado: **borrador**; las decisiones que
siguen abiertas están en §6 con el valor por defecto que P1 asume.

Origen: German, 01/11. La vertical **Invertir** tiene que responder preguntas
de decisión ("tengo 80 mil, ¿depto en Capital o casa en Rivadavia para
alquilar?", "¿en qué zona conviene invertir?") con una **respuesta en prosa y
las propiedades más acordes**, no con un listado ordenado por rentabilidad.
Decisión de arquitectura de German del mismo día: **la inteligencia vive en el
core**. P2 planifica, consulta y redacta; P1 muestra. Las mismas funciones
sirven después a las tools MCP para Claude.ai y ChatGPT.

Las reglas que valen: **P3 calcula, P2 expone, P1 muestra.** Este pedido no
agrega indicadores ni umbrales: todo número sale de lo que P3 ya calculó y P2
ya sirve. Los juicios ("conviene", "está cara", "la zona sube") son los de P3
(`deal_rating`, `rental_investment_rating`, `resale_investment_rating`,
`zone_ref.trend`) con sus textos tal cual.

Evidencia completa y propuesta de producto: `docs/PLAN_2026-11-01_invertir-agente-mcp.md`
del repo de P1 (§0 y §3).

---

## 0. Qué vio P1 (01/11, P2 local `:8000`)

1. Con la pregunta *"Tengo 80 mil dólares para invertir en San Juan y quiero
   comprar algo para alquilar. ¿Me conviene un departamento en Capital o una
   casa en Rivadavia? Priorizá la rentabilidad y que esté por debajo del
   precio de similares"*, la **extracción** sale bien (`zones: [capital,
   rivadavia]`, `budget_max: 80000`, `order: gross_yield_desc`,
   `semantic_query: "para alquilar, subvaluada respecto de la zona"`), pero el
   **turno** la aplana en una sola búsqueda de 490 resultados con el texto
   template. No compara ni elige.
2. **`vertical: "investment"` funciona por `/search/structured`** (384
   departamentos en Capital; `score_components` trae `gross_yield`, clase
   `inversion`). El canal conversacional la mapea a `compraventa` + "para
   invertir" (`_VERTICAL_OVERRIDES`), así que la web nunca usó ese score.
3. Cobertura (vivienda en venta activa, 2.345): rentabilidad estimada en 874
   (37 %) y **solo en Capital 58 % · Rivadavia 45 % · Santa Lucía 24 % ·
   Rawson 10 %**; cero en las otras 15 zonas. Comparación de precio en el
   84 %. Mediana 7,7 %, máxima 18,6 %. Semáforos de inversión en las 874.
4. El `/mcp` de P2 arma el link del detalle como `/dettaglio/<id>`: en
   producción es 404 (P1 sirve `/propiedad/<id>`). El texto dice
   "Opportunity Score N/100", jerga que P1 sacó el 29/09.

---

## 1. Endpoint nuevo: análisis de inversión por SSE

**Qué.** `POST /api/v1/search/invest` (nombre a gusto de P2), con auth de
portal como el resto de `/api/v1/*`. Request:

```jsonc
{ "query": "texto crudo del usuario, ≤ 500 chars",
  "vertical": "invertir",            // único valor en esta fase
  "session_id": "<uuid> | null" }    // solo correlación (eventos); el análisis es stateless
```

Respuesta: SSE con **CRLF** como `/search/stream`. Tres pasos, siempre en
este orden:

### 1.1 Paso 1 — Planificar (LLM, salida JSON, objetivo ≤ 4 s)

El LLM lee la pregunta y produce:

```jsonc
{ "question_type": "seleccion | comparacion | zona | propiedad | simple",
  "searches": [                      // 1 a 6; vacío si "simple"
    { "label": "Departamentos en Capital hasta US$ 80.000",
      "params": { "vertical": "investment", "zones": ["capital"], "property_type": "apartment",
                  "budget_max": 80000, "currency": "USD", "filters": [], "semantic_query": null,
                  "near": null, "order": "opportunity_score", "limit": 50 } } ],
  "zone_summaries": ["capital", "rivadavia"],   // opcional, para preguntas de zona/comparación
  "note": "qué asumió (p. ej. 'sin tipo: miré casas y departamentos')" }
```

- `params` es un `StructuredSearchRequest` válido con **`vertical: "investment"`
  forzado** por P2 (no por el LLM) y `limit ≤ 50`. Lo que el LLM escriba
  fuera de la whitelist se descarta como hoy en `_validate` (nunca 422 al
  cliente: se corrige o se omite y se anota en `note`).
- **`question_type: "simple"`** cuando una sola consulta alcanza y no hay
  comparación, elección ni pregunta de zona ("departamentos para invertir en
  Capital"): P2 emite `skip` y cierra. Es la puerta que evita pagar y esperar
  donde el flujo normal ya responde. P1 llama al endpoint en todo Invertir y
  confía en esta decisión.
- Modelo: el extractor de producción (hoy Haiku 4.5) alcanza para planificar;
  es un trabajo pariente de la extracción. Variable propia por si P2 prefiere
  otro.

### 1.2 Paso 2 — Ejecutar (sin LLM, en proceso)

- Cada `search` corre contra el servicio de búsqueda estructurada **en
  proceso** (`app.core.structured_search`), no por HTTP: así no consume el
  `rate_limit_search` del sitio. Devuelve `total_matches` y las cards.
- Por búsqueda, P2 arma un **resumen del conjunto encontrado**: cantidad, con
  rentabilidad, mediana y rango de `gross_yield_pct`, mediana de
  `valuation_gap_pct`, conteo por `deal_rating` y por los dos semáforos de
  inversión, `zone_ref` (tendencia, `cap_pct`, muestra) y `price_ref` de la
  primera card. Son recuentos de números de P3 sobre lo encontrado, rotulados
  así; **no son indicadores nuevos** y no se persisten.
- `zone_summaries`: lo mismo por zona (una búsqueda `investment`, `limit:
  100`, sin tipo ni presupuesto salvo que la pregunta los fije), hasta que
  exista un endpoint de `zone_stats` de vivienda (fuera de este pedido).
- **Candidatos**: la unión de las cards de todas las búsquedas, sin
  duplicados, ordenada por `opportunity_score` de clase inversión (el que P2
  ya calcula), tope 12, con la card **completa** (misma forma que el evento
  `cards` de `/search/stream`: `price_ref`, `zone_ref`, motivos, semáforos,
  `photo_url`, todo). Es lo que lee el paso 3 y lo que P1 pinta.

### 1.3 Paso 3 — Redactar (LLM en streaming, con guard)

Entrada: la pregunta, el plan con su `note`, los resúmenes por búsqueda y por
zona, y los 12 candidatos en forma compacta (id, zona, tipo, precio USD, m²,
dormitorios, rentabilidad y renta estimada, posición frente a similares y
percentil, `deal_rating` + textos, semáforos de inversión + textos, tendencia
y rentabilidad de la zona, referencia de precio, días publicado).

Salida, en este orden:

1. **`picks`**: 3 a 6 ids **de los candidatos** (nunca otros), cada uno con
   `motivo` ≤ 140 caracteres que cite un motivo de P3 ("Un 16 % por debajo de
   avisos similares y rentabilidad estimada del 14 %"). P2 adjunta la card
   completa de cada pick.
2. **`comparison`** (opcional, solo `comparacion` y `zona`): una tabla
   estructurada `{columns: [...], rows: [...]}` con los valores de los
   resúmenes del paso 2 (opción, avisos, con rentabilidad, rentabilidad
   mediana, posición mediana, tendencia de la zona). P1 la dibuja.
3. **`answer_chunk`**: la prosa, por chunks. Entre 60 y 150 palabras. Pasa
   por `narrative_guard` **oración por oración** con la whitelist de números
   armada con TODAS las cards y resúmenes del paso 2 (no solo las 20 de un
   turno): una oración con un número sin respaldo se descarta, como hoy.

**Reglas de la prosa** (van al prompt; P1 las verifica en el golden set):

- Cada número sale de una card o de un resumen. Nada de memoria del modelo.
- Los juicios son los de P3, con sus textos. **Sin umbrales propios** ("más
  de 8 % es bueno"), sin "mala inversión", sin "no compres". Lo que está por
  encima de similares se dice en neutro, con el texto de P3.
- Puede describir el conjunto ("de los 48 departamentos encontrados, la mitad
  tiene rentabilidad estimada entre 6 y 9 %"), siempre rotulado como lo
  encontrado.
- **Zona sin rentabilidad: se dice en la primera oración** ("En Pocito ningún
  aviso tiene rentabilidad estimada: no hay alquileres similares publicados
  con los que estimarla") y se sigue con posición frente a similares,
  tendencia de la zona y referencia de precio.
- No cambia zona, tipo ni presupuesto del usuario en silencio; si el plan
  amplió, lo dice (la `note` del paso 1).
- Vocabulario de usuario (el de P1): "Posición frente a avisos similares",
  "Rentabilidad anual estimada", "Podría alquilarse a ≈ US$ N/mes",
  "Referencia de precio de la zona", "Avisos similares". **Nunca** "gap",
  "percentil", "yield", "Opportunity Score", "semáforo", "cap", "comparables",
  "mediana" (decir "la mitad", "entre X e Y").
- es-AR, "vos". Sin preguntas al usuario (no hay repregunta en este modo).
- El aviso de estimación lo agrega **P1** al pie, siempre; P2 no lo repite.

### 1.4 Eventos SSE

| Evento | Payload | Cuándo |
|---|---|---|
| `plan` | `{analysis_id, question_type, steps: [{index, label}], note}` | al terminar el paso 1 (no "simple") |
| `step` | `{index, status: "running" \| "done" \| "failed", label, total_matches, ms}` | dos por búsqueda (al empezar y al terminar) |
| `picks` | `{cards: [Card + {motivo}]}` | inicio del paso 3 |
| `comparison` | `{columns, rows}` | opcional, después de `picks` |
| `answer_chunk` | `{text}` | prosa por chunks |
| `done` | `{analysis_id, partial, latency_ms, steps, model, usage: {input_tokens, output_tokens, cache_read_input_tokens}, cost_usd?}` | siempre al final |
| `skip` | `{analysis_id, reason: "simple"}` | pregunta simple; cierra sin `plan` |
| `error` | `{code, message}` | como en `/search/stream`; HTTP 200 |

Orden: `plan → step* → picks → [comparison] → answer_chunk* → done`, o
`skip`, o `error`. Sin `response_chunk` ni `cards`: es otro canal, P1 no
confunde los dos.

### 1.5 Límites y comportamiento

- **Tiempo total ≤ 45 s** en el server: vencido, P2 corta y emite `done` con
  `partial: true` después de lo que haya (si no llegó al paso 3, `picks` con
  los 3 mejores candidatos por score y una oración fija "No alcancé a
  terminar el análisis").
- **Desconexión del cliente** (P1 cierra el SSE porque el usuario buscó otra
  cosa): P2 cancela las búsquedas pendientes y el stream del LLM. Es la
  diferencia entre pagar y no pagar el paso 3.
- Máximo 6 búsquedas por plan, `limit ≤ 50`; 12 candidatos al paso 3.
- Rate limit propio del endpoint (`RATE_LIMIT_INVEST`, propuesta 6/min por
  IP), independiente de `rate_limit_search`. P1 además pone cupos por
  visitante y un tope diario (lo suyo).
- Modelo del paso 3 por variable (`INVEST_LLM_MODEL`). P1 propone Claude
  Opus 5.5 (`claude-opus-5-5`); Sonnet 5.5 (`claude-sonnet-5-5`) si la
  latencia pesa más que el matiz. Costo estimado por análisis con dos
  llamadas (planificar con el extractor actual, redactar con ~15 k tokens de
  entrada y ~1,5 k de salida): ≈ US$ 0,10 con Opus 5.5, ≈ 0,07 con Sonnet 5.5.
  Es más barato y más controlable que un agente con bucle libre de tools
  (6-8 idas al modelo).
- Observabilidad: P2 registra el análisis a su manera (query, `question_type`,
  búsquedas, latencia, `usage`, `partial`, cancelado sí/no). P1 registra lo
  suyo en su log. Si P2 quiere sumarlo al enum de `/events`, P1 lo manda.
- **Solo Invertir, y solo si la pregunta lo pide.** Alquilar, Comprar y Lotes
  siguen con el flujo de siempre (cards en ~85 ms). No se toca
  `/search/stream`.

### 1.6 Qué NO (reglas duras de la spec)

No recalcular indicadores ni umbrales; no traducir ni reescribir los textos
de P3; null ≠ 0 y null ≠ "malo"; precios comparados solo en `price_usd`;
alquileres solo con el mismo `rental_period`. P1 no parsea `answer_chunk`:
por eso `picks` y `comparison` van estructurados.

---

## 2. Tools MCP de inversión (fase siguiente, mismas funciones)

Sobre el `/mcp` existente, con las funciones del §1.2 (búsqueda `investment`
en proceso, resúmenes, comparación):

| Tool | Hace | Salida |
|---|---|---|
| `finder_invest_search` | búsqueda `investment` con los parámetros de §1.1 (`zones`, `property_type`, `budget_*`, `filters` de la whitelist, `semantic_query`, `near`, `order`, `limit ≤ 20`) | texto es-AR compacto por card + `structuredContent` con ids, precios, indicadores y link `https://paradisofinder.com/propiedad/<id>?utm_source=mcp`; **fotos por URL, no base64** |
| `finder_zone_summary` | el resumen de zona del §1.2 | texto + `structuredContent` |
| `finder_compare` | 2 a 4 ids, los campos de §1.3 lado a lado | tabla en texto + `structuredContent` |
| `finder_similar` | los similares del detalle (`comparables_pool` + 5 de superficie más parecida) | texto + ids |
| `search` / `fetch` | alias para que ChatGPT lo acepte como fuente de *deep research* (`search(query)` → `{id, title, url}[]`; `fetch(id)` → el detalle) | según la forma que pide OpenAI |

Además, en lo que ya existe:

- **Link del detalle**: `FINDER_FRONTEND_URL=https://paradisofinder.com` y
  path `/propiedad/<id>` (hoy `/dettaglio/<id>` → 404). P1 agrega igual una
  redirección `/dettaglio/:id → /propiedad/:id` para los clientes que ya lo
  tengan cacheado.
- **Vocabulario**: las reglas de §1.3 en `format_card_for_llm`,
  `format_property_detail_for_llm` y en `instructions` del server ("Score
  78/100" → "puntaje de oportunidad 78 de 100, explicado por…"; sin
  "Opportunity Score", "semáforo", "gap").
- `finder_search` con `vertical: invertir` debería usar la vertical
  `investment` real (score de clase inversión), no `compraventa` + frase.
- **`finder_invest_analysis`** (corre el pipeline del §1 y devuelve la
  respuesta armada): tentador, pero cuesta tokens a FINDER por cada llamada
  de cualquier cliente del mundo. **Apagado por defecto** (variable) hasta
  tener OAuth o cuota por cliente.

---

## 3. Configuración que P1 necesita de P2 en Railway

| Variable | Para qué |
|---|---|
| `RATE_LIMIT_INVEST` | el endpoint nuevo (propuesta 6/min por IP de P1) |
| `INVEST_LLM_MODEL` | modelo del paso 3 |
| `INVEST_TIMEOUT_S` | 45 por defecto |
| `FINDER_FRONTEND_URL` | `https://paradisofinder.com` (MCP) |

`rate_limit_search` no cambia: el pipeline no pasa por HTTP.

---

## 4. Cómo lo verifica P1 (aceptación)

Contra el Docker local de P2 (`P2_MODE=live`), sin mocks (German, 03/10).

1. **Simple**: "departamentos para invertir en Capital" → `skip` en ≤ 3 s.
2. **Comparación** (la pregunta de §0.1): `plan` con 2 búsquedas (`question_type:
   comparacion`), `picks` de 3 a 6 con card completa y `motivo`, `comparison`
   con dos filas, prosa que nombra las dos opciones con números presentes en
   los resúmenes o cards, `done` con `usage`. `plan` ≤ 4 s; `done` ≤ 45 s.
3. **Zona sin rentabilidad**: "qué conviene comprar para invertir en Pocito"
   → la primera oración dice que no hay rentabilidad estimada; los `picks`
   traen `deal_rating` o posición frente a similares y su motivo lo cita.
4. **Zona**: "en qué zona de San Juan conviene invertir en departamentos" →
   `zone_summaries` de al menos las 4 zonas con rentabilidad, prosa que
   nombra cuáles tienen y cuáles no.
5. **Guard**: en el golden set de 20 preguntas (las escribe German), 0
   oraciones con números sin respaldo; 0 palabras prohibidas (§1.3); 0 picks
   fuera de los candidatos.
6. **Desconexión**: P1 cierra el SSE al recibir `plan` → P2 registra la
   cancelación y **no** llama al LLM del paso 3 (se ve en el log de `usage`).
7. **Tiempo**: `INVEST_TIMEOUT_S=5` → `done.partial: true` con picks y la
   oración fija.
8. **Latencia** del golden set: p50 y p90 de `plan` y de `done`, para fijar
   el mensaje de espera de P1.

---

## 5. Qué hace P1 (para que P2 sepa qué hay del otro lado)

Route handler `/api/invest/analysis` que reenvía el SSE; el análisis corre en
paralelo a la búsqueda normal (que sigue pintando cards en menos de un
segundo); panel "Lectura de FINDER · inversión" con pasos, selección, tabla,
prosa y el aviso de estimación; interruptor por entorno, caché por consulta,
cupos por visitante y tope diario; eventos propios; redirección de
`/dettaglio`. Detalle en el plan de P1, §4.

---

## 6. Decisiones abiertas (German) y lo que P1 asume mientras tanto

| # | Decisión | Valor por defecto en este pedido |
|---|---|---|
| 1 | Nombre y path del endpoint | `POST /api/v1/search/invest`, a gusto de P2 |
| 2 | `comparison` estructurada | sí, opcional, solo `comparacion` y `zona` |
| 3 | Modelo del paso 3 | Opus 5.5; Sonnet 5.5 si la latencia pesa |
| 4 | Tiempo máximo | 45 s |
| 5 | Prosa | 60 a 150 palabras, sin repregunta |
| 6 | `finder_invest_analysis` por MCP | apagado hasta tener auth |
| 7 | Orden de entrega | §1 primero (la web lo usa ya); §2 después, con las mismas funciones |
