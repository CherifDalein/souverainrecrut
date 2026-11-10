#!/usr/bin/env bash
# ==========================================================
# Déploie une image Docker Hub sur un environnement
# Usage : deploy.sh <staging|prod> <tag>
#
# Variables : celles de common.sh + POSTGRES_PASSWORD, JWT_SECRET
# (portée par environnement dans GitLab), DOCKERHUB_USER,
# DOCKERHUB_TOKEN (lecture seule), BACKEND_IMAGE.
# L'image n'est jamais reconstruite : elle est récupérée sur Docker Hub.
# ==========================================================
source "$(dirname "$0")/common.sh"
TAG="${2:?tag de image requis}"

: "${POSTGRES_PASSWORD:?variable POSTGRES_PASSWORD manquante}"
: "${JWT_SECRET:?variable JWT_SECRET manquante}"
: "${DOCKERHUB_USER:?variable DOCKERHUB_USER manquante}"
: "${DOCKERHUB_TOKEN:?variable DOCKERHUB_TOKEN manquante}"
BACKEND_IMAGE="${BACKEND_IMAGE:-cherifdiallo725/souverainrecrut-backend}"
COMPOSE_FILE="$(dirname "$0")/../deployment/docker-compose.yml"

init_ssh
echo "==> Déploiement ${ENV_NAME} : ${BACKEND_IMAGE}:${TAG} -> ${DEPLOY_HOST}:${API_PORT}"

remote "mkdir -p '${REMOTE_DIR}'"

# 1. Mémoriser la version en place (utilisée par le rollback)
CURRENT_TAG="$(remote "grep -s '^IMAGE_TAG=' '${REMOTE_DIR}/.env' | cut -d= -f2" || true)"
echo "    Version actuelle : ${CURRENT_TAG:-aucune}"

# 2. Transmettre les fichiers de déploiement
copy_to "$COMPOSE_FILE" "${REMOTE_DIR}/docker-compose.yml"

# 3. Générer le .env sur le serveur.
#    Les secrets passent par l'entrée standard de SSH : ils n'apparaissent
#    ni dans les logs du pipeline ni dans la liste des processus.
{
  echo "COMPOSE_PROJECT_NAME=souverainrecrut-${ENV_NAME}"
  echo "BACKEND_IMAGE=${BACKEND_IMAGE}"
  echo "IMAGE_TAG=${TAG}"
  echo "API_PORT=${API_PORT}"
  echo "POSTGRES_DB=souverainrecrut"
  echo "POSTGRES_USER=souverainrecrut"
  echo "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}"
  echo "JWT_SECRET=${JWT_SECRET}"
  echo "API_VERSION=v1"
} | remote "umask 077 && cat > '${REMOTE_DIR}/.env.new' && mv '${REMOTE_DIR}/.env.new' '${REMOTE_DIR}/.env'"

if [ -n "$CURRENT_TAG" ] && [ "$CURRENT_TAG" != "$TAG" ]; then
  remote "echo '${CURRENT_TAG}' > '${REMOTE_DIR}/.previous_tag'"
fi

# 4. Récupérer l'image (token Docker Hub en lecture seule) et démarrer
printf '%s' "$DOCKERHUB_TOKEN" \
  | remote "docker login -u '${DOCKERHUB_USER}' --password-stdin >/dev/null && echo '    Docker Hub : authentifié'"

remote "cd '${REMOTE_DIR}' \
  && docker compose pull --quiet \
  && docker compose up -d --remove-orphans \
  && docker compose ps -a"

remote "docker logout >/dev/null"

log_history "action=deploy tag=${TAG} precedent=${CURRENT_TAG:-aucun}"
echo "==> Déploiement ${ENV_NAME} lancé avec ${TAG}"
