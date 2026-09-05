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
| `P2_BASE_URL` | `http://<servicio-p2>.railway.internal:8000` (red privada) **o** `https://p2.tu-dominio` (pública) | Sin `/api/v1`. El nombre interno es el del servicio de P2 en el mismo proyecto/entorno. |
| `P2_API_KEY` | la `PORTAL_API_KEY` configurada en P2 | Header `X-API-Key`. **En producción P2 debe tener auth activa** (en dev está vacía). |
| `P2_MODE` | `live` | Ya viene en el Dockerfile. Jamás `auto` en prod: degradaría a mocks en silencio si P2 cae. |
| `CONTACT_WHATSAPP` | `549264…` (solo dígitos) | Botón "Publicá tu propiedad". Vacío = no se muestra. |
| `CONTACT_WHATSAPP_TEXT` | opcional | Texto prellenado. |
| `EVENTS_LOG_DIR` | `/data/logs` (default del Dockerfile) | Con volumen montado en `/data`. Vacío = solo stdout (Railway Logs). |
| `PORT` | la inyecta Railway | Next la lee; el Dockerfile expone 3000 por si no la inyecta. |

Railway aporta además `RAILWAY_GIT_COMMIT_SHA` (la muestra `/api/health` como `version`).

## Pasos

1. **Repo → Railway.** New Project → Deploy from GitHub repo → elegir este repo y
   la rama (`main`). Railway detecta el `Dockerfile` ("Using detected Dockerfile!")
   y lee `railway.json`.
2. **Variables.** Cargar la tabla de arriba. Para la red privada, el valor de
   `P2_BASE_URL` es `http://${{<servicio-p2>.RAILWAY_PRIVATE_DOMAIN}}:8000`
   (referencia entre servicios) o el nombre `<servicio-p2>.railway.internal`.
3. **Volumen (recomendado).** Service → Volumes → Add volume, mount path **`/data`**.
   Sin volumen el log de eventos se pierde en cada deploy (queda en stdout).
   El entrypoint deja `/data/logs` escribible por el usuario no-root; alternativa
   de Railway si algo falla: variable `RAILWAY_RUN_UID=0` (corre como root).
4. **Dominio.** Settings → Networking → Generate Domain (o dominio propio).
   Railway termina TLS; HSTS ya viene en los headers.
5. **Deploy.** Automático en cada push a la rama. Manual: `railway up`.
6. **Smoke test** (reemplazar el host):
   ```bash
   curl -s https://<host>/api/health            # {"ok":true,"p2_mode":"live","p2_target":"…"}
   curl -s "https://<host>/api/health?deep=1"   # …"p2":{"status":"ok","http":200}
   curl -sI https://<host>/ | grep -i "content-security-policy\|strict-transport"
   ```
   Después: una búsqueda real (`/buscar?q=casa%20en%20rawson`), abrir un detalle
   y ver que `Logs` no muestre `[p2]` ni `[events]`.

## P2 en Railway: dos cosas a revisar del lado de P2

- **Escuchar en IPv6.** La red privada de Railway es IPv6: el `CMD` de P2 hoy es
  `uvicorn … --host 0.0.0.0` (solo IPv4). En Railway tiene que ser `--host ::`
  (dual-stack), o P1 no lo alcanza por `*.railway.internal`. Por URL pública no
  aplica.
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
