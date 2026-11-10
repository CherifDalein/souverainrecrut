#!/usr/bin/env bash
# ==========================================================
# Données de test pour vérifier l'API et la persistance (5.4)
#
#   ADMIN_PASSWORD=xxx donnees-test.sh <staging|prod> create
#       crée un compte ADMIN de test (en base) puis un candidat via l'API
#   ADMIN_PASSWORD=xxx donnees-test.sh <staging|prod> check
#       se connecte via l'API et vérifie que le candidat est toujours là
#
# À lancer depuis le Mac (clé ~/.ssh/souverainrecrut_deploy).
# ==========================================================
set -euo pipefail

ENV_NAME="${1:?environnement requis : staging ou prod}"
ACTION="${2:-check}"
case "$ENV_NAME" in
  staging) PORT=4001 ;;
  prod)    PORT=4000 ;;
  *) echo "Environnement inconnu : $ENV_NAME" >&2; exit 2 ;;
esac

: "${ADMIN_PASSWORD:?définir ADMIN_PASSWORD (lettres et chiffres, 8 caractères minimum)}"
HOST="${DEPLOY_HOST:-192.168.64.2}"
SSH_USER="${DEPLOY_USER:-usercicd}"
KEY="${SSH_KEY:-$HOME/.ssh/souverainrecrut_deploy}"
API="http://${HOST}:${PORT}/v1"
ADMIN_EMAIL="admin.test@souverainrecrut.local"
CANDIDATE_EMAIL="candidat.persistance@souverainrecrut.local"
BACKEND_DIR="$(cd "$(dirname "$0")/../../backend" && pwd)"

remote() { ssh -i "$KEY" -o BatchMode=yes "${SSH_USER}@${HOST}" "cd /opt/souverainrecrut/${ENV_NAME} && $1"; }
json_field() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }

login() {
  curl -fsS -X POST "${API}/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
    | json_field "['data']['token']"
}

if [ "$ACTION" = "create" ]; then
  echo "==> [${ENV_NAME}] Création du compte ADMIN de test"
  HASH="$(cd "$BACKEND_DIR" && node -e 'require("bcrypt").hash(process.env.ADMIN_PASSWORD, 10).then(h => console.log(h))')"
  # SQL transmis par l'entrée standard : pas d'interprétation des '$' du hash
  printf "INSERT INTO users (id, \"firstName\", \"lastName\", email, password, role, \"createdAt\", \"updatedAt\") VALUES ('admin-test', 'Admin', 'Test', '%s', '%s', 'ADMIN', NOW(), NOW()) ON CONFLICT (email) DO NOTHING;\n" \
    "$ADMIN_EMAIL" "$HASH" \
    | remote "docker compose exec -T postgres sh -c 'psql -q -U \$POSTGRES_USER -d \$POSTGRES_DB -v ON_ERROR_STOP=1'"

  TOKEN="$(login)"
  echo "==> [${ENV_NAME}] Connexion OK, création d'un candidat via l'API"
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${API}/candidates" \
    -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' \
    -d "{\"fullName\":\"Candidat Persistance\",\"email\":\"${CANDIDATE_EMAIL}\",\"phone\":\"0600000000\"}")"
  case "$code" in
    201) echo "    candidat créé (HTTP 201)" ;;
    409) echo "    candidat déjà présent (HTTP 409)" ;;
    *)   echo "    ÉCHEC création candidat (HTTP ${code})" >&2; exit 1 ;;
  esac
fi

echo "==> [${ENV_NAME}] Vérification des données"
echo "    version déployée : $(remote "grep '^IMAGE_TAG=' .env | cut -d= -f2")"
TOKEN="$(login)"
echo "    authentification : OK"
CANDIDATES="$(curl -fsS "${API}/candidates?limit=100" -H "Authorization: Bearer ${TOKEN}")"
TOTAL="$(json_field "['pagination']['total']" <<<"$CANDIDATES")"
echo "    candidats en base : ${TOTAL}"
if grep -q "$CANDIDATE_EMAIL" <<<"$CANDIDATES"; then
  echo "    OK : le candidat de test est présent"
else
  echo "    ÉCHEC : le candidat de test est absent" >&2
  exit 1
fi
