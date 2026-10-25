#!/usr/bin/env bash
# Copy the engine and its settings to the server, then rebuild and restart it.
#
#   deploy/deploy.sh ubuntu@SERVER_IP
#
# Uses the SSH key ~/.ssh/scandiff-engine.pem (or SSH_KEY). engine/.env goes to the
# server as deploy/engine.env, readable only by its owner; it is never in the image.
set -euo pipefail

HOST="${1:?usage: deploy/deploy.sh ubuntu@SERVER_IP}"
KEY="${SSH_KEY:-$HOME/.ssh/scandiff-engine.pem}"
ENGINE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new"

rsync -az --delete -e "$SSH" \
  --exclude .venv --exclude .venv.nosync --exclude data --exclude out --exclude static \
  --exclude tests --exclude .env --exclude deploy/engine.env \
  --exclude __pycache__ --exclude .pytest_cache \
  "$ENGINE_DIR/" "$HOST:/srv/scandiff/"
$SSH "$HOST" 'umask 077 && cat > /srv/scandiff/deploy/engine.env' < "$ENGINE_DIR/.env"

$SSH "$HOST" 'cd /srv/scandiff/deploy && sudo docker compose up -d --build && sudo docker compose ps'
