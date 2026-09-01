# P1 ← P2 — Especificación de integración · San Juan (es-AR)

**Fecha:** 2026-08-26 · **Reemplaza** a `P1_STREAMING_INTEGRATION.md`
(2026-04-03, era Roma: shapes viejos, EUR, chips italianos — archivado
en `archive/docs/`, NO usar).
Fuente de verdad complementaria: `/docs` (Swagger vivo, generado de los
schemas reales) y `SPECS.md`.

**Mercado activo:** `san_juan` (es-AR). Todos los endpoints con prefijo
`/api/v1/`.

**Última actualización:** 2026-09-01. Si venías integrando con una versión
anterior, empezá por los deltas con checklist de migración:
**`CAMBIOS_P2_PARA_P1_2026-09-01.md`** (el dúplex pasa a filtrar con
`is_duplex`, que además llega en la Card; `place`) y antes
**`CAMBIOS_P2_PARA_P1_2026-08-30.md`**. Cambios del 29-30/08 — `POST /search/map` implementado
(§2, cierra el hueco §4.1 del handoff) y **paginación unificada**: los
resultados son siempre estructurados y paginados en los tres endpoints; las
`related` (embeddings, máx 10) llegan solo en la última página.
⚠️ **Cambios incompatibles (2026-08-29)** — ver §5b:
`complemento` → `related` (nuevo shape) y las últimas claves en
castellano/italiano migradas al contrato inglés.

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

> **Hoy P1 usa el canal CONVERSACIONAL** (`POST /search/stream`, SSE; `POST
> /search` como fallback sync). El canal del portal existe y está soportado,
> pero no es el que está integrado. `/search/structured` y `/search/semantic`
> **no son endpoints de P1** en ninguno de los dos modos.


| Modo | Endpoints | Estado |
|---|---|---|
| **Búsqueda del portal** (barra de búsqueda, sin conversación) | `POST /search/text` con `limit`/`offset` | STATELESS — sin sesión |
| **Mapa** (los dos modos) | `POST /search/map` — criterio estructurado *o* `session_id` | Stateless o con sesión, según la forma |
| **Conversacional** (chat con refinamientos) | `POST /sessions` + `POST /search/stream` (SSE) o `POST /search` (sync fallback) | Con sesión: el estado se ACUMULA turno a turno en P2 |

---

## 2. Búsqueda del portal (stateless)

### POST /search/text
Input: `{ query, limit? (default 20), offset? (default 0), modo? ("hibrido") }`
Output: `{ covered, clarification_needed, extraction: {params, meta},
result: {total, total_matches, citta, params_applied, cards[]},
related: {reason, count, cards[]} | null }`

- `clarification_needed=true` → `result=null`: mostrar chips
  **[Comprar] [Alquilar] [Invertir]** y reintentar la MISMA query
  anteponiendo la elección (o pasar al flujo conversacional).
- `related.cards` = "similares" que NO cumplen los filtros duros:
  renderizar SEPARADAS y marcadas como similares.
- `total_matches` = total real en DB; `total` = cards devueltas.

### Scroll infinito — RESULTADOS estructurados, RELATED por embeddings

**Regla de oro (2026-08-29):** los resultados salen SIEMPRE de la búsqueda
estructurada y se paginan; las "relacionadas" salen de embeddings y llegan
SOLO cuando lo estructurado se agotó.

1. Página 1: `POST /search/text` `{query, limit, offset: 0}`.
2. Páginas siguientes: **el mismo** `/search/text` con `offset` (20, 40, …;
   máx 10000). Orden determinístico (desempate por `id`) → sin solapes.
   *(Stateless: re-extrae por página — 2,1-2,7 s cuando la consulta no la
   cubre el fast-path. Si algún día este canal scrollea intensivo, se cachea
   la extracción por texto de consulta.)*
3. **Última página**: cuando `offset + result.total >= total_matches`, la
   respuesta trae además `related` — hasta **10** cards por embeddings.
   P1 ya no tiene que llamar a `/search/semantic` ni deduplicar: viene
   resuelto y deduplicado contra lo ya mostrado.

En las páginas intermedias `related` es `null`. No hay que pedirlo ni
paginarlo: es el cierre del scroll, no una sección paralela.

### POST /search/map — el mapa (2026-08-29)
Devuelve **TODOS** los pins del criterio, no la página rankeada. Cierra el
hueco §4.1 del handoff: el mapa armado con `/search/structured` +
`limit=100` dibujaba ~79 puntos de ~300.

**Es un servicio delgado y NO conversacional, a propósito.** No interpreta
lenguaje, no llama al LLM y no modifica ninguna sesión: recibe criterio ya
resuelto y devuelve coordenadas. Todo lo que sea entender al usuario pasa
antes, por `/search/text` o por el chat. No esperes que crezca: si el mapa
necesita algo nuevo, casi siempre se resuelve mandándole otro criterio.

Dos formas **mutuamente excluyentes** (mandar las dos → 422):

```jsonc
// (a) criterio estructurado — el MISMO vocabulario de /search/structured.
//     P1 lo alimenta con extraction.params (portal).
{ "vertical": "sale", "zones": ["capital"], "property_type": "apartment",
  "currency": "USD", "area_min_sqm": 100,
  "filters": [ { "field": "pool", "operator": "eq", "value": true } ] }

// (b) sesión conversacional — P2 resuelve el estado acumulado del chat.
{ "session_id": "b7e2d4f0-…" }
```

Sin `limit`/`offset` (devuelve el universo), sin `order` (un mapa no tiene
ranking) y sin texto libre (cero LLM: la extracción vive en `/search/text`
y en el chat). Mandar cualquiera de esos da **422** en vez de ignorarse: si
se ignoraran en silencio, P1 creería que pagina y recibiría todo sin
enterarse.

```jsonc
{ "total_matches": 421,   // avisos del criterio en DB — el MISMO valor que
                          // /search/text y /search/structured ("N de M")
  "total_pins": 333,      // subconjunto mapeable — SIEMPRE == pins.length
  "citta": "san_juan",
  "params_applied": { "vertical": "sale", "zones": ["capital"], … },
  "pins": [
    { "id": "008c82aa-…", "latitude": -31.5336557, "longitude": -68.5182953,
      "price": 100000,        // SIEMPRE el original del aviso
      "currency": "USD",      // USD | ARS
      "price_usd": 100000.0,  // única base comparable entre monedas
      "rental_period": null,  // day | week | month — sin esto un precio de
                              // alquiler no es interpretable (regla dura #5)
      "property_type": "apartment", "operation": "sale" }
  ] }
```

Reglas de comportamiento:

1. **Sin tope y sin paginación.** `pins.length == total_pins` siempre.
2. **Gate del mapa server-side:** `quality_tier >= 2` + coordenadas. No es
   calidad, es ubicación: medido en la DB real, el tier 2 tiene coordenadas
   en el **100%** de los avisos y el tier 1 en el **0%**. P1 no recibe jamás
   un pin sin dónde ponerse — no hace falta que filtre.
3. **`total_matches` usa el gate del LISTADO** (tier >= 1) para que "N de M
   en el mapa" cierre con el contador del listado. `total_pins <= total_matches`.
4. Orden determinístico por `id` (respuestas estables y cacheables).
5. **Payload mínimo a propósito:** el popup de un pin pide el detalle a
   `GET /property/{id}`. Sin `content_language`: no viaja texto de P3.
6. Sesión inexistente/expirada → **404** (P1 recrea sesión); sesión que
   todavía no buscó nada → **422** (no se devuelve el mercado entero).
7. Fast-path puro (SQL). Medido en la instancia de prueba: **p95 38 ms** en
   el peor caso absoluto del mercado (todo en venta, 1.824 pins, 374 KB).
   Bucket de rate limit de búsqueda (30/min).

Medido el 2026-08-29 contra la DB real (los totales se mueven con cada
corrida de P3):

| criterio | `total_matches` | `total_pins` | antes (página de 100) |
|---|---|---|---|
| deptos en venta en capital | 421 | 333 | 79 |
| casas en venta en rawson | 189 | 139 | 73 |
| alquileres en capital | 271 | 206 | 74 |

---

## 3. Conversacional (SSE) — el canal principal del chat

### POST /sessions → `{ session_id, created_at, expires_at }` (TTL 24 h)
`GET /sessions/{id}` para reconexión. Sesión expirada → crear una nueva
(el contexto se pierde: aceptado por diseño).

El mapa del chat sale de `POST /search/map` con `{session_id}` (forma (b)
de §2): usa el criterio acumulado tal como lo dejó el último turno, sin que
P1 tenga que reenviar `context.search_params`.

### Paginación del chat (2026-08-29) — NO es un turno

`POST /search` y `POST /search/stream` aceptan `limit` (default 20) y
`offset`. Para pedir la página siguiente se manda **sin `query`**:

```jsonc
{ "session_id": "b7e2d4f0-…", "offset": 20 }
```

Eso re-consulta el criterio ya acumulado y **no cuenta como turno**: no
llama al LLM, no mergea, no toca el estado ni el historial (`message_count`
y `turns` no se mueven). Medido: **14-21 ms** contra los ~2-3 s de un turno
con narrativa.

- En SSE, una paginación emite `cards` → `done` **sin `response_chunk`**: la
  narrativa describe el efecto de un turno, y paginar no es uno.
- `related` (hasta 10, por embeddings) llega en la **última página**, igual
  que en el portal.
- Un request sin `query`, sin `vertical_override` y sin `offset` → **422**.
  Paginar una sesión que todavía no buscó nada → **422**.

### POST /search/stream — SSE
Request: `{ session_id, query, vertical_override? }`

**Orden de eventos:** `cards` → `response_chunk`(×N) → `done`
 | `clarification` | `error` (los tres últimos terminan el stream).

#### event: cards
```jsonc
{
  "session_id": "…",
  "cards": [ /* Card[], ver §5 */ ],
  "summary": {              // resumen estructurado (textos ya es-AR)
    "vertical": "Alquiler", "zone": "Capital, Rivadavia",
    "property_type": "Departamento", "budget": "hasta $ 700.000 (ARS)",
    "order": "Opportunity Score",
    "assumption_note": "Asumí compra — decime si buscás alquilar" /*|null*/,
    "total_results": 142           // = total_matches REAL en DB
  },
  "nivel1_required": false,
  "total": 20,                     // cards en este payload (= limit pedido)
  "total_matches": 142,            // total real en DB — paginar con offset
  "related": { "reason": "structured_exhausted", "count": 10,
               "cards": [ /* similares — render separado */ ] },  // |null:
                          // SOLO en la ÚLTIMA página, máx 10 — ver abajo
  "suggestions": ["Ampliar la zona", "Ajustar el presupuesto"],      // |null (con 0 resultados)
  "content_language": "es-AR"      // idioma de los TEXTOS de P3 (las claves son inglés)
}
```
Acción P1: renderizar cards + summary AL INSTANTE (mediana ~20 ms).

> ⚠️ **`related` viaja DENTRO de este evento `cards`, no en `done`.** Es el
> error de integración más fácil de cometer: si P1 espera el `done` para
> leerlos, no los ve nunca.
>
> **Cuándo llega:** solo cuando la página AGOTA los resultados duros, es
> decir `offset + total >= total_matches`. No depende de que haya "pocos"
> resultados:
>
> | escenario | `related` |
> |---|---|
> | 9 resultados, `limit=20` → la página 1 ya es la última | **sí** |
> | 58 resultados, `limit=20`, `offset=0` | `null` |
> | 58 resultados, `limit=20`, `offset=40` → devuelve 18, la última | **sí, 10** |
>
> Verificado contra la DB real el 30/08 en este mismo endpoint.
> **Consecuencia de producto:** si el scroll de P1 no llega al final, en una
> búsqueda de 58 resultados el usuario NUNCA ve los relacionados. Es la regla
> pedida (30/08), pero conviene tenerla presente al diseñar el scroll.

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
context, related }`. Fallback sin SSE; NO trae narrativa LLM.

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
| `relevance_score` | En cards de `related`/semántica: score de similitud |

### Reglas de producto que cambian lo que el usuario ve

Son reglas FIJAS: no se re-discuten por caso. Prompt `ar-1.9.1`.

**Verticales — tres de las cuatro intenciones son COMPRAS** (28/08, cerrada
el 29/08). Se resuelve en dos pasos, en orden:

1. **¿Hay verbo de compra?** (comprar / invertir / adquirir / "en venta") →
   es COMPRA, punto. El verbo MANDA sobre lo que venga después:
   *"comprar depto para alquiler profesional"* es una compra, no un alquiler.
   Lo que sigue describe el uso y va a `semantic_query`.
2. **Sin verbo de compra**: **"renta"** ("para renta", "que deje renta") y
   **"reventa"** significan COMPRAR para invertir — **nunca alquilar**.
   Cualquier otro "alquilar/alquiler" es un INQUILINO, siempre:
   *"depto para alquilar en pocito"*, *"casa para alquilar a una pareja"*,
   *"depto para alquiler profesional"*.

Si un usuario se queja de "busqué para alquilar y me mostró alquileres", la
respuesta es: está bien.

**Dúplex — categoría propia con dato propio** (01/09; reemplaza la
preferencia blanda de 28/08 y 30/08). P3 entregó `es_duplex`, así que el
dúplex FILTRA como cualquier categoría:

| el usuario busca | llega como | qué devuelve |
|---|---|---|
| dúplex | `is_duplex: true`, `property_type: null` | SOLO dúplex — de los dos tipos de base |
| departamento | `property_type: "apartment"` | departamentos **+ los dúplex mezclados** (para el usuario un dúplex es un depto) |
| casa | `property_type: "house"` | casas **+ los dúplex al FINAL** de la lista |

`property_type: null` cuando se pide dúplex no es un olvido: la marca es
**ortogonal** al tipo — 50 dúplex están tipificados `apartment` y 13 `house`,
y los dos grupos son dúplex reales. Fijar un tipo dejaría fuera a uno entero.

Cada card trae **`is_duplex`** (`true` / `false` / `null` = no evaluado):
conviene sellarla, sobre todo en la vertical `house`, donde el dúplex
aparece al final de una lista de casas.

⚠️ **`is_duplex` reemplaza al parche anterior.** Ya no llega
`preferred_property_type: "apartment"` ni `semantic_query: "dúplex"` — si P1
detectaba el dúplex mirando esos dos campos, hay que mirar `is_duplex`.

*Dúplex en Rawson sigue dando 0*, y es correcto: los 3 que existen están en
`quality_tier 0` (les falta superficie) y tier 0 no se muestra nunca. La
consulta devuelve 0 duros + `related`.

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
| `property_type` | `house`, `apartment`, `land`, … (los de la card) — filtro DURO |
| `preferred_property_type` | mismo vocabulario. Preferencia **BLANDA**: ordena, NO filtra. Reservado para categorías que P3 todavía no tipifique — el dúplex **dejó de usarlo el 01/09** (tiene `is_duplex`). Hoy ninguna regla lo emite; el campo sigue en el contrato |
| `is_duplex` | **NUEVO (01/09)** `true` = SOLO dúplex, filtro **DURO** (`master.properties.es_duplex` de P3) · `false` = excluirlos · `null` = sin pronunciarse, y entonces `apartment` los trae mezclados y `house` al final. Con `true`, `property_type` va en `null` (la marca es ortogonal al tipo). P1 no lo manda: lo produce la extracción y P2 lo conserva al paginar |
| `place` | **NUEVO (31/08)** barrio o localidad de San Juan que NO es zona del catálogo: `"Concepción"`, `"Trinidad"`, `"Marquesado"`. Filtro **DURO** por el nombre escrito en el texto del aviso (P3 no tiene columna de barrio). P1 no lo manda: lo produce la extracción y P2 lo conserva al paginar. Si ningún aviso lo nombra, la búsqueda da 0 y llega `related` |
| `currency` | `USD` \| `ARS` (AR) · `EUR` (IT) |
| `area_min_sqm` | m² mínimos |
| `filters[]` | `{field, operator, value}` — `field` = nombre de la card (`pool`, `parking`, `condition`, `price_usd`, `gross_yield_pct`…) |
| `order` | `opportunity_score` · `price_asc` · `price_desc` · `price_per_sqm_asc` · `valuation_gap_desc` · `price_percentile_asc` · `gross_yield_desc` · `days_on_market_desc` |

`extraction.params` viene en este vocabulario y sigue siendo un body válido
de `/search/structured`, pero **P1 no lo necesita para paginar** (decisión del
30/08): el chat pagina con `{session_id, offset}` y el portal con `offset`
sobre `/search/text`. Se ecoa para trazabilidad y debug.

⚠️ Si aun así se reenvía, mandarlo **COMPLETO**: perder `is_duplex`,
`place` o `semantic_query` cambia (o vacía) la página
siguiente (medido: el ranking difiere desde la posición 2). Ojo también con
`limit`/`offset` dentro de ese dict — ecoan los defaults del extractor
(20 / 0), no lo que se pidió.

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

## 5b. Migración de claves al contrato inglés (2026-08-29)

La migración de agosto había cubierto la **Card**, pero no el sobre de las
respuestas conversacionales. Se completó. Renombres, **solo de nombres — los
valores y el comportamiento no cambian**:

| antes | ahora | dónde |
|---|---|---|
| `riepilogo` | `summary` | `/search`, evento `cards` del SSE |
| `riepilogo.zona` | `summary.zone` | idem |
| `riepilogo.tipo` | `summary.property_type` | idem |
| `riepilogo.orden` | `summary.order` | idem |
| `riepilogo.nota_asuncion` | `summary.assumption_note` | idem |
| `riepilogo.total_resultados` | `summary.total_results` | idem |
| `context.zona` | `context.zones` | `/search`, evento `done` |
| `context.tipo` | `context.property_type` | idem |
| `context.orden` | `context.order` | idem |
| `context.superficie_min` | `context.area_min_sqm` | idem |
| `citta` | `market` | `/search/structured`, `/search/semantic`, `/search/map` |
| `complemento` | `related` (shape nuevo) | todos |

**Bug de canal corregido de paso:** el evento SSE armaba su payload sin los
alias, así que el MISMO dato salía como `campo/operador/valor` por
`/search/stream` y como `field/operator/value` por `/search`. Ahora los dos
canales emiten idéntico.

**Lo que NO cambió:** `context.search_params` sigue con el vocabulario
interno (`zonas`, `tipo`, `moneda`, `orden`) — es el estado acumulado del
motor, no contrato de nombres. `/search/map` y `/search/structured` lo
aceptan igual (tienen alias de entrada).

**Cómo se validó:** caracterización diferencial de 24 escenarios
(`tests/migration_snapshot/`) — captura completa de todos los endpoints antes
y después; la única diferencia admitida es el mapa de renombres de arriba.
El arnés se autovalida primero (dos capturas sin tocar código deben dar
idénticas) para descartar ruido.

## 6. Errores (todos los endpoints)

| Código | Significado | Acción P1 |
|---|---|---|
| 401 | API key faltante/mala | Config del server P1 |
| 404 | Sesión inexistente/expirada | Crear sesión nueva y reintentar |
| 422 | Params inválidos (detalle en `detail`); en `/search/map`, también las dos formas juntas o una sesión sin criterio | Bug: loguear |
| 429 | Rate limit | Backoff |
| 501 | Mercado no soportado | No debería ocurrir (san_juan) |
| 502 | Fallo del LLM (mensaje explícito) | Mostrar error + retry |
| 503 | LLM no configurado / sin cotización USD-ARS / universo del mapa sobre `MAP_MAX_PINS` | Mostrar error |
| 500 | Error interno (sanitizado) | Genérico + retry |

En SSE los errores llegan como `event: error` (el HTTP ya es 200).

---

## 7. Checklist de integración sugerido (fases)

- **I1 — Portal**: `/search/text` + scroll con `offset` sobre el MISMO
  endpoint + render de Card §5 + clarificación con chips.
- **I2 — Chat SSE**: sesión + `/search/stream` (cards → typing de
  narrativa → done) + chips + reset + related separado + paginación.
- **I3 — Detalle**: `/property/{id}` con semáforos, score explicado y
  comparables.
- **I4 — Mapa**: `/search/map` (forma (a) en el portal, forma (b) en el
  chat) — una sola llamada, sin filtrar del lado de P1 y sin aviso de
  parcialidad: ya viene el universo completo.

Instancia de prueba de P2: puerto 8001 local (la 8000 es del usuario).
Swagger: `http://localhost:8001/docs`.
