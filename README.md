# paradisofinder.com — P1 · FINDER San Juan (es-AR)

Capa de presentación de FINDER para el mercado San Juan: **búsqueda simple en texto libre**
con listado + mapa (patrón Airbnb). Next.js (App Router). Antes de tocar código, leer
`CLAUDE.md` y los docs en el orden que indica (`docs/HANDOFF_P1_2026-08-28.md` →
`docs/P1_INTEGRATION_SPEC.md` → `docs/prompt-inicial.md` → `docs/producto-p1.md`), más los
dos registros de decisión que revierten cosas de esos documentos:
`docs/DECISION_2026-08-29_mapa.md` y `docs/DECISION_2026-08-29_busqueda-simple.md`.
El primer MVP (beta, analítica propia, botón de publicar, detalle en pestaña nueva,
galería completa) está en `docs/DECISION_2026-09-05_mvp-beta.md`. Para correrla en Docker
(instalar, construir, operar, leer logs): `docs/DOCKER.md`; para el deploy en Railway:
`docs/DEPLOY_RAILWAY.md`; el CI/CD local por hooks de git (`develop` → Docker del :3000,
`stage` → Railway): `docs/CI_CD.md`.

Hay dos formas de correr P1 en esta máquina, y usan el mismo puerto (3000), así que no
conviven:

| Modo | Para qué | Cómo |
|---|---|---|
| **Desarrollo** (`npm run dev`) | tocar código, hot reload | secciones Requisitos → Ejecución de este README |
| **Docker** (`docker compose up -d`) | correr la misma imagen que Railway, con el log de eventos en un volumen | `docs/DOCKER.md` (resumen en **Ejecución en Docker**) |

## Requisitos

- **Node.js ≥ 20.9** (`engines` de Next 16; probado en 24.2) y npm 10+. Para el modo
  Docker solo hace falta Docker Desktop / Engine 24+ con Compose v2.
- **P2 (FINDER Core)** en `http://localhost:8000` — el Docker de la instancia San Juan.
  En desarrollo es opcional (sin P2, P1 sirve los mocks de `/mocks`, modo demo); en Docker
  es obligatorio (`P2_MODE=live`, sin mocks).

## Instalación

```bash
npm install
cp .env.example .env.local     # y editar — ver Configuración
```

`.gitignore` excluye `.env*`: nunca se commitea.

## Configuración

Todas las variables son **solo del server**. Topología A: el browser nunca habla con P2,
así que **ninguna lleva prefijo `NEXT_PUBLIC_`** — eso filtraría la API key al bundle del
cliente (y el número de WhatsApp se lee por request, sin rebuild).

| Variable | Default | Qué hace |
|---|---|---|
| `P2_BASE_URL` | vacío → mocks | URL base de P2 **sin** `/api/v1` (lo agrega `src/lib/p2/client.ts`). Docker local: `http://localhost:8000`. |
| `P2_API_KEY` | vacío | Header `X-API-Key`. Vacío = auth apagada, que es como está el Docker de desarrollo. |
| `P2_MODE` | `auto` | `auto`: P2 si hay URL, y ante fallo de **conexión** cae a mocks con warning · `live`: solo P2, los errores se propagan · `mock`: siempre mocks. |
| `CONTACT_WHATSAPP` | vacío → sin botón | Número (solo dígitos, con código de país, ej. `5492645550000`) del botón **"Publicá tu propiedad"** para inmobiliarias/dueños. Vacío = el botón no se muestra. |
| `CONTACT_WHATSAPP_TEXT` | "Hola, quiero publicar…" | Texto prellenado del mensaje de WhatsApp. |
| `EVENTS_LOG_DIR` | `logs` | Directorio del **log propio de eventos** (`events-YYYY-MM-DD.jsonl`, fecha UTC). Vacío = solo stdout. Ver **Analítica de uso**. |

El `.env.local` de esta máquina **ya viene apuntado al P2 real**. Ojo con `.env.example`:
dice puerto 8001 (instancia de prueba), la instancia real es la **8000**.

Cambiar cualquiera de las tres **requiere reiniciar**: Next lee el env al arrancar.

## Ejecución

Desarrollo, con hot reload:

```bash
npm run dev                    # http://localhost:3000
PORT=3001 npm run dev          # otro puerto
```

Next 16 **no deja levantar dos `next dev` sobre el mismo directorio**, ni siquiera en
puertos distintos: el segundo aborta con `Another next dev server is already running` y te
dice el PID del que ya está. Quién corre y en qué puerto, sin adivinar:

```bash
cat .next/dev/lock    # {"pid":…,"port":3000,"appUrl":"http://localhost:3000","startedAt":…}
```

En segundo plano. Next ya escribe su propio log en `.next/dev/logs/next-development.log`;
el `nohup` guarda además el banner de arranque y los errores de compilación:

```bash
nohup npm run dev > /tmp/pf-dev.log 2>&1 &
tail -f /tmp/pf-dev.log
```

Build de producción local:

```bash
npm run build && npm start      # http://localhost:3000
npm run lint
```

## Ejecución en Docker

Runbook completo (instalación, configuración, operación, logs, problemas típicos):
**`docs/DOCKER.md`**. Lo esencial — es la misma imagen que se deploya en Railway, apuntada
al P2 del Docker local:

```bash
docker compose up -d --build      # construir + arrancar → http://localhost:3000 (3-5 min la 1ª vez)
docker compose ps                 # paradisofinder-web  Up … (healthy)
curl -s "http://localhost:3000/api/health?deep=1"   # …"p2":{"status":"ok"} = llega a P2
docker compose logs -f            # logs del server
docker compose up -d --build      # actualizar tras un git pull / cambio de código
docker compose down               # parar (el volumen con los eventos queda; -v lo borra)
```

Variables: `CONTACT_WHATSAPP` y `P2_API_KEY` se toman de un `.env` junto al compose (o del
shell); `P2_BASE_URL` ya apunta a `host.docker.internal:8000`. El log de eventos queda en
el volumen `pfw-data` (`/data/logs/events-YYYY-MM-DD.jsonl`, fecha UTC):

```bash
docker compose exec web sh -c 'cat /data/logs/*.jsonl' > events.jsonl
node scripts/events-report.mjs events.jsonl
```

Usa el puerto 3000, el mismo que `npm run dev`: no correr los dos a la vez.

**Parar.** `npm run dev` levanta tres procesos (`npm run dev` → `next dev` → `next-server`)
y matar el de arriba no siempre arrastra a los de abajo: puede quedar el puerto tomado. Al
que hay que matar es al que escucha — eso sí baja el árbol entero y borra el lock:

```bash
kill $(lsof -t -iTCP:3000 -sTCP:LISTEN)
```

Si igual quedó algo colgado, el grupo completo — PGID es la 3ra columna:

```bash
ps -Ao pid,ppid,pgid,command | grep "next dev"
kill -TERM -<PGID>
```

**Reiniciar** = parar + `npm run dev`. No hay scripts `stop`/`restart` en `package.json`.

## Verificar que anda

```bash
curl -s -o /dev/null -w "P1 %{http_code}\n" http://localhost:3000/
curl -s "http://localhost:3000/api/health?deep=1"    # P1 vivo + estado de P2 visto desde P1
curl -s -o /dev/null -w "P2 %{http_code}\n" http://localhost:8000/api/v1/health
open http://localhost:8000/docs        # Swagger vivo de P2 — la fuente de verdad del contrato
```

Si P1 responde 200 pero los resultados huelen a demo, es que P2 no contestó y `P2_MODE=auto`
cayó a los mocks: está el warning en el log del server. Para que eso falle ruidosamente en
vez de degradar en silencio, `P2_MODE=live`.

Consultas de humo contra P2 real: al final de este README, en **Consultas para probar**.

## Arquitectura (topología A)

El browser **nunca** habla con P2. Todo pasa por el server de P1:

```
POR BÚSQUEDA (sesión nueva cada vez — sin memoria entre consultas):
browser ── /api/sessions          ──► POST /api/v1/sessions           → session_id
        ── /api/search/stream     ──► POST /api/v1/search/stream      (SSE)
                                        cards → 20 cards, summary, suggestions, related*
                                        response_chunk → resumen en prosa
                                        done → cierre (context en vocabulario interno)
        ── /api/search/map        ──► POST /api/v1/search/map {session_id}  (pins, sin tope)
SCROLL (de a 10 hasta agotar el criterio, SIN tope) — página 2 del buffer, sin red; después:
        ── /api/search/stream     ──► POST /api/v1/search/stream {session_id, offset}
                                        (paginación 29/08: sin query, no es turno, ~100 ms,
                                         cards → done sin narrativa)
SIEMPRE:
        ── /api/events            ──► logs/events-YYYY-MM-DD.jsonl (log propio, TODO evento)
                                  ──► POST /api/v1/events (solo lo que entra en el enum de P2)
página de detalle (server component) ──► GET /api/v1/property/{id}

* `related` (embeddings, máx 10, ya deduplicado) llega SOLO con la última página
  del criterio — con 0 resultados, la primera ES la última.
```

`/api/search` (`/search/text`, portal stateless) y `/api/search/structured` siguen
disponibles pero la UI no los usa: el canal con streaming da además `suggestions`, los
chips de clarificación y el resumen en prosa, y pagina la misma sesión. Comparación medida
de las tres opciones en `docs/DECISION_2026-08-29_busqueda-simple.md`. `/search/semantic`
se eliminó de P1 el 30/08: `related` viene resuelto (`docs/CAMBIOS_P2_PARA_P1_2026-08-30.md`).

`X-API-Key` vive en env vars del server (`src/lib/p2/client.ts`); jamás en código cliente.

## Mapa del código

| Ruta | Qué es |
|---|---|
| `src/app/page.tsx` + `src/components/SearchHero.tsx` | Pantalla 1: home (input libre + chips de oportunidad) |
| `src/app/buscar/` + `src/components/SearchResultsView.tsx` | Pantalla 2: búsqueda simple (sesión nueva + SSE) — listado izquierda + mapa derecha |
| `src/lib/sse.ts` | Parser SSE (ojo: P2 usa CRLF; ver hallazgos) |
| `src/components/ResultsMap.tsx` | Mapa Leaflet con clustering, alimentado por `/search/map` |
| `src/app/propiedad/[id]/` + `src/components/detail.tsx` | Pantalla 3: detalle (abre en pestaña nueva) con galería completa, señales explicadas, indicadores, comparables |
| `src/lib/p2/` | Contrato (`types.ts`), cliente server-only (`client.ts`), mocks (`mocks.ts`) |
| `src/lib/format.ts` / `labels.ts` | Reglas de display de la card (spec §5) y etiquetas es-AR de códigos estables |
| `src/lib/chips.ts` | Chips de oportunidad → frases canónicas para P2 |
| `src/lib/track.ts` + `src/lib/tracking-ids.ts` | Analítica del browser (`trackEvent`, `search_id`, link del detalle con contexto) |
| `src/app/api/events/` + `src/lib/server/event-log.ts` | Log propio JSONL + reenvío a P2 de lo que entra en su enum |
| `scripts/events-report.mjs` | Reporte consulta → resultados → clicks a partir del log |
| `Dockerfile` + `docker-entrypoint.sh` + `.dockerignore` | Imagen standalone no-root (`docs/DOCKER.md`): volumen `/data` para el log, healthcheck `/api/health` |
| `docker-compose.yml` | Correr esa imagen en local contra el P2 del Docker (puerto 3000, volumen `pfw-data`) |
| `railway.json` | Deploy en Railway (`docs/DEPLOY_RAILWAY.md`): builder Dockerfile, healthcheck, restart |
| `scripts/git-hooks/` + `scripts/ci/` | CI/CD local por hooks versionados (`docs/CI_CD.md`): `develop` → guardias + rebuild del :3000; push a `stage` → gate bloqueante, artefacto verificado y smoke del stage de Railway |
| `scripts/actualizar_3000.sh` · `scripts/deploy_verify.sh` · `scripts/ci/smoke.mjs` | Rebuild del Docker local con smoke · verificación de la imagen en un contenedor aislado (:3002) · el smoke común (health, `P2_MODE=live`, SSE real, cruce de `total_matches` con P2) |
| `src/proxy.ts` + `next.config.ts` | Hardening HTTP: CSP con nonce por request, HSTS, nosniff, X-Frame-Options, Permissions-Policy |
| `src/app/api/health/` | Healthcheck (`?deep=1` sondea P2) |
| `src/components/PublishCta.tsx` + `src/lib/server/contact.ts` | Botón "Publicá tu propiedad" (WhatsApp, `CONTACT_WHATSAPP`) |

## Reglas que este código respeta (no romper)

- Contador de resultados = `total_matches`, nunca `total`.
- CLARIFICATION se renderiza como pregunta con chips, jamás como error.
- Señales/ratings/score siempre con sus `reasons`/`score_components`, textos de P3 tal cual.
- `null` = no informado → se omite (nunca 0; en ratings, jamás "malo").
- Precio principal = el original del aviso; comparaciones solo por `price_usd`; sufijo por
  `rental_period` en alquileres; `price_per_sqm` solo en ventas.
- Scroll de a 10 hasta agotar el criterio, sin tope (decisión 30/08,
  `docs/DECISION_2026-08-30_scroll-completo.md`): el turno trae 20, se muestran 10 y las
  otras 10 quedan de buffer → la página 2 es instantánea; las siguientes paginan la MISMA
  sesión con `{session_id, offset}` sin `query` (no es un turno, ~100 ms, sin narrativa).
  El criterio vive en P2: nada que reenviar ni que poder perder (`preferred_property_type`
  incluido). La última página trae `related` ("similares", máx 10, ya deduplicado) y puede
  venir corta (2 cards + 10 related): se muestra entera — P1 no llama a `/search/semantic`
  ni deduplica. Al agotar, cierra con "Eso es todo lo publicado…".
- Mapa (decisión 29/08, `docs/DECISION_2026-08-29_mapa.md`): split tipo Airbnb alimentado
  por `POST /search/map`, que ya devuelve el universo mapeable filtrado server-side.
  Nunca mandarle `limit`/`offset`/`order` (schema `extra="forbid"` → 422): usar
  `toMapRequest()`. Con clustering, porque un criterio real trae cientos de pins.
- Diferencias del contrato real ya contempladas: `deal_rating_reasons` y el SSE con CRLF
  (`docs/HALLAZGOS_DATOS_REALES_2026-08-29.md`); renombres del 29-30/08 (`related`,
  `summary`, `market`) y paginación por sesión (`docs/CAMBIOS_P2_PARA_P1_2026-08-30.md`).
- Selector de vertical Alquilar · Comprar · Invertir desde el 01/09
  (`docs/DECISION_2026-09-01_selector-vertical.md`): viaja como frase canónica, nunca como
  `vertical_override` en sesión nueva.
- MVP beta (05/09, `docs/DECISION_2026-09-05_mvp-beta.md`): etiqueta Beta en el header y
  el pie; **el detalle abre en pestaña nueva** (card, popup del mapa, comparables) con
  `?s=<search_id>&r=<rank>` para la analítica; la galería muestra **todas** las fotos
  (P2 manda hasta 24); el botón de publicar solo aparece con `CONTACT_WHATSAPP`.

## Analítica de uso (MVP beta, 05/09)

Toda interacción pasa por `POST /api/events` del server de P1, que escribe **una línea
JSON por evento** en `logs/events-YYYY-MM-DD.jsonl` (fecha UTC, directorio
`EVENTS_LOG_DIR`, gitignored) y reenvía a `POST /events` de P2 solo los que entran en su
enum cerrado (`card_clicked`, `detail_viewed`, `outbound_click`, `empty_results`,
`nivel1_shown`, `refinement_applied`). OJO: P2 rechaza con 422 cualquier otro
`event_type` y cualquier `session_id` que no sea UUID — hasta el 05/09 no entraba ninguno.

Cada línea trae `visitor_id` (persiste entre pestañas), `tab_id`, `session_id` (la sesión
de P2 de esa búsqueda, la misma que P2 usa en sus propios eventos) y **`search_id` =
`<session_id>.<turno>`**, la clave que une consulta → resultados → navegación. Como el
detalle abre en otra pestaña, el link lleva `?s=<search_id>&r=<rank>` y la pestaña nueva
adopta ese contexto. Los eventos y sus payloads están en
`docs/DECISION_2026-09-05_mvp-beta.md`; el "score" es el `opportunity_score` de P3 por card
(`search_results.results[]`) más `scores{top,avg,min}`.

```bash
node scripts/events-report.mjs            # lee logs/ y arma el reporte por búsqueda
node scripts/events-report.mjs logs/events-2026-09-05.jsonl
jq -c 'select(.event=="card_clicked") | [.search_id,.payload.rank,.payload.score]' logs/*.jsonl
```

## Deploy en Railway (Docker)

Runbook completo en `docs/DEPLOY_RAILWAY.md`. Resumen: Railway construye el `Dockerfile`
(Next `output: "standalone"`, usuario no-root, `HOSTNAME=::` dual-stack, `P2_MODE=live`)
desde la rama **`stage`** (integración de GitHub), lee `railway.json` (healthcheck
`/api/health`, restart on failure) y las variables van en el dashboard: `P2_BASE_URL`
(`http://paradisofinder-core.railway.internal:8000`, la red privada de Railway, que en entornos
creados después del 16/10/2025 es IPv4 + IPv6, así que el `--host 0.0.0.0` de P2 alcanza;
plan B la URL pública `https://paradisofinder-core-staging.up.railway.app`),
`P2_API_KEY` (la `PORTAL_API_KEY` del stage de P2), `CONTACT_WHATSAPP`. Montar un volumen en
`/data` para que el log de eventos sobreviva a los deploys; se lee con
`railway ssh -- cat /data/logs/*.jsonl`. La imagen es la misma que corre
`docker compose up -d` en local (`docs/DOCKER.md`). El handoff de P2 con lo que ya está
de su lado: `docs/HANDOFF_P2_CICD_2026-09-05.md`.

## CI/CD local (hooks de git)

`docs/CI_CD.md`. Se enchufa una vez con `./scripts/ci/install_hooks.sh` (apunta
`core.hooksPath` a `scripts/git-hooks/`, versionado) y de ahí en más:

| evento | qué pasa |
|---|---|
| commit / merge / push en `develop` | lint + tsc + `next build` (~16 s) y, si dan verde, `docker compose up -d --build` del :3000 con espera de healthy y smoke. En segundo plano; avisa por notificación. |
| commit en `stage` | las mismas guardias, feedback nomás |
| push a `stage` | **gate bloqueante** (las guardias: si dan rojo el push no sale; `--no-verify` lo saltea) → Railway promueve desde GitHub → en local se verifica la misma imagen de un worktree limpio del commit (`scripts/deploy_verify.sh`, :3002) y se hace el smoke contra la URL de stage hasta que sirva ese commit |

El smoke (`scripts/ci/smoke.mjs`) falla ante degradación silenciosa: exige `P2_MODE=live`,
que P1 llegue a P2, una búsqueda real por sesión + SSE con cards que no sean las de `/mocks`
y el mismo `total_matches` que P2 ("casas en rawson" → 180). Estado y logs:
`./scripts/ci/cd_status.sh`; todo vive en `.ci/` (gitignored). Falta cargar en `.ci/config`
la `STAGE_BASE_URL` del stage de P1 cuando exista el servicio en Railway.

## Consultas para probar (contra P2 real)

`casa en rawson` (189 resultados, 139 pins) · `departamento en capital` (421 / 333 pins) ·
`alquiler departamento menos de 1800000 pesos en rivadavia` (62 resultados: scrolleando
hasta el final, la última página trae 2 cards + 10 "similares" y el cierre del listado) ·
`departamento en jachal` (0 resultados → acciones para relajar el criterio + bloque
"Podrían interesarte") · `algo lindo` (clarificación con chips) · `comprar hola`
(P2 sigue sin señal → P1 pide un dato concreto en vez de repetir los chips).
