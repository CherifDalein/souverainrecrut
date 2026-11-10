# Déploiement – SouverainRecrut Backend

Provisionnement du serveur et déploiement de l'API Backend à partir de l'image publiée par Jenkins sur Docker Hub.
Ce dossier correspond aux **sections 4 et 5 du cahier des charges** (« Provisionnement et déploiement »).

- Projet GitLab (privé) : `https://gitlab.com/mcd2020etude/souverainrecrut-deploy`, branche `Dev`
- Image déployée : `cherifdiallo725/souverainrecrut-backend:<tag>` (Docker Hub)
- Procédures détaillées : [procédure de déploiement](../documentation/procedure-deploiement.md) · [procédure de rollback](../documentation/procedure-rollback.md) · [architecture](../documentation/architecture.md)

---

## 1. Vue d'ensemble

```
Terraform ──▶ vérifie l'accès SSH + génère l'inventaire
Ansible   ──▶ installe Docker / Compose, crée /opt/souverainrecrut/{staging,prod}
GitLab CI ──▶ validate-image ─▶ deploy-staging ─▶ smoke-staging ─▶ [▶ deploy-prod] ─▶ smoke-prod
                                                                   (approbation)
VM Ubuntu 24.04 (192.168.64.2)
   ├── staging : backend :4001 + PostgreSQL (volume souverainrecrut-staging_pgdata)
   └── prod    : backend :4000 + PostgreSQL (volume souverainrecrut-prod_pgdata)
```

L'image n'est **jamais reconstruite** ici : le serveur la télécharge depuis Docker Hub par son tag.

## 2. Contenu du dossier

| Élément | Rôle |
|---|---|
| [`terraform/`](terraform/) | `providers.tf`, `variables.tf`, `main.tf`, `outputs.tf` : vérification SSH de la VM et génération de `ansible/inventory.ini` |
| [`ansible/`](ansible/) | `playbook.yml` (préparation du serveur, idempotent), `ansible.cfg`, `inventory.ini` généré |
| [`deployment/`](deployment/) | `docker-compose.yml` (backend + PostgreSQL + migrations Prisma) et `.env.example` |
| [`.gitlab-ci.yml`](.gitlab-ci.yml) | Pipeline de déploiement : validation, staging, approbation, production, rollback |
| [`scripts/`](scripts/) | `deploy.sh`, `smoke-test.sh`, `rollback.sh`, `common.sh`, `donnees-test.sh` |
| [`reports/`](reports/) | Sorties Terraform et des deux exécutions Ansible |
| [`captures/`](captures/) | Captures GitLab et de la VM |

## 3. Prérequis

| Élément | Version utilisée |
|---|---|
| Hyperviseur | UTM (Mac Apple Silicon) – VMware Fusion incompatible avec macOS 27 |
| VM | Ubuntu 24.04.5 LTS `aarch64`, 4 vCPU, 4 Go RAM, 30 Go disque, réseau NAT, OpenSSH |
| Terraform | 1.17.1 (provider `hashicorp/local` ~> 2.5) |
| Ansible | core 2.21 |
| GitLab Runner | 19.5.3, exécuteur *shell*, tag `souverainrecrut-mac` |
| Clé SSH | `~/.ssh/souverainrecrut_deploy` (ED25519, dédiée au déploiement) |
| Docker Hub | token **Read-only** pour le serveur |

## 4. Variables CI/CD (Settings → CI/CD → Variables)

| Clé | Type | Portée | Visibilité |
|---|---|---|---|
| `DEPLOY_HOST` | Variable | All | visible |
| `DEPLOY_USER` | Variable | All | visible |
| `SSH_PRIVATE_KEY` | **File** | All | – (multiligne, terminée par un retour à la ligne) |
| `SSH_KNOWN_HOSTS` | **File** | All | – (`ssh-keyscan -t ed25519 <ip>`) |
| `DOCKERHUB_USER` | Variable | All | masquée |
| `DOCKERHUB_TOKEN` | Variable | All | **masquée** |
| `POSTGRES_PASSWORD` | Variable | `staging` / `production` | **masquée** (une valeur par environnement) |
| `JWT_SECRET` | Variable | `staging` / `production` | **masquée** (une valeur par environnement) |

Aucun secret n'est présent dans le dépôt. Les fichiers ignorés par Git : `terraform.tfvars`, `*.tfstate`, `.terraform/`, `.env`.

## 5. Déclencheurs du pipeline

| Déclencheur | Tag déployé |
|---|---|
| Push sur `Dev` | `sha-<7 premiers caractères du commit>` (refusé si Jenkins ne l'a pas publié) |
| Lancement manuel (Build → Pipelines → New pipeline) | input `image_tag`, ex. `sha-c1e56f9` |
| Mise en production | **manuelle** : bouton ▶ sur `deploy-prod` |
| Rollback de la production | manuel : bouton ▶ sur `rollback-prod` ; automatique si `smoke-prod` échoue |

## 6. Démarrage rapide

```bash
# 1. Infrastructure
cd deploiement/terraform
cp terraform.tfvars.example terraform.tfvars        # adapter l'IP et l'utilisateur
terraform init && terraform validate && terraform plan && terraform apply

# 2. Configuration du serveur
cd ../ansible
ansible app -m ping
ansible-playbook playbook.yml -K                     # 2e exécution : changed=0

# 3. Déploiement : GitLab → Build → Pipelines → New pipeline → image_tag = sha-xxxxxxx
```

Détail pas à pas : [procédure de déploiement](../documentation/procedure-deploiement.md).

## 7. Dépannage

| Symptôme dans le pipeline | Cause | Solution |
|---|---|---|
| `Le tag … n'existe pas sur Docker Hub` | Image non publiée par Jenkins | Lancer le pipeline Jenkins, ou indiquer un tag existant dans `image_tag` |
| `variable X manquante` | Variable absente, ou *Protected* sur une branche non protégée | Créer la variable, décocher *Protected* ou protéger la branche |
| `Host key verification failed` | `SSH_KNOWN_HOSTS` vide ou incorrect | Recoller la sortie de `ssh-keyscan -t ed25519 <ip>` (type File) |
| `Permission denied (publickey)` | Clé absente de la VM ou mal copiée | Vérifier `authorized_keys` ; `SSH_PRIVATE_KEY` doit finir par un retour à la ligne |
| `unauthorized: incorrect username or password` | Token Docker Hub invalide | Générer un token *Read-only* et le tester : `curl -u user:token "https://auth.docker.io/token?service=registry.docker.io&scope=repository:<image>:pull"` |
| `syntax is invalid` (GitLab) | YAML invalide | Build → Pipeline editor → Validate |
| `smoke-*` échoue puis rollback | L'API ne démarre pas ou la base est inaccessible | `docker compose logs migrate backend` dans `/opt/souverainrecrut/<env>` |
| L'API répond mais `/ready` → `DISCONNECTED` | Mot de passe PostgreSQL changé alors que le volume existe déjà | PostgreSQL garde le mot de passe de sa création : remettre l'ancien, ou recréer le volume (perte des données) |
