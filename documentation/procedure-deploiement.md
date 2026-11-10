# Procédure de déploiement – SouverainRecrut Backend

Procédure reproductible par un tiers, de la VM vierge à l'API en production.
Prérequis et variables : [deploiement/README.md](../deploiement/README.md).

---

## Étape 0 – Prérequis sur le poste d'administration (Mac)

```bash
brew tap hashicorp/tap
brew install hashicorp/tap/terraform ansible gitlab-runner
terraform -version && ansible --version | head -1 && gitlab-runner --version | head -1
```

**Vérification** : les trois versions s'affichent.

## Étape 1 – Préparer la VM (4.1)

1. Créer une VM Ubuntu Server 24.04 LTS (ARM64 sur Mac Apple Silicon) : 2 vCPU minimum, 4 Go RAM, 30 Go disque, réseau NAT, **OpenSSH installé**.
2. Dans la VM :
   ```bash
   sudo apt update && sudo apt upgrade -y
   ip -4 addr show | grep inet
   ```
3. Sur le Mac, créer la clé de déploiement et l'installer sur la VM :
   ```bash
   ssh-keygen -t ed25519 -N "" -C "deploy-souverainrecrut" -f ~/.ssh/souverainrecrut_deploy
   ssh-copy-id -i ~/.ssh/souverainrecrut_deploy.pub <utilisateur>@<ip>
   ssh -i ~/.ssh/souverainrecrut_deploy -o BatchMode=yes <utilisateur>@<ip> "uname -m"
   ```
4. Faire un snapshot de la VM (UTM : VM éteinte → clic droit → *Clone*).

**Vérification** : la connexion SSH aboutit **sans mot de passe**.

## Étape 2 – Terraform (4.2)

```bash
cd deploiement/terraform
cp terraform.tfvars.example terraform.tfvars   # renseigner server_ip et ssh_user
terraform init
terraform validate
terraform plan        # Plan: 2 to add
terraform apply       # yes
```

**Vérification** : la ligne `SSH OK : <hôte> – aarch64 – Ubuntu 24.04…` et le fichier `deploiement/ansible/inventory.ini` créé.

## Étape 3 – Ansible (4.3)

```bash
cd ../ansible
ansible app -m ping                 # pong
ansible-playbook playbook.yml -K    # mot de passe sudo de la VM
ansible-playbook playbook.yml -K    # 2e exécution
```

**Vérification** : `failed=0` à la 1re exécution, puis `changed=0` à la 2e (idempotence) ; le résumé indique Docker, Compose, `Conteneur de test : OK` et les répertoires `/opt/souverainrecrut/staging` et `/opt/souverainrecrut/prod`.

## Étape 4 – Préparer GitLab (4.4)

1. Créer un projet **privé** et y pousser le dépôt :
   ```bash
   git remote add gitlab https://<utilisateur>@gitlab.com/<utilisateur>/souverainrecrut-deploy.git
   git push gitlab Dev      # mot de passe : Personal Access Token (write_repository)
   ```
2. **Settings → Repository** : branche par défaut `Dev`.
3. **Settings → CI/CD → General pipelines** : *CI/CD configuration file* = `deploiement/.gitlab-ci.yml`.
4. **Settings → CI/CD → Runners → New project runner** (tag `souverainrecrut-mac`, sans jobs non tagués), puis sur le Mac :
   ```bash
   gitlab-runner register --non-interactive --url https://gitlab.com \
     --token <token glrt-… affiché par GitLab> --executor shell --description "mac-runner"
   brew services restart gitlab-runner
   gitlab-runner verify
   ```
5. **Settings → CI/CD → Variables** : créer les variables listées dans le [README](../deploiement/README.md#4-variables-cicd-settings--cicd--variables). Les valeurs secrètes se copient sans être affichées :
   ```bash
   pbcopy < ~/.ssh/souverainrecrut_deploy                            # SSH_PRIVATE_KEY (File)
   ssh-keyscan -t ed25519 <ip> 2>/dev/null | pbcopy                   # SSH_KNOWN_HOSTS (File)
   openssl rand -hex 16 | tr -d '\n' | pbcopy                         # POSTGRES_PASSWORD (par env.)
   openssl rand -hex 32 | tr -d '\n' | pbcopy                         # JWT_SECRET (par env.)
   ```

**Vérification** : le runner est *online* (pastille verte) ; **Build → Pipeline editor → Validate** indique une simulation réussie.

## Étape 5 – Déployer (5.1 à 5.3)

1. Vérifier que l'image a été publiée par Jenkins (pipeline vert) et noter son tag, ex. `sha-c1e56f9`.
2. GitLab → **Build → Pipelines → New pipeline**, branche `Dev`, input `image_tag` = le tag.
3. Le pipeline exécute automatiquement `validate-image`, `deploy-staging`, `smoke-staging`.
4. Vérifier le staging : `http://<ip>:4001/v1/ready` → `"database":"CONNECTED"`.
5. **Approuver** la mise en production : bouton ▶ sur `deploy-prod`.
6. `smoke-prod` vérifie la production.

**Vérification** :
```bash
curl -s http://<ip>:4000/v1/health      # "status":"UP"
curl -s http://<ip>:4000/v1/ready       # "status":"READY","database":"CONNECTED"
ssh -i ~/.ssh/souverainrecrut_deploy <utilisateur>@<ip> \
  "cd /opt/souverainrecrut/prod && docker compose ps && tail -3 /opt/souverainrecrut/deploy-history.log"
```

Contrôle des endpoints métier et de la base :
```bash
ADMIN_PASSWORD="<mot de passe de test>" deploiement/scripts/donnees-test.sh prod create
```

## Ce que fait un déploiement (`scripts/deploy.sh`)

1. Lit la version en place (`IMAGE_TAG` du `.env`) et la mémorise dans `.previous_tag`.
2. Copie `docker-compose.yml` sur le serveur.
3. Génère le `.env` (droits `0600`) à partir des variables GitLab, transmises par l'entrée standard SSH.
4. `docker login` avec le token en lecture seule, `docker compose pull`, `docker compose up -d`, `docker logout`.
5. Compose démarre PostgreSQL, attend qu'il soit sain, applique les migrations (`migrate`), puis démarre l'API.
6. Ajoute une ligne à `/opt/souverainrecrut/deploy-history.log` (date, environnement, tag, version précédente, auteur, pipeline).

## En cas d'échec

Voir le tableau de dépannage du [README](../deploiement/README.md#7-dépannage) et la [procédure de rollback](procedure-rollback.md).
