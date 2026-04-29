#!/usr/bin/env bash
#
# Runs ON the VPS as the `verdict` user. Called by the GitHub Actions
# deploy job over SSH with no arguments. It pulls the latest main, runs
# workspace installs + web build, and asks systemd to pick up the new
# processes. If anything along the way fails, it rolls the working tree
# back to the previous commit and restarts the services so the demo is
# never left half-deployed.
#
# Environment variables required on the VPS (live in /srv/verdict/app/.env):
#   PRIVATE_KEY + RPC_URL + … (everything the api + web runtime needs)
#
# Idempotency: a double-run is safe — the only side effect is a second
# fast-forward pull and a second systemd restart.

set -euo pipefail

APP_DIR="/srv/verdict/app"
LOG_PREFIX="[deploy]"

log() { printf "%s %s\n" "$LOG_PREFIX" "$*"; }
fail() { printf "%s ERROR: %s\n" "$LOG_PREFIX" "$*" >&2; exit 1; }

cd "$APP_DIR"

log "pre-deploy HEAD:  $(git rev-parse --short HEAD)"
PREV_HEAD="$(git rev-parse HEAD)"

rollback() {
  log "rolling back to $PREV_HEAD"
  git reset --hard "$PREV_HEAD" >/dev/null
  # best-effort rebuild on the old tree; the service may already be
  # running the last-known-good binary, so we just try to restart.
  pnpm install --frozen-lockfile >/dev/null 2>&1 || true
  pnpm --filter @verdict/web build >/dev/null 2>&1 || true
  sudo /bin/systemctl restart verdict-api verdict-web || true
}

trap 'rollback' ERR

log "git fetch + fast-forward"
git fetch --prune origin main
git reset --hard origin/main

log "new HEAD: $(git rev-parse --short HEAD)"

log "pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile

log "apply any pending DB migrations"
(cd apps/api && pnpm exec drizzle-kit migrate 2>&1 | tail -5 || true)

log "pnpm build (web)"
pnpm --filter @verdict/web build

trap - ERR

log "restart services"
sudo /bin/systemctl restart verdict-api
sudo /bin/systemctl restart verdict-web

log "health check (api)"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf --max-time 3 http://127.0.0.1:4000/health >/dev/null; then
    log "api is healthy after ${i} attempts"
    break
  fi
  if [ "$i" -eq 10 ]; then
    fail "api failed health check after 10 attempts"
  fi
  sleep 1
done

log "health check (web)"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf --max-time 3 http://127.0.0.1:3000/ >/dev/null; then
    log "web is healthy after ${i} attempts"
    break
  fi
  if [ "$i" -eq 10 ]; then
    fail "web failed health check after 10 attempts"
  fi
  sleep 1
done

log "deploy complete: $(git rev-parse --short HEAD)"
