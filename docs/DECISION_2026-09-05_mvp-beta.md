# Decisión 2026-09-05 — Primer MVP: beta, analítica, publicar, pestaña nueva, fotos

**Pedido de German (05/09)**, pensando en el primer MVP público. Cinco puntos:

1. **Indicar que es una versión beta.**
2. **Tracking** de la consulta, algún score de los resultados obtenidos y la
   navegación sencilla (qué detalle se abre, cuál no), para después analizar
   consulta → resultados → interacción.
3. **Botón para que inmobiliarias/dueños nos contacten** para publicar (WhatsApp).
4. **Cada detalle de propiedad abre en una pestaña nueva** (antes: misma pestaña).
5. **Usar todas las fotos en el detalle** (se sospechaba que no).

## Qué se hizo

### 1. Beta
- Etiqueta **Beta** junto a la marca en el header (todas las pantallas), con
  tooltip "estamos ajustando la búsqueda y las señales".
- El pie dice "versión beta" y avisa que puede haber datos incompletos o
  señales en ajuste. El `<title>` de la home también lo dice.

### 2. Analítica — dónde y cómo (recomendación aplicada)
Hallazgo previo, verificado contra el Swagger vivo de P2: **`POST /events`
tiene un enum CERRADO de `event_type`** (`session_created`, `search_executed`,
`nivel1_shown`, `refinement_applied`, `card_clicked`, `outbound_click`,
`detail_viewed`, `empty_results`, `tipologia_fuera_alcance`, `agency_ingest`)
y exige **`session_id` UUID de 36 chars**. P1 mandaba `p1-<uuid>` y nombres
propios (`search_performed`, …): **P2 rechazaba TODO con 422** y el
fire-and-forget lo tapaba. Hasta hoy no había entrado ni un evento de P1.
Además, P2 guarda sus eventos en una lista de Redis (`finder:events`, "luego
PostgreSQL"): no es un lugar cómodo para analizar.

Decisión: **P1 tiene su propio log, y además reenvía a P2 lo que entra en su
contrato.**

- **Log propio:** `POST /api/events` escribe UNA línea JSON por evento en
  `logs/events-YYYY-MM-DD.jsonl` (fecha UTC; directorio configurable con
  `EVENTS_LOG_DIR`, vacío = solo stdout para hostings sin disco). Se lee con
  `node scripts/events-report.mjs` (une consulta → resultados → clicks por
  búsqueda), o con jq / DuckDB / pandas.
- **Modelo de correlación:**
  - `visitor_id` (localStorage, persiste entre pestañas y visitas),
  - `tab_id` (sessionStorage, la pestaña),
  - `session_id` = sesión de P2 de la búsqueda (UUID) — la misma que P2 usa
    en sus propios `search_executed`/`detail_viewed`, así los dos logs se unen,
  - **`search_id` = `<session_id>.<turno>`** = UNA corrida (la sesión acumula
    chips, `suggestions` y cambios de vertical como turnos).
  - Como el detalle abre en pestaña nueva, el link lleva
    `?s=<search_id>&r=<rank>[&from=map|related|comparable]` y la pestaña nueva
    adopta ese contexto antes de emitir sus eventos.
- **Eventos (nombres de P1)** — cada línea trae `ts, event, visitor_id,
  tab_id, session_id, search_id, page, payload, ua`:

  | Evento | Payload relevante | Va a P2 como |
  |---|---|---|
  | `search_performed` | `query, mode (search·chip·suggestion·vertical), vertical, vertical_override` | `refinement_applied` si `mode ≠ search` (el turno ya lo registra P2) |
  | **`search_results`** | `total_matches, received, summary{vertical,zone,property_type,budget,order,assumption_note}, scores{top,avg,min,n}, results[{id,rank,score,deal,price_usd}], related_count, suggestions, latency_ms` | — (solo P1) |
  | `search_error` | `stage (session·stream·sse·network), status, message` | — |
  | `zero_results` | `query, suggestions` | `empty_results` |
  | `clarification_shown` | `reason, chips, repeat` | `nivel1_shown` |
  | `clarification_chip_selected` | `chip` | `refinement_applied` |
  | `results_page_loaded` | `offset, kind (buffer·session), results[…]` | — |
  | `related_shown` | `reason, count, results[…]` | — |
  | **`card_clicked`** | `property_id, rank, score, from (list·related·map·comparable)` | `card_clicked` |
  | `property_detail_opened` | `property_id, rank, from, referrer` | `detail_viewed` |
  | `contact_click` / `source_click` | `property_id, channel / url` | `outbound_click` |
  | `publish_contact_click` | `screen (header·home·footer)` | — |
  | `vertical_selected`, `vertical_resynced`, `opportunity_chip_toggled`, `example_query_clicked`, `map_*` | como antes | — |

  El "score de los resultados" es el `opportunity_score` de P3 tal cual: por
  card en `results[]` y resumido en `scores` — P1 no calcula nada.
- Al reenviar a P2 el payload suma `p1_event`, `search_id` y `visitor_id`.
  Un rechazo de P2 ahora se loguea en el server (una vez por tipo), para que
  no vuelva a pasar en silencio.

### 3. Publicar (WhatsApp)
Botón **"Publicá tu propiedad"** en el header (todas las pantallas; en mobile
dice "Publicá"), bloque **"¿Sos inmobiliaria o vendés tu propiedad?"** en la
home y link en el pie. Abren `wa.me/<número>` con texto prellenado. El número
va en **`CONTACT_WHATSAPP`** (server, dígitos con código de país; texto en
`CONTACT_WHATSAPP_TEXT`, opcional). **Sin número, nada se muestra** — hay que
cargarlo en `.env.local` y reiniciar. Click trackeado (`publish_contact_click`).

### 4. Detalle en pestaña nueva
Título y foto de la card, popup del mapa y comparables del detalle abren con
`target="_blank"` (rel `noopener`). En la pestaña nueva no hay historial:
"← Volver a los resultados" pasa a ser **"← Nueva búsqueda"** (link a la home)
cuando `history.length` es 1.

### 5. Galería completa
P2 manda hasta **24 fotos** por aviso (verificado); la galería mostraba 4
miniaturas fijas. Ahora: foto principal con flechas y contador "n / N", tira
con TODAS las miniaturas (columna con scroll en desktop, fila con scroll en
mobile; la activa se mantiene a la vista), teclado ← →, click en la principal
avanza. Las que fallan (404 / hotlink) se siguen descartando.

## Verificación (05/09, P2 real, Playwright)
- Home/results/detalle en desktop y 390 px: etiqueta Beta, botón y bloque de
  publicar, sin overflow horizontal, sin errores de consola.
- Card → pestaña nueva con `?s=<uuid>.1&r=1`; popup del mapa y comparables
  con `target=_blank` y `from=map|comparable`; back link "Nueva búsqueda".
- Galería: 8/8 miniaturas, contador, flechas, último thumb → scroll de la tira.
- Log: `logs/events-2026-09-04.jsonl` con la corrida completa; el reporte
  imprime «casa en rawson» · 180 resultados · score top 100 · prom 91 · click #1.
- Redis de P2 (`finder:events`): `card_clicked` y `detail_viewed` de P1 al
  lado del `search_executed` propio de P2, misma sesión.

## Pendiente / a decidir
- **Cargar el número de WhatsApp** (`CONTACT_WHATSAPP`) — hasta entonces el
  botón no aparece.
- Rotación/retención del log (`logs/` está en `.gitignore`; un archivo por día).
- Si P2 amplía el enum de `/events` (o acepta `search_results`), ampliar el
  mapeo en `src/app/api/events/route.ts`.

## Addendum 05/09 (tarde) — rediseño de las cards de resultados

Pedido de German: las cards se veían desproporcionadas y descuadradas. Diagnóstico
medido con Playwright: alturas de 698 a 955 px en la misma fila (hasta 15 chips de
atributos, textos sin acotar) y fotos con márgenes blancos que llegan así del portal
(`compraensanjuan` centra la foto en un lienzo 4:3 blanco, sin CORS → no se puede
detectar ni recortar en el browser). Cambios en `PropertyCard.tsx`, `signals.tsx` y el
bloque Card de `globals.css`:

- **Foto 4:3 sobre passe-partout lila** con `mix-blend-mode: multiply`: el blanco del
  lienzo se vuelve lila (deja de verse blanco-sobre-blanco); las luces de la foto real
  apenas se tiñen. Zoom suave al hover. Sellos "Similar" y "Dúplex" sobre la foto.
- **Todo lo variable acotado**: título y dirección en 1 línea, señal y contexto de
  mercado en 2, **hasta 4 chips + "+N"** (expande al click). Alturas medidas después:
  653–711 px, y el grid las iguala por fila.
- Jerarquía: precio serif + "≈ US$ · US$/m²" en una línea debajo, título, ficha
  técnica (ambientes/dormitorios/baños/m²) en tinta, dirección en gris, señal a ancho
  completo, fila de score (`Score 100` + barra + "¿por qué?"), ratings, chips,
  contexto, pie con fuente · publicante · días y "Ver aviso ↗".
- Zona capitalizada en títulos (`zoneName`: "rawson" → "Rawson"; no es traducción).
- Grid `minmax(320px)`: 2 columnas con mapa, 3 sin mapa, 1 en mobile.
- El sello "Similar" muestra el porcentaje solo si `relevance_score` ≤ 1 (P2 mandó
  1,04 en una related).

### Paso 1 (05/09, noche) — altura uniforme, medida

German: "las cards no tienen el mismo alto". El grid igualaba por fila, no entre filas.
Ahora cada bloque de la card es una **ranura de alto fijo que se renderiza aunque el
dato falte** (vacía e invisible): precio 46 px (2 líneas), título 21, ficha 19,
dirección 18, señal 50 (2 líneas, texto acotado), score 20, ratings 26 (una fila, con
etiquetas cortas "Precio · Reventa · Renta" y la larga en `title`), chips 54 (2 filas,
3 + "+N"), contexto 37 (2 líneas), pie 30. Solo crece lo que el usuario abre (¿por qué?,
reasons, +N). Medido con Playwright sobre 30 cards por layout: **una sola altura** —
686 px con mapa (2 col.), 690 sin mapa (3 col.), 686 en alquiler, 689 en mobile.
Pendiente el paso 2: la estética.
