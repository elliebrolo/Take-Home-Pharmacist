# syntax=docker/dockerfile:1
# Take-Home-Pharmacist: one container serves the API and the built web app (Cloud Run listens on $PORT).
# Reproducible: dependencies come from package-lock.json (npm ci); Node 24 for the built-in node:sqlite.

# ---- build the web app ----
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Optional: bake a different API address into the web build (the web app normally uses its own origin).
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ---- runtime ----
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Litestream copies the SQLite database to a Cloud Storage bucket, so records survive restarts and new revisions.
COPY --from=litestream/litestream:0.3.13 /usr/local/bin/litestream /usr/local/bin/litestream

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# The server runs TypeScript through tsx and imports shared types and demo data from src/.
COPY tsconfig.json server.ts ./
COPY server ./server
COPY src ./src
COPY --from=build /app/dist ./dist
COPY deploy/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh && mkdir -p /data /mnt/uploads && chown -R node:node /app /data /mnt/uploads
USER node

ENV DATA_DIR=/data \
    UPLOAD_DIR=/mnt/uploads \
    PORT=8080
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
