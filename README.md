# paradisofinder.com — P1 · FINDER San Juan (es-AR)

Capa de presentación de FINDER para el mercado San Juan: **búsqueda simple en texto libre**
con listado + mapa (patrón Airbnb). Next.js (App Router). Antes de tocar código, leer
`CLAUDE.md` y los docs en el orden que indica (`docs/HANDOFF_P1_2026-08-28.md` →
`docs/P1_INTEGRATION_SPEC.md` → `docs/prompt-inicial.md` → `docs/producto-p1.md`), más los
dos registros de decisión que revierten cosas de esos documentos:
`docs/DECISION_2026-08-29_mapa.md` y `docs/DECISION_2026-08-29_busqueda-simple.md`.

## Correr en desarrollo

```bash
npm install
npm run dev        # http://localhost:3000
```

**Ya viene apuntado a P2 real** (`.env.local` → `http://localhost:8000`, el Docker local).
Si P2 está apagado, cae solo a los mocks de `/mocks` (modo demo). Para cambiar de
instancia, editar `.env.local` (ver `.env.example`).

`P2_MODE`: `auto` (default: P2 si hay URL, mocks si la conexión falla) · `live` · `mock`.

## Arquitectura (topología A)

El browser **nunca** habla con P2. Todo pasa por el server de P1:

```
POR BÚSQUEDA (sesión nueva cada vez — sin memoria entre consultas):
browser ── /api/sessions          ──► POST /api/v1/sessions           → session_id
        ── /api/search/stream     ──► POST /api/v1/search/stream      (SSE)
                                        cards → 20 cards (fijas), riepilogo, suggestions
                                        response_chunk → resumen en prosa
                                        done → context.search_params
        ── /api/search/map        ──► POST /api/v1/search/map {session_id}  (pins, sin tope)
SCROLL (10 × 3, tope 30) — la página 2 sale del buffer del stream, sin red:
        ── /api/search/structured ──► POST /api/v1/search/structured  (con context.search_params)
        ── /api/search/semantic   ──► POST /api/v1/search/semantic    ("similares", dedup en P1)
SIEMPRE:
        ── /api/events            ──► POST /api/v1/events             (fire-and-forget)
página de detalle (server component) ──► GET /api/v1/property/{id}
```

`/api/search` (`/search/text`, portal stateless) sigue disponible pero la UI no lo usa: el
canal con streaming da además `suggestions`, los chips de clarificación y el resumen en
prosa. Comparación medida de las tres opciones en
`docs/DECISION_2026-08-29_busqueda-simple.md`.

`X-API-Key` vive en env vars del server (`src/lib/p2/client.ts`); jamás en código cliente.

## Mapa del código

| Ruta | Qué es |
|---|---|
| `src/app/page.tsx` + `src/components/SearchHero.tsx` | Pantalla 1: home (input libre + chips de oportunidad) |
| `src/app/buscar/` + `src/components/SearchResultsView.tsx` | Pantalla 2: búsqueda simple (sesión nueva + SSE) — listado izquierda + mapa derecha |
| `src/lib/sse.ts` | Parser SSE (ojo: P2 usa CRLF; ver hallazgos) |
| `src/components/ResultsMap.tsx` | Mapa Leaflet con clustering, alimentado por `/search/map` |
| `src/app/propiedad/[id]/` | Pantalla 3: detalle con señales explicadas, indicadores, comparables |
| `src/lib/p2/` | Contrato (`types.ts`), cliente server-only (`client.ts`), mocks (`mocks.ts`) |
| `src/lib/format.ts` / `labels.ts` | Reglas de display de la card (spec §5) y etiquetas es-AR de códigos estables |
| `src/lib/chips.ts` | Chips de oportunidad → frases canónicas para P2 |
| `src/lib/track.ts` + `src/app/api/events/` | Observabilidad (`trackEvent`, fire-and-forget) |

## Reglas que este código respeta (no romper)

- Contador de resultados = `total_matches`, nunca `total`.
- CLARIFICATION se renderiza como pregunta con chips, jamás como error.
- Señales/ratings/score siempre con sus `reasons`/`score_components`, textos de P3 tal cual.
- `null` = no informado → se omite (nunca 0; en ratings, jamás "malo").
- Precio principal = el original del aviso; comparaciones solo por `price_usd`; sufijo por
  `rental_period` en alquileres; `price_per_sqm` solo en ventas.
- Paginación 10 × 3 (tope 30): el stream trae 20 fijas (ignora `limit`), se muestran 10 y
  las otras 10 quedan de buffer → la página 2 es instantánea; la 3 va por
  `/search/structured`. Ojo: `context.search_params` llega en `done`, después de la prosa
  (~2,7 s), así que el scroll espera a tenerlo en vez de caer a `/search/semantic`.
  Agotado `total_matches`, `/search/semantic` completa con "similares" (dedup por id en P1).
- Mapa (decisión 29/08, `docs/DECISION_2026-08-29_mapa.md`): split tipo Airbnb alimentado
  por `POST /search/map`, que ya devuelve el universo mapeable filtrado server-side.
  Nunca mandarle `limit`/`offset`/`order` (schema `extra="forbid"` → 422): usar
  `toMapRequest()`. Con clustering, porque un criterio real trae cientos de pins.
- Diferencias del contrato real ya contempladas: `deal_rating_reasons` y el SSE con CRLF —
  ver `docs/HALLAZGOS_DATOS_REALES_2026-08-29.md`.
- Sin selector de vertical en el portal (decisión 28/08).

## Consultas para probar (contra P2 real)

`casa en rawson` (189 resultados, 139 pins, tope 30 al scrollear) · `departamento en capital`
(421 / 333 pins) · `departamento en jachal` (0 resultados → acciones para relajar el criterio
+ bloque "Podrían interesarte") · `algo lindo` (clarificación con chips) · `comprar hola`
(P2 sigue sin señal → P1 pide un dato concreto en vez de repetir los chips).
