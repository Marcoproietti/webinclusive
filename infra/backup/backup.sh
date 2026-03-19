#!/bin/bash
# ─────────────────────────────────────────────────────────
# WEB.INCLUSIVE — Backup giornaliero
# Crontab: 0 2 * * * /opt/webinclusive/infra/backup/backup.sh
# ─────────────────────────────────────────────────────────
set -euo pipefail

BACKUP_DIR="/opt/backups/webinclusive"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30
LOG_FILE="$BACKUP_DIR/backup_${DATE}.log"

mkdir -p "$BACKUP_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "[$(date)] ══════════════════════════════════════════"
echo "[$(date)] Backup WEB.INCLUSIVE avviato — $DATE"

# 1. DB principale
echo "[$(date)] Dump PostgreSQL principale..."
docker exec webinclusive-postgres-1 \
  pg_dump -U "$POSTGRES_USER" -d webinclusive -Fc --no-password \
  | gzip > "$BACKUP_DIR/main_db_${DATE}.dump.gz"
echo "[$(date)] ✅ DB principale: $(du -sh "$BACKUP_DIR/main_db_${DATE}.dump.gz" | cut -f1)"

# 2. DB Whistleblowing
echo "[$(date)] Dump PostgreSQL whistleblowing..."
docker exec webinclusive-postgres-wb-1 \
  pg_dump -U "$WB_POSTGRES_USER" -d wb_db -Fc --no-password \
  | gzip > "$BACKUP_DIR/wb_db_${DATE}.dump.gz"
echo "[$(date)] ✅ DB WB: $(du -sh "$BACKUP_DIR/wb_db_${DATE}.dump.gz" | cut -f1)"

# 3. MinIO allegati clinici
echo "[$(date)] Sync MinIO → backup locale..."
docker run --rm --network webinclusive_internal \
  -v "$BACKUP_DIR:/backup" \
  minio/mc:latest sh -c "
    mc alias set local http://minio:9000 $MINIO_ACCESS_KEY $MINIO_SECRET_KEY --quiet
    mc mirror local/clinical-attachments /backup/minio_${DATE}/ --quiet
  " || echo "[$(date)] ⚠️  MinIO sync fallito — continuo"

# 4. Cifra backup con GPG
echo "[$(date)] Cifratura GPG backup..."
for f in "$BACKUP_DIR"/*_${DATE}*; do
  if [[ -f "$f" && "$f" != *.gpg ]]; then
    gpg --batch --yes --encrypt \
        --recipient "$BACKUP_GPG_KEY" \
        "$f" && rm "$f"
    echo "[$(date)] ✅ Cifrato: $(basename "$f").gpg"
  fi
done

# 5. Upload S3
if [[ -n "${S3_BUCKET:-}" ]]; then
  echo "[$(date)] Upload S3..."
  aws s3 sync "$BACKUP_DIR" "s3://$S3_BUCKET/db/" \
    --sse aws:kms \
    --storage-class STANDARD_IA \
    --exclude "*.log" \
    --quiet
  echo "[$(date)] ✅ Upload S3 completato"
fi

# 6. Pulizia vecchi backup
echo "[$(date)] Pulizia backup > $RETENTION_DAYS giorni..."
find "$BACKUP_DIR" -name "*.gpg" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.log" -mtime +7 -delete
find "$BACKUP_DIR" -type d -empty -delete

echo "[$(date)] ══════════════════════════════════════════"
echo "[$(date)] ✅ Backup completato"

# 7. Notifica
STATUS=$?
WEBHOOK_MSG="✅ Backup WEB.INCLUSIVE OK: $DATE"
[[ $STATUS -ne 0 ]] && WEBHOOK_MSG="🚨 ERRORE backup WEB.INCLUSIVE: $DATE"

if [[ -n "${WEBHOOK_URL:-}" ]]; then
  curl -s -X POST "$WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"$WEBHOOK_MSG\"}" || true
fi

exit $STATUS
