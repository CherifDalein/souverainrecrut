# syntax=docker/dockerfile:1

# ======================================================
# Étape 1 : Construction (TypeScript -> JavaScript)
# ======================================================
FROM node:22-alpine AS builder
WORKDIR /app

# Dépendances d'abord : la couche est mise en cache
# tant que package*.json ne change pas
COPY package*.json ./
RUN npm ci

# Code source (filtré par .dockerignore)
COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate \
 && npm run build

# ======================================================
# Étape 2 : Dépendances de production uniquement
# ======================================================
FROM node:22-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev \
 && npm cache clean --force

# ======================================================
# Étape 3 : Image d'exécution
# ======================================================
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000

# npm, yarn et corepack ne servent pas à l'exécution : on les retire
# pour réduire la surface d'attaque (ils embarquent leurs propres CVE)
RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg

# Fichiers appartenant à l'utilisateur non-root "node"
# (fourni par l'image officielle Node.js)
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node package.json ./

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/v1/health || exit 1

CMD ["node", "dist/server.js"]
