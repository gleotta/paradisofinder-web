# P1 ← P2 — Especificación de integración · San Juan (es-AR)

**Fecha:** 2026-08-26 · **Reemplaza** a `P1_STREAMING_INTEGRATION.md`
(2026-04-03, era Roma: shapes viejos, EUR, chips italianos — archivado
en `archive/docs/`, NO usar).
Fuente de verdad complementaria: `/docs` (Swagger vivo, generado de los
schemas reales) y `SPECS.md`.

**Mercado activo:** `san_juan` (es-AR). Todos los endpoints con prefijo
`/api/v1/`.

---

## 0. Topología y autenticación (decisión 2026-08-26: topología A)

- **P1 llama a P2 SOLO desde su servidor** (route handlers / server
  components de Next.js). El browser NUNCA llama a P2 directo.
- Header **`X-API-Key: <PORTAL_API_KEY>`** en todo `/api/v1/*`, salvo:
  `/health` (monitoreo), `/webhooks/*` (firma Twilio) y `/agency/*`
  (key propia). Sin key o key mala → **401**
  `{"detail":"API key faltante o inválida (header X-API-Key)"}`.
- `PORTAL_API_KEY` vacía en P2 = auth apagada (solo desarrollo).
- La key vive en variables de entorno del server de P1 — nunca en
  código cliente. CORS permite `X-API-Key` pero es irrelevante en
  topología A (no hay llamadas cross-origin desde el browser).
- Rate limits (por IP): búsqueda 30/min, sesiones 20/min, default
  60/min, eventos 120/min → 429 al excederse. El server de P1 comparte
  IP: dimensionar/cachear en P1 si hace falta.

## 1. Los dos modos de uso (no mezclar)

| Modo | Endpoints | Estado |
|---|---|---|
| **Búsqueda del portal** (barra de búsqueda, sin conversación) | `POST /search/text` + `POST /search/structured` (scroll) + `POST /search/semantic` | STATELESS — sin sesión |
| **Conversacional** (chat con refinamientos) | `POST /sessions` + `POST /search/stream` (SSE) o `POST /search` (sync fallback) | Con sesión: el estado se ACUMULA turno a turno en P2 |

---

## 2. Búsqueda del portal (stateless)

### POST /search/text
Input: `{ query, limit? (default 20), modo? ("hibrido" default) }`
Output: `{ covered, clarification_needed, extraction: {params, meta},
result: {total, total_matches, citta, params_applied, cards[]},
complemento: {motivo, faltantes, agregadas, cards[]} | null }`

- `clarification_needed=true` → `result=null`: mostrar chips
  **[Comprar] [Alquilar] [Invertir]** y reintentar la MISMA query
  anteponiendo la elección (o pasar al flujo conversacional).
- `complemento.cards` = "similares" que NO cumplen los filtros duros:
  renderizar SEPARADAS y marcadas como similares.
- `total_matches` = total real en DB; `total` = cards devueltas.

### Scroll infinito
1. Página 1: `/search/text` → guardar `extraction.params` (es un body
   válido de `/search/structured`).
2. Páginas siguientes: `POST /search/structured` con esos params +
   `offset` (20, 40, …; máx 10000) y `limit`. Orden determinístico
   (desempate por `id`) → sin solapes. ~20-90 ms, sin LLM.
3. Agotado `total_matches`: seguir con `POST /search/semantic`
   `{query, offset}` para más "similares" — dedup por ids ya vistos
   DEL LADO DE P1.

---

## 3. Conversacional (SSE) — el canal principal del chat

### POST /sessions → `{ session_id, created_at, expires_at }` (TTL 24 h)
`GET /sessions/{id}` para reconexión. Sesión expirada → crear una nueva
(el contexto se pierde: aceptado por diseño).

### POST /search/stream — SSE
Request: `{ session_id, query, vertical_override? }`

**Orden de eventos:** `cards` → `response_chunk`(×N) → `done`
 | `clarification` | `error` (los tres últimos terminan el stream).

#### event: cards
```jsonc
{
  "session_id": "…",
  "cards": [ /* Card[], ver §5 */ ],
  "riepilogo": {            // resumen estructurado (ya es-AR)
    "vertical": "Alquiler", "zona": "Capital, Rivadavia",
    "tipo": "Departamento", "budget": "hasta $ 700.000 (ARS)",
    "orden": "Opportunity Score",
    "nota_asuncion": "Asumí compra — decime si buscás alquilar" /*|null*/,
    "total_resultados": 142        // = total_matches REAL en DB
  },
  "nivel1_required": false,
  "total": 20,                     // cards en este payload
  "total_matches": 142,            // total real en DB
  "complemento": { "motivo": "resultados_insuficientes",
                   "faltantes": 12, "agregadas": 12,
                   "cards": [ /* similares — render separado */ ] }, // |null
  "suggestions": ["Ampliar la zona", "Ajustar el presupuesto"],      // |null (con 0 resultados)
  "content_language": "es-AR"      // idioma de los TEXTOS de P3 (las claves son inglés)
}
```
Acción P1: renderizar cards + riepilogo AL INSTANTE (mediana ~20 ms).

#### event: response_chunk
`{ "token": "…" }` — la narrativa natural de la IA, en streaming
(primer token ~0,9 s; completa ~2,2 s). Concatenar con efecto typing.
Si el LLM está caído/apagado llega UN chunk con el resumen template:
mismo manejo, cero cambios en P1.

#### event: done
```jsonc
{ "context": { /* estado acumulado; search_params = JSON de búsqueda */ },
  "meta": { "extractor": "fast|llm|override|merge_only",
            "narrativa": "llm|template|llm_parcial",
            "latency_ms": { "extraction_y_merge": 1.3, "search": 7.4,
                            "narrativa": 2175.0, "total": 8.8 } } }
```
Guardar `context` es OPCIONAL (P2 ya lo persiste en la sesión).

#### event: clarification
```jsonc
{ "session_id": "…",
  "message": "¿Qué estás buscando? …",         // texto es-AR listo
  "chips": ["Comprar", "Alquilar", "Invertir"], // [] si no aplica
  "clarification_reason": "sin_senal|oferta|fuera_de_dominio|otra_ciudad",
  "nivel1_required": true,                      // false si chips vacíos
  "context": { … } }
```
Chip clickeado → nueva request con `vertical_override`:
**"comprar" | "alquilar" | "invertir"** (se aceptan también los valores
viejos comprare/affittare/investire). Con override, P2 busca con TODO el
contexto acumulado.

#### event: error
`{ "message": "…", "status"?: 502|503 }` — mensajes EXPLÍCITOS
("LLM no disponible: …"); error interno genérico llega sanitizado
("Internal search error"). Sin más eventos después.

### Comportamientos conversacionales (P2 los resuelve; P1 solo envía texto)
- Refinamientos acumulan: "de 2 dormitorios", "también en Rivadavia",
  "sacale la pileta", "hasta 700 mil" — el estado vive en P2.
- "empecemos de nuevo" / "olvidate todo" → evento `clarification` con
  mensaje de reinicio y chips (contexto limpio).
- La narrativa confirma el efecto del turno ("Sin pileta quedan 53…").

### POST /search (sync)
Mismo request; devuelve todo junto: `{ session_id, riepilogo, cards,
nivel1_required, chips, suggestions, llm_response (texto template),
context, complemento }`. Fallback sin SSE; NO trae narrativa LLM.

---

## 4. Detalle y eventos

- `GET /property/{id}` → `{ property (PropertyDetail ⊃ Card + `description`,
  `heating`, `year_built`, `beds`, `private_bathroom`, `double_bed`),
  comparables (MiniCard[] con `zone`/`area_sqm`/`price`/`currency`/
  `price_usd`), score_components, content_language }`.
- `GET /property/{id}/card` → HTML OG (previews WhatsApp).
- `POST /events` `{ session_id, event_type, payload }` — fire-and-forget.

---

## 5. Card — shape y REGLAS DE DISPLAY (contrato P3→P2→P1)

**Contrato INTERNACIONAL (2026-08-27):** las claves y los códigos de la
API son en **inglés**; los TEXTOS libres vienen localizados por P3 en el
idioma del mercado, declarado en **`content_language`** (`"es-AR"`) a
nivel de respuesta. El schema completo está en `/docs` (Swagger).

| Campo | Regla de display |
|---|---|
| `price` + `currency` ("USD"\|"ARS") | **Precio principal, SIEMPRE el original del aviso** ("US$ 65.000" / "$ 650.000") |
| `rental_period` (`day`\|`week`\|`month`\|null) | Sufijo del precio en alquileres: "/día", "/semana", "/mes". **null = no informado** → asumir mensual pero NO comparar contra otras periodicidades. Un precio `day` NO es comparable con uno `month` |
| `price_usd` | Referencia secundaria cuando el aviso está en ARS ("≈ US$ 327"). **Comparar SIEMPRE por acá**, nunca el nominal entre monedas |
| `price_ars` | Referencia secundaria SOLO en alquileres publicados en USD |
| `price_per_sqm` (USD) | Mostrar solo en VENTAS |
| `estimated_price_per_sqm` | Estimación de P3 **por m²** — NO es un precio total |
| `operation` | `sale` \| `rent` |
| `property_type` | `house`, `apartment`, `land`, `office`, `retail`, `villa`, `garage`, `warehouse`, `room`, `studio`, `attic`, `penthouse`, `other` |
| `condition` | `unknown` \| `new` \| `excellent` \| `good` \| `needs_renovation` \| `under_construction` |
| `opportunity_score` (0-100) + `score_components[]` | Nunca el número solo: componentes con `key,label,value,weight,raw_value,raw_unit,description` — **display directo, ya localizado por P3** |
| `primary_signal` `{text,type,color}` | Mostrar tal cual (P3) |
| `deal_rating`, `resale_investment_rating`, `rental_investment_rating` + sus `*_reasons[{code,text}]` | `green`\|`yellow`\|`red`\|**null = NO EVALUADO → omitir, jamás "malo"**. Los `resale_*`/`rental_*` solo en ventas. `text` tal cual; `code` estable para lógica |
| `market_context` | Frase lista (P3): mostrar tal cual; null = nada que destacar |
| `bedrooms, bathrooms, rooms, area_sqm, covered_area_sqm, floor` | null = NO INFORMADO → omitir (nunca 0) |
| `pool, bbq_area, patio, furnished, parking, gated_community, mortgage_eligible, elevator` | Chips de atributos; null = no informado → omitir |
| `gross_yield_pct` | Renta bruta anual estimada. **Reactivada en AR el 27/08** (P3): ~96% de las ventas la traen, mediana ~7,9%. null = no evaluado → omitir. Filtrable y ordenable |
| `sources[{name,id,url}]` | **Procedencia** — mostrar la fuente del aviso (principio UX 4). El dedup de P3 puede fusionar varias |
| `listing_url` | Link al aviso original en el portal de origen |
| `publisher` (`agency`\|`owner`) | "Inmobiliaria" / "Dueño directo" |
| `contact` `{phone,whatsapp,web}` | null = no informado. Respetar la política de contacto del producto |
| `photo_url`, `photos[]` | `photos` es la galería completa; `photo_url` es la principal |
| `semantic_qualities[]`, `nearby_points[]` | Tags de enriquecimiento y puntos de referencia (P3, localizados) |
| `days_on_market`, `listing_published_at`, `listing_updated_at` | "N días publicada" / "actualizado hace…" |
| `quality_tier`, `quality_score` | tier 0 no se muestra; **mapa solo con `quality_tier >= 2`** |
| `zone`, `address`, `latitude`, `longitude` | Ubicación |
| `comparables_count`, `zone_supply`, `valuation_gap_pct`, `price_percentile`, `estimated_monthly_rent`, `rent_to_price_ratio` | Indicadores de mercado (P3) |
| `relevance_score` | En cards de `complemento`/semántica: score de similitud |

### Reglas de producto que cambian lo que el usuario ve (28/08)

- **"para alquilar" es SIEMPRE un inquilino** (regla de mercado AR/San Juan).
  "depto para alquilar en pocito", "casa para alquilar a una pareja" → busca
  ALQUILERES. El inversor lo dice explícito: "comprar/invertir para alquilar",
  "para después alquilar", "para renta". Prompt `ar-1.8.4`.
- **El dúplex se trata como departamento** (`property_type: "apartment"`).
  P3 tipifica 45 de 59 así. Pidiendo dúplex explícitamente, los que declaran
  serlo salen primero y detrás siguen el resto de los departamentos.

### Qué NO debe hacer P1 (reglas duras)
1. NO recalcular indicadores ni umbrales (todo viene precomputado).
2. NO traducir/reescribir textos de P3 (`text` de reasons,
   `market_context`, `description` de componentes, señales). El idioma
   lo declara `content_language`.
3. NO comparar `price` nominal entre monedas (usar `price_usd`).
4. NO tratar null como 0 ni como "no tiene" (null = no informado).
5. NO comparar precios de alquiler sin mirar `rental_period`.
6. NO parsear la narrativa (`response_chunk`): es texto libre.
7. Mapa: usar solo cards con `quality_tier >= 2` y lat/lon. **OJO — esto
   alcanza para la página visible y nada más.** Los endpoints topean en
   `limit=100` y devuelven resultados RANKEADOS, no el universo del criterio:
   "deptos en venta en capital" son 421 coincidencias, de las que llegan 100 y
   solo ~79 traen `tier >= 2`. Un mapa así dibuja ~79 puntos de ~300. Si P1
   muestra mapa, tiene que decirle al usuario que son los de esta página.
   El endpoint de mapa (`POST /search/map`, payload liviano, sin tope, filtro
   `tier >= 2`) NO existe todavía — decisión del 28/08 de no construirlo aún.
   Ver `HANDOFF_P1_2026-08-28.md` §4.1.

### Request — vocabulario público (2026-08-27, pase 2)

Se filtra por el **mismo nombre con el que el campo aparece en la card**.
Los nombres anteriores siguen aceptándose como alias de transición.

| Campo del request | Valores |
|---|---|
| `vertical` | `sale` · `rent` · `investment` · **`temporary_rent`** |
| `zones` | nombres de `master.zones` |
| `property_type` | `house`, `apartment`, `land`, … (los de la card) |
| `currency` | `USD` \| `ARS` (AR) · `EUR` (IT) |
| `area_min_sqm` | m² mínimos |
| `filters[]` | `{field, operator, value}` — `field` = nombre de la card (`pool`, `parking`, `condition`, `price_usd`, `gross_yield_pct`…) |
| `order` | `opportunity_score` · `price_asc` · `price_desc` · `price_per_sqm_asc` · `valuation_gap_desc` · `price_percentile_asc` · `gross_yield_desc` · `days_on_market_desc` |

`extraction.params` de `/search/text` viene en este vocabulario y sigue
siendo un body válido de `/search/structured` (mecanismo de scroll).

### Alquiler temporario y habitaciones (P3 handoff 27/08)

`temporario := property_type "room" OR rental_period "day"/"week"`.

- La vertical **`rent` los EXCLUYE**: sus precios no son comparables con
  los mensuales (un precio por día no se compara con uno por mes).
- La vertical **`temporary_rent` los busca en exclusiva** — es la que
  alimenta el vertical de temporarios/habitaciones de P1.
- Habitación: `beds` (el TAMAÑO), `double_bed`, `private_bathroom` y
  `room_class` (`single` · `single_double_bed` · `double` · `triple_plus`,
  **derivado**, P3 no lo persiste). Una simple matrimonial y una doble
  alojan a la misma gente y **no son el mismo producto**.
- Una habitación **no se vende** y **no tiene `price_per_sqm`**: su mínimo
  de visibilidad son las camas, no los metros.

### Nota de migración (2026-08-27)
El contrato anterior exponía claves y códigos en italiano
(`indirizzo`, `operazione: "vendita"`, `tipo: "casa_indipendente"`,
`semaforo: "verde"`, `num_bagni`, `locali`, `posto_auto`…) heredados
del schema de P3, y omitía procedencia, contacto, galería de fotos y
periodicidad de alquiler. La DB de P3 **no cambió**: la traducción vive
en la capa de borde de P2 (`app/models/value_maps.py`). El request se migró en el
mismo día (pase 2, arriba): acepta el vocabulario público y los nombres
anteriores como alias.

## 6. Errores (todos los endpoints)

| Código | Significado | Acción P1 |
|---|---|---|
| 401 | API key faltante/mala | Config del server P1 |
| 404 | Sesión inexistente/expirada | Crear sesión nueva y reintentar |
| 422 | Params inválidos (detalle en `detail`) | Bug: loguear |
| 429 | Rate limit | Backoff |
| 501 | Mercado no soportado | No debería ocurrir (san_juan) |
| 502 | Fallo del LLM (mensaje explícito) | Mostrar error + retry |
| 503 | LLM no configurado / sin cotización USD-ARS | Mostrar error |
| 500 | Error interno (sanitizado) | Genérico + retry |

En SSE los errores llegan como `event: error` (el HTTP ya es 200).

---

## 7. Checklist de integración sugerido (fases)

- **I1 — Portal**: `/search/text` + scroll (`/search/structured` +
  `/search/semantic`) + render de Card §5 + clarificación con chips.
- **I2 — Chat SSE**: sesión + `/search/stream` (cards → typing de
  narrativa → done) + chips + reset + complemento separado.
- **I3 — Detalle**: `/property/{id}` con semáforos, score explicado y
  comparables.

Instancia de prueba de P2: puerto 8001 local (la 8000 es del usuario).
Swagger: `http://localhost:8001/docs`.
