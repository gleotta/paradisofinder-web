# API_CONTRACT.md — Contrato de la API de P2 (finder-core) para P1

**Versión 2026-09-13** (QA de producción del 7/9: score recalibrado, filtros
duros/blandos, orden por intención, vigencia, vertical de lotes, narración
honesta, latencia). Reemplaza como fuente de verdad a
`docs/P1_INTEGRATION_SPEC.md` (2026-09-01) donde difieran; el Swagger vivo
(`/docs`) sigue siendo la referencia del shape completo. **Todos los cambios
de este cierre son ADITIVOS**: nada de lo que P1 consumía se renombra ni se
quita; lo que cambia de comportamiento está marcado ⚠️.

Mercado activo: `san_juan` (es-AR). Prefijo `/api/v1/`. Auth y rate limits:
sin cambios (`X-API-Key` server-to-server; búsqueda 30/min por IP).

---

## 1. Qué lee P2 (la vista sobre `master`)

P2 lee `master.properties` directo, sin vistas ni tablas de conteo, con el
filtro base del contrato P3→P2:

```
is_active = TRUE AND quality_tier >= 1 AND citta = 'san_juan'
```

`is_active = TRUE` equivale a `status = 'active'` (contrato P3 §1.3). Sobre
esa vista, por vertical:

| vertical (API) | interna | `operazione` | compuerta de clase |
|---|---|---|---|
| `sale` | `compraventa` | `vendita` | `tipo IN (appartamento, casa_indipendente, villa, attico, penthouse)` y NO unidad diminuta (`appartamento` con `superficie_cubierta < 15`) |
| `investment` | `affitti_investimento` | `vendita` | ídem `sale` |
| `rent` | `affitti_residenza` | `affitto` | vivienda, sin temporarios: `tipo <> 'stanza' AND (periodicidad IS NULL OR periodicidad = 'mes')` y NO unidad diminuta |
| `temporary_rent` | `affitti_temporario` | `affitto` | `tipo = 'stanza' OR periodicidad IN ('dia','semana') OR unidad diminuta` |
| **`land`** (nuevo) | `lotes` | `vendita` | `tipo = 'terreno'` (+ `land_class` opcional) |

⚠️ **`property_type` es la CLASE, sin agregados** (contrato P3 §10). `house`
= `casa_indipendente`, `apartment` = `appartamento`. Hasta el 12/09 la API
sumaba `OR es_duplex IS TRUE` (1.725 casas donde P3 veía 1.688); se quitó.
El dúplex se pide con `is_duplex: true` y es un filtro adicional. Los
conteos de la API (`total_matches` / `summary.total_results`) coinciden
ahora con un conteo por `tipo` sobre la vista de arriba (menos temporarios
y unidades diminutas en `rent`; medido 13/09: 1.789 casas en venta, 400
departamentos en alquiler).

**Vigencia** (`status` de P3, T4): `removed` nunca llega. `stale` (más de
90 días sin actualizarse en el portal) NO está en la vista por default;
entra SOLO cuando el usuario pide antigüedad explícita (`order:
days_on_market_desc` o filtro `days_on_market` con `gt`/`gte`), marcado
`listing_status: "stale"`, `deal_rating: "outdated"` y score ≤ 40, y
`summary.includes_outdated = true`. Producción lee la base de Railway: nada
de P3 se ve en la API hasta el sync.

---

## 2. Endpoints

| Endpoint | Uso | Estado |
|---|---|---|
| `POST /sessions` | crear sesión (TTL 24 h) | sin cambios |
| `GET /sessions/{id}` | estado de la sesión (reconexión) | `context` suma `near`, `land_class` |
| `POST /search/stream` | **canal de P1** (SSE) | eventos nuevos/ampliados (§3) · ⚠️ sesión inexistente → **HTTP 404** antes del stream |
| `POST /search` | fallback sync | suma `clarification` (§3.4) |
| `POST /search/map` | pins (criterio o sesión) | acepta `land_class`; `vertical: "land"` |
| `POST /search/text` | portal stateless | mismo motor; `extraction.params` suma `near`, `land_class` |
| `GET /property/{id}` | detalle | Card ampliada (§4); `stale` se puede abrir por id (marcado `outdated`) |
| `/search/structured`, `/search/semantic`, `/search/extract` | motor / portal / pruebas | no son endpoints de P1 |

### 2.1 Request de búsqueda (vocabulario público, mismo que la Card)

`POST /search/stream` y `POST /search`:

```jsonc
{ "session_id": "<uuid>", "query": "casa con pileta en Rivadavia hasta 120 mil dólares",
  "vertical_override": null,   // "comprar" | "alquilar" | "invertir" | "lotes" (chips)
  "limit": 20, "offset": 0 }   // sin `query` = PAGINACIÓN (no es un turno)
```

Criterio estructurado (`/search/structured`, `/search/map`, y el eco
`extraction.params` / `context.search_params`):

| campo | valores |
|---|---|
| `vertical` | `sale` · `rent` · `investment` · `temporary_rent` · **`land`** |
| `zones` | nombres de `master.zones` |
| `property_type` | `house` · `apartment` · `villa` · `room` · `land` (`land` redirige a la vertical `land`) |
| `is_duplex` | `true` = SOLO dúplex (filtro duro) · `false` = sin dúplex · `null` |
| `place` | barrio/localidad de San Juan que no es zona: filtro DURO por el texto del aviso (índice de texto de P3) |
| **`near`** (nuevo) | X de "cerca de X". Se resuelve contra el catálogo de puntos de interés de P2 (UNSJ, hospitales, plazas, terminal, estadio, dique…) y el catálogo de zonas de P3 (departamento o alias → centroide). Con `near`, el orden por default es `distance_asc` |
| **`land_class`** (nuevo) | `urban` · `rural` · `null` (ambas) — solo `vertical: land` |
| `budget_max` / `budget_min` + `currency` | `USD` · `ARS` (ARS se convierte con la última cotización) |
| `area_min_sqm` | m² mínimos (en lotes: superficie TOTAL; "5 hectáreas" = 50000) |
| `filters[]` | `{field, operator, value}`: `pool`, `bbq_area`, `patio`, `furnished`, `parking`, `gated_community`, `mortgage_eligible`, `elevator`, `condition`, `bedrooms`, `rooms`, `bathrooms`, `floor`, `area_sqm`, `price_usd`, `valuation_gap_pct`, `price_percentile`, `opportunity_score`, `days_on_market`, `gross_yield_pct`, `zone`, `property_type`, `beds`, `private_bathroom`, `double_bed`, **`land_class`, `land_services`, `in_subdivision`, `buildable`** (nuevos). Operadores: `gt lt gte lte eq neq in not_in not_true` |
| `order` | `opportunity_score` (default) · `price_asc` · `price_desc` · `price_per_sqm_asc` · `valuation_gap_desc` · `price_percentile_asc` · `gross_yield_desc` · `days_on_market_desc` · **`distance_asc`** (requiere `near`) |

Errores: `422` parámetros fuera de whitelist / `near` irresoluble en
`/search/structured` (`detail` lo dice); `503` sin cotización USD/ARS.

---

### 2.2 `GET /api/v1/health` — diagnóstico de producción (aditivo, 13/09)

Además de los campos de siempre (`status`, `db`, `embedding`, `pgvector`,
`semantic_search`, `data_provider`, `active_sessions`) la respuesta trae
`diagnostics` (P1 puede ignorarlo; sirve para verificar un deploy sin entrar
al contenedor):

```jsonc
"diagnostics": {
  "embedding": { "model": "paraphrase-multilingual-MiniLM-L12-v2", "dimensions": 384,
                 "threads": 1, "cpu_count": 32, "cpu_quota": 1.0,      // hilos de torch efectivos vs. cuota del contenedor
                 "warmup_ms": 210.4, "last_embed_ms": 38.1,             // ms del embed de arranque y del último
                 "cache_entries": 12, "cache_hits": 3 },
  "indexes":   { "embedding_column": "description_embedding",
                 "hnsw_embedding": true, "hnsw_index": "idx_properties_embedding",   // HNSW sobre la columna configurada
                 "tsv_gin": true, "tsv_index": "idx_properties_embedding_tsv",       // GIN de embedding_tsv (place)
                 "total": 18 },
  "config":    { "llm_provider": "claude", "llm_model": "claude-haiku-4-5-20251001",
                 "llm_extraction_timeout_s": 3.0, "extraction_cache_ttl_seconds": 3600.0,
                 "related_timeout_s": 1.5, "narrative_first_token_timeout_s": 4.0,
                 "embedding_provider": "local", "embedding_column": "description_embedding",
                 "embedding_threads_setting": 0 }
}
```

Lo que tiene que dar en producción: `threads` ≤ cuota (1-2 en Railway),
`last_embed_ms` < 100, `hnsw_embedding` y `tsv_gin` en `true`, y los
timeouts iguales a los de arriba salvo que se hayan cambiado a propósito.
Ningún chequeo embebe ni llama al LLM (el healthcheck corta a los 5 s).

## 3. `POST /search/stream` — eventos SSE

Orden: `cards` → [`clarification` NO terminal] → `response_chunk` (×N) →
`done` | `clarification` terminal | `error`.

**Siempre llega `cards` antes de cualquier narrativa** (T6). Paginar
(`{session_id, offset}` sin `query`) emite `cards` → `done`, sin narrativa.

### 3.1 `event: cards`

```jsonc
{
  "session_id": "…",
  "cards": [ /* Card[] — §4 */ ],
  "summary": {                                   // §3.2
    "vertical": "Compra", "zone": "Rivadavia", "property_type": "Casa",
    "budget": "hasta US$ 120.000",
    "order": "Opportunity Score",               // etiqueta del orden REAL aplicado
    "order_code": "opportunity_score",          // NUEVO: código del orden aplicado
    "assumption_note": "Asumí compra — decime si buscás alquilar", // |null; también "Quité pileta" tras relajar
    "total_results": 13,
    "hard_filters": [ /* NUEVO §3.2 */ ],
    "soft_criteria": ["luminoso"],              // NUEVO: blandos (ordenan, no filtran)
    "near": "Universidad Nacional de San Juan (UNSJ, Complejo Islas Malvinas)", // NUEVO |null
    "land_class": "urban",                      // NUEVO: "urban" | "rural" | "both" | null
    "includes_outdated": false                  // NUEVO: true si entran avisos `stale`
  },
  "nivel1_required": false,
  "total": 13, "total_matches": 13,
  "related": null,                              // solo en la ÚLTIMA página, máx 10; puede FALTAR si excede su presupuesto (1,5 s, §7)
  "suggestions": null,
  "clarification": null,                        // NUEVO: copia de la aclaración NO terminal (§3.3) o null
  "content_language": "es-AR"
}
```

### 3.2 `summary.hard_filters` — chips de filtros DUROS

Cada filtro duro aplicado, uno por uno, con valor y etiqueta es-AR. Duro =
se cumple o el resultado no aparece (operación, tipo, zona, lugar,
presupuesto con moneda, dormitorios mínimos, pileta, cochera, amoblado,
apto crédito, superficie mínima, dúplex, clase de lote, servicios, loteo…).

```jsonc
"hard_filters": [
  { "field": "vertical",      "operator": "eq",  "value": "sale",      "label": "Compra" },
  { "field": "property_type", "operator": "eq",  "value": "house",     "label": "Casa" },
  { "field": "zones",         "operator": "in",  "value": ["rivadavia"], "label": "Rivadavia" },
  { "field": "budget_max",    "operator": "lte", "value": 120000,      "label": "hasta US$ 120.000" },
  { "field": "pool",          "operator": "eq",  "value": true,        "label": "con pileta" },
  { "field": "bedrooms",      "operator": "gte", "value": 2,           "label": "2+ dormitorios" },
  { "field": "place",         "operator": "text","value": "trinidad",  "label": "en Trinidad" },
  { "field": "land_class",    "operator": "eq",  "value": "urban",     "label": "Lote urbano" }
]
```

Los blandos (`soft_criteria`: "luminoso", "moderno", "para negociar" cuando
no es orden, "con potencial"…) afectan el ranking (híbrido semántico) y
nunca la inclusión.

### 3.3 `event: clarification`

Dos formas, distinguidas por `terminal`:

**(a) Terminal** (como hasta ahora; cierra el stream, sin `cards`):
`clarification_reason` ∈ `sin_senal` · `oferta` · `fuera_de_dominio` ·
`otra_ciudad` · **`place_unknown`** (nuevo: la X de "cerca de X" no se
resolvió; el estado de la sesión queda intacto).

```jsonc
{ "session_id": "…", "message": "No ubico ese lugar (busqué \"lo de mi tía\"). ¿Es un barrio, un departamento o un punto conocido…?",
  "chips": [], "clarification_reason": "place_unknown", "nivel1_required": false,
  "terminal": true, "context": { … } }
```

`fuera_de_dominio` ya no dice "solo viviendas": los lotes tienen vertical.
Queda para locales, galpones y oficinas (sin vertical, tier 0 en P3);
chips `["Viviendas", "Lotes"]`.

**(b) NO terminal** (nuevo, T2): llega DESPUÉS de `cards` cuando el criterio
dejó **menos de 3 resultados**. Las cards que cumplen ya salieron; se
ofrece relajar UN filtro duro con el conteo que daría cada relajación. El
stream sigue con la narrativa y `done`.

```jsonc
{ "session_id": "…",
  "message": "Solo 2 avisos cumplen todo lo que pediste. Si aflojás un filtro tendrías — quitar el lugar: 163; quitar los dormitorios: 4; quitar el tipo: 3.",
  "chips": ["Quitar el lugar", "Quitar los dormitorios", "Quitar el tipo"],
  "clarification_reason": "few_results",
  "options": [ { "relax": "place", "label": "Quitar el lugar", "count": 163 },
               { "relax": "bedrooms", "label": "Quitar los dormitorios", "count": 4 },
               { "relax": "property_type", "label": "Quitar el tipo", "count": 3 } ],
  "nivel1_required": false, "terminal": false, "context": { … } }
```

Acción P1: mostrar los chips; **enviar el `label` del chip como `query`**
aplica la relajación (el motor lo entiende como retracción: "Quitar
pileta", "Quitar el presupuesto", "Quitar la zona", "Quitar el tipo"…). El
turno siguiente lleva `summary.assumption_note = "Quité pileta"`. Nunca se
mezclan en silencio resultados que no cumplen.

### 3.4 `event: response_chunk`

`{ "token": "…" }` — narrativa LLM, ahora **oración por oración** (validada
por una guardia determinística antes de emitirse: todo número tiene que
existir en las cards/summary del mismo turno; sin "oportunidad real" /
"score perfecto" / "imperdible" cuando alguna de las 3 primeras cards es
débil — tier ≤ 1, gap null o acotado, > 180 días, atípica, `stale`;
nunca pregunta si aplicar un orden ya aplicado). Moneda: la del pedido; si
no la dijo, la de la mayoría de las cards, con la conversión de la card
entre paréntesis. Fallback: UN chunk con el resumen template (también
cuando el primer token tarda más de `NARRATIVE_FIRST_TOKEN_TIMEOUT_S`).

### 3.5 `event: done`

```jsonc
{ "context": { …, "near": "la universidad", "land_class": null, "search_params": { … } },
  "meta": { "extractor": "fast|llm|rules_fallback|override|merge_only|pagination",
            "narrativa": "llm|template|llm_parcial",
            "narrativa_descartes": [ { "oracion": "…", "motivo": "número sin respaldo: ['42']" } ], // opcional
            "pagination": { "limit": 20, "offset": 0, "returned": 20, "total_matches": 118, "has_more": true },
            "latency_ms": { "extraction_y_merge": 1.3, "search": 18.1, "narrativa": 1994.8, "total": 86.9 } } }
```

`extractor: "rules_fallback"` = el LLM de interpretación no respondió en
`LLM_EXTRACTION_TIMEOUT_S` (3 s) y se interpretó por reglas + catálogo; la
nota de asunción lo dice. Las consultas repetidas no pasan por el LLM
(cache de interpretación, TTL 1 h): `meta.cached` en `extraction`.

### 3.6 `event: error`

`{ "message": "…", "status"?: 404|422|502|503 }` — sin cambios. ⚠️ La
sesión inexistente/expirada ahora se rechaza con **HTTP 404 antes de abrir
el stream** (F2): el cliente recrea la sesión y reintenta. `422` en el
stream = paginar una sesión sin criterio.

### 3.7 `POST /search` (sync)

Mismo `SearchResponse` de antes más `clarification` (objeto de §3.3(b) o
`null`) y `summary` ampliado. `llm_response` (texto template) incluye el
mensaje de relajación cuando aplica.

---

## 4. Card — campos (aditivos)

Sin cambios en los existentes salvo su SEMÁNTICA marcada ⚠️. Reglas de
display de `P1_INTEGRATION_SPEC.md` §5 siguen vigentes (precio principal =
original del aviso, `price_usd` para comparar, null = no informado).

### 4.1 Score y valuación (P2, reglas en `SCORING.md`)

| campo | tipo | qué es |
|---|---|---|
| `opportunity_score` ⚠️ | int 0-100 | **score de P2** (antes el de P3). En una consulta amplia ≤ 5 % de las cards ≥ 90 y ≤ 25 % ≥ 75 |
| `score_components[]` | `{key,label,value,weight,raw_value,raw_unit,description}` | cada punto explicado en es-AR: `gap_valuacion`, `price_position`, `gross_yield`, `time_on_market`, `freshness` (vivienda); `gap_zonal`, `price_position`, `time_on_market`, `en_loteo` (lotes); y `tope_*` (peso 0) con el motivo del tope |
| `p3_opportunity_score` | int\|null | el de P3 (trazabilidad, no mostrar) |
| `valuation_gap_pct` ⚠️ | float\|null | solo con ≥ 5 comparables y superficie cubierta; **acotado a ±35** |
| `valuation_gap_capped` | bool | `true` = el gap real excede ±35 % → `deal_rating: verify_data` |
| `has_covered_area` | bool\|null | vivienda: hay cubierta (base de `price_per_sqm` y gap); null en lotes |
| `price_per_sqm` ⚠️ | float\|null | vivienda: SIEMPRE `price_usd / covered_area_sqm`; null sin cubierta. En lotes: null (ver `price_per_sqm_land`) |
| `price_percentile` | int\|null | solo con ≥ 5 comparables |
| `market_context` | str\|null | frase de P3, solo cuando el gap es elegible |
| `deal_rating` ⚠️ | `green` · `yellow` · `red` · **`verify_data`** · **`outdated`** · null | null = no evaluado (p.ej. sin comparables) |
| `deal_rating_reasons[]` | `{code,text}` | motivos de P3 vigentes + de P2: `verificar_datos`, `sin_actualizar`, `pocos_comparables`, `sin_superficie_cubierta`, `aviso_antiguo`, `atipico` |
| `atypical_flags[]` | `composite` · `shared_or_partial` · `tiny_unit` | atípicos: score ≤ 40 |

Etiquetas es-AR sugeridas para `deal_rating`: `verify_data` → "verificar
datos", `outdated` → "sin actualizar".

### 4.2 Vigencia y antigüedad (dos cosas distintas)

| campo | qué es |
|---|---|
| `listing_status` | `active` · `stale` (vigencia de P3; `removed` nunca llega) |
| `days_on_market` ⚠️ | días desde la publicación ORIGINAL (el portal la conserva al re-publicar). SEÑAL de negociación, no criterio de vigencia: "publicado hace X" |
| `days_since_update` | días desde `listing_updated_at`: la frescura ("actualizado hace Y") |
| `age_flag` | `old` (> 180 días) · `very_old` (> 365) · null — etiqueta de antigüedad; con motivo `aviso_antiguo` en `deal_rating_reasons` |
| `listing_published_at`, `listing_updated_at` | las dos fechas (sin cambios) |

### 4.3 Cercanía

| campo | qué es |
|---|---|
| `distance_km` | solo con `order: distance_asc`: distancia al punto resuelto (`summary.near`). Las cards sin coordenadas van al final |
| `location_confidence` | `high` (pin del portal) · `medium` (dirección escrita) · `low` (solo la zona) |

### 4.4 Lote (`property_type: "land"`, vertical `land`)

| campo | qué es |
|---|---|
| `land_class` | `urban` · `rural` (`lote_clase` de P3) · null |
| `land_class_confidence` | `high` · `medium` · `low` |
| `land_services` | `true` declara servicios · `false` declara que NO · **`null` no lo dice (nunca mostrar como "sin servicios")** |
| `land_services_detail[]` | subset de `agua`, `luz`, `cloacas`, `gas`, `pavimento` |
| `in_subdivision`, `subdivision_name` | dentro de loteo (`true`/null) y su nombre |
| `price_per_sqm_land` | USD/m² sobre superficie TOTAL (`area_sqm`) |
| `price_per_hectare` | USD/ha — solo rurales |
| `land_zoning` | `residential` · `commercial` · `industrial` · `rural` · `mixed` · null |
| `frontage_m`, `depth_m`, `buildable` | medidas y "apto construcción" SOLO si el aviso lo dice |
| `zone_stats_ref` | celda de `zone_stats` usada para `gap_zonal`: `{bucket, median_price_per_sqm, median_price_per_hectare, sample, fallback, fallback_ref}`; `fallback` ≠ null = la zona no llega a la muestra mínima y se usó el nivel superior (dicho también en `score_components`) |

En lotes NO hay `gross_yield_pct` como componente, ni `estimated_price_per_sqm`
de vivienda, ni `price_per_sqm`. Etiqueta de `property_type: land`: **"Lote"**.

---

## 5. Orden por intención (T3)

| el usuario dice | `order_code` | `summary.order` |
|---|---|---|
| "cerca de X" | `distance_asc` (con `near` resuelto) | "Cercanía a <nombre resuelto>" |
| "mucho tiempo publicada", "para negociar", "las más antiguas" | `days_on_market_desc` (entran `stale`, marcados) | "Más tiempo publicadas primero" |
| "más barato / económico" | `price_asc` (por `price_usd`) | "Precio (menor a mayor)" |
| "para invertir / renta / oportunidad" | `opportunity_score` | "Opportunity Score" |
| "la renta más alta" | `gross_yield_desc` | "Rentabilidad (mayor a menor)" |
| sin señal | `opportunity_score` con desempate por actualización más reciente | "Opportunity Score" |

Un orden explícito manda sobre la cercanía ("más barato cerca de la uni"
→ `price_asc`, y `near` se conserva para la narrativa). La narrativa nunca
pregunta si aplicar un criterio ya aplicado.

---

## 6. Paginación, reintento y errores

- **Paginación**: `{session_id, offset[, limit]}` sin `query` → `cards` →
  `done`, sin narrativa ni aclaración. Orden determinístico (score de P2
  calculado en SQL, desempate por `id`): páginas sin solapes. `related`
  solo en la última página (sin cambios).
- **Reintento de sesión**: `POST /search/stream` y `POST /search` con sesión
  inexistente/expirada → **HTTP 404** (`{"detail": "Session … not found or expired"}`).
  P1 crea sesión nueva y reenvía el mismo `query`. Una sesión sin criterio
  que intenta paginar → 422.
- **Timeouts**: interpretación LLM > 3 s → reglas + catálogo
  (`meta.extractor: rules_fallback`, nota de asunción); narrativa sin primer
  token en 4 s → resumen template en un chunk. Las cards nunca esperan al
  LLM narrativo.

| código | significado | acción P1 |
|---|---|---|
| 401 | API key | config |
| 404 | sesión inexistente/expirada · propiedad inexistente o `removed` | recrear sesión / ocultar |
| 422 | params inválidos · `near` irresoluble (`/search/structured`) · paginar sin criterio | loguear |
| 429 | rate limit | backoff |
| 502 | LLM devolvió basura (extracción) | mostrar + retry |
| 503 | LLM no configurado · sin cotización USD/ARS | mostrar |
| 504 | timeout del LLM en `/search/text` modo `llm` (el híbrido y el chat caen a reglas) | retry |
| 500 | interno (sanitizado) | genérico + retry |

---

## 7. Latencia (medida en `tests/reports/latency_*.md`)

30 consultas variadas × 3 corridas contra `/search/stream`: objetivo p95
del primer `cards` ≤ 2,5 s y `done` ≤ 6 s. El fast-path determinístico
cubre 103/138 casos del golden (~0,1 s a `cards`); el resto pasa por el LLM
con timeout (≤ 3 s + búsqueda) y cache por consulta normalizada.

### 7.1 Railway (QA de producción 13/09, 2.º pase)

En producción 3 de 12 consultas tardaban 6,6-7,1 s hasta `cards` (las que
agotan la página y traen `related`). Causa medida: el embedding de la consulta
(torch con un hilo por núcleo VISIBLE del host sobre una cuota de 1 CPU).
Correcciones: hilos acotados a la cuota, embed fuera del event loop, cache
consulta → vector y **presupuesto de `related`** (`RELATED_TIMEOUT_S`, 1,5 s):
si se vence, `related` llega `null` y las cards no esperan. Para P1 no cambia
nada: `related` ya era opcional. Detalle y evidencia en
`docs/QA_RESULTADOS_2026-09-13.md` §7.

## 8. Resumen de cambios para P1 (checklist)

1. `opportunity_score` es el de P2 (más bajo y más raro en 90+); mostrar
   `score_components` incluyendo `tope_*`.
2. `deal_rating` suma `verify_data` y `outdated`; `deal_rating` puede ser
   null aunque antes fuera verde (sin comparables).
3. `summary.hard_filters` → chips; `summary.order_code` → orden real;
   `summary.near` / `land_class` / `includes_outdated`.
4. `clarification` NO terminal (`few_results`) después de `cards`; enviar
   el chip como `query` para relajar.
5. Vertical `land` con `property_type: "land"` y campos §4.4; `vertical_override: "lotes"`.
6. `distance_km` con `order_code: distance_asc`; `place_unknown` terminal.
7. Sesión inválida → HTTP 404 antes del stream (reintento automático).
8. `days_on_market` = publicado hace; `days_since_update` = actualizado hace;
   `age_flag` y `listing_status` para etiquetas.
