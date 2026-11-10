# Architecture – chaîne CI/CD SouverainRecrut

Périmètre : **API Backend** (Node.js 22, Express, TypeScript, Prisma) et sa base **PostgreSQL**. Le Frontend est hors périmètre.

## 1. Vue d'ensemble

```
                        CHAÎNE D'INTÉGRATION (partie 1)
 ┌──────────┐  pollSCM  ┌─────────────────────────────── Jenkins ───────────────────────────────┐
 │  GitHub  │──────────▶│ npm ci → prisma generate → tests (Jest) → SonarQube → Quality Gate    │
 │ branche  │           │        → docker build → Trivy (HIGH/CRITICAL) → docker push            │
 │   Dev    │           └───────────────────────────────────┬────────────────────────────────────┘
 └──────────┘                       webhook ▲               │ uniquement si tout est vert
                              ┌─────────────┴──┐            ▼
                              │   SonarQube    │   ┌──────────────────────────────────────┐
                              └────────────────┘   │ Docker Hub                           │
                                                   │ souverainrecrut-backend:sha-<commit> │
                                                   └──────────────────┬───────────────────┘
                        CHAÎNE DE DÉPLOIEMENT (partie 2)              │ docker pull (lecture seule)
 ┌──────────┐ ┌────────────────── GitLab CI/CD ───────────────────┐   │
 │ GitLab   │─▶ validate-image → deploy-staging → smoke-staging   │   │
 │ (privé)  │ │   → [approbation] → deploy-prod → smoke-prod      │   │
 └──────────┘ └──────────────────────┬────────────────────────────┘   │
                                     │ runner (Mac) ── SSH ──┐        │
                                     ▼                       ▼        ▼
                     ┌──────────── VM Ubuntu 24.04 ARM64 (UTM) ────────────┐
   Terraform ──────▶ │  /opt/souverainrecrut/staging  backend:4001 + PG    │
   Ansible   ──────▶ │  /opt/souverainrecrut/prod     backend:4000 + PG    │
                     └─────────────────────────────────────────────────────┘
```

## 2. Composants

| Composant | Rôle | Hébergement | Version |
|---|---|---|---|
| GitHub | Dépôt de référence (fork), livrable | github.com | – |
| Jenkins | Pipeline d'intégration (`integration-continue/Jenkinsfile`) | Conteneur Docker, image personnalisée (Node 22, Docker CLI, Trivy) | 2.580.2 |
| SonarQube | Analyse statique, couverture, Quality Gate `SouverainRecrut` | Conteneur Docker | 9.9 LTS Community |
| Trivy | Scan de vulnérabilités de l'image | Binaire dans l'image Jenkins | 0.58.1 |
| Docker Hub | Registre des images versionnées | hub.docker.com | – |
| GitLab | Pipeline de déploiement (`deploiement/.gitlab-ci.yml`) | gitlab.com, projet privé | – |
| GitLab Runner | Exécute les jobs de déploiement | Mac (exécuteur *shell*) | 19.5.3 |
| Terraform | Vérification SSH, inventaire Ansible | Mac | 1.17.1 |
| Ansible | Configuration du serveur | Mac | core 2.21 |
| Serveur | Ubuntu 24.04.5 LTS `aarch64`, Docker 29.9, Compose 5.7 | VM UTM | – |
| PostgreSQL | Base de données | Conteneur `postgres:16-alpine` | 16 |

## 3. Flux d'une modification

| # | Étape | Outil | Contrôle bloquant |
|---|---|---|---|
| 1 | Commit poussé sur `Dev` | GitHub | – |
| 2 | Installation, génération Prisma, 70 tests | Jenkins | un test échoue |
| 3 | Analyse statique et couverture | SonarQube | Quality Gate rouge |
| 4 | Construction de l'image | Docker | erreur de build |
| 5 | Scan de vulnérabilités | Trivy | faille HIGH/CRITICAL non justifiée |
| 6 | Publication `sha-<commit>` et `<version>-<build>` | Docker Hub | – |
| 7 | Validation du tag | GitLab | tag absent ou invalide (`latest` refusé) |
| 8 | Déploiement staging et tests de fumée | GitLab → VM | API ou base indisponible → rollback |
| 9 | Approbation de la mise en production | GitLab (manuel) | – |
| 10 | Déploiement production et tests de fumée | GitLab → VM | échec → rollback automatique |

## 4. Réseau et ports

| Élément | Adresse / port | Exposition |
|---|---|---|
| VM | `192.168.64.2` (réseau NAT UTM) | joignable depuis le Mac uniquement |
| SSH | 22 | clé ED25519 uniquement |
| API staging | 4001 → 4000 (conteneur) | réseau local |
| API production | 4000 → 4000 (conteneur) | réseau local |
| PostgreSQL | 5432 | **non publié** : réseau Docker interne à chaque environnement |
| Jenkins / SonarQube | 8080 / 9000 | Mac, réseau Docker `ci` |

## 5. Données et configuration

| Élément | Emplacement |
|---|---|
| Code de l'API | image Docker Hub (immuable) |
| Schéma de la base | migrations Prisma embarquées dans l'image, appliquées par le service `migrate` |
| Données | volume Docker `souverainrecrut-<env>_pgdata` sur la VM |
| Configuration et secrets | variables GitLab (portées `staging` / `production`) → `.env` (`0600`) sur la VM |
| Historique des déploiements | `/opt/souverainrecrut/deploy-history.log` |
| Version précédente (rollback) | `/opt/souverainrecrut/<env>/.previous_tag` |

## 6. Choix techniques

| Choix | Justification |
|---|---|
| Jenkins pour l'intégration, GitLab pour le déploiement | Architecture imposée par le cahier des charges ; séparation entre fabrication de l'artefact et livraison |
| Image identique en staging et en production | L'artefact testé est celui qui est livré ; seule la configuration change |
| Tags `sha-<commit>` (pas de `latest`) | Traçabilité commit → image → déploiement ; rollback vers une version identifiée |
| Prisma mocké dans les tests | Tests rapides et sans base de données dans la CI |
| Service `migrate` avant l'API | Migrations appliquées une seule fois, sur une base saine ; l'API ne démarre pas si elles échouent |
| UTM au lieu de VMware | ESXi/Workstation x86 incompatibles avec Apple Silicon ; Fusion plante sur macOS 27 |
| Runner sur le Mac | VM en réseau privé, inaccessible aux runners partagés de gitlab.com |
| Staging et production sur la même VM | Ressources limitées (8 Go) ; isolation par projet Compose (réseau, volume, port, secrets) |
