# ─────────────────────────────────────────────────────────
# services/auth-service/Dockerfile
# Build multi-stage: builder → runtime minimale
# ─────────────────────────────────────────────────────────

# ── Stage 1: Build ────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache python3 make g++   # per bcrypt nativo

WORKDIR /app

COPY package*.json ./
COPY prisma/       ./prisma/

RUN npm ci --frozen-lockfile

# Genera Prisma client
RUN npx prisma generate

COPY tsconfig.json ./
COPY src/          ./src/

RUN npm run build

# ── Stage 2: Runtime minimale ─────────────────────────────
FROM node:20-alpine AS runtime

# Utente non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Solo dipendenze produzione + Prisma client generato
COPY package*.json ./
RUN npm ci --only=production --frozen-lockfile && npm cache clean --force

# Copia artefatti build + Prisma
COPY --from=builder /app/dist           ./dist
COPY --from=builder /app/node_modules/.prisma \
                    ./node_modules/.prisma
COPY prisma/schema.prisma               ./prisma/

USER appuser

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
