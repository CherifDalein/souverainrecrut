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

### 3.4 Mise en place de Jenkins
- Image Jenkins personnalisée ([`integration-continue/jenkins/Dockerfile`](../integration-continue/jenkins/Dockerfile)) : Node 22, client Docker + buildx, Trivy, plugins préinstallés (Git, Pipeline, SonarQube, Credentials Binding).
- `docker-compose.yml` : volume persistant `jenkins_home`, socket Docker de l'hôte, réseau `ci`.
- Credentials `dockerhub` et `sonar-token` ; serveur SonarQube et outil `sonar-scanner` déclarés ; webhook SonarQube → Jenkins.

### 3.5 Automatisation de la chaîne CI
[`integration-continue/Jenkinsfile`](../integration-continue/Jenkinsfile) : checkout `Dev` → `npm ci` → `prisma generate` → tests + couverture → analyse SonarQube → Quality Gate → build Docker → scan Trivy → publication Docker Hub.
- Déclenchement automatique par `pollSCM` (toutes les 2 min) : un webhook GitHub ne peut pas atteindre un Jenkins local.
- La publication n'a lieu que si **tous** les contrôles réussissent.

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
