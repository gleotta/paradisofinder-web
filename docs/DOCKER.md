# P1 en Docker — instalar, construir, correr, leer logs

Runbook de la imagen Docker de P1 (paradisofinder.com) en una máquina local. Es la
**misma imagen que se deploya en Railway** (`docs/DEPLOY_RAILWAY.md`): lo que anda acá
anda allá. Preparado y verificado el 05/09/2026 contra el P2 real (Docker local, :8000).

## 1. Qué hay en el repo

| Archivo | Rol |
|---|---|
| `Dockerfile` | Receta de la imagen. Tres etapas: `deps` (`npm ci` desde el lockfile) → `build` (`next build`, con typecheck) → `runner` (imagen final mínima con el `output: "standalone"` de Next, sin devDependencies). Corre como usuario **`nextjs` (uid 1001), no root**. Defaults: `HOSTNAME=::` (IPv4 + IPv6), `PORT=3000`, `P2_MODE=live`, `EVENTS_LOG_DIR=/data/logs`. |
| `docker-entrypoint.sh` | Arranca como root SOLO para dejar `EVENTS_LOG_DIR` escribible por `nextjs` (los volúmenes se montan como root) y baja privilegios con `su-exec` antes de ejecutar `node server.js`. |
| `.dockerignore` | Contexto de build mínimo: sin `node_modules`, `.next`, `.env*`, `logs`, docs ni el propio `Dockerfile`. Los `mocks/` SÍ van (los importa `src/lib/p2/mocks.ts`). |
| `docker-compose.yml` | Cómo correrla en ESTA máquina: puerto 3000, P2 en `host.docker.internal:8000`, volumen `pfw-data` en `/data`, `restart: unless-stopped`. |
| `railway.json` | Solo para Railway (builder, healthcheck, restart). Docker local lo ignora. |
| `src/app/api/health/route.ts` | `GET /api/health` (vivo) y `GET /api/health?deep=1` (además sondea a P2). |

Tamaño de la imagen: ~318 MB (`node:24-alpine` + standalone de Next + Leaflet).

## 2. Requisitos

- **Docker Desktop** (macOS/Windows) o Docker Engine 24+ con Compose v2 (`docker compose`,
  con espacio). Verificado con Docker 28.
- **P2 (FINDER Core) corriendo** en esta máquina, en el puerto 8000. Es el Docker de la
  instancia San Juan (`~/git/paradisofinder-core`, `docker compose up -d`). Comprobar:
  ```bash
  curl -s http://localhost:8000/api/v1/health | head -c 120
  docker ps --format '{{.Names}}' | grep finder     # finder-core, finder-redis, …
  ```
  Sin P2, P1 en Docker **no cae a mocks** (`P2_MODE=live`): cada búsqueda muestra un error
  explícito. Es a propósito: en producción jamás degradar en silencio.
- **Nada escuchando en el puerto 3000.** `npm run dev` usa el mismo puerto; no correr los
  dos a la vez. Quién lo tiene: `lsof -iTCP:3000 -sTCP:LISTEN`.
- No hace falta Node ni `npm install` en la máquina para correr la imagen (sí para el
  reporte de eventos del §7 y para `npm run dev`).

## 3. Instalar (primera vez)

```bash
git clone <repo> paradisofinder-web && cd paradisofinder-web
docker compose up -d --build
```

Eso construye la imagen (3-5 minutos la primera vez: descarga `node:24-alpine`, instala
dependencias y hace `next build`; las siguientes tardan ~1 minuto por la caché) y levanta
el contenedor `paradisofinder-web`. Abrir **http://localhost:3000**.

Comprobar:

```bash
docker compose ps                                     # paradisofinder-web  Up … (healthy)
curl -s "http://localhost:3000/api/health?deep=1"
# {"ok":true,"service":"paradisofinder-web","version":"dev","p2_mode":"live",
#  "p2_target":"host.docker.internal:8000","p2":{"status":"ok","http":200}}
```

`(healthy)` tarda ~15 s en aparecer (el `HEALTHCHECK` de la imagen pega a `/api/health`
cada 30 s). Si `p2.status` es `"down"`, P2 no está o no escucha en el 8000 (§8).

## 4. Configurar

Las variables se pasan por Compose (`environment:` en `docker-compose.yml`). Dos de ellas
se toman del entorno del shell o de un archivo **`.env`** junto al compose (Compose lo lee
solo; está en `.gitignore`):

```bash
# .env (junto a docker-compose.yml) — solo estas dos; NO poner P2_BASE_URL acá
CONTACT_WHATSAPP=549264XXXXXXX     # botón "Publicá tu propiedad"; vacío = no se muestra
P2_API_KEY=                        # X-API-Key de P2; vacío = auth apagada (dev)
```

| Variable | Valor en compose | Para qué |
|---|---|---|
| `P2_BASE_URL` | `http://host.docker.internal:8000` | Dentro del contenedor `localhost` es el propio contenedor: P2 se alcanza por el host. En Linux lo resuelve el `extra_hosts: host-gateway` del compose. |
| `P2_API_KEY` | `${P2_API_KEY:-}` | Vacío en el P2 de desarrollo. |
| `P2_MODE` | `live` | Sin mocks. Para demo sin P2: cambiar a `mock` en el compose. |
| `CONTACT_WHATSAPP` | `${CONTACT_WHATSAPP:-}` | Solo dígitos con código de país. |
| `CONTACT_WHATSAPP_TEXT` | (no está en el compose) | Texto prellenado; agregar si se quiere otro. |
| `EVENTS_LOG_DIR` | `/data/logs` | Log de eventos en el volumen `pfw-data`. Vacío = solo stdout. |
| `PORT` / `HOSTNAME` | defaults de la imagen (3000 / `::`) | No tocar. Para otro puerto en el host, cambiar el lado izquierdo de `ports:` (`"3001:3000"`). |

Ojo: **el `.env` también lo lee `npm run dev`** (Next carga `.env` en todos los modos).
Con solo `CONTACT_WHATSAPP` y `P2_API_KEY` adentro eso es deseable (misma config); por eso
`P2_BASE_URL` no va ahí (rompería el dev, que usa `localhost:8000` desde `.env.local`).

Cambiar una variable = recrear el contenedor:

```bash
docker compose up -d            # aplica cambios de environment/.env sin rebuild
```

## 5. Operar

```bash
docker compose up -d --build    # (re)construir la imagen y (re)arrancar
docker compose up -d            # arrancar sin rebuild (usa la imagen que hay)
docker compose ps               # estado + healthcheck
docker compose restart          # reiniciar
docker compose stop             # parar (queda creado)
docker compose down             # parar y borrar el contenedor (el volumen queda)
docker compose down -v          # ídem + borrar el volumen con el log de eventos (¡datos!)
```

- `restart: unless-stopped`: si el contenedor se cae o Docker se reinicia, vuelve solo.
  Después de un `docker compose stop` explícito NO vuelve hasta un `up`.
- **Actualizar código**: `git pull && docker compose up -d --build`. Compose reconstruye
  la imagen y recrea el contenedor; el volumen (eventos) se conserva.
- Rebuild sin caché (dependencias raras, lockfile cambiado a mano):
  `docker compose build --no-cache && docker compose up -d`.

Sin Compose, la misma imagen a mano:

```bash
docker build -t paradisofinder-web .
docker run -d --name paradisofinder-web -p 3000:3000 \
  -e P2_BASE_URL=http://host.docker.internal:8000 \
  -e CONTACT_WHATSAPP=549264XXXXXXX \
  -v pfw-data:/data \
  --restart unless-stopped \
  paradisofinder-web
```

## 6. Logs del servidor (stdout)

```bash
docker compose logs -f              # seguir en vivo
docker compose logs --tail 200      # últimas 200 líneas
docker compose logs --since 1h      # última hora
docker logs paradisofinder-web      # equivalente sin compose
```

Qué buscar ahí:

| Línea | Significa |
|---|---|
| `- Network: http://[::]:3000` · `✓ Ready` | Arrancó bien, escuchando en IPv4 e IPv6. |
| `[entrypoint] No pude preparar EVENTS_LOG_DIR=…` | El volumen no quedó escribible: los eventos salen por stdout (`[event] {…}`). |
| `[events] No pude escribir el log en "…"` | Ídem, detectado al primer evento. |
| `[event] {"ts":…}` | Un evento que NO pudo ir al archivo (o `EVENTS_LOG_DIR` vacío). |
| `[p2] 401 — API key faltante o inválida` | `P2_API_KEY` no coincide con la `PORTAL_API_KEY` de P2. |
| `[p2] 422 — params inválidos (bug de P1)` | P1 mandó algo que P2 no acepta: reportar. |
| `[p2] /events rechazó "…" con HTTP …` | P2 no aceptó un evento reenviado (enum cerrado / session_id no-UUID). |
| `[p2] No pude conectar con P2 …` | Solo con `P2_MODE=auto`. En `live` la conexión fallida se ve como error HTTP en la UI. |

## 7. Log de eventos (analítica) — dónde está y cómo leerlo

Cada interacción del usuario (consulta, resultados con scores, clicks en cards, apertura
de detalle, contacto, mapa…) queda como **una línea JSON** en el volumen `pfw-data`,
montado en `/data`: `/data/logs/events-YYYY-MM-DD.jsonl`. El modelo de datos (qué evento
lleva qué payload, y cómo `search_id` une consulta → resultados → navegación) está en
`docs/DECISION_2026-09-05_mvp-beta.md`; el resumen operativo, en el README (§ Analítica).

**Fechas en UTC**: el nombre del archivo y `ts` son UTC. San Juan es UTC-3, así que lo
que pasa después de las 21:00 locales cae en el archivo del día siguiente.

Listar y mirar adentro del contenedor:

```bash
docker compose exec web sh -c 'ls -la /data/logs'
docker compose exec web sh -c 'wc -l /data/logs/*.jsonl'
docker compose exec web sh -c 'tail -n 5 /data/logs/events-2026-09-05.jsonl'
```

Copiar afuera y analizar (el reporte corre con Node en la máquina):

```bash
docker compose exec web sh -c 'cat /data/logs/*.jsonl' > events.jsonl
node scripts/events-report.mjs events.jsonl        # consulta → resultados → clicks, por búsqueda

# Ejemplos con jq
jq -r 'select(.event=="search_performed") | [.ts, .payload.query] | @tsv' events.jsonl
jq -r 'select(.event=="search_results") | [.search_id, .payload.total_matches, .payload.scores.top] | @tsv' events.jsonl
jq -r 'select(.event=="card_clicked") | [.search_id, .payload.rank, .payload.score, .payload.from] | @tsv' events.jsonl
jq -c 'select(.search_id=="<uuid>.1")' events.jsonl   # todo lo que pasó en una búsqueda
```

Con el contenedor parado, el volumen sigue existiendo (`paradisofinder-web_pfw-data`):

```bash
docker run --rm -v paradisofinder-web_pfw-data:/data alpine ls -la /data/logs
docker run --rm -v paradisofinder-web_pfw-data:/data alpine cat /data/logs/events-2026-09-05.jsonl > events.jsonl
```

Backup / limpieza: es un archivo por día y no hay rotación automática. Copiar los `.jsonl`
que se quieran conservar y borrar los viejos con
`docker compose exec web sh -c 'rm /data/logs/events-2026-08-*.jsonl'`. `docker compose
down -v` borra TODO el volumen.

Además, P2 recibe una copia de los eventos que entran en su contrato (`card_clicked`,
`detail_viewed`, `outbound_click`, `empty_results`, `nivel1_shown`, `refinement_applied`)
y los guarda en su Redis (`finder-redis`, lista `finder:events`):

```bash
docker exec finder-redis redis-cli llen finder:events
docker exec finder-redis redis-cli lrange finder:events -5 -1
```

## 8. Problemas típicos

| Síntoma | Causa / solución |
|---|---|
| `Bind for 0.0.0.0:3000 failed: port is already allocated` | Hay un `npm run dev` u otro contenedor en el 3000. `kill $(lsof -t -iTCP:3000 -sTCP:LISTEN)` o cambiar `ports:` en el compose. |
| `/api/health?deep=1` → `"p2":{"status":"down"…}` | P2 apagado o en otro puerto: `docker ps`, `curl localhost:8000/api/v1/health`. En Linux sin Docker Desktop, verificar que `host.docker.internal` resuelve (el compose lo mapea con `host-gateway`). |
| Las búsquedas dicen "Error de configuración del servidor" | `[p2] 401` en los logs: `P2_API_KEY` ≠ `PORTAL_API_KEY` de P2. |
| Se ven resultados "de demo" | `P2_MODE` quedó en `mock`/`auto` con P2 caído. El compose fija `live`; revisar overrides. |
| El botón "Publicá tu propiedad" no aparece | `CONTACT_WHATSAPP` vacío. Definirla en `.env` y `docker compose up -d`. |
| `[events] No pude escribir el log…` en los logs | El volumen no es escribible por uid 1001 (p. ej. bind mount raro). Usar el volumen nombrado del compose, o `chown -R 1001:1001` del directorio del host. |
| La imagen no refleja un cambio de código | Falta `--build`: `docker compose up -d --build`. |
| Build lento / falla `npm ci` | Red. Reintentar; `docker compose build --no-cache` si el lockfile cambió. |
| `(unhealthy)` en `docker compose ps` | `docker compose logs` — casi siempre P1 no arrancó (falta `public/`? el Dockerfile lo crea) o el puerto interno no es 3000. |

## 9. Limpieza total

```bash
docker compose down -v                  # contenedor + volumen (eventos)
docker rmi paradisofinder-web:latest    # la imagen
docker builder prune                    # caché de build (opcional)
```

## 10. Relación con Railway

Railway construye este mismo `Dockerfile` desde el repo (no usa `docker-compose.yml`):
variables en el dashboard, volumen montado en `/data`, healthcheck `/api/health`. Todo eso
está en `docs/DEPLOY_RAILWAY.md`. Diferencias con local: `P2_BASE_URL` apunta a la red
privada de Railway (`http://<p2>.railway.internal:8000`, y P2 debe escuchar en `::`), y
`P2_API_KEY` es obligatoria.
