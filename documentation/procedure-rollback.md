# Procédure de rollback – SouverainRecrut Backend

Retour de l'API à une version antérieure de l'image, **sans perte de données**.
Script : [`deploiement/scripts/rollback.sh`](../deploiement/scripts/rollback.sh).

---

## 1. Principe

| Ce qui change | Ce qui ne change pas |
|---|---|
| `IMAGE_TAG` dans `/opt/souverainrecrut/<env>/.env` | Secrets (`POSTGRES_PASSWORD`, `JWT_SECRET`) |
| Conteneur `backend` recréé avec l'image ciblée | Volume PostgreSQL : **les données sont conservées** |
| `.previous_tag` (pour pouvoir annuler le rollback) | Configuration Compose, réseau, port |

Chaque déploiement mémorise automatiquement la version qu'il remplace dans `.previous_tag`. Le rollback revient à cette version, ou à un tag indiqué explicitement.

## 2. Quand déclencher un rollback

| Situation | Déclenchement |
|---|---|
| Les tests de fumée échouent après un déploiement (`smoke-staging`, `smoke-prod`) | **Automatique** dans le même job |
| Un défaut est constaté en production après validation | **Manuel** : job `rollback-prod` |
| Retour à une version précise (plusieurs versions en arrière) | Manuel : script avec un tag |

## 3. Identifier la version précédente

```bash
ssh -i ~/.ssh/souverainrecrut_deploy <utilisateur>@<ip> '
  cd /opt/souverainrecrut/prod
  echo "Version en place     : $(grep ^IMAGE_TAG= .env | cut -d= -f2)"
  echo "Version précédente   : $(cat .previous_tag 2>/dev/null || echo aucune)"
  echo "--- historique"; grep "env=prod" /opt/souverainrecrut/deploy-history.log | tail -5'
```

Versions disponibles : page des tags Docker Hub `cherifdiallo725/souverainrecrut-backend`. Chaque tag `sha-<commit>` correspond à un commit GitHub et à un build Jenkins validé.

## 4. Procédure

### 4.1 Depuis GitLab (recommandé)

1. Ouvrir le pipeline qui a déployé la version à annuler.
2. Cliquer sur ▶ **`rollback-prod`**.
3. Lire le log : `==> Rollback prod : <version actuelle> -> <version précédente>`.

### 4.2 Depuis le poste d'administration

```bash
export DEPLOY_HOST=<ip> DEPLOY_USER=<utilisateur>
export SSH_PRIVATE_KEY=~/.ssh/souverainrecrut_deploy
ssh-keyscan -t ed25519 "$DEPLOY_HOST" 2>/dev/null > /tmp/known_hosts && export SSH_KNOWN_HOSTS=/tmp/known_hosts

deploiement/scripts/rollback.sh prod                 # vers la version précédente
deploiement/scripts/rollback.sh prod sha-8d97f20     # vers une version précise
```

### 4.3 Sur le serveur, sans outillage (secours)

```bash
cd /opt/souverainrecrut/prod
sed -i 's|^IMAGE_TAG=.*|IMAGE_TAG=<tag cible>|' .env
docker compose pull backend
docker compose up -d backend
```

## 5. Vérifier le retour arrière

```bash
DEPLOY_HOST=<ip> deploiement/scripts/smoke-test.sh prod
ADMIN_PASSWORD="<mot de passe de test>" deploiement/scripts/donnees-test.sh prod check
```

Attendu : les 5 tests de fumée `OK`, `version déployée : <tag cible>`, `OK : le candidat de test est présent`.

Le rollback est tracé dans `/opt/souverainrecrut/deploy-history.log` (`action=rollback`).

## 6. Limite : les migrations de base de données

Le rollback remplace le code, **pas le schéma de la base**. Les migrations Prisma déjà appliquées par la nouvelle version restent en place lorsqu'on revient à l'ancienne.

Règles à respecter pour que le rollback reste sûr :
- migrations **additives** (nouvelle table, nouvelle colonne optionnelle) plutôt que suppressions ou renommages ;
- en cas de changement destructif, procéder en deux versions : la version N ajoute le nouveau schéma et reste compatible avec l'ancien, la version N+1 supprime l'ancien ;
- avant une migration risquée, sauvegarder la base :
  ```bash
  cd /opt/souverainrecrut/prod
  docker compose exec -T postgres sh -c 'pg_dump -U $POSTGRES_USER $POSTGRES_DB' > sauvegarde-$(date +%F-%H%M).sql
  ```

## 7. Scénario de test (environnement maîtrisé)

| Étape | Action | Résultat attendu |
|---|---|---|
| 1 | Pipeline avec `image_tag = sha-8d97f20` (v1) | production en `sha-8d97f20` |
| 2 | `donnees-test.sh prod create` | candidat créé |
| 3 | Pipeline avec `image_tag = sha-c1e56f9` (v2) | log `deploy-prod` : `Version actuelle : sha-8d97f20` |
| 4 | Job `rollback-prod` | log : `Rollback prod : sha-c1e56f9 -> sha-8d97f20` |
| 5 | `donnees-test.sh prod check` | version `sha-8d97f20`, candidat présent |

Résultats obtenus : voir le [rapport final](rapport-final.md), section 9.7.
