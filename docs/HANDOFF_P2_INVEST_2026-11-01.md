# HANDOFF P2 → P1 · Análisis de inversión (`POST /search/invest`) y tools MCP · 2026-11-01

> Copia tal cual del handoff del equipo de P2 (recibido el 02/11). Lo que P1
> hizo con él: `docs/DECISION_2026-11-02_analisis-inversion.md`.

**Fecha:** 2026-11-01 · **Estado de P2:** implementado, probado contra la DB
real y los LLM reales, release gate con golden 138/138 y smokes en PASS,
**desplegado en el Docker local del 8000** (`finder-core`). En Railway queda
disponible con el próximo deploy de `develop` más las variables de §7.

Documento de ENTRADA para integrar la vertical **Invertir** con el análisis
en tres pasos pedido en `PEDIDO_P1_A_P2_2026-11-01.md`. Orienta y manda al
documento correcto: la fuente de verdad técnica es `API_CONTRACT.md` §9 (el
endpoint) y `MCP_INTEGRATION.md` (las tools). Las decisiones que se apartan
del pedido y las mediciones están en `RESPUESTA_P2_A_P1_INVEST_2026-11-01.md`
y `INVEST_RESULTADOS.md`. Los payloads de este documento son de una corrida
real contra el Docker del 8000 el 01/11 (`analysis_id 9cf2b2b8…`).

---

## 1. Qué integra P1

| Necesidad | Endpoint / tool de P2 | Dónde |
|---|---|---|
| Panel "Lectura de FINDER · inversión" (pasos, selección, tabla, prosa) | `POST /api/v1/search/invest` (SSE) | §3 de este doc; `API_CONTRACT.md` §9 |
| Cards de Invertir como hasta ahora | `POST /api/v1/search/stream` | sin cambios |
| Link del detalle desde Claude.ai / ChatGPT | `/propiedad/<id>?utm_source=mcp` | §6 |
| Tools MCP de inversión | `finder_invest_search`, `finder_zone_summary`, `finder_compare`, `finder_similar`, `search`/`fetch` | `MCP_INTEGRATION.md` |
| Batería de aceptación | `scripts/qa_invest.py` | §8 |

**Regla del flujo (decisión de German, 01/11):** en Invertir, P1 dispara las
dos cosas **en paralelo**: el stream de siempre (cards en < 1 s) y el análisis
(`/search/invest`). El análisis decide solo si tiene algo que agregar: para
una pregunta simple ("departamentos para invertir en Capital") responde
`skip` en ~1,5 s y P1 no muestra panel. Las otras verticales no lo llaman.

---

## 2. Qué hace P2 adentro (para saber qué esperar)

1. **plan** (LLM de extracción, ~1,3-2,1 s): tipo de pregunta y 1 a 6
   búsquedas `investment`. P2 sanea todo (whitelists, catálogo de zonas,
   vertical forzada, barrios → `place`, "usado" sin filtro de estado, lotes y
   locales descartados porque son otra vertical). Nunca 422: lo corregido
   queda en `plan.adjustments`.
2. **búsquedas** (sin LLM, 40-400 ms): en proceso, no consumen el rate limit
   de búsqueda. Por cada una, un resumen con recuentos de P3 (avisos, con
   rentabilidad sobre el universo entero, valor típico y rango, posición
   frente a similares, lecturas, tendencia). Candidatos: unión por puntaje de
   clase inversión, tope 12, cada búsqueda aporta al menos sus 3 mejores.
3. **redacción** (Opus 5.5, ~5-7 s): 3 a 6 picks **solo** de los candidatos
   con un `reason` ≤ 140 caracteres, y 60-130 palabras de prosa que pasan por
   la guardia oración por oración (números con respaldo, sin jerga, sin
   preguntas, sin "mala inversión", sin umbrales propios). La tabla
   `comparison` la arma P2 con los resúmenes, no el LLM.

Los juicios son los de P3 (`deal_rating`, lecturas para alquilar y reventa,
`zone_ref.trend`) con sus textos; P2 no agrega indicadores ni umbrales.

---

## 3. Contrato de `POST /api/v1/search/invest`

```http
POST /api/v1/search/invest
X-API-Key: <PORTAL_API_KEY>
Content-Type: application/json
Accept: text/event-stream

{ "query": "Tengo 80 mil dólares para invertir en San Juan y quiero comprar algo para alquilar. ¿Me conviene un departamento en Capital o una casa en Rivadavia? Priorizá la rentabilidad y que esté por debajo del precio de similares",
  "vertical": "invertir",
  "session_id": null }
```

`query` ≤ 500 caracteres; `vertical` solo `invertir` (o `investment`);
`session_id` es correlación para eventos, el análisis no lee ni escribe la
sesión. Respuesta HTTP 200 `text/event-stream`, bloques separados con
**CRLF**, igual que `/search/stream`. Orden de eventos:

```
plan → step* → picks → [comparison] → answer_chunk* → done
| skip
| error
```

### 3.1 `plan` (2,1 s en la corrida de ejemplo)

```json
{ "analysis_id": "9cf2b2b8-383e-4663-bece-9d4e87900d7a",
  "question_type": "comparacion",
  "steps": [ { "index": 1, "label": "Departamento en Capital hasta US$ 80.000" },
             { "index": 2, "label": "Casa en Rivadavia hasta US$ 80.000" } ],
  "note": null,
  "adjustments": null }
```

- `question_type`: `seleccion` · `comparacion` · `zona` · `propiedad`
  (`simple` nunca llega: es `skip`).
- `steps`: los pasos a pintar, en orden. Con resúmenes de zona hay un paso
  más, `"Resumen de N zonas"`.
- `note`: supuesto del plan para el usuario ("partí el presupuesto: 60 mil
  por departamento"), o null. Ya pasa por el filtro de vocabulario.
- `adjustments`: lo que P2 corrigió (zona desconocida descartada, barrio
  buscado como `place`, filtro no admitido…), o null. Es trazabilidad; se
  puede mostrar en chico o no mostrar.

### 3.2 `step` (dos por búsqueda)

```json
{ "index": 1, "status": "running", "label": "Departamento en Capital hasta US$ 80.000", "total_matches": null, "ms": 0 }
```
```json
{ "index": 1, "status": "done", "label": "Departamento en Capital hasta US$ 80.000",
  "total_matches": 206, "ms": 132.6,
  "params": { "vertical": "investment", "zones": ["capital"], "property_type": "apartment",
              "budget_max": 80000, "order": "gross_yield_desc", "limit": 50 },
  "with_yield": 148 }
```

`status` `running` | `done` | `failed` (con `error`). En `done` llegan
`params` (el criterio público aplicado, sirve para chips) y `with_yield`
(avisos con rentabilidad estimada en el universo entero). Los `done` pueden
llegar en otro orden que los `running` (corren en paralelo): pintar por
`index`.

### 3.3 `picks` (6,7 s)

`{ "cards": [ Card + { "reason": "…" } ] }`, 3 a 6 cards **completas**
(misma forma que las del evento `cards` de `/search/stream`: `price_ref`,
`zone_ref`, motivos, lecturas, `photo_url`, todo), el mejor primero. Recorte
de la primera de la corrida de ejemplo:

```json
{ "id": "18510ce8-59a6-4d83-b5af-0e8da0445a4c", "property_type": "apartment", "zone": "capital",
  "price": 38000, "currency": "USD", "price_usd": 38000.0, "area_sqm": 65, "bedrooms": 3,
  "opportunity_score": 93, "gross_yield_pct": 13.26, "estimated_monthly_rent": 419.88,
  "valuation_gap_pct": 32.54, "price_percentile": 6,
  "deal_rating": "green", "rental_investment_rating": "green", "resale_investment_rating": "green",
  "deal_rating_reasons": [ { "code": "subvaluado", "text": "Precio 33 % más bajo que avisos similares de la zona" } ],
  "zone_ref": { "zone": "capital", "property_type": "apartment", "bucket": "3", "trend": "down",
                "trend_pct": -2.08, "trend_weeks": 4, "cap_pct": 7.21, "sample": 112, "week": "2026-10-26", "…": "…" },
  "price_ref": { "level": "zona", "place": "capital", "value": 864.99, "unit": "sqm", "sample": 112, "bucket": "3" },
  "days_on_market": 107, "photo_url": "https://www.compraensanjuan.com/fotos_inmuebles/2656461_1.jpg",
  "reason": "Rentabilidad anual estimada 13,3 % y 33 % por debajo de avisos similares; lectura para alquilar verde" }
```

⚠️ La clave es **`reason`** (el pedido decía `motivo`): claves en inglés
como todo el contrato. Con menos de 3 candidatos llegan los que hay.

### 3.4 `comparison` (opcional, después de `picks`)

Llega cuando hay 2 o más búsquedas (en `comparacion` y también en una
`seleccion` entre departamentos y casas) o 2 o más zonas (`zona`, las con
rentabilidad primero). `columns` y `rows` vienen en lenguaje de usuario,
listos para dibujar; `raw` trae los números por fila para quien quiera
pintar otra cosa.

```json
{ "columns": ["Opción", "Avisos", "Con rentabilidad estimada", "Rentabilidad anual estimada (valor típico)",
              "Posición frente a avisos similares (valor típico)", "Tendencia de la zona"],
  "rows": [ ["Departamento en Capital hasta US$ 80.000", "206", "148 de 206 (72 %)", "9,1 %", "14 % por debajo de avisos similares", "en baja (-2,1 %)"],
            ["Casa en Rivadavia hasta US$ 80.000", "53", "2 de 53 (4 %)", "10,6 %", "35 % por debajo de avisos similares", "estable (-1,9 %)"] ],
  "raw": [ { "label": "Departamento en Capital hasta US$ 80.000", "total_matches": 206, "with_yield": 148,
             "yield_median_pct": 9.1, "yield_p25_pct": 8.6, "yield_p75_pct": 9.8, "valuation_gap_median_pct": 14.2,
             "zone_trend": "down", "zone_trend_pct": -2.08, "zone_cap_pct": 7.21 },
           { "…": "…" } ] }
```

### 3.5 `answer_chunk` (una oración validada por chunk, 6,9 s el primero)

```json
{ "text": "Según las lecturas, el departamento en Capital sale mejor parado para alquilar. " }
{ "text": "De los 206 encontrados, 148 tienen rentabilidad estimada, con valor típico de 9,1 % y la mitad entre 8,6 % y 9,8 %. " }
{ "text": "En casas en Rivadavia solo 2 de 53 la tienen, y la lectura para alquilar es amarilla en 48: Sin datos de rentabilidad de la zona. " }
{ "text": "Te conviene mirar el departamento de US$ 38.000 con 13,3 % de rentabilidad anual estimada y 33 % por debajo de avisos similares, y el de US$ 42.000 con 12 %. " }
{ "text": "En Rivadavia, la casa de US$ 80.000 tiene 10,1 % y está 34 % por debajo de avisos similares. " }
{ "text": "Tené en cuenta que en Capital la tendencia está en baja, -2,1 % en 4 semanas. " }
```

Concatenar tal cual (cada chunk termina en espacio). Sin markdown, sin
preguntas, sin jerga: ya está cuidado del lado de P2. **El aviso de
estimación lo pone P1 al pie**, siempre; P2 no lo repite.

### 3.6 `done` (9,1 s)

```json
{ "analysis_id": "9cf2b2b8-383e-4663-bece-9d4e87900d7a", "partial": false,
  "latency_ms": 9076, "latency_detail_ms": { "plan": 2055.8, "searches": 133.7, "write": 6867.3, "total": 9076.6 },
  "steps": [ { "index": 1, "status": "done", "label": "…", "total_matches": 206, "ms": 132.6, "params": { "…": "…" }, "with_yield": 148 }, { "…": "…" } ],
  "question_type": "comparacion",
  "model": "claude-opus-5-5", "plan_model": "claude-haiku-4-5-20251001",
  "prompt_versions": { "plan": "inv-plan-1.1", "write": "inv-write-1.1" },
  "usage": { "input_tokens": 8680, "output_tokens": 876, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 1529 },
  "cost_usd": 0.0506, "narrative": "llm", "candidates": 12, "dropped": null }
```

- `partial: true` = se venció el tiempo (`INVEST_TIMEOUT_S`, 45 s): lo que
  llegó es válido y el último `answer_chunk` es la oración fija "No alcancé
  a terminar el análisis.". Si no llegó al paso 3, los `picks` son los 3
  mejores por puntaje.
- `narrative`: `llm` · `llm_truncated` (prosa entera hasta la última oración
  completa) · `partial` · `fallback` (una oración fija sin prosa del LLM).
- `cost_usd` es una estimación por tabla de precios; `dropped` lista las
  oraciones que la guardia descartó, con el motivo (diagnóstico).

### 3.7 `skip` y `error`

```json
{ "analysis_id": "…", "reason": "simple" }
```
`reason`: `simple` (una búsqueda alcanza: el stream ya respondió) ·
`plan_timeout` (el plan no llegó en `INVEST_PLAN_TIMEOUT_S`, 8 s) ·
`plan_unparseable`. En los tres casos P1 no muestra panel y no reintenta.

```json
{ "code": "llm_unavailable", "status": 503, "message": "LLM provider no configurado (LLM_PROVIDER / LLM_API_KEY)." }
```
`code`: `llm_unavailable` (503) · `llm_error` (502). HTTP 200 como en
`/search/stream`. Un 401 (API key) o 429 (rate limit) llegan como HTTP, antes
del stream.

---

## 4. Comportamientos que P1 tiene que contemplar

- **Tiempos medidos** (local, 20 preguntas, dos pasadas): `plan` 1,3-2,1 s,
  `picks` 5,3-6,9 s, `done` 6-9,5 s (un caso de 14 s). Mensaje de espera
  sugerido: "Leyendo el mercado…" hasta `plan`, los pasos hasta `picks`,
  la prosa después. `skip` en 0,8-1,9 s.
- **Desconexión**: cerrar el SSE cancela en P2 las búsquedas y el stream del
  LLM; si el paso 3 no empezó, no se paga. Cerrar cuando el usuario cambia
  de pregunta es lo correcto.
- **Límites** (decisión de German, 01/11): la seguridad es la API key del
  portal; el cupo por visitante y su tope diario los pone **P1**. P2 no
  limita por IP (solo ve la del server de P1). P2 frena, con **429 antes de
  abrir el stream** y `Retry-After`:
  - por minuto, keyeado por el header **`X-Visitor-Id`** que P1 manda con
    cada request (un id estable por visitante; sin el header, un bucket
    global de 6/min para todo el sitio) → body `{"error": "Rate limit
    exceeded: 6 per 1 minute"}`;
  - por concurrencia (`INVEST_MAX_CONCURRENT`, 4 análisis en vuelo por
    proceso) → `{"detail": {"code": "busy", "message": "…"}}`, `Retry-After: 5`;
  - por día (`INVEST_DAILY_MAX`, 500 análisis por día UTC, compartido entre
    réplicas) → `{"detail": {"code": "daily_cap", "message": "…"}}`,
    `Retry-After` hasta las 00:00 UTC.
  Ante un 429, P1 no reintenta solo: muestra que el análisis no está
  disponible ahora y deja el flujo normal. Las preguntas `skip` también
  cuentan para los frenos (pagan el plan).
- **Preguntas que P2 no puede analizar**: lotes/terrenos/locales (otra
  vertical) → el plan los descarta; si no queda nada, `skip`. Otra provincia
  ("quiero invertir en Mendoza") → `skip`. Un barrio ("Trinidad") → se busca
  como `place` (lo dice `adjustments`).
- **Una opción sin resultados** en una comparación: el `step` llega `done`
  con `total_matches: 0`, la tabla trae la fila con "0" y "sin datos", y la
  prosa lo dice ("en Capital no encontré…").

---

## 5. Reglas de display

- Vocabulario: todo lo que arma P2 ya está en lenguaje de usuario
  ("rentabilidad anual estimada", "posición frente a avisos similares",
  "lectura del aviso / para alquilar / para reventa", "puntaje de
  oportunidad"). No traducir ni reescribir.
- `reason` de cada pick: una línea bajo la card; cita datos o lecturas de
  P3 de ese aviso.
- `note` y `adjustments` del plan: opcionales; `note` es para el usuario,
  `adjustments` es diagnóstico.
- `params` de cada `step`: el criterio público, el mismo vocabulario de
  `/search/structured`; sirve para chips o para "ver estos avisos" (es un
  body válido de `/search/structured` con `limit`/`offset`).
- `comparison.rows` ya viene formateada; `raw` es para gráficos.

---

## 6. MCP (lo que cambia para Claude.ai y ChatGPT)

- Link del detalle: `FINDER_FRONTEND_URL` + `/propiedad/<id>?utm_source=mcp`
  (antes `/dettaglio/<id>`, 404 en producción). P1 mantiene la redirección
  `/dettaglio/:id → /propiedad/:id` para clientes que lo tengan cacheado.
- Vocabulario de usuario en cards, detalle, explicación del puntaje e
  `instructions` del server (sin "Opportunity Score", "semáforo",
  "comparables").
- `finder_search` con `vertical: "invertir"` usa la vertical `investment`
  real; y con `query` + `vertical` ya no pierde la consulta (antes el chip
  pisaba el texto).
- Tools nuevas, todas con texto es-AR compacto + `structuredContent`, fotos
  por URL: `finder_invest_search`, `finder_zone_summary`, `finder_compare`,
  `finder_similar`, `search` / `fetch` (forma de deep research de OpenAI).
  `finder_invest_analysis` existe pero solo se registra con
  `MCP_INVEST_ANALYSIS_ENABLED=true` (decisión 6: apagada hasta tener OAuth).
  Verificadas en el Docker del 8000 el 01/11 (`tools/list` las lista;
  `finder_zone_summary` responde). Detalle: `MCP_INTEGRATION.md`.

---

## 7. Configuración en Railway (P2)

| Variable | Valor | Para qué |
|---|---|---|
| `RATE_LIMIT_INVEST` | `6/minute` (default) | por minuto, por `X-Visitor-Id` (global sin header), ver §4 |
| `INVEST_MAX_CONCURRENT` | `4` (default) | análisis en vuelo a la vez, por proceso |
| `INVEST_DAILY_MAX` | `500` (default) | tope diario UTC, el techo de gasto (≈ US$ 25/día con Opus) |
| `INVEST_LLM_MODEL` | `claude-opus-5-5` (default) · `claude-sonnet-5-5` | modelo de redacción; Sonnet = mitad de costo, redacción algo más seca (`INVEST_RESULTADOS.md` §4.2) |
| `INVEST_LLM_EFFORT` | `low` (default) | esfuerzo del modelo de redacción |
| `INVEST_TIMEOUT_S` | `45` (default) | tiempo total; vencido → `done.partial` |
| `INVEST_PLAN_TIMEOUT_S` | `8` (default) | presupuesto del plan; vencido → `skip` |
| `FINDER_FRONTEND_URL` | `https://paradisofinder.com` (default nuevo) | links del MCP |
| `MCP_INVEST_ANALYSIS_ENABLED` | `false` (default) | el pipeline entero por MCP |

Ninguna es obligatoria: los defaults son los medidos. `LLM_API_KEY` es la
misma de siempre (los dos pasos usan la cuenta de Anthropic de P2).

---

## 8. Cómo verificarlo (P1)

Contra el Docker local del 8000, o contra staging/producción con la API key:

```bash
# la aceptación de P1 (§4 del pedido): 6 preguntas, forma del SSE, picks, vocabulario, latencias, desconexión
.venv/bin/python scripts/qa_invest.py --base-url http://localhost:8000

# el golden de 20 consultas de usuario con expectativas de plan y prosa
.venv/bin/python scripts/qa_invest.py --base-url https://<p2> --api-key "$FINDER_API_KEY" \
  --golden tests/invest_evaluation/golden_invest.json --label prod
```

Deja `tests/reports/invest_qa_<ts>.md` con veredicto, tabla por pregunta,
latencias p50/p90 y la prosa de cada análisis. Un `curl` mínimo:

```bash
curl -N -X POST http://localhost:8000/api/v1/search/invest \
  -H "Content-Type: application/json" -H "Accept: text/event-stream" \
  -d '{"query":"qué conviene comprar para invertir en Pocito","vertical":"invertir"}'
```

---

## 9. Decisiones abiertas (German) y pendientes

1. **Chip Invertir de la web**: hoy el stream sigue en compra ordenada por
   rentabilidad (clase de score compra), y el análisis puntúa con la clase
   inversión. Si el chip pasa a `vertical_override: "investment"`, toda la
   pantalla de Invertir usa un solo criterio. Es un cambio chico en P1 (el
   valor del chip) y nada en P2.
2. **Valores de los frenos de P2** (`INVEST_MAX_CONCURRENT`, `INVEST_DAILY_MAX`,
   `RATE_LIMIT_INVEST`): los defaults son 4 / 500 / 6 por minuto por
   visitante; ajustar según el tráfico real.
3. **Golden de 20 de German** (§4.5 del pedido): la batería lo corre con
   `--golden`; el de P2 es un punto de partida.
4. **OAuth en `/mcp`** antes de encender `finder_invest_analysis`.

---

## 10. Referencias

- `API_CONTRACT.md` §9 — contrato del endpoint, evento por evento.
- `MCP_INTEGRATION.md` — tools, parámetros, salidas.
- `RESPUESTA_P2_A_P1_INVEST_2026-11-01.md` — decisiones respecto del pedido y aceptación.
- `INVEST_RESULTADOS.md` — golden de 20, Opus vs Sonnet, fallas y correcciones.
- `tests/reports/invest_qa_20261101_*.md` — corridas; `release_gate_20261101_141835.md` — gate.
