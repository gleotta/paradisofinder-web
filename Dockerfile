# syntax=docker/dockerfile:1
# paradisofinder.com — P1 (Next.js, output standalone) para Railway / Docker.
# Runbook: docs/DEPLOY_RAILWAY.md. Tres etapas: deps → build → runner (imagen final
# sin node_modules completos: solo lo que traza `output: "standalone"`).

FROM node:24-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- deps: instalación reproducible desde el lockfile ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- build: `next build` con typecheck; no necesita variables de P2 ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `public/` está vacío en el repo (git no versiona directorios vacíos) y el COPY
# de abajo lo exige.
RUN mkdir -p public && npm run build

# ---- runner: mínimo, no-root, healthcheck ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    # Docker pone HOSTNAME = id del container: sin esto Next escucharía ahí y nada
    # externo llegaría. `::` = dual-stack (IPv4 + IPv6): el edge, el healthcheck y
    # la red privada de Railway hablan IPv6; Next formatea IPv6 correctamente.
    # Railway inyecta PORT; 3000 es el default.
    HOSTNAME=:: \
    PORT=3000 \
    # En producción NUNCA degradar a mocks en silencio: si P2 no responde, error visible.
    P2_MODE=live \
    # Log de eventos en el volumen (/data). Sin volumen, cae a stdout con un warning.
    EVENTS_LOG_DIR=/data/logs

# su-exec: el entrypoint arranca como root solo para dejar el volumen escribible
# y baja a `nextjs` antes de ejecutar el server.
RUN apk add --no-cache su-exec \
 && addgroup -S -g 1001 nodejs \
 && adduser -S -u 1001 -G nodejs -h /app nextjs \
 && mkdir -p /data/logs \
 && chown -R nextjs:nodejs /app /data

COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

# Railway usa su propio healthcheck (railway.json → /api/health); este sirve para
# `docker run` local y otros orquestadores.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" > /dev/null || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
