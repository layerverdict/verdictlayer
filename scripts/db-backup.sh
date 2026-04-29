#!/usr/bin/env bash
#
# Daily Postgres dump. Runs on the VPS under the `verdict` user via a
# systemd timer. Keeps the last 14 dumps locally so we can restore to
# any point in the last two weeks without maintaining an off-box
# target during the hackathon.
#
# Off-host retention can be bolted on later (Cloudflare R2 free tier,
# or any S3-compatible bucket) by piping this script's output into
# `aws s3 cp` / `rclone copy`.

set -euo pipefail

BACKUP_DIR="/srv/verdict/backups"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
OUT="$BACKUP_DIR/verdict-$TIMESTAMP.sql.gz"
RETAIN=14

mkdir -p "$BACKUP_DIR"

# The container runs as the postgres user and already has the right
# env; calling pg_dump through `docker exec` keeps us from shipping a
# host-side postgres client just for this.
docker exec verdict-pg pg_dump \
  -U verdict \
  -d verdict \
  --clean --if-exists --no-owner --no-privileges \
  | gzip -9 \
  > "$OUT"

# Prune older dumps — keep the N newest.
# shellcheck disable=SC2012
ls -1t "$BACKUP_DIR"/verdict-*.sql.gz 2>/dev/null \
  | tail -n +$((RETAIN + 1)) \
  | xargs -r rm -f

# Best-effort health summary to the log.
size=$(stat -c%s "$OUT" 2>/dev/null || echo 0)
echo "[db-backup] wrote $OUT ($size bytes); retaining $RETAIN dumps"
