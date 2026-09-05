# Deploy de P1 en Railway (Docker) — runbook

Estado: preparado el 05/09/2026. P1 corre como **un servicio Docker en Railway**
construido desde el `Dockerfile` del repo (Next.js `output: "standalone"`,
usuario no-root, healthcheck en `/api/health`). P2 (FINDER Core) es otro
servicio: en Railway (red privada) o en cualquier host con URL pública.

## Archivos del deploy

| Archivo | Qué hace |
|---|---|
| `Dockerfile` | 3 etapas: `npm ci` → `next build` → runner mínimo (`node server.js`) como usuario `nextjs`. `HOSTNAME=::` (IPv4+IPv6), `PORT=3000`, `P2_MODE=live`, `EVENTS_LOG_DIR=/data/logs`. |
| `docker-entrypoint.sh` | Arranca como root SOLO para dejar el volumen `/data` escribible por `nextjs` (Railway monta volúmenes como root) y baja privilegios con `su-exec`. |
| `.dockerignore` | Contexto mínimo: sin `node_modules`, `.next`, `.env*`, `logs`, docs. |
| `railway.json` | Builder `DOCKERFILE`, healthcheck `/api/health` (120 s), restart `ON_FAILURE` ×5, draining 15 s. Railway lo marca deprecado a favor de IaC (`.railway/railway.ts`) pero **funciona hasta el 2026-12-01**; migración: `railway config migrate --apply`. |
| `next.config.ts` | `output: "standalone"`, `poweredByHeader: false`, headers de seguridad (nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, HSTS). |
| `src/proxy.ts` | Content-Security-Policy con **nonce por request** (`script-src 'nonce-…' 'strict-dynamic'`, `connect-src 'self'`, `frame-ancestors 'none'`). |
| `src/app/api/health/route.ts` | `GET /api/health` → 200 siempre que P1 viva; `?deep=1` sondea `GET /api/v1/health` de P2. |

## Variables de entorno (Railway → Service → Variables)

Todas del server; **ninguna con `NEXT_PUBLIC_`**. Se leen en runtime (no hace
falta rebuild para cambiarlas; sí redeploy, que Railway hace solo al guardar).

| Variable | Valor en producción | Notas |
|---|---|---|
| `P2_BASE_URL` | `http://paradisofinder-core.railway.internal:8000` (red privada de Railway: `http://`, no `https://`; el nombre es el del servicio de P2, en el **mismo proyecto y entorno**) · plan B: `https://paradisofinder-core-staging.up.railway.app` (URL pública del stage de P2) | Sin `/api/v1`. Desde el changelog de Railway del 2025-10-17, los entornos creados después del 16/10/2025 resuelven `*.railway.internal` a **IPv4 e IPv6**, así que el `--host 0.0.0.0` de P2 alcanza (el `stage` es del 05/09/2026). Se comprueba con `/api/health?deep=1`. |
| `P2_API_KEY` | la `PORTAL_API_KEY` configurada en P2 | Header `X-API-Key`. **En producción P2 debe tener auth activa** (en dev está vacía). |
| `P2_MODE` | `live` | Ya viene en el Dockerfile. Jamás `auto` en prod: degradaría a mocks en silencio si P2 cae. |
| `CONTACT_WHATSAPP` | `549264…` (solo dígitos) | Botón "Publicá tu propiedad". Vacío = no se muestra. |
| `CONTACT_WHATSAPP_TEXT` | opcional | Texto prellenado. |
| `EVENTS_LOG_DIR` | `/data/logs` (default del Dockerfile) | Con volumen montado en `/data`. Vacío = solo stdout (Railway Logs). |
| `PORT` | la inyecta Railway | Next la lee; el Dockerfile expone 3000 por si no la inyecta. |

Railway aporta además `RAILWAY_GIT_COMMIT_SHA` (la muestra `/api/health` como `version`).

## Pasos

1. **Repo → Railway.** New Project → Deploy from GitHub repo → elegir este repo y
   la rama **`stage`** (entorno `stage`; `develop` es el Docker local — `docs/CI_CD.md`).
   Railway detecta el `Dockerfile` ("Using detected Dockerfile!") y lee `railway.json`.
2. **Variables.** Cargar la tabla de arriba. Para la red privada, el valor de
   `P2_BASE_URL` es `http://${{paradisofinder-core.RAILWAY_PRIVATE_DOMAIN}}:8000`
   (referencia entre servicios) o directamente `http://paradisofinder-core.railway.internal:8000`.
   Requiere que P1 esté en el **mismo proyecto y entorno** (`stage`) que P2.
3. **Volumen (recomendado).** Service → Volumes → Add volume, mount path **`/data`**.
   Sin volumen el log de eventos se pierde en cada deploy (queda en stdout).
   El entrypoint deja `/data/logs` escribible por el usuario no-root; alternativa
   de Railway si algo falla: variable `RAILWAY_RUN_UID=0` (corre como root).
4. **Dominio.** Settings → Networking → Generate Domain (o dominio propio).
   Railway termina TLS; HSTS ya viene en los headers. **El puerto destino del dominio
   tiene que ser 3000** (el que fija el Dockerfile): Railway inyecta `PORT` y el dominio
   rutea a un puerto fijo que se configura aparte; si no coinciden, el edge devuelve
   `502 Application failed to respond` con la app perfectamente sana en los logs (a P2 le
   costó media hora, handoff del 05/09 §5).
5. **Deploy.** Automático en cada push a `stage` (integración de GitHub). El pipeline
   local (`docs/CI_CD.md`) pone un gate adelante del push, verifica la misma imagen en
   local y hace el smoke contra la URL cuando Railway la promueve. Manual: `railway up`.
6. **Smoke test** (reemplazar el host):
   ```bash
   curl -s https://<host>/api/health            # {"ok":true,"p2_mode":"live","p2_target":"paradisofinder-core.railway.internal:8000"}
   curl -s "https://<host>/api/health?deep=1"   # …"p2":{"status":"ok","http":200}  ← la red privada anda
   curl -sI https://<host>/ | grep -i "content-security-policy\|strict-transport"
   ```
   Si `?deep=1` da `"status":"down"`, P1 no llega a P2 por la red privada (¿otro proyecto u
   otro entorno?): plan B, la URL pública en `P2_BASE_URL`.
   El smoke del pipeline hace todo eso y además exige `P2_MODE=live` y el mismo
   `total_matches` que P2 ("casas en rawson" → 180):
   ```bash
   SMOKE_P2_BASE_URL=https://paradisofinder-core-staging.up.railway.app SMOKE_P2_API_KEY=… \
     node scripts/ci/smoke.mjs https://<host>
   ```
   Después: una búsqueda real (`/buscar?q=casa%20en%20rawson`), abrir un detalle
   y ver que `Logs` no muestre `[p2]` ni `[events]`. Si hay resultados pero los números
   no coinciden con los de P2, P1 está sirviendo mocks: revisar `P2_MODE` y `P2_BASE_URL`.

## P2 en Railway: dos cosas a revisar del lado de P2

Estado al 05/09 (`docs/HANDOFF_P2_CICD_2026-09-05.md`): el stage de P2 está desplegado en
`https://paradisofinder-core-staging.up.railway.app` (puerto interno 8000, auth encendida,
Postgres con 5586 propiedades, "casas en rawson" → 180). Se promueve desde la rama `stage`
de `gleotta/paradisofinder-core`.

- **Red privada: P2 NO necesita escuchar en `::`** (corregido el 05/09 a la tarde). El
  handoff de P2 (§3) y la primera versión de este runbook daban por hecho que la red
  privada de Railway era solo IPv6 y que el `uvicorn --host 0.0.0.0` de P2 no se alcanzaba.
  Desde el changelog de Railway del **2025-10-17** ("IPv4 Private Networks"), los entornos
  creados después del 16/10/2025 resuelven `*.railway.internal` a IPv4 e IPv6; el `stage`
  de P2 es del 05/09/2026, así que `http://paradisofinder-core.railway.internal:8000` alcanza a P2 tal
  cual está. Condiciones: P1 y P2 en el mismo proyecto y el mismo entorno, `http://`
  adentro (Wireguard ya cifra) y el puerto 8000 (el `PORT` de P2). Solo los entornos
  anteriores al 16/10/2025 siguen siendo IPv6-only; ahí sí haría falta `--host ::`.
- **`PORTAL_API_KEY`** definida (y la misma en `P2_API_KEY` de P1). Los rate
  limits de P2 (`60/min` búsquedas, `120/min` eventos) son por IP: todo P1 sale
  con una sola IP, dimensionar si crece el tráfico.

## Correr la imagen localmente (mismo build que Railway)

Runbook completo del Docker local (instalar, configurar, operar, leer logs, problemas):
**`docs/DOCKER.md`**. Resumen: `docker-compose.yml` ya apunta al P2 del Docker local
(`host.docker.internal:8000`) y monta el volumen `pfw-data` en `/data`:

```bash
CONTACT_WHATSAPP=549264XXXXXXX docker compose up -d --build   # http://localhost:3000
curl -s "http://localhost:3000/api/health?deep=1"
docker compose exec web sh -c 'ls -la /data/logs'             # el log de eventos
docker compose exec web sh -c 'cat /data/logs/*.jsonl' > events.jsonl && node scripts/events-report.mjs events.jsonl
```

## Leer el log de eventos en Railway

```bash
railway link                                   # una vez, elige proyecto/servicio
railway ssh -- ls -la /data/logs               # archivos del volumen
railway ssh -- cat /data/logs/events-2026-09-05.jsonl > events.jsonl
node scripts/events-report.mjs events.jsonl    # reporte local
railway logs -n 200                            # stdout (si EVENTS_LOG_DIR está vacío)
```

`railway volume browse` / `railway volume files` también listan el contenido del volumen.

## Hardening aplicado (y lo que NO está)

- Imagen mínima (standalone), usuario **no-root** (`nextjs`, uid 1001), sin
  `npm` ni devDependencies en el runner, telemetría de Next apagada.
- **Secrets solo en variables del server**; el browser nunca ve P2 ni la API key
  (topología A). `.env*` fuera del contexto de build.
- Headers: CSP con nonce (bloquea scripts inline no autorizados y todo
  `connect` que no sea al propio P1), HSTS, nosniff, X-Frame-Options DENY,
  Referrer-Policy, Permissions-Policy. `x-powered-by` apagado.
- `P2_MODE=live`: sin degradación silenciosa a mocks.
- Healthcheck de deploy + restart on failure + draining para no cortar SSE en curso.
- NO incluido (fuera de alcance del MVP): rate limiting propio en P1 (P2 ya
  limita por IP), WAF, autenticación, rotación del log del volumen (un archivo
  por día; borrar a mano o con un cron si crece).
