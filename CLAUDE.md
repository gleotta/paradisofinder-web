# paradisofinder.com — Capa P1 de FINDER · Mercado San Juan (es-AR)

Este repo contiene **P1, la capa de presentación** de FINDER, plataforma de inteligencia inmobiliaria conversacional.

**Orden de lectura obligatorio antes de codear:**
1. `docs/HANDOFF_P1_2026-08-28.md` — orientación de P2 y reglas de producto vigentes.
2. `docs/P1_INTEGRATION_SPEC.md` — **fuente de verdad del contrato REST** (junto al Swagger vivo de P2).
3. `docs/prompt-inicial.md` — instrucción de construcción de P1 (reconciliada con los dos anteriores).
4. `docs/producto-p1.md` — definición funcional de producto.

**Regla de conflicto:** si algo de `prompt-inicial.md` o `producto-p1.md` contradice la spec o el handoff de P2, **ganan la spec y el handoff**, y se deja registro del conflicto.

## Stack

- **Next.js (App Router)**. UI en español (es-AR).
- **Topología A:** P1 llama a P2 SOLO desde su servidor (route handlers / server components). El browser nunca llama a P2 directo. Header `X-API-Key` desde variables de entorno del server — jamás en código cliente.
- El mercado NO es un parámetro: esta instancia ES San Juan (`market_citta` es config del servidor de P2).

## Reglas de producto innegociables (P1)

1. **El chat es la interfaz primaria.** La home es un campo de texto libre central; los chips de oportunidad son atajos que alimentan la conversación.
2. **Lo que escribe el usuario predomina** sobre cualquier selección de UI.
3. **CLARIFICATION es diseño, no error:** renderizarla como pregunta del sistema con sus chips (`[Comprar] [Alquilar] [Invertir]`), nunca como falla.
4. **Ninguna señal sin explicación:** `primary_signal`, ratings y score siempre acompañados de sus `reasons`/`score_components` (texto de P3, tal cual).
5. **Paginación 10 × 3:** páginas de 10, scroll infinito, tope 30 resultados por consulta (mecánica de scroll: spec §2).
6. **Cero resultados nunca es un vacío mudo:** mensaje conversacional + `suggestions[]` de P2. En San Juan el 0 casi siempre es el mercado, no un bug.
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

Toda interacción emite eventos a `POST /events` de P2 (fire-and-forget) vía una interfaz `trackEvent`: consulta, sin-resultados, clarificación mostrada/chip elegido, chips de oportunidad, paginación, apertura de detalle, click en contacto y en source.

## Diferencias del contrato real (verificadas 29/08 — detalle en `docs/HALLAZGOS_DATOS_REALES_2026-08-29.md`)

- La clave de reasons del precio es **`deal_rating_reasons`** (no `deal_reasons`): leerla con `dealReasons()` de `src/lib/format.ts`, o el rating queda sin explicación.
- **El SSE de P2 usa CRLF**: el parser debe separar bloques por `\r\n\r\n` (buscar solo `\n\n` deja el chat mudo, sin error).
- La sesión del chat **nace vacía**: el primer refinamiento tras una búsqueda del portal se siembra con la consulta original (si no, P2 responde clarificación).
- Campos extra reales: `secondary_indicators[]` (`{name,value,tooltip}`, se muestran) y `score_badge_color`. `heating: "unknown"` = no informado.

## Mocks

`/mocks` contiene ejemplos ilustrativos en el vocabulario público de la card. **La verdad es el Swagger vivo de P2 y la colección Postman** (`docs/postman/FINDER_Core.postman_collection.json` en el repo de P2). Ante cualquier diferencia, ganan Swagger/Postman.

## Fuera de alcance

Monetización, autenticación, favoritos/alertas, mapa, chat en la vista de detalle, interpretación de lenguaje natural (vive en P2).
