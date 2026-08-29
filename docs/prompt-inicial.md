# PROMPT INICIAL — Construcción de la capa P1 de FINDER (paradisofinder.com)
**Versión 1.1 — reconciliada con `P1_INTEGRATION_SPEC.md` (2026-08-26) y `HANDOFF_P1_2026-08-28.md`**

> Prompt autocontenido para el agente/equipo que construye P1 desde cero.
> **Fuente de verdad del contrato API:** `docs/P1_INTEGRATION_SPEC.md` + Swagger vivo de P2 (`http://localhost:8001/docs`). Este prompt define producto y UX; ante conflicto con la spec, gana la spec.

---

Sos el equipo de desarrollo frontend de **FINDER**. Vas a construir **P1, la capa de presentación**, en **paradisofinder.com**, para el mercado **San Juan (es-AR)**.

## Stack y arquitectura

- **Next.js (App Router)**, UI en español (es-AR).
- **Topología A** (spec §0): P2 se llama SOLO desde el servidor de P1. `X-API-Key` en env vars del server. Rate limits por IP compartida del server: cachear/dimensionar en P1.
- El **mercado no se manda**: esta instancia es San Juan. P1 no envía provincia ni ciudad como parámetro global.
- Cliente API desacoplado: mientras no haya P2 corriendo, servir los ejemplos de `/mocks` (ilustrativos; la shape real está en Swagger/Postman).

## Concepto de producto

FINDER no es un buscador con filtros: **la interfaz primaria es conversacional**. El usuario escribe en texto libre, el sistema responde con resultados + narrativa, y se refina conversando. Todo prefiltro visible (chips) es un atajo que alimenta la conversación. Principio rector: **lo que escribe el usuario predomina sobre cualquier selección de UI**.

## Orden de construcción (checklist de la spec §7)

- **I1 — Portal:** `/search/text` + scroll (`/search/structured` + `/search/semantic`) + render de la Card (spec §5) + clarificación con chips.
- **I2 — Chat SSE:** `POST /sessions` + `/search/stream` (cards → typing de narrativa → done) + chips + reset + complemento separado.
- **I3 — Detalle:** `GET /property/{id}` con señales, score explicado y comparables.

## Pantalla 1 — Home conversacional

- Single page con hero: título + **campo de texto libre central** estilo ChatGPT/Gemini/Claude.
- **Sin selector de vertical en v1**: `POST /search/text` recibe solo texto y P2 infiere la vertical (venta / alquiler / temporario). El parámetro `vertical` en el portal no existe hoy (handoff §4.2, pedido registrado a P2).
- **Chips de oportunidad** bajo el campo (máximo uno activo; toggle; combinable con el texto escrito). Cada chip inyecta su intención en la consulta usando el vocabulario que P2 entiende:

| Chip | Intención | Mecánica sugerida |
|---|---|---|
| `Temporarios` | Vertical `temporary_rent` | En chat: `vertical_override`; en portal: frase canónica en la query |
| `Los más baratos` | Orden `price_asc` | Frase canónica ("las más baratas primero") o `order` en structured |
| `Gangas de la zona` | Bajo comparables (`valuation_gap_desc` / `price_percentile_asc`) | Ídem |
| `Para renta` | `investment` + `gross_yield_desc` | Ídem |
| `Para revalorizar` | `investment` + `valuation_gap_desc` | Ídem |
| `Bajo precio de zona` | `price_percentile_asc` | Ídem |

- **Regla de mercado a respetar (handoff §3):** "para alquilar" es SIEMPRE un inquilino; el inversor lo dice explícito ("comprar para alquilar", "para renta"). P1 no compensa nada: si un usuario reporta "busqué 'para alquilar' y me mostró alquileres", está bien.

### Flujo de búsqueda y conversación

1. **Primera consulta** (desde la home): `POST /search/text` con `limit=10`. Guardar `extraction.params`.
2. **Scroll infinito**: `POST /search/structured` con esos params + `offset` 10, 20 — **tope 30 resultados por consulta** (3 páginas de 10). Si `total_matches` se agota antes, opcionalmente completar con `/search/semantic` (dedup por id en P1, cards marcadas como similares).
3. **Refinamiento** (el usuario vuelve a escribir en el input anclado): crear sesión (`POST /sessions`) y pasar al canal SSE `POST /search/stream`. El estado se acumula turno a turno **en P2** — P1 solo envía texto.
4. **CLARIFICATION** (en ambos modos): renderizar como pregunta del sistema con chips `[Comprar] [Alquilar] [Invertir]`. Chip clickeado → en chat, reintento con `vertical_override` (`comprar|alquilar|invertir`); en portal, reintentar la misma query anteponiendo la elección.
5. **Cambio de vertical dentro del chat** ("mejor en alquiler"): lo resuelve P2 dentro de la misma sesión, conservando el contexto acumulado. P1 **no corta la sesión**; refleja la vertical vigente desde `riepilogo.vertical`. "Empecemos de nuevo" → P2 devuelve clarification con contexto limpio.

## Pantalla 2 — Resultados

- **Lista de cards** (sin mapa: decisión 28/08 — no construirlo; el endpoint `/search/map` no existe).
- **Chat anclado abajo, persistente**: refinar sin salir; la lista se actualiza.
- **Contador "N resultados" = `total_matches`**, nunca `total`.
- **`complemento.cards`** (similares que NO cumplen los filtros duros): renderizar en bloque SEPARADO y marcado como "similares".
- En SSE: renderizar `cards` + `riepilogo` al instante (~20 ms), concatenar `response_chunk` con efecto typing, cerrar en `done`. Mostrar `riepilogo.nota_asuncion` cuando venga (ej. "Asumí compra — decime si buscás alquilar").
- **Cero resultados**: mensaje conversacional + `suggestions[]` de P2 como chips de acción ("Ampliar la zona", "Ajustar el presupuesto"). En San Juan el 0 suele ser el mercado (Zonda, Calingasta, Jáchal devuelven 0 seguido; temporario tiene ~10 avisos): jamás un vacío mudo.
- **Tope de 30 alcanzado**: mensaje del sistema invitando a refinar (barrio, rango de precio, prioridad).

### Card — reglas de display (resumen; contrato completo en spec §5)

- Precio principal SIEMPRE el original del aviso (`price` + `currency`); `price_usd` como referencia secundaria en ARS. Sufijo por `rental_period` en alquileres (`/día`, `/semana`, `/mes`; null = asumir mensual sin comparar entre periodicidades). `price_per_sqm` solo en ventas.
- **Señal principal**: `primary_signal {text, type, color}` tal cual — es el "semáforo con explicación" de la card.
- Ratings `deal_rating`, `resale_investment_rating`, `rental_investment_rating` (`green|yellow|red|null`) con sus `*_reasons[].text` tal cual. **null = NO EVALUADO → omitir, jamás "malo"**. Los `resale_*`/`rental_*` solo en ventas.
- `opportunity_score` (0-100) nunca solo: siempre con `score_components` (display directo, ya localizado).
- `market_context`: frase lista, tal cual; null = nada que destacar.
- Atributos null = no informado → omitir (nunca 0). Chips de atributos (`pool`, `parking`, `furnished`…) solo si vienen.
- **Procedencia**: mostrar `sources[]` y `listing_url` (link al aviso original). `publisher`: "Inmobiliaria" / "Dueño directo".
- `days_on_market` → "N días publicada". `gross_yield_pct` visible en ventas cuando viene (mediana ~7,9% en AR).
- Textos de P3 localizados (`content_language: es-AR`): **mostrar tal cual, no traducir ni reescribir**. Los `code` sí son estables para lógica.
- Dúplex: se tipifica como `apartment` (regla 28/08); no crear tipo aparte en la UI.

## Pantalla 3 — Detalle de propiedad

- **Página nueva con URL propia** (patrón Airbnb/Booking). Sin chat embebido en v1.
- Datos: `GET /property/{id}` → `PropertyDetail` (Card + `description`, `heating`, `year_built`, `beds`, `private_bathroom`, `double_bed`) + `comparables` (MiniCard[]) + `score_components`.
- Orden narrativo (el diferencial arriba):
  1. **Galería** (`photos[]`).
  2. **Señales + Score explicado**: `primary_signal`, ratings con reasons, `opportunity_score` con `score_components`, `market_context`.
  3. **Indicadores de mercado**: `valuation_gap_pct`, `price_percentile`, `estimated_monthly_rent`, `gross_yield_pct`, `rent_to_price_ratio`, `comparables_count`, `zone_supply` — según operación.
  4. **Comparables** (MiniCards).
  5. **Datos duros**: tipo, m², ambientes, dormitorios, baños, condición, piso, antigüedad (`year_built`), zona, dirección.
  6. **Descripción** original del aviso.
  7. **Contacto** (`contact`, `publisher`) respetando la política de contacto del producto.
  8. **Source**: `sources[]`, `listing_url`, fechas de publicación/actualización.
- Habitaciones (`property_type: room`): mostrar `beds`, `double_bed`, `private_bathroom`, `room_class`; no tienen `price_per_sqm` ni operación venta.
- `GET /property/{id}/card` existe para previews OG (WhatsApp) — usarlo en metadatos de la página.

## Errores (spec §6)

401 config server · 404 sesión expirada → crear nueva y reintentar · 422 loguear como bug · 429 backoff · 502/503 mensaje explícito + retry · 500 genérico + retry. En SSE los errores llegan como `event: error` con HTTP 200.

## Estética (obligatoria)

Referencia visual: paradisoestate.it.

```css
--purple: #4D1480;        /* primario */
--purple-deep: #3A0F62;
--magenta: #EB4283;       /* acento / CTAs */
--ink: #241032;           /* texto */
--muted: #6B5C79;
--lilac: #F4EDF7;         /* fondos de sección */
--line: #E7DCEF;          /* bordes */
--white: #FFFFFF;
/* pasteles de apoyo: #F7B8D4 #E4D3F2 #C9B4DE #FFD7E8 #D9C2EC */
--display: Georgia, 'Times New Roman', serif;   /* títulos */
--body: 'Segoe UI', system-ui, -apple-system, sans-serif;
--maxw: 1120px;
```

Cards blancas sobre fondo lila, títulos serif, acentos magenta. Los colores de señales (`green`/`yellow`/`red` de P3) son un sistema semántico aparte: elegir tonos que armonicen.

## Observabilidad (día uno)

Interfaz `trackEvent` → `POST /events { session_id, event_type, payload }` (fire-and-forget): consulta realizada (texto, chip) · sin resultados · clarificación mostrada / chip elegido · carga de páginas 2 y 3 · complemento mostrado · apertura de detalle · click en contacto · click en source/listing_url.

## Fuera de alcance de v1

Mapa (decisión 28/08) · selector de vertical en el portal (param inexistente en P2, pedido registrado) · monetización · autenticación · favoritos/alertas · chat en el detalle · NLP (vive en P2).
