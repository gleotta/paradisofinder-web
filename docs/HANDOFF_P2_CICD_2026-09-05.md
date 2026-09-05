# HANDOFF P1 — CI/CD y conexión con P2 en Railway

**Fecha:** 2026-09-05 · **De:** P2 (finder-core) · **Para:** P1 (paradisofinder-web)

> Recibido el 05/09/2026 y aplicado en P1 el mismo día: `docs/CI_CD.md` es la
> versión de P1 de lo que acá se describe. Se guarda tal cual, como registro.
>
> **Corrección de P1 (05/09, German):** el §3 parte de que la red privada de Railway
> es solo IPv6. Desde el changelog de Railway del 2025-10-17 ("IPv4 Private Networks"),
> los entornos creados después del 16/10/2025 resuelven `*.railway.internal` a IPv4 e
> IPv6; el `stage` de P2 es del 05/09/2026 y su dominio privado es
> `paradisofinder-core.railway.internal`, así que `http://paradisofinder-core.railway.internal:8000`
> debería alcanzar al `--host 0.0.0.0` de P2 sin cambios. Es el valor a usar en
> `P2_BASE_URL` (mismo proyecto y entorno); la URL pública queda como plan B.
> Detalle en `docs/DEPLOY_RAILWAY.md`.

Qué hay acá: lo que P2 ya dejó andando en Railway, las variables que P1
necesita para hablarle, un bloqueante que es de P2 y hay que decidir, y el
CI/CD que replicar en P1 (el mismo que se armó hoy en P2).

---

## 1. Lo que ya está listo del lado de P2 — nada que hacer

Entorno **`stage`** de P2 desplegado y verificado el 2026-09-05:

| qué | estado |
|---|---|
| URL pública | `https://paradisofinder-core-staging.up.railway.app` |
| Promoción | integración de **GitHub** de Railway: mira la rama `stage` del repo `gleotta/paradisofinder-core` |
| Auth | **encendida** (`X-API-Key`). Sin key → 401; con key → 200 |
| Base de datos | Postgres de Railway con el schema `master` de P3: **5586 propiedades, 3265 visibles (tier ≥ 1)**, todas con embedding, extensión `vector` OK |
| Búsqueda | `"casas en rawson"` → 180 coincidencias (idéntico a local) |
| Semántica | `embedding=ok · pgvector=ok · semantic_search=available` |
| LLM | narrativa en streaming verificada token a token sobre `/search/stream` |
| Puerto interno | **8000** (`PORT=8000` declarada en Railway; el dominio rutea a 8000) |

El contrato de la API no cambió: siguen valiendo `docs/P1_INTEGRATION_SPEC.md`
y los deltas de `CAMBIOS_P2_PARA_P1_2026-09-01.md`.

---

## 2. Variables que P1 tiene que cargar en su servicio de Railway

Todas del **server** de P1. Ninguna con `NEXT_PUBLIC_` (topología A: el
browser nunca llama a P2 directo).

| variable | valor |
|---|---|
| `P2_BASE_URL` | `https://paradisofinder-core-staging.up.railway.app` — **sin** `/api/v1`, lo agrega el cliente. (Ver §3: la alternativa privada todavía no funciona.) |
| `P2_API_KEY` | el `PORTAL_API_KEY` del entorno `stage` de P2. **No se transcribe acá**: sacalo de Railway → servicio `finder-core` → entorno `stage` → Variables. Es el mismo string en las dos puntas. |
| `P2_MODE` | `live` (ya viene en el Dockerfile de P1; si está en `auto`, un fallo de red cae a mocks **en silencio** — en stage no lo querés) |

Lo demás (`CONTACT_WHATSAPP`, `EVENTS_LOG_DIR`, volumen en `/data`) sigue
como está en `docs/DEPLOY_RAILWAY.md` de P1.

**Verificación de que la key quedó bien**, desde cualquier lado:

```bash
# sin key -> 401 ; con key -> 200
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://paradisofinder-core-staging.up.railway.app/api/v1/sessions \
  -H 'Content-Type: application/json' -d '{"canal":"web"}'
```

---

## 3. Bloqueante conocido: la red privada de Railway es IPv6

`docs/DEPLOY_RAILWAY.md` de P1 ya lo tenía anotado y sigue vigente:

- La red privada de Railway (`*.railway.internal`) es **IPv6**.
- El `CMD` de P2 hoy es `uvicorn … --host 0.0.0.0` → **solo IPv4**.
- Consecuencia: `P2_BASE_URL=http://finder-core.railway.internal:8000`
  **no conecta**. Por URL pública sí, y es lo que está verificado.

**Hoy:** usar la URL pública. Anda, tiene la auth encendida y está probada.

**Si P1 prefiere la red privada** (no expone P2 al mundo, sin egress, un
hop menos): pedirle a P2 que cambie el `CMD` a `--host ::` (dual-stack;
en Linux con `bindv6only=0` sigue aceptando IPv4, así que el tooling local
no se entera). Es un cambio de una línea en el `Dockerfile` de P2, más
`./scripts/deploy_verify.sh` para confirmar el artefacto. **Decisión de P1:
avisá y se hace.**

---

## 4. El CI/CD a replicar en P1

Lo que se armó hoy en P2, y que P1 puede copiar casi tal cual. La referencia
completa está en `docs/CI_CD.md` de P2, y los scripts en `scripts/ci/` y
`scripts/git-hooks/`.

### La forma

| evento | qué corre | dónde termina |
|---|---|---|
| commit / merge / push en **`develop`** | guardias rápidas → rebuild del Docker local | el contenedor local de P1 (:3000) |
| commit en **`stage`** | guardias rápidas | feedback nomás |
| **push a `stage`** | el gate del repo — **bloquea el push si da rojo** | — |
| después del push | Railway promueve desde GitHub → smoke contra la URL | el stage de P1 en Railway |

### Las decisiones que ya se tomaron en P2 y conviene copiar

1. **Hooks versionados, no `.git/hooks`.** `git config core.hooksPath
   scripts/git-hooks`: el hook que corre es el que se ve en el diff y no se
   desincroniza entre máquinas. (P1 hoy no tiene ningún hook configurado.)
2. **Las guardias van ANTES del rebuild.** Si dan rojo, el contenedor local
   no se toca y se queda con el último código que andaba. Nada peor que
   perder la demo por un commit a medio hacer.
3. **El gate de `stage` bloquea el push** (`pre-push` con salida ≠ 0).
   Escotilla: `git push --no-verify`.
4. **Railway promueve desde GitHub**, el pipeline local no sube código:
   pone el gate adelante del push y verifica el resultado después.
5. **El smoke post-deploy es obligatorio.** Que Railway diga "buildeó" no es
   que ande. Y tiene que fallar ante **degradación silenciosa**: en P1 eso
   es `P2_MODE=auto` cayendo a mocks — un smoke que solo mire HTTP 200 te
   deja un stage sirviendo datos falsos y en verde.
6. **Un lock con PID** para no pisar dos despliegues, y que se rompa solo si
   el proceso murió (si no, un `kill -9` te traba el CD para siempre).

### Lo que P1 tiene que cambiar respecto de P2

- **Guardias rápidas**: en P2 son 397 tests de pytest (~75 s). En P1 el
  equivalente natural es `npm run lint` + `npx tsc --noEmit` + `npm run build`.
- **Gate de stage**: P2 corre su release gate (golden 129 + narrativa +
  canales). P1 no tiene ese gate: su vara es build limpio + un smoke contra
  `/api/health` y una búsqueda real que **no** venga de mocks.
- **`railway.json`**: P1 ya lo tiene (healthcheck `/api/health`, timeout 120,
  `ON_FAILURE`, `drainingSeconds: 15`). No hace falta tocarlo.

---

## 5. Pasos concretos, en orden

1. **Ramas.** P1 tiene `develop` local sin pushear y no tiene `stage`:
   ```bash
   git push -u origin develop
   git branch stage && git push -u origin stage
   ```
2. **Railway**: conectar el servicio de P1 al repo de GitHub, rama `stage` →
   entorno `stage`.
3. **Variables** del §2 en ese entorno (`P2_BASE_URL`, `P2_API_KEY`,
   `P2_MODE=live`).
4. **Dominio**: Settings → Networking → Generate Domain. Verificar que el
   **puerto destino coincida con el que bindea el contenedor** — a P2 esto
   le costó un 502 de media hora: Railway inyecta `PORT` y el dominio rutea
   a un puerto fijo que se configura aparte. Si no coinciden, el edge
   devuelve `502 Application failed to respond` con el log de la app
   perfectamente sano. En P1 el Dockerfile fija `PORT=3000` y `HOSTNAME=::`.
5. **CI/CD local**: copiar el esqueleto de `scripts/ci/` + `scripts/git-hooks/`
   de P2, adaptar las guardias a npm y correr el instalador.
6. **Verificar** con el §6.

---

## 6. Cómo se sabe que quedó bien

```bash
# 1. P1 responde
curl -s https://<url-de-p1-stage>/api/health

# 2. P1 está hablando con P2 de verdad (no con mocks): una búsqueda con
#    datos reales tiene que devolver los mismos números que P2.
#    "casas en rawson" -> 180 coincidencias.
```

Si P1 devuelve resultados pero los números no coinciden con los de P2,
está sirviendo mocks: revisar `P2_MODE=live` y `P2_BASE_URL`.

---

## 7. Pendiente de P2 (no bloquea)

- **`--host ::`** en el `CMD`, si P1 elige la red privada (§3).
- El modelo de embeddings (458 MB) se baja en cada arranque del contenedor:
  ~1 min de boot. Se puede hornear en la imagen si molesta; medido, no urge.
