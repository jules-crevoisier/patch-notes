# Multi-stage Docker build pour le blog patch-notes.fr.
#  - deps    : install des dépendances (prod + prisma CLI nécessaire pour `migrate deploy`).
#  - builder : génère le client Prisma à partir du schéma versionné.
#  - runtime : image alpine minimale, user non-root, healthcheck HTTP, migrations au boot.

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json ./
RUN npm install --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY prisma ./prisma
RUN npx prisma generate

FROM node:22-alpine AS runtime
WORKDIR /app
# tzdata : requis pour que le cron scheduler interne (blog/automation/scheduler.js)
# résolve correctement le fuseau Europe/Paris (node-cron s'appuie sur l'IANA
# tz database, absente par défaut d'alpine).
RUN apk add --no-cache openssl wget tzdata
ENV NODE_ENV=production \
    PORT=3001

RUN addgroup --system --gid 1001 blog \
    && adduser --system --uid 1001 --ingroup blog blog

COPY --from=deps --chown=blog:blog /app/node_modules ./node_modules
COPY --from=builder --chown=blog:blog /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=blog:blog package.json ./
COPY --chown=blog:blog server.js ./
COPY --chown=blog:blog db.js ./
COPY --chown=blog:blog seo-urls.js ./
COPY --chown=blog:blog pins.js ./
COPY --chown=blog:blog pinned-shelf.js ./
COPY --chown=blog:blog suggestions.js ./
COPY --chown=blog:blog prisma ./prisma
COPY --chown=blog:blog public ./public
COPY --chown=blog:blog automation ./automation

USER blog
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -q -O - http://127.0.0.1:3001/health || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && exec node server.js"]
