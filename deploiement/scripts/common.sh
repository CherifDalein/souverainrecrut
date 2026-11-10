#!/usr/bin/env bash
# ==========================================================
# Fonctions communes aux scripts de déploiement
# Variables attendues (GitLab CI/CD) :
#   DEPLOY_HOST, DEPLOY_USER, SSH_PRIVATE_KEY (type File),
#   SSH_KNOWN_HOSTS (type File)
# ==========================================================
set -euo pipefail

ENV_NAME="${1:?environnement requis : staging ou prod}"

case "$ENV_NAME" in
  staging) API_PORT=4001 ;;
  prod)    API_PORT=4000 ;;
  *) echo "Environnement inconnu : $ENV_NAME (attendu : staging ou prod)" >&2; exit 2 ;;
esac

: "${DEPLOY_HOST:?variable DEPLOY_HOST manquante}"
REMOTE_DIR="/opt/souverainrecrut/${ENV_NAME}"
API_URL="http://${DEPLOY_HOST}:${API_PORT}/v1"

# Prépare la connexion SSH (clé copiée en 600, hôte vérifié)
init_ssh() {
  : "${DEPLOY_USER:?variable DEPLOY_USER manquante}"
  : "${SSH_PRIVATE_KEY:?variable SSH_PRIVATE_KEY manquante}"
  : "${SSH_KNOWN_HOSTS:?variable SSH_KNOWN_HOSTS manquante}"

  KEY_FILE="$(mktemp)"
  cp "$SSH_PRIVATE_KEY" "$KEY_FILE"
  chmod 600 "$KEY_FILE"
  trap 'rm -f "$KEY_FILE"' EXIT

  SSH_OPTS=(
    -i "$KEY_FILE"
    -o BatchMode=yes
    -o ConnectTimeout=10
    -o StrictHostKeyChecking=yes
    -o UserKnownHostsFile="$SSH_KNOWN_HOSTS"
  )
}

remote() { ssh "${SSH_OPTS[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}" "$@"; }
copy_to() { scp -q "${SSH_OPTS[@]}" "$1" "${DEPLOY_USER}@${DEPLOY_HOST}:$2"; }

# Trace d'audit : qui a déployé quoi, quand, depuis quel pipeline
log_history() {
  remote "echo '$(date -u +%Y-%m-%dT%H:%M:%SZ) env=${ENV_NAME} $1 par=${GITLAB_USER_LOGIN:-manuel} pipeline=${CI_PIPELINE_URL:-n/a}' >> /opt/souverainrecrut/deploy-history.log"
}
