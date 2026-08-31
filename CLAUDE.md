# paradisofinder.com — Capa P1 de FINDER · Mercado San Juan (es-AR)

Este repo contiene **P1, la capa de presentación** de FINDER, plataforma de inteligencia inmobiliaria conversacional.

**Orden de lectura obligatorio antes de codear:**
1. `docs/HANDOFF_P1_2026-08-28.md` — orientación de P2 y reglas de producto vigentes.
2. `docs/P1_INTEGRATION_SPEC.md` — **fuente de verdad del contrato REST** (junto al Swagger vivo de P2). El delta del 29-30/08 (renombres incompatibles, mapa, paginación) está en `docs/CAMBIOS_P2_PARA_P1_2026-08-30.md` — ya aplicado en P1 el 30/08.
3. `docs/prompt-inicial.md` — instrucción de construcción de P1 (reconciliada con los dos anteriores).
4. `docs/producto-p1.md` — definición funcional de producto.

**Regla de conflicto:** si algo de `prompt-inicial.md` o `producto-p1.md` contradice la spec o el handoff de P2, **ganan la spec y el handoff**, y se deja registro del conflicto.

## Stack

- **Next.js (App Router)**. UI en español (es-AR).
- **Topología A:** P1 llama a P2 SOLO desde su servidor (route handlers / server components). El browser nunca llama a P2 directo. Header `X-API-Key` desde variables de entorno del server — jamás en código cliente.
- El mercado NO es un parámetro: esta instancia ES San Juan (`market_citta` es config del servidor de P2).

## Reglas de producto innegociables (P1)

1. **Búsqueda simple, NO conversacional** (cambiado 29/08 por German — ver `docs/DECISION_2026-08-29_busqueda-simple.md`; revierte el principio original "el chat es la interfaz primaria"). Campo de texto libre central en la home y barra de búsqueda sticky en resultados. Resultados: listado a la izquierda, mapa a la derecha (patrón Airbnb). **Por debajo usa `POST /sessions` + SSE `/search/stream` con una sesión NUEVA por consulta** (opción C): no hay memoria entre búsquedas, pero sí se aprovechan los textos de P2 (`suggestions`, mensaje y chips de clarificación, `summary` con `assumption_note`, resumen en prosa). La sesión vive solo para esa búsqueda: chips de clarificación (`vertical_override`), `suggestions` y el scroll se resuelven dentro de ella.
2. **Lo que escribe el usuario predomina** sobre cualquier selección de UI.
3. **CLARIFICATION es diseño, no error:** renderizarla como pregunta del sistema con el `message` y los `chips` que manda P2, nunca como falla. El chip reintenta con `vertical_override` en la misma sesión. (Si se usara `/search/text`, ese canal NO manda `message` ni `chips` y habría que ponerlos en P1.)
4. **Ninguna señal sin explicación:** `primary_signal`, ratings y score siempre acompañados de sus `reasons`/`score_components` (texto de P3, tal cual).
5. **Scroll infinito de a 10 hasta agotar el criterio, SIN tope** (cambiado 30/08 por German — ver `docs/DECISION_2026-08-30_scroll-completo.md`; reemplaza el "10 × 3, tope 30" del prompt inicial). Página 2 sale del buffer de las 20 del turno; las siguientes paginan la MISMA sesión con `{session_id, offset}` sin `query` (spec §3: no es un turno, sin LLM, ~100 ms, SSE `cards` → `done` sin narrativa). El criterio completo vive en P2 — nada que reenviar ni que poder perder (`preferred_property_type` incluido). El motivo del cambio: `related` viaja SOLO en la última página del criterio — con un tope, en toda búsqueda de más de 30 resultados no llegaba nunca. OJO render: la última página puede venir corta (p. ej. 2 cards + 10 `related` con 62 resultados) y se muestra entera.
6. **Cero resultados nunca es un vacío mudo:** el resumen en prosa de P2 lo explica, y debajo van sus `suggestions[]` como chips de acción (se responden en la misma sesión) + `related` como "Podrían interesarte" (con 0 resultados la primera página ES la última, así que `related` llega de una). OJO: `suggestions[]` solo existe en el evento `cards` del SSE; en `POST /search/text` viene `null` (verificado 29/08 y 30/08). En San Juan el 0 casi siempre es el mercado, no un bug.
7. **Contador de resultados = `total_matches`** (total real en DB), no `total` (cards de la página).
8. **Mapa (cambiado 29/08, decisión de German — ver `docs/DECISION_2026-08-29_mapa.md`):** split view tipo Airbnb alimentado por **`POST /search/map`** (P2 lo implementó el 29/08): devuelve el universo mapeable del criterio, ya filtrado server-side por `quality_tier >= 2` + coordenadas — P1 no vuelve a filtrar. Forma (b) con `session_id` en chat, forma (a) con `toMapRequest(params)` en portal; el schema es `extra="forbid"`, así que NUNCA mandar `limit`/`offset`/`order`. El aviso sobre el mapa dice "N de M con ubicación publicada" (la diferencia son los avisos tier 1, sin coordenadas).
9. **Detalle de propiedad:** página propia con URL por propiedad, sin chat embebido.

## Reglas duras heredadas de la spec (NO violar — detalle en spec §5)

- NO recalcular indicadores ni umbrales: todo viene precomputado de P3.
- NO traducir ni reescribir textos de P3 (`text` de reasons, `market_context`, componentes): mostrarlos tal cual; `content_language` declara el idioma.
- NO comparar `price` nominal entre monedas: comparar por `price_usd`.
- NO tratar `null` como 0 ni como "no tiene": null = no informado → omitir. En ratings, null = NO EVALUADO, jamás "malo".
- NO comparar precios de alquiler sin mirar `rental_period`.
- NO parsear la narrativa (`response_chunk`): es texto libre.

## Estética

Tokens obligatorios (referencia paradisoestate.it), definidos en `docs/prompt-inicial.md`: violeta `#4D1480` / `#3A0F62`, magenta `#EB4283`, ink `#241032`, fondo lila `#F4EDF7`, cards blancas, títulos serif (Georgia), cuerpo sans, contenedor 1120px.

## Observabilidad

Toda interacción emite eventos a `POST /events` de P2 (fire-and-forget) vía una interfaz `trackEvent`: consulta, sin-resultados, clarificación mostrada/chip elegido, chips de oportunidad, paginación, apertura de detalle, click en contacto y en source, y los del mapa (abrir/cerrar, click en marker, carga de pins).

## Diferencias del contrato real (verificadas 29-30/08 — detalle en `docs/HALLAZGOS_DATOS_REALES_2026-08-29.md` y `docs/CAMBIOS_P2_PARA_P1_2026-08-30.md`)

- **Renombres incompatibles del 29-30/08 (spec §5b), ya aplicados en P1:** `complemento` → `related` (shape `{reason, count, cards}`, llega SOLO en la última página, máx 10, ya deduplicado), `riepilogo` → `summary` (claves en inglés: `zone`, `property_type`, `order`, `assumption_note`, `total_results`), `citta` → `market`.
- La clave de reasons del precio es **`deal_rating_reasons`** (no `deal_reasons`): leerla con `dealReasons()` de `src/lib/format.ts`, o el rating queda sin explicación.
- **El SSE de P2 usa CRLF**: el parser debe separar bloques por `\r\n\r\n` (buscar solo `\n\n` deja el chat mudo, sin error).
- La sesión del chat **nace vacía**: el primer refinamiento tras una búsqueda del portal se siembra con la consulta original (si no, P2 responde clarificación).
- Campos extra reales: `secondary_indicators[]` (`{name,value,tooltip}`, se muestran) y `score_badge_color`. `heating: "unknown"` = no informado. El evento `cards` real NO manda `content_language` (el spec §3 lo muestra): tratarlo como opcional.
- **La clarificación puede venir SIN chips** (visto 31/08: `clarification_reason: "otra_ciudad"` con `chips: []` y `nivel1_required: false` — p. ej. "casas en concepcion", localidad de Capital que el extractor confunde con otra ciudad; reportado a P2). P1 muestra búsquedas de ejemplo en ese caso para no dejar un callejón sin salida.
- **`/search/stream` acepta `limit` y `offset` desde el 29/08** (antes los ignoraba): `{session_id, offset}` SIN `query` pagina el criterio acumulado — no es un turno, no pasa por el LLM (medido 14-21 ms) y emite `cards` → `done` sin `response_chunk`. Paginar una sesión que no buscó, o mandar un request sin `query`/`vertical_override`/`offset`, da 422.
- **El costo del stream es la narrativa, no la búsqueda** (medido 29/08 con `meta.latency_ms`): extracción 2 ms — usa el mismo extractor determinístico `fast` que `/search/text` —, búsqueda 80 ms, **narrativa LLM 2.700 ms**. Las cards salen a los ~85 ms; la prosa llega después. Nunca atar la UI al cierre del stream.
- `context.search_params` sigue viajando en `done` con el vocabulario interno del motor (no es contrato de nombres). Ya NO es la base del scroll — la paginación va por sesión — pero `/search/structured` y `/search/map` lo siguen aceptando como alias.

## Mocks

`/mocks` contiene ejemplos ilustrativos en el vocabulario público de la card. **La verdad es el Swagger vivo de P2 y la colección Postman** (`docs/postman/FINDER_Core.postman_collection.json` en el repo de P2). Ante cualquier diferencia, ganan Swagger/Postman.

## Fuera de alcance

Monetización, autenticación, favoritos/alertas, chat en la vista de detalle, interpretación de lenguaje natural (vive en P2). (El mapa DEJÓ de estar fuera de alcance el 29/08 — regla de producto 8.)
