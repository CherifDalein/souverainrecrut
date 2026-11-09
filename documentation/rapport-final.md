# Rapport – Projet fil rouge CI/CD SouverainRecrut

**Module** CI/CD – Mastère Expert en Développement et Déploiement de Solutions Numériques Sécurisées (M2, RNCP 40166)
**Étudiant** Mamadou Cherif Diallo
**Dépôt** https://github.com/CherifDalein/souverainrecrut (branche `Dev`)
**Image** https://hub.docker.com/r/cherifdiallo725/souverainrecrut-backend

> Partie 1 (Jour 1) – Intégration continue avec Jenkins : **réalisée**.
> Partie 2 (Jour 2) – Provisionnement et déploiement : à compléter.

---

## 1. Objectif de la partie 1

À l'issue de cette partie, l'API Backend doit être **testée, analysée, conteneurisée et publiée sur Docker Hub** par une chaîne automatisée (cahier des charges, section 3).

La démarche suit la progression du cours : **Manuel → Scripté → Automatisé**. Chaque étape a d'abord été exécutée et validée à la main (tests, analyse SonarQube, build et scan de l'image, push), puis confiée à Jenkins. Ainsi, une erreur dans le pipeline relève de la configuration de Jenkins et non d'une étape jamais vérifiée.

## 2. Architecture de la chaîne d'intégration

```
GitHub (Dev) ──pollSCM──▶ Jenkins ──▶ tests ──▶ SonarQube / Quality Gate ──▶ build Docker ──▶ Trivy ──▶ Docker Hub
```

| Composant | Rôle | Hébergement |
|---|---|---|
| GitHub | Code source, branche de travail `Dev` | fork personnel |
| Jenkins 2.580.2 | Orchestration du pipeline (`Jenkinsfile` versionné) | conteneur Docker, image personnalisée |
| SonarQube 9.9 LTS | Analyse statique, couverture, Quality Gate | conteneur Docker |
| Trivy 0.58.1 | Scan de vulnérabilités de l'image | binaire dans l'image Jenkins |
| Docker Hub | Registre des images versionnées | `cherifdiallo725/souverainrecrut-backend` |

Jenkins et SonarQube partagent le réseau Docker `ci` ; Jenkins utilise le moteur Docker de l'hôte via le socket monté. Détail de la reproduction : [`integration-continue/README.md`](../integration-continue/README.md).

## 3. Travaux réalisés

### 3.1 Préparation du dépôt
- Fork du dépôt officiel et récupération de la branche `Dev` (absente du fork, copiée depuis le dépôt amont).
- Installation : `npm ci`, `npx prisma generate`, `npm run build`.

### 3.2 Tests Backend
- **Choix** : Jest + ts-jest + Supertest. Jest produit nativement le format `lcov` lu par SonarQube ; Supertest teste l'application Express sans démarrer de serveur.
- **Isolation** : le client Prisma est remplacé par un mock (`moduleNameMapper`). Les tests s'exécutent en 2 s **sans PostgreSQL**, ce qui simplifie l'agent CI.
- **70 tests** répartis en 9 fichiers : authentification (login, JWT invalide, expiré ou forgé), contrôle d'accès (401 sans token, 403 pour un rôle insuffisant), candidats, offres, candidatures, utilisateurs (hachage bcrypt), tableau de bord, santé de l'API, gestion des erreurs.
- **Rapports** : `coverage/lcov.info` (couverture) et `coverage/test-report.xml` (exécution, via `jest-sonar`).

### 3.3 Analyse SonarQube
- Configuration dans `backend/sonar-project.properties` (sources, tests, exclusions, rapports).
- Création du Quality Gate **SouverainRecrut**, défini par défaut, avec des conditions sur le *New Code* **et** l'*Overall Code* : le gate par défaut ne contrôlait que le nouveau code et passait même avec une couverture globale faible.
- Traitement du Security Hotspot **S5689** (`X-Powered-By`) : correction dans `app.ts` et test de non-régression.

La couverture est passée de **52,5 %** à **94,4 %**. Le nombre de lignes à couvrir reste stable (504 → 503) : la hausse vient uniquement des tests ajoutés, sans modification du code applicatif.

![Couverture avant les tests](../integration-continue/captures/01-sonar-activity-couverture-avant-52.5.png)
*Figure 1 – SonarQube, onglet Activity : couverture avant l'écriture des tests (289 lignes couvertes sur 504, soit 52,5 %).*

![Couverture après les tests](../integration-continue/captures/03-sonar-activity-couverture-apres-94.4.png)
*Figure 2 – SonarQube, onglet Activity : couverture après l'écriture des tests (493 lignes couvertes sur 503, soit 94,4 %).*

![Vue d'ensemble après les tests](../integration-continue/captures/04-sonar-overview-apres-tests.png)
*Figure 3 – Vue Overall Code après les tests : Quality Gate Passed, 0 bug, 0 vulnérabilité, 0 % de duplication.*

![Rapport d'exécution des tests](../integration-continue/captures/05-sonar-overview-69-tests-version-1.0.0.png)
*Figure 4 – Rapport d'exécution des tests importé dans SonarQube (69 tests à ce stade) et version 1.0.0 de l'analyse.*

![Quality Gate SouverainRecrut](../integration-continue/captures/06-sonar-quality-gate-souverainrecrut.png)
*Figure 5 – Quality Gate SouverainRecrut : couverture ≥ 80 %, duplications ≤ 3 %, notes A, 100 % des Security Hotspots revus.*

### 3.4 Mise en place de Jenkins
- Image Jenkins personnalisée ([`integration-continue/jenkins/Dockerfile`](../integration-continue/jenkins/Dockerfile)) : Node 22, client Docker + buildx, Trivy, plugins préinstallés (Git, Pipeline, SonarQube, Credentials Binding).
- `docker-compose.yml` : volume persistant `jenkins_home`, socket Docker de l'hôte, réseau `ci`.
- Credentials `dockerhub` et `sonar-token` ; serveur SonarQube et outil `sonar-scanner` déclarés ; webhook SonarQube → Jenkins.

![Installation des plugins Jenkins](../integration-continue/captures/08-jenkins-installation-plugins.png)
*Figure 6 – Installation des plugins Jenkins (Pipeline, Git, Credentials Binding, Timestamper…).*

![Credentials Jenkins](../integration-continue/captures/09-jenkins-credentials.png)
*Figure 7 – Credentials Jenkins : `dockerhub` et `sonar-token`, secrets masqués. Aucun secret n'est présent dans le dépôt.*

![Serveur SonarQube dans Jenkins](../integration-continue/captures/10-jenkins-config-serveur-sonarqube.png)
*Figure 8 – Déclaration du serveur SonarQube dans Jenkins (`http://sonarqube:9000`, authentification par `sonar-token`).*

![Outil sonar-scanner](../integration-continue/captures/11-jenkins-outil-sonar-scanner.png)
*Figure 9 – Outil `sonar-scanner` installé automatiquement par Jenkins (SonarQube Scanner 8.4.0.16527).*

![Webhook SonarQube vers Jenkins](../integration-continue/captures/12-sonar-webhook-jenkins.png)
*Figure 10 – Webhook SonarQube → Jenkins : transmet le verdict du Quality Gate au stage `waitForQualityGate`.*

### 3.5 Automatisation de la chaîne CI
[`integration-continue/Jenkinsfile`](../integration-continue/Jenkinsfile) : checkout `Dev` → `npm ci` → `prisma generate` → tests + couverture → analyse SonarQube → Quality Gate → build Docker → scan Trivy → publication Docker Hub.
- Déclenchement automatique par `pollSCM` (toutes les 2 min) : un webhook GitHub ne peut pas atteindre un Jenkins local.
- La publication n'a lieu que si **tous** les contrôles réussissent.

![Pipeline Jenkins build #3](../integration-continue/captures/13-jenkins-pipeline-build-3-succes.png)
*Figure 11 – Build #3 : tous les stages au vert, Quality Gate SonarQube Passed reçu par webhook, puis publication sur Docker Hub.*

### 3.6 Image Docker et publication

| | Dockerfile fourni | Dockerfile retenu |
|---|---|---|
| Base | `node:20-alpine` (le projet exige Node ≥ 22) | `node:22-alpine` |
| Étapes | 2 | 3 : build, dépendances de production, exécution |
| Utilisateur | `root` | `node` (non-root) |
| Contexte de build | tout le dossier, sans `.dockerignore` | `.dockerignore` : `.env`, `.git`, `node_modules`, tests exclus |
| Santé | aucune | `HEALTHCHECK` sur `/v1/health` |
| Port | `EXPOSE 4000`, application sur 4500 par défaut | `PORT=4000` aligné |
| Outils inutiles | npm, yarn, corepack présents | retirés de l'image finale |

**Seuils Trivy** : HIGH et CRITICAL bloquants (`--exit-code 1`). Une exception justifiée et datée (`deepmerge-ts`, CLI Prisma, correctif réservé à Prisma 7) est documentée dans `backend/.trivyignore`. Les autres failles ont été corrigées par la mise à jour de l'image de base, `npm audit fix` et un `override` de `effect`.

**Tags** : `<version>-<n° build>` (ex. `1.0.0-3`) et `sha-<commit>` (ex. `sha-8d97f20`), uniques à chaque build ; labels OCI `revision` et `version` dans l'image. `latest` n'est pas utilisé.

![Tags Docker Hub](../integration-continue/captures/07-dockerhub-push-manuel-1.0.0-sha-ef9f10e.png)
*Figure 12 – Docker Hub : les tags `1.0.0` et `sha-ef9f10e` pointent vers le même digest (`f6682ad13f0d`), donc vers la même image, identifiée à la fois par sa version et par son commit.*

## 4. Résultats

| Indicateur | Avant | Après |
|---|---|---|
| Tests automatisés | 1 (placeholder) | **70** |
| Couverture (SonarQube) | 52,5 % | **94,4 %** |
| Quality Gate | – | **Passed** |
| Vulnérabilités Trivy HIGH + CRITICAL | 46 (dont 2 CRITICAL) | **0 bloquante** |
| Image | Node 20, root, 870 Mo | Node 22, non-root, 143 Mo compressés |
| Publication | manuelle | automatique, conditionnée aux contrôles |

Build Jenkins de référence **#3** : tous les stages verts, images `1.0.0-3` et `sha-8d97f20` publiées. Build **#4** déclenché automatiquement (*SCM change*) après un commit, sans intervention manuelle.

Preuves : [`integration-continue/reports/`](../integration-continue/reports/) et [`integration-continue/captures/`](../integration-continue/captures/).

## 5. Exigences de qualité et de sécurité (section 7 du cahier des charges)

| Exigence | Mise en œuvre |
|---|---|
| Reproductibilité | `npm ci` (lockfile), versions d'outils figées, image Jenkins et pipeline versionnés, procédure dans le README |
| Qualité logicielle | 70 tests à chaque build ; couverture et résultats SonarQube consultables, Quality Gate bloquant |
| Sécurité | Secrets dans les credentials Jenkins, masqués dans les logs ; image non-root analysée par Trivy |
| Traçabilité | Tag `sha-<commit>` et labels OCI reliant l'image au commit |
| Documentation | README du pipeline, rapport, description du Quality Gate, guide de dépannage |


## 6. Limites et pistes d'amélioration

- **Architecture de l'image** : construite sur Apple Silicon, elle est publiée en `linux/arm64` uniquement. Si le serveur de déploiement est en `amd64`, ajouter un build multi-architecture (`docker buildx --platform linux/amd64,linux/arm64`).
- **Exception Trivy** : à lever lors de la migration vers Prisma 7.
- **SonarQube** : base H2 embarquée et version 9.9 (avertissement Node.js) ; en production, base PostgreSQL et version récente.
- **Déclenchement** : `pollSCM` interroge GitHub toutes les 2 minutes ; un webhook (Jenkins exposé publiquement) serait plus réactif.
- **Couverture des branches** : 68 % ; des tests sur la configuration par défaut (`env.ts`) l'amélioreraient.

---

## Partie 2 – Provisionnement et déploiement

*À compléter (Jour 2) : VMware / Ubuntu Server, Terraform, Ansible, GitLab CI/CD, Docker Compose + PostgreSQL, vérification et rollback.*
