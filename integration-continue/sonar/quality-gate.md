# SonarQube – configuration et Quality Gate

## Paramètres d'analyse

Fichier : [`sonar-project.properties`](sonar-project.properties) (copie de `backend/sonar-project.properties`, utilisé par le pipeline).

| Paramètre | Valeur | Raison |
|---|---|---|
| `sonar.sources` | `src` | Code applicatif analysé |
| `sonar.tests` / `sonar.test.inclusions` | `tests`, `tests/**/*.test.ts` | Fichiers reconnus comme tests (non comptés dans les sources) |
| `sonar.exclusions` | `src/docs/**`, `src/swagger/**`, `**/*.md` | Documentation Swagger : pas de logique métier |
| `sonar.coverage.exclusions` | `src/server.ts`, docs, swagger | `server.ts` ne fait que démarrer le serveur |
| `sonar.javascript.lcov.reportPaths` | `coverage/lcov.info` | Couverture produite par Jest |
| `sonar.testExecutionReportPaths` | `coverage/test-report.xml` | Nombre et résultat des tests (généré par `jest-sonar`) |
| `sonar.projectVersion` | `1.0.0` (surchargé par Jenkins avec la version du `package.json`) | Rattache chaque analyse à une version |

Aucun token n'est présent dans ce fichier : il est fourni par Jenkins (`withSonarQubeEnv`).

## Quality Gate `SouverainRecrut`

Le Quality Gate par défaut *Sonar way* ne contrôle que le **New Code**. Lors d'une première analyse ou d'un commit qui ne touche que les tests, il passe donc même si la couverture globale est faible. Un Quality Gate dédié a été créé et défini **par défaut**.

Seuils repris du cours (couverture ≥ 80 %, aucune vulnérabilité bloquante, duplications < 3 %).

| Portée | Métrique | Condition d'échec |
|---|---|---|
| New Code | Coverage | < 80 % |
| New Code | Duplicated Lines (%) | > 3 % |
| New Code | Maintainability / Reliability / Security Rating | pire que A |
| New Code | Security Hotspots Reviewed | < 100 % |
| Overall Code | Coverage | < 80 % |
| Overall Code | Duplicated Lines (%) | > 3 % |
| Overall Code | Reliability Rating | pire que A |
| Overall Code | Security Rating | pire que A |

Dans le pipeline, `waitForQualityGate abortPipeline: true` arrête le build si le Quality Gate est rouge : l'image n'est ni construite ni publiée.

## Résultats

| Métrique (Overall Code) | Avant tests (11h27) | Après tests |
|---|---|---|
| Lignes à couvrir / couvertes | 504 / 289 | 503 / 493 |
| Couverture | 52,5 % | **94,4 %** |
| Tests unitaires | – | **69**, puis 70 |
| Bugs / Vulnérabilités | 0 / 0 | 0 / 0 |
| Code smells | non relevé | 6 (dette 1 h 30, note A) |
| Duplications | non relevé | 0 % |
| Security Hotspots | 1 non revu (note E) | corrigé dans le code (S5689) |
| Quality Gate | – | **Passed** |

Le nombre de lignes à couvrir reste stable : la hausse de couverture vient uniquement des tests ajoutés, sans modification du code applicatif.

### Security Hotspot traité

- **Règle S5689** – *This framework implicitly discloses version information by default* (`src/app.ts`).
- Express envoie l'en-tête `X-Powered-By: Express`, qui renseigne un attaquant sur la technologie utilisée.
- Correction : `app.disable("x-powered-by")` + test `ne divulgue pas le framework via l'en-tête X-Powered-By` (commit `f8cf823`).

### Couverture des conditions

SonarQube combine couverture des lignes et des conditions : Jest affiche 100 % de lignes mais 68 % de branches, d'où 94,4 %. Les branches restantes sont principalement des valeurs par défaut (`process.env.PORT || 4500`) dans `src/config/env.ts`.

## Limites connues

- **Base H2 embarquée** : SonarQube tourne sans base externe, ce qui suffit en formation. En production, une base PostgreSQL dédiée serait nécessaire (montée de version, persistance).
- **Édition Community** : pas d'analyse par branche ; toutes les analyses apparaissent sur la branche `main` de SonarQube, bien que le code analysé soit celui de `Dev`.
- **Avertissement Node.js** : SonarQube 9.9 recommande Node 16/18 pour l'analyse JavaScript ; l'analyse fonctionne avec Node 22. Piste : passer à une version récente de SonarQube.
