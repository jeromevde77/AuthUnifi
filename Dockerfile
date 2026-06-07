# --- Étape build : installe les dépendances (compilation de better-sqlite3) ---
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Outils nécessaires si un binaire pré-compilé n'est pas disponible.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Étape runtime : image légère sans les outils de build ---
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY views ./views
COPY public ./public

# Les emails sont stockés ici ; à monter en volume pour les conserver.
RUN mkdir -p /app/data && chown -R node:node /app
ENV DB_PATH=/app/data/portal.db

USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
