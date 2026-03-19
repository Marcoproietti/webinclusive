FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --frozen-lockfile
COPY tsconfig.json src/ ./
RUN npm run build

FROM node:20-alpine AS runtime
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production --frozen-lockfile && npm cache clean --force
COPY --from=builder /app/dist ./dist
USER appuser
EXPOSE 3006
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3006/health || exit 1
CMD ["node","dist/index.js"]
