# CI/CD local — `develop` → Docker del :3000 · `stage` → Railway

*Creado el 2026-09-05, replicando el de P2 (handoff en
`docs/HANDOFF_P2_CICD_2026-09-05.md`; referencia: `docs/CI_CD.md` de finder-core).*

Dos ramas, dos destinos, un solo mecanismo: **hooks de git versionados**.
No hay servidor de CI ni runner que mantener — lo que dispara todo es el
commit y el push de esta máquina.

| evento | qué corre | dónde termina | ¿bloquea? |
|---|---|---|---|
| commit / merge / push en **`develop`** | guardias rápidas (lint + tsc + `next build`, ~16 s en caliente) → `actualizar_3000.sh` | tu Docker del **:3000** | no, va en segundo plano |
| commit en **`stage`** | guardias rápidas | nada (feedback nomás) | no |
| **push a `stage`** | el gate: las mismas guardias | — | **sí: si da rojo el push no sale** |
| push a `stage` (después del gate) | `deploy_verify.sh` (la imagen, en un contenedor aislado) → smoke contra la URL de stage | **Railway lo promueve desde GitHub** | no, sigue en segundo plano |

Cualquier otra rama (`main`, features…) no dispara nada.

## Enchufarlo

```bash
./scripts/ci/install_hooks.sh      # apunta core.hooksPath a scripts/git-hooks y crea .ci/config
```

No se copia nada a `.git/hooks`: `core.hooksPath` apunta a
`scripts/git-hooks/`, que está versionado. El hook que corre es el que se
ve en el diff, y no se desincroniza entre máquinas. (Instalado en esta
máquina el 05/09; las ramas `develop` y `stage` ya existen en `origin`.)

Desenchufar: `./scripts/ci/install_hooks.sh --uninstall`. Los scripts
quedan y se pueden correr a mano.

## `develop` — el Docker del :3000

```
commit → lint → tsc --noEmit → next build → docker compose up -d --build → healthy → smoke
```

- **Las guardias van primero a propósito.** Si dan rojo, el :3000 **no se
  toca**: se queda con el último código que andaba, que es lo que querés si
  estás mostrando el sistema. El que rompe se entera por la notificación de
  macOS, no por una demo caída. (Y si el build de la imagen falla, Compose
  tampoco recrea el contenedor.)
- Las guardias son el equivalente de los 397 tests de P2: P1 no tiene suite,
  su vara es que compile limpio (`scripts/ci/guardias_rapidas.sh`, del más
  barato al más caro). Next 16 aísla el build de producción (`.next/`) del
  dev server (`.next/dev/`): conviven con un `npm run dev` abierto.
- El rebuild es el `docker compose up -d --build` de `docs/DOCKER.md`, con
  espera de healthy y el **smoke** (abajo) contra el P2 local del :8000.
  Unos 35 s de corte mientras se recrea el contenedor; el volumen con el log
  de eventos se conserva.
- **Despliega el árbol de trabajo**, no el commit (`build: .` del compose):
  el :3000 refleja también lo que tengas sin commitear en ese momento.
- Si llegan varios commits seguidos, el segundo no encola una corrida
  nueva: marca "pendiente" y el que está corriendo se repite al terminar,
  así el :3000 queda con el **último** commit y no con el primero.

## `stage` — Railway

```
push → GATE (bloqueante: lint + tsc + build) → [push sale]
     → Railway buildea desde GitHub (rama stage)
     → en local: la MISMA imagen, de un worktree limpio del commit pusheado, verificada en :3002
     → smoke contra la URL de stage, esperando a que sirva ESE commit
```

**Quién promueve: la integración de GitHub de Railway** (`CD_STAGE_DEPLOY=none`).
Railway mira `origin/stage` y buildea el `Dockerfile` solo. El pipeline local
no sube código: pone el gate adelante del push y verifica el artefacto y la
URL después.

- **El gate bloquea el push.** Es lo que un pre-push puede probar: el árbol
  de trabajo compila limpio. Escotilla: `git push --no-verify`. Si pusheás
  `stage` parado en otra rama, el gate corre sobre lo que tenés en disco y te
  lo avisa; la verificación del artefacto, en cambio, usa el commit pusheado.
- El pipeline espera a que `origin/stage` tenga el commit antes de seguir.
  Si el push falla, no verifica nada.
- **`scripts/deploy_verify.sh --ref <sha>`** construye la imagen desde un
  worktree limpio de ese commit (`.ci/worktrees/`, sin `.env.local` ni
  cambios a medio hacer — exactamente lo que ve Railway), la audita (sin
  `.env*`, sin `docs`/`scripts`/`src`/devDependencies, tope 600 MB), la
  levanta aislada en el **:3002** contra el P2 local, espera el `healthy`
  del `HEALTHCHECK` propio, comprueba que el server corre como `nextjs`
  (no-root) y le pasa el smoke con `APP_VERSION=<sha>`. Nunca toca el :3000.
  Reporte en `.ci/reports/`. ~40 s con la caché de capas; 3-5 min en frío.
- **El smoke remoto espera a que stage sirva el commit pusheado**: `/api/health`
  reporta `version` = `RAILWAY_GIT_COMMIT_SHA` (7 chars) y el smoke reintenta
  hasta `STAGE_SMOKE_DEADLINE` (15 min) mientras la URL siga contestando con
  la versión anterior. Así "stage responde" quiere decir "stage corre esto",
  no "el deploy viejo sigue sano". Si Railway no inyectara el sha:
  `CD_STAGE_PIN_VERSION=0`.

## El smoke (`scripts/ci/smoke.mjs`) — uno solo para los tres destinos

Corre igual contra el :3000, el :3002 del artefacto y la URL de stage.
Falla explícito ante **degradación silenciosa**, que en P1 es servir mocks
con HTTP 200:

| chequeo | por qué |
|---|---|
| `/api/health` → `ok`, y `version` = la esperada si se pidió | vivo, y corriendo el commit que se cree |
| `p2_mode === "live"` | con `auto` un fallo de red cae a mocks en silencio; con `mock` es demo |
| `/api/health?deep=1` → `p2.status === "ok"` | P1 llega al P2 que tiene configurado |
| `GET /` → 200 con `Content-Security-Policy` con nonce | el hardening (`src/proxy.ts`) corre en la imagen standalone |
| `POST /api/sessions` + `POST /api/search/stream` (SSE, CRLF) → `cards` con `total_matches > 0` y cierre `done` | el canal real de la UI, de punta a punta, con ids que no son los de `/mocks` |
| mismo `total_matches` que `POST /search/text` del P2 (`SMOKE_P2_BASE_URL`) | "casas en rawson" → 180 en los dos lados, o P1 no habla con ese P2 |

```bash
node scripts/ci/smoke.mjs http://localhost:3000                                   # a mano, sin cruce
SMOKE_P2_BASE_URL=http://localhost:8000 node scripts/ci/smoke.mjs http://localhost:3000
SMOKE_DEADLINE=900 SMOKE_EXPECT_VERSION=594a1e2 \
  SMOKE_P2_BASE_URL=https://paradisofinder-core-staging.up.railway.app SMOKE_P2_API_KEY=… \
  node scripts/ci/smoke.mjs https://<stage-de-p1>.up.railway.app
```

Verificado el 05/09: pasa contra el :3000 y el artefacto; y falla como debe
con `P2_MODE=auto`, con una versión distinta, con la key de P2 incorrecta y
con una consulta que pide clarificación.

## Configurar Railway (una vez) — lo que falta del handoff del 05/09

Del lado de P2 ya está todo (stage con auth encendida en
`https://paradisofinder-core-staging.up.railway.app`). Del lado de P1:

1. **Servicio**: conectado al repo `gleotta/paradisofinder-web`, rama
   **`stage`** → entorno `stage`. `railway.json` ya fija builder `DOCKERFILE`,
   healthcheck `/api/health` (120 s), `ON_FAILURE` ×5 y draining 15 s.
2. **Variables** (todas del server, ninguna `NEXT_PUBLIC_`):
   `P2_BASE_URL=http://paradisofinder-core.railway.internal:8000` (red privada,
   mismo proyecto y entorno que P2; sin `/api/v1`. El handoff §3 decía que no
   conectaba por ser IPv6-only: desde el 2025-10-17 los entornos nuevos de
   Railway son IPv4 + IPv6, ver `docs/DEPLOY_RAILWAY.md`; plan B, la URL
   pública `https://paradisofinder-core-staging.up.railway.app`), `P2_API_KEY` = la
   `PORTAL_API_KEY` del entorno `stage` de P2 (Railway → `finder-core` →
   `stage` → Variables), `P2_MODE=live` (ya viene en el Dockerfile),
   `CONTACT_WHATSAPP`, volumen en `/data`. Detalle: `docs/DEPLOY_RAILWAY.md`.
3. **Dominio**: Settings → Networking → Generate Domain, y que el **puerto
   destino sea 3000** (el que fija el Dockerfile). Si no coincide, el edge
   devuelve `502 Application failed to respond` con la app perfectamente
   sana en los logs — a P2 le costó media hora.
4. **Smoke**: en `.ci/config` (gitignored) la URL que te dio Railway, y en
   `.env.local` la key del stage de P2 para el cruce de `total_matches`:

```bash
# .ci/config
STAGE_BASE_URL="https://<stage-de-p1>.up.railway.app"
# STAGE_P2_BASE_URL ya apunta a la URL PÚBLICA del stage de P2 (el smoke corre desde
# esta máquina, fuera de la red privada; el P2_BASE_URL de P1 en Railway es el privado)

# .env.local
STAGE_P2_API_KEY=…            # la PORTAL_API_KEY del entorno stage de P2
```

Sin `STAGE_BASE_URL` el pipeline no puede verificar nada remoto: te queda un
"Railway dice que buildeó" en vez de un "anda" (lo avisa con ⚠ en cada push).

**Alternativa — promover con el CLI** (`CD_STAGE_DEPLOY=railway`): el
pipeline sube un worktree limpio del commit pusheado con `railway up`.
Necesita `railway login` (o `RAILWAY_TOKEN` en `.env.local`) y
`RAILWAY_PROJECT_ID` en `.ci/config`. Es el camino de P2, adaptado; en P1
no se probó (el CLI de esta máquina no tiene sesión).

## Interruptores

Todos en `.ci/config`, o por entorno para una corrida suelta.

| variable | default | qué hace |
|---|---|---|
| `CD_FAST_TESTS` | `1` | `0` = `develop` rebuildea sin lint/tsc/build previos |
| `CD_STAGE_GATE_BLOCKING` | `1` | `0` = el gate corre pero no frena el push |
| `CD_STAGE_VERIFY_ARTIFACT` | `1` | `0` = no verificar la imagen tras el push |
| `CD_VERIFY_PORT` | `3002` | puerto del contenedor de verificación (nunca 3000) |
| `CD_STAGE_DEPLOY` | `none` | `railway` = promover con el CLI |
| `CD_STAGE_PIN_VERSION` | `1` | `0` = el smoke no espera a que stage sirva el commit pusheado |
| `CD_NOTIFY` | `1` | `0` = sin notificaciones de macOS |
| `CD_DRY_RUN` | `0` | `1` = **ensayo**: recorre el pipeline sin ejecutar nada |
| `STAGE_SMOKE_QUERY` | `casas en rawson` | la consulta del smoke (tiene que devolver resultados, no clarificación) |
| `STAGE_SMOKE_DEADLINE` | `900` | segundos que se espera a stage (el build de Railway corre adentro) |

```bash
CD_DRY_RUN=1 ./scripts/ci/cd_develop.sh    # probar el cableado sin efectos
```

## Ver qué pasó

```bash
./scripts/ci/cd_status.sh        # resumen + últimas líneas del último log
./scripts/ci/cd_status.sh -f     # seguir en vivo el que está corriendo
./scripts/ci/cd_status.sh -l     # listar los logs
```

Todo vive en `.ci/` (gitignored): `logs/` una corrida por archivo,
`state/` el último SHA desplegado por rama y los locks (con PID: un lock
huérfano se descarta solo), `reports/` los veredictos de `deploy_verify.sh`,
`worktrees/` los checkouts limpios (se borran al terminar).

## A mano, sin hooks

Los pipelines son scripts normales:

```bash
./scripts/ci/guardias_rapidas.sh        # lint + tsc + build
./scripts/ci/cd_develop.sh              # guardias + :3000
./scripts/actualizar_3000.sh            # solo el rebuild del :3000 + smoke
./scripts/deploy_verify.sh              # la imagen del árbol de trabajo, en :3002
./scripts/deploy_verify.sh --ref stage  # la imagen de un commit, de un worktree limpio
./scripts/ci/cd_stage.sh gate           # solo el gate
./scripts/ci/cd_stage.sh deploy         # artefacto + smoke del stage (de la punta de stage)
./scripts/ci/cd_stage.sh deploy <sha>   # ídem para un commit puntual
./scripts/ci/cd_stage.sh all            # gate + deploy
```

## Lo que esto NO hace

- **No commitea ni pushea por vos**: reacciona a lo que vos hacés.
- **No despliega a producción.** `stage` llega hasta el entorno de staging;
  la promoción a producción sigue siendo una decisión, no un push.
- **No dispara con pushes hechos desde otra máquina**: los hooks son
  locales. Si algún día hace falta, el reemplazo natural es un runner
  self-hosted de GitHub Actions corriendo estos mismos scripts.
- **No verifica el artefacto ANTES del push** (Railway lo buildea en
  paralelo). Si la imagen rompe, Railway deja el deploy anterior en pie
  (healthcheck en rojo → no cambia) y el smoke remoto falla por versión: el
  log de `.ci/logs/` lo dice antes y más claro que el dashboard.
