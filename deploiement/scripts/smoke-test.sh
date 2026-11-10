#!/usr/bin/env bash
# ==========================================================
# Tests de fumée après déploiement
# Usage : smoke-test.sh <staging|prod>
# Échoue (code 1) si l'API ou la base ne répondent pas.
# ==========================================================
source "$(dirname "$0")/common.sh"

echo "==> Tests de fumée ${ENV_NAME} : ${API_URL}"

for attempt in $(seq 1 20); do
  if ready="$(curl -fsS --max-time 5 "${API_URL}/ready" 2>/dev/null)" \
     && grep -q '"database":"CONNECTED"' <<<"$ready"; then
    break
  fi
  if [ "$attempt" -eq 20 ]; then
    echo "ÉCHEC : l'API n'est pas prête après 60 s" >&2
    exit 1
  fi
  echo "    tentative ${attempt}/20 : API pas encore prête"
  sleep 3
done

check() {
  local label="$1" path="$2" expected="$3" code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${API_URL}${path}")"
  if [ "$code" = "$expected" ]; then
    echo "    OK   ${label} (${path} -> ${code})"
  else
    echo "    ÉCHEC ${label} (${path} -> ${code}, attendu ${expected})" >&2
    return 1
  fi
}

check "API démarrée"              /health          200
check "Base de données connectée" /ready           200
check "Informations de l'API"     /info            200
check "Route protégée sans token" /candidates      401
check "Route inconnue"            /route-inconnue  404

echo "==> ${ENV_NAME} validé"
