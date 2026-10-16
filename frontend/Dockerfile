# The web app for docker compose: the built frontend, with /api forwarded to the backend on the
# same address, the way the VPS serves it. Built from the repository root because the app reads
# docs/backend/openapi.json at build time:  docker compose up --build web
FROM node:22-slim AS build
WORKDIR /repo/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY docs/backend/openapi.json /repo/docs/backend/openapi.json
COPY frontend/ ./
RUN npm run build

FROM caddy:2
COPY frontend/Caddyfile.compose /etc/caddy/Caddyfile
COPY --from=build /repo/frontend/dist /srv
