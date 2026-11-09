# Intégration continue – SouverainRecrut Backend

Pipeline Jenkins qui teste, analyse, conteneurise et publie l'API Backend de SouverainRecrut sur Docker Hub.
Ce dossier correspond à la **partie 3 du cahier des charges** (« Intégration continue avec Jenkins »).

- Dépôt : https://github.com/CherifDalein/souverainrecrut, branche `Dev`
- Image publiée : https://hub.docker.com/r/cherifdiallo725/souverainrecrut-backend

---

## 1. Vue d'ensemble

```
 git push (branche Dev)
        │  pollSCM toutes les 2 min
        ▼
 ┌──────────────────────────── Jenkins ────────────────────────────┐
 │ Checkout → npm ci → prisma generate → tests + couverture         │
 │   → analyse SonarQube → Quality Gate ──(webhook)── SonarQube     │
 │   → docker build → scan Trivy → push Docker Hub                  │
 └──────────────────────────────────────────────────────────────────┘
        │  uniquement si tous les contrôles sont verts
        ▼
 Docker Hub : cherifdiallo725/souverainrecrut-backend:<version>-<build> et :sha-<commit>
```

Chaque stage est une barrière : si un contrôle échoue (test, Quality Gate, vulnérabilité), les stages suivants ne s'exécutent pas et **aucune image n'est publiée**.

## 2. Contenu du dossier

| Élément | Rôle |
|---|---|
| [`Jenkinsfile`](Jenkinsfile) | Pipeline déclaratif (référencé par le job Jenkins, *Script Path* `integration-continue/Jenkinsfile`) |
| [`Dockerfile`](Dockerfile) | Copie du Dockerfile Backend pour le livrable. **La source de référence utilisée par le pipeline est [`backend/Dockerfile`](../backend/Dockerfile)** |
| [`jenkins/`](jenkins/) | Image Jenkins personnalisée (Node 22, client Docker, Trivy) et `docker-compose.yml` |
| [`sonar/`](sonar/) | Paramètres d'analyse et description du Quality Gate |
| [`reports/tests/`](reports/tests/) | Résultats des tests, couverture Jest, rapports `lcov.info` et `test-report.xml` |
| [`reports/trivy/`](reports/trivy/) | Scans Trivy avant / après durcissement de l'image |
| [`captures/`](captures/) | Captures d'écran des étapes (SonarQube, Docker Hub, Jenkins) |

Fichiers associés dans le Backend : [`jest.config.js`](../backend/jest.config.js), [`tests/`](../backend/tests/), [`sonar-project.properties`](../backend/sonar-project.properties), [`.dockerignore`](../backend/.dockerignore), [`.trivyignore`](../backend/.trivyignore).

## 3. Prérequis

| Outil | Version utilisée |
|---|---|
| Docker Desktop (moteur) | 29.7.2 – 6 Go de RAM recommandés |
| Jenkins | 2.580.2 (image `jenkins/jenkins:lts-jdk21`) |
| SonarQube Community | 9.9.8 LTS (`sonarqube:lts-community`) |
| SonarQube Scanner | 8.4.0.16527 (outil Jenkins `sonar-scanner`) |
| Node.js | 22 (dans l'image Jenkins et l'image Backend) |
| Trivy | 0.58.1 |

Comptes nécessaires : GitHub, Docker Hub (avec un *Personal Access Token* Read & Write dédié à Jenkins).

## 4. Mise en place (reproduction)

### 4.1 SonarQube

```bash
docker run -d --name sonarqube -p 9000:9000 sonarqube:lts-community
```

Puis sur http://localhost:9000 :
1. créer le projet `souverainrecrut-backend` ;
2. créer le Quality Gate `SouverainRecrut` et le définir par défaut (voir [`sonar/quality-gate.md`](sonar/quality-gate.md)) ;
3. générer un *Global Analysis Token* ;
4. créer le webhook **Administration → Configuration → Webhooks** : `http://jenkins:8080/sonarqube-webhook/`.

### 4.2 Jenkins

```bash
cd integration-continue/jenkins
docker compose up -d --build      # construit l'image et crée le réseau "ci"
docker network connect ci sonarqube

# Vérification des outils
docker exec jenkins sh -c 'node -v; docker version --format "{{.Client.Version}} / {{.Server.Version}}"; trivy --version | head -1'

# Mot de passe initial
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Configuration sur http://localhost:8080 :

| Où | Quoi |
|---|---|
| Assistant | *Install suggested plugins* (Git, Pipeline, SonarQube… sont préinstallés via [`plugins.txt`](jenkins/plugins.txt)) |
| Credentials → Global | `dockerhub` (*Username with password* : compte + token) · `sonar-token` (*Secret text*) |
| System → SonarQube servers | Nom `sonarqube`, URL `http://sonarqube:9000`, token `sonar-token`, *Environment variables* coché |
| Tools → SonarQube Scanner | Nom `sonar-scanner`, installation automatique |
| Nouveau job *Pipeline* | `souverainrecrut-backend-ci` → *Pipeline script from SCM* → Git `https://github.com/CherifDalein/souverainrecrut.git`, branche `*/Dev`, *Script Path* `integration-continue/Jenkinsfile` |

Le premier build est lancé manuellement : il enregistre le déclencheur `pollSCM`. Les suivants partent automatiquement à chaque commit sur `Dev`.

## 5. Les stages du pipeline

| Stage | Commande | Bloque si |
|---|---|---|
| Checkout Dev | `checkout scm` + calcul des tags | – |
| Installation des dépendances | `npm ci` (lockfile strict, build reproductible) | dépendance introuvable |
| Génération Prisma | `npx prisma generate` | schéma invalide |
| Tests + couverture | `npm run test:coverage` (70 tests Jest, Prisma mocké) | un test échoue |
| Analyse SonarQube | `sonar-scanner` dans `withSonarQubeEnv('sonarqube')` | erreur d'analyse |
| Quality Gate | `waitForQualityGate abortPipeline: true` (verdict via webhook) | Quality Gate rouge |
| Build image Docker | `docker build` + labels OCI (commit, version) | erreur de build |
| Scan Trivy | `trivy image --severity HIGH,CRITICAL --exit-code 1` | vulnérabilité HIGH/CRITICAL non justifiée |
| Publication Docker Hub | `docker login --password-stdin` + `docker push` | échec d'authentification |

Les rapports de couverture et Trivy sont archivés à chaque build (*artefacts* Jenkins).

## 6. Politiques retenues

### Tests
- Jest + ts-jest + Supertest ; Prisma est remplacé par un mock (`moduleNameMapper`) : **aucune base de données n'est nécessaire dans la CI**.
- Domaines couverts : authentification, contrôle d'accès (401/403), candidats, offres, candidatures, utilisateurs, tableau de bord, santé de l'API.

### Quality Gate `SouverainRecrut`
Couverture ≥ 80 %, duplications ≤ 3 %, notes Fiabilité / Sécurité / Maintenabilité A, 100 % des Security Hotspots revus. Détail : [`sonar/quality-gate.md`](sonar/quality-gate.md).

### Seuils Trivy
- **Bloquant** : toute vulnérabilité HIGH ou CRITICAL.
- **Exception documentée** dans [`backend/.trivyignore`](../backend/.trivyignore) : `CVE-2026-40345` (`deepmerge-ts`, utilisé uniquement par le CLI Prisma au lancement des migrations, jamais exposé aux requêtes HTTP ; correctif disponible seulement avec Prisma 7, version majeure). À retirer lors du passage à Prisma 7.

### Tags d'image (traçabilité)
| Tag | Exemple | Usage |
|---|---|---|
| `<version>-<n° build>` | `1.0.0-3` | Version applicative (`package.json`) + build Jenkins, unique à chaque build |
| `sha-<commit>` | `sha-8d97f20` | Relie l'image au commit exact sur GitHub |

Le tag `latest` n'est pas utilisé. Les labels `org.opencontainers.image.revision` et `.version` sont inscrits dans l'image (`docker inspect`).

### Secrets
- Aucun secret dans le dépôt : tokens Docker Hub et SonarQube stockés dans les **credentials Jenkins**.
- `withCredentials` + `--password-stdin` : le token n'apparaît jamais dans les logs (masqué `****`).
- `.dockerignore` exclut `.env`, `.git`, `node_modules`, les tests ; aucun secret dans `ARG`/`ENV` du Dockerfile.

## 7. Résultats

| Indicateur | Avant | Après |
|---|---|---|
| Tests automatisés | 1 (placeholder) | **70** |
| Couverture SonarQube | 52,5 % | **94,4 %** |
| Quality Gate | Sonar way (New Code uniquement) | **SouverainRecrut – Passed** |
| Security Hotspots | 1 non revu (S5689, `X-Powered-By`) | corrigé + test de non-régression |
| Vulnérabilités Trivy HIGH + CRITICAL | 46 (dont 2 CRITICAL) | **0 bloquante** (1 exception justifiée) |
| Image | Node 20, root, 870 Mo | Node 22, utilisateur `node`, HEALTHCHECK, 143 Mo compressés |
| Publication | manuelle | **automatique** à chaque commit sur `Dev` |

Build de référence : **#3**, tous les stages verts, publication de `1.0.0-3` et `sha-8d97f20`.
Déclenchement automatique vérifié : build #4 démarré par *SCM change* après le commit `7d76873`.

## 8. Dépannage

| Symptôme | Cause / solution |
|---|---|
| `npm ci` : `node-gyp-build: command not found` | Le chemin du projet contient `:` (séparateur du PATH). Renommer le dossier |
| `Unable to find integration-continue/Jenkinsfile` | Casse du nom : le fichier doit s'appeler `Jenkinsfile` (Git/GitHub sont sensibles à la casse, pas macOS) |
| Stage *Quality Gate* bloqué | Webhook SonarQube absent ou URL incorrecte (`http://jenkins:8080/sonarqube-webhook/`) |
| Jenkins ne joint pas SonarQube | `docker network connect ci sonarqube` |
| `permission denied` sur `/var/run/docker.sock` | Vérifier `group_add: ["0"]` dans `jenkins/docker-compose.yml` |
| Installation de Trivy impossible (release GitHub supprimée) | Binaire copié depuis l'image officielle `aquasec/trivy:0.58.1` (voir `jenkins/Dockerfile`) |

## 9. Captures

| Fichier | Contenu |
|---|---|
| [01](captures/01-sonar-activity-couverture-avant-52.5.png) | SonarQube Activity – couverture **avant** les tests : 52,5 % |
| [02](captures/02-sonar-new-code-premiere-analyse.png) | Première analyse, onglet *New Code* (aucune ligne nouvelle) |
| [03](captures/03-sonar-activity-couverture-apres-94.4.png) | SonarQube Activity – couverture **après** les tests : 94,4 % |
| [04](captures/04-sonar-overview-apres-tests.png) | Overview *Overall Code* après les tests : 0 bug, 0 vulnérabilité |
| [05](captures/05-sonar-overview-69-tests-version-1.0.0.png) | Overview avec rapport d'exécution des tests et version 1.0.0 |
| [06](captures/06-sonar-quality-gate-souverainrecrut.png) | Quality Gate `SouverainRecrut` |
| [07](captures/07-dockerhub-push-manuel-1.0.0-sha-ef9f10e.png) | Docker Hub – push manuel `1.0.0` / `sha-ef9f10e` (même digest) |
| [08](captures/08-jenkins-installation-plugins.png) | Installation des plugins Jenkins |
| [09](captures/09-jenkins-credentials.png) | Credentials Jenkins `dockerhub` et `sonar-token` (secrets masqués) |
| [10](captures/10-jenkins-config-serveur-sonarqube.png) | Déclaration du serveur SonarQube dans Jenkins |
| [11](captures/11-jenkins-outil-sonar-scanner.png) | Outil `sonar-scanner` |
| [12](captures/12-sonar-webhook-jenkins.png) | Webhook SonarQube → Jenkins |
| [13](captures/13-jenkins-pipeline-build-3-succes.png) | Pipeline build #3 : tous les stages verts, Quality Gate Passed |
