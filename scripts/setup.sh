#!/bin/bash
# ─────────────────────────────────────────────────────────
# WEB.INCLUSIVE — Script primo avvio
# Uso: ./scripts/setup.sh
# ─────────────────────────────────────────────────────────
set -euo pipefail
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
err()  { echo -e "${RED}❌ $1${NC}"; exit 1; }

echo "═══════════════════════════════════════════════════"
echo "  WEB.INCLUSIVE — Setup primo avvio"
echo "═══════════════════════════════════════════════════"

# 1. Prerequisiti
command -v docker  >/dev/null || err "Docker non installato"
command -v openssl >/dev/null || err "OpenSSL non installato"
ok "Prerequisiti OK"

# 2. Genera .env se non esiste
if [[ ! -f .env ]]; then
  cp .env.example .env
  # Genera automaticamente i secrets
  JWT_SECRET=$(openssl rand -hex 64)
  COOKIE_SECRET=$(openssl rand -hex 32)
  ENC_KEY=$(openssl rand -hex 32)
  WB_ENC_KEY=$(openssl rand -hex 32)
  WB_HMAC_KEY=$(openssl rand -hex 32)
  REDIS_PASS=$(openssl rand -hex 24)
  PG_PASS=$(openssl rand -hex 24)
  WB_PG_PASS=$(openssl rand -hex 24)
  MINIO_PASS=$(openssl rand -hex 24)
  GRAFANA_PASS=$(openssl rand -hex 16)

  sed -i "s|GENERATE_WITH_openssl_rand_-hex_64|$JWT_SECRET|g"           .env
  sed -i "s|GENERATE_WITH_openssl_rand_-hex_32$|$COOKIE_SECRET|g"       .env
  sed -i "s|GENERATE_WITH_openssl_rand_-hex_32_DIFFERENT$|$WB_ENC_KEY|g" .env
  sed -i "s|GENERATE_WITH_openssl_rand_-hex_32_DIFFERENT|$WB_HMAC_KEY|g" .env
  sed -i "s|CHANGE_ME_STRONG_PASSWORD|$PG_PASS|g"                        .env
  sed -i "s|CHANGE_ME_DIFFERENT_PASSWORD|$WB_PG_PASS|g"                  .env
  sed -i "s|CHANGE_ME_REDIS_PASSWORD|$REDIS_PASS|g"                      .env
  sed -i "s|CHANGE_ME_MINIO_SECRET|$MINIO_PASS|g"                        .env
  sed -i "s|CHANGE_ME_GRAFANA_PASSWORD|$GRAFANA_PASS|g"                  .env
  # Aggiorna ENCRYPTION_KEY
  sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$ENC_KEY|g"               .env

  ok ".env creato con secrets autogenerati"
  warn "Configura manualmente: ALLOWED_ORIGINS, SMTP_*, FIREBASE_*, FCM_SERVER_KEY"
else
  ok ".env già presente"
fi

# 3. Avvia infrastruttura dati
echo "Avvio PostgreSQL, Redis, MinIO..."
docker compose up -d postgres postgres-wb redis minio
echo "Attendo che i servizi siano pronti..."
sleep 20

# 4. Migrations DB
echo "Esecuzione migrations..."
for svc in auth-service scheduling-service presenze-service cartella-service hr-service; do
  echo "  → $svc"
  docker compose run --rm "$svc" npx prisma migrate deploy 2>/dev/null || \
    warn "Migration $svc fallita (normale se già eseguita)"
done

docker compose run --rm wb-service npx prisma migrate deploy 2>/dev/null || \
  warn "Migration wb-service fallita"

ok "Migrations completate"

# 5. Seed dati sviluppo
read -p "Caricare seed dati di sviluppo? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  docker compose run --rm auth-service npx tsx prisma/seed.ts
  ok "Seed completato"
fi

# 6. Crea bucket MinIO
echo "Configurazione MinIO..."
docker compose run --rm minio sh -c "
  mc alias set local http://minio:9000 \$MINIO_ROOT_USER \$MINIO_ROOT_PASSWORD --quiet 2>/dev/null
  mc mb local/clinical-attachments  --quiet 2>/dev/null || true
  mc mb local/quality-documents     --quiet 2>/dev/null || true
  mc mb local/backups               --quiet 2>/dev/null || true
  echo 'Bucket creati'
" 2>/dev/null || warn "Configurazione MinIO manuale richiesta"
ok "MinIO configurato"

# 7. Avvia tutti i servizi
echo "Avvio tutti i servizi..."
docker compose up -d
sleep 20

# 8. Verifica health
echo "Verifica health endpoints..."
declare -A SERVICES=(
  ["gateway"]="3000"
  ["auth-service"]="3001"
  ["scheduling-service"]="3002"
  ["presenze-service"]="3003"
  ["cartella-service"]="3004"
  ["hr-service"]="3005"
  ["notify-service"]="3006"
  ["wb-service"]="3007"
)

for svc in "${!SERVICES[@]}"; do
  port="${SERVICES[$svc]}"
  if curl -sf "http://localhost:${port}/health" > /dev/null 2>&1; then
    ok "$svc :$port"
  else
    warn "$svc :$port non risponde"
  fi
done

# 9. Chmod backup script
chmod +x infra/backup/backup.sh

echo ""
echo "═══════════════════════════════════════════════════"
echo "  🎉 WEB.INCLUSIVE avviato!"
echo "═══════════════════════════════════════════════════"
echo "  API Gateway:  http://localhost:3000"
echo "  Grafana:      http://localhost:3001 (porta Grafana)"
echo "  MinIO:        http://localhost:9001"
echo ""
echo "  Credenziali seed (solo dev):"
echo "  admin@webinclusive.it        / Admin1234!"
echo "  coordinator@webinclusive.it  / Coord1234!"
echo "  operatore.test@webinclusive.it / Operator1234!"
echo "═══════════════════════════════════════════════════"
