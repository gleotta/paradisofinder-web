# FINDER — Documento de Producto · Capa P1 (Presentación)

**Site:** paradisofinder.com · **Mercado:** San Juan (es-AR)
**Versión:** 1.1 — 2026-08-28, reconciliada con `P1_INTEGRATION_SPEC.md` y `HANDOFF_P1_2026-08-28.md`
**Regla de conflicto:** ante contradicción, ganan la spec y el handoff de P2.

---

## 0. Registro de reconciliación (qué cambió respecto de v1.0)

| Tema | v1.0 (sesión de producto) | v1.1 (tras spec/handoff P2) |
|---|---|---|
| Mapa en resultados | Split view con mapa activable + overlay de zonas | **Fuera de v1** (decisión 28/08; endpoint `/search/map` no existe; con lo que hay se dibujarían ~79 de ~300 puntos) |
| Selector de vertical en el portal | Segmentado `Alquiler | Compra` sobre el input | **Fuera de v1**: `/search/text` recibe solo texto y P2 infiere la vertical. Pedido de parámetro `vertical` registrado a P2 (handoff §4.2) |
| Cambio de operación en chat | P1 cerraba la sesión y abría una nueva | **Lo resuelve P2 dentro de la misma sesión** (estado acumulado, contexto conservado). P1 refleja la vertical vigente desde `riepilogo.vertical` — *cambio propuesto, ver §9* |
| Semáforo único por card | `semaforo` + `explicacion` | Vocabulario real: `primary_signal {text,type,color}` como señal principal + ratings `deal/resale/rental` con `reasons`, `opportunity_score` con `score_components`. null = no evaluado → se omite |
| Temporario | Chip dentro de Alquiler | Confirmado como chip, respaldado por la vertical real `temporary_rent` de P2 (excluida de `rent` por incomparabilidad de precios) |
| Mercado | Genérico (mocks con barrios de CABA) | **San Juan**; el mercado es configuración de la instancia de P2, no un parámetro |
| Contrato REST propio (`contrato-rest-p2.md`) | Shapes inventadas por P1 | **Eliminado.** Fuente de verdad: `P1_INTEGRATION_SPEC.md` + Swagger vivo |

---

## 1. Propósito y alcance

P1 es la capa de presentación de FINDER: una aplicación web conversacional para descubrir oportunidades inmobiliarias en San Juan. **Next.js**, consumiendo P2 vía REST según `P1_INTEGRATION_SPEC.md` (topología A: llamadas solo desde el servidor de P1, `X-API-Key` en env vars).

**Dentro del alcance:** home conversacional, resultados con scroll, clarificación con chips, detalle de propiedad, eventos de uso.
**Fuera del alcance:** mapa, selector de vertical en el portal, monetización, autenticación, favoritos/alertas, chat en el detalle, NLP (vive en P2).

## 2. Principios de producto

1. **El chat es la interfaz primaria.** Texto libre central; los chips son atajos que alimentan la conversación.
2. **Lo que escribe el usuario predomina** sobre cualquier selección de UI.
3. **Toda señal se explica.** `primary_signal`, ratings y score siempre con sus textos de P3, mostrados tal cual.
4. **El límite y el vacío invitan a refinar.** Tope de 30 → invitación a afinar; cero resultados → mensaje + `suggestions[]` de P2. En San Juan el 0 casi siempre es el mercado (zonas sin stock; temporario ~10 avisos), no un bug.
5. **CLARIFICATION es diseño, no error:** se renderiza como pregunta con chips.

## 3. Home conversacional

- Hero con campo de texto libre central estilo ChatGPT/Gemini/Claude. Conversación completa, no solo búsqueda.
- **Sin selector de vertical** (v1): P2 infiere venta / alquiler / temporario del texto. Cuando no hay señal suficiente, P2 devuelve clarification con chips `[Comprar] [Alquilar] [Invertir]`.
- **Chips de oportunidad** (uno activo máx., toggle, combinable con texto):

| Chip | Intención | Respaldo en P2 |
|---|---|---|
| Temporarios | Alquiler temporario / habitaciones | Vertical `temporary_rent` |
| Los más baratos | Menor precio absoluto | Orden `price_asc` |
| Gangas de la zona | Bajo comparables de zona | `valuation_gap_desc` / `price_percentile_asc` |
| Para renta | Comprar para alquilar | `investment` + `gross_yield_desc` |
| Para revalorizar | Comprar para vender | `investment` + `valuation_gap_desc` |
| Bajo precio de zona | Más baratas que su zona | `price_percentile_asc` |

- **Regla de mercado (28/08):** "para alquilar" es SIEMPRE un inquilino; el inversor lo dice explícito ("comprar para alquilar", "para renta"). P1 no compensa.

## 4. Flujo de búsqueda y sesión

1. **Primera consulta:** `POST /search/text`, `limit=10` (stateless). Se guarda `extraction.params`.
2. **Scroll:** `POST /search/structured` con esos params + offset — **10 × 3 = tope 30 por consulta**. Agotado `total_matches`, opcionalmente `/search/semantic` como "similares" (dedup en P1).
3. **Refinamiento:** al volver a escribir, se crea sesión y se pasa al canal SSE (`/search/stream`). El estado se acumula **en P2**.
4. **Clarificación:** pregunta + chips; chip → `vertical_override` en chat / query antepuesta en portal.
5. **Cambio de vertical en chat:** dentro de la misma sesión, resuelto por P2 con contexto conservado; P1 refleja `riepilogo.vertical` y muestra `nota_asuncion` cuando viene.

## 5. Vista de resultados

- **Lista de cards** con chat anclado abajo, persistente. Sin mapa en v1.
- Contador "N resultados" = **`total_matches`**; `total` es solo las cards de la página.
- **Complemento** (similares que no cumplen filtros duros): bloque separado y marcado.
- SSE: cards + `riepilogo` al instante, narrativa con efecto typing, `done` cierra. La narrativa no se parsea.
- Card según contrato de display de la spec §5: precio original + `price_usd` de referencia, sufijo por `rental_period`, `primary_signal` como señal principal explicada, ratings con reasons (null = no evaluado → omitir), procedencia (`sources`, `listing_url`), `days_on_market`, atributos como chips solo si vienen.

## 6. Vista detallada

Página propia con URL por propiedad (patrón Airbnb/Booking), sin chat. Fuente: `GET /property/{id}` (+ `/card` para previews OG en metadatos).

Orden narrativo: galería → señales + score explicado (`score_components`, `market_context`) → indicadores de mercado según operación → comparables → datos duros → descripción original → contacto → source. Habitaciones: `beds`, `double_bed`, `private_bathroom`, `room_class`; sin `price_per_sqm`.

## 7. Estética

Tokens de paradisoestate.it (violeta `#4D1480`/`#3A0F62`, magenta `#EB4283`, ink `#241032`, lila `#F4EDF7`, bordes `#E7DCEF`, pasteles de apoyo; serif display + sans body; contenedor 1120px). Los colores `green/yellow/red` de las señales de P3 son un sistema semántico aparte que debe armonizar con la paleta.

## 8. Observabilidad (día uno)

`POST /events` (fire-and-forget) para: consulta (texto, chip) · sin resultados · clarificación mostrada / chip elegido · páginas 2 y 3 · complemento mostrado · apertura de detalle · click en contacto · click en source. El pipeline aguas abajo lo define el Arquitecto; P1 garantiza la emisión.

## 9. Pendientes y decisiones abiertas

**Requieren confirmación de producto:**
- **Corte de sesión al cambiar de vertical:** v1.0 lo definía; v1.1 propone delegarlo a P2 (misma sesión, contexto conservado), porque el corte destruiría el contexto acumulado que P2 mantiene por diseño. *A confirmar por German.*
- **Estrategia híbrida portal→chat** (primera consulta stateless + refinamientos por SSE) vs. todo conversacional desde el primer mensaje. La híbrida sigue el checklist I1→I2 de la spec y la paginación solo está documentada en modo portal. *A confirmar.*

**Registrados como pedidos a P2 (handoff §4):**
- Parámetro `vertical` en `/search/text` (habilitaría el selector del portal).
- Endpoint `POST /search/map` (habilitaría el mapa: universo tier ≥ 2 completo, 2.476 avisos con coordenadas).
- Formas libres de cambio de intención en chat ("en cualquier zona", "no, mejor para revender") — en plan de trabajo de P2; P1 no compensa.

**Pendientes de P3 (vía P2):** dúplex como tipo propio; ruido de datos (precios anómalos, duplicados).

**Pendientes de diseño/producto menores:** tonos de señales que armonicen con la paleta; naming "Gangas de la zona" vs "Bajo precio de zona"; responsive del listado; SEO de detalle (aprovechar `/property/{id}/card` OG).
