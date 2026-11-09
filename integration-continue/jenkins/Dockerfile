# Binaire Trivy récupéré depuis l'image officielle (version figée)
FROM aquasec/trivy:0.58.1 AS trivy

# Jenkins + outils nécessaires au pipeline SouverainRecrut
FROM jenkins/jenkins:lts-jdk21

USER root

# Outils de base
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg git \
 && install -m 0755 -d /etc/apt/keyrings

# Client Docker + buildx (le moteur reste celui de la machine hôte)
RUN curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
 && echo "deb [signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
      > /etc/apt/sources.list.d/docker.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends docker-ce-cli docker-buildx-plugin

# Node.js 22 (tests, build TypeScript, analyse Sonar du TypeScript)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs

# Trivy (même version que pour les scans manuels)
# (la release GitHub v0.58.1 n'est plus téléchargeable : on copie le binaire
#  depuis l'image officielle, ce qui garantit exactement la même version)
COPY --from=trivy /usr/local/bin/trivy /usr/local/bin/trivy

RUN rm -rf /var/lib/apt/lists/*

USER jenkins

# Plugins demandés au 3.4 (Git, Pipeline, SonarQube) + confort
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt
