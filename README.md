# paradisofinder.com — P1 · FINDER San Juan (es-AR)

Capa de presentación de FINDER: búsqueda inmobiliaria **conversacional** para el mercado
San Juan. Next.js (App Router). Antes de tocar código, leer `CLAUDE.md` y los docs en el
orden que indica (`docs/HANDOFF_P1_2026-08-28.md` → `docs/P1_INTEGRATION_SPEC.md` →
`docs/prompt-inicial.md` → `docs/producto-p1.md`).

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
browser ── /api/search            ──► POST /api/v1/search/text        (1ª consulta, limit=10)
        ── /api/search/structured ──► POST /api/v1/search/structured  (scroll 10×3, tope 30)
        ── /api/search/semantic   ──► POST /api/v1/search/semantic    ("similares", dedup en P1)
        ── /api/search/map        ──► POST /api/v1/search/map         (pins del mapa, sin tope)
        ── /api/sessions          ──► POST /api/v1/sessions           (chat, TTL 24 h)
        ── /api/chat              ──► POST /api/v1/search/stream      (SSE passthrough)
        ── /api/events            ──► POST /api/v1/events             (fire-and-forget)
página de detalle (server component) ──► GET /api/v1/property/{id}
```

`X-API-Key` vive en env vars del server (`src/lib/p2/client.ts`); jamás en código cliente.

## Mapa del código

| Ruta | Qué es |
|---|---|
| `src/app/page.tsx` + `src/components/SearchHero.tsx` | Pantalla 1: home conversacional (input libre + chips de oportunidad) |
| `src/app/buscar/` + `src/components/ConversationView.tsx` | Pantalla 2: resultados + chat anclado (portal stateless → refinamientos por SSE) |
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
- Paginación 10 × 3 (tope 30) solo en modo portal; los turnos de chat muestran lo que P2 devuelve.
- Mapa (decisión 29/08, `docs/DECISION_2026-08-29_mapa.md`): split tipo Airbnb alimentado
  por `POST /search/map`, que ya devuelve el universo mapeable filtrado server-side.
  Nunca mandarle `limit`/`offset`/`order` (schema `extra="forbid"` → 422): usar
  `toMapRequest()`. Con clustering, porque un criterio real trae cientos de pins.
- Diferencias del contrato real ya contempladas: `deal_rating_reasons`, SSE con CRLF y
  siembra de la sesión del chat — ver `docs/HALLAZGOS_DATOS_REALES_2026-08-29.md`.
- Sin selector de vertical en el portal (decisión 28/08).

## Demo con mocks

Consultas útiles contra el mock: `casa en rawson` (87 resultados, tope 30 al scrollear) ·
`depto para alquilar en pocito` (23 → agota y completa con similares semánticos) ·
`casa en zonda` (0 resultados + sugerencias) · `alquiler temporario` (mercado chico +
complemento) · `hola` (clarificación con chips) · en el chat: `empecemos de nuevo` (reset).
