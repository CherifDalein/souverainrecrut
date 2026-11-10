#!/usr/bin/env bash
# ==========================================================
# Retour à une version antérieure de l'image
# Usage : rollback.sh <staging|prod> [tag]
#   sans tag : revient à la version précédente mémorisée
#   avec tag : revient à la version indiquée
#
# Seul IMAGE_TAG change : les secrets et le volume PostgreSQL
# restent en place (les données sont conservées).
# Attention : le rollback applicatif n'annule pas les migrations
# de schéma déjà appliquées (cf. procedure-rollback.md).
# ==========================================================
source "$(dirname "$0")/common.sh"
init_ssh

CURRENT_TAG="$(remote "grep -s '^IMAGE_TAG=' '${REMOTE_DIR}/.env' | cut -d= -f2" || true)"
TARGET_TAG="${2:-$(remote "cat '${REMOTE_DIR}/.previous_tag' 2>/dev/null" || true)}"

if [ -z "$TARGET_TAG" ]; then
  echo "Aucune version précédente connue pour ${ENV_NAME} : rollback impossible" >&2
  exit 1
fi

echo "==> Rollback ${ENV_NAME} : ${CURRENT_TAG:-?} -> ${TARGET_TAG}"

remote "cd '${REMOTE_DIR}' \
  && sed -i 's|^IMAGE_TAG=.*|IMAGE_TAG=${TARGET_TAG}|' .env \
  && echo '${CURRENT_TAG}' > .previous_tag \
  && docker compose pull --quiet backend \
  && docker compose up -d backend \
  && docker compose ps -a"

log_history "action=rollback tag=${TARGET_TAG} precedent=${CURRENT_TAG:-?}"
echo "==> ${ENV_NAME} revenu à ${TARGET_TAG}"
