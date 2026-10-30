# v0.8.6

# Runtime base: everything the API needs at run time, without the compiler toolchain.
FROM node:24.22.1-alpine AS runtime

RUN apk upgrade --no-cache
RUN apk add --no-cache jemalloc
RUN apk add --no-cache python3 py3-pip py3-setuptools uv
# The npm bundled with the base image ships vulnerable brace-expansion, undici and
# http-cache-semantics; stay on npm 11 so lockfile and allowScripts handling match.
RUN npm install -g npm@11.21.1 --no-audit --no-fund && rm -rf /root/.npm

# Set environment variable to use jemalloc
ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2

# Add `uv` for extended MCP support
COPY --from=ghcr.io/astral-sh/uv:0.9.5-python3.12-alpine /usr/local/bin/uv /usr/local/bin/uvx /bin/
RUN uv --version

RUN mkdir -p /app && chown node:node /app

# Build stage: native addons (better-sqlite3) need make/g++.
FROM runtime AS node
RUN apk add --no-cache make g++

# Set configurable max-old-space-size with default
ARG NODE_MAX_OLD_SPACE_SIZE=6144
ARG NPM_CI_TIMEOUT_SECONDS=1500
ARG NPM_CI_ATTEMPTS=2

WORKDIR /app

USER node

COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node api/package.json ./api/package.json
COPY --chown=node:node client/package.json ./client/package.json
COPY --chown=node:node packages/data-provider/package.json ./packages/data-provider/package.json
COPY --chown=node:node packages/data-schemas/package.json ./packages/data-schemas/package.json
COPY --chown=node:node packages/api/package.json ./packages/api/package.json
COPY --chown=node:node packages/client/package.json ./packages/client/package.json
COPY --chown=node:node packages/roko-server/package.json ./packages/roko-server/package.json

RUN \
    # Allow mounting of these files, which have no default
    touch .env ; \
    # Create directories for the volumes to inherit the correct permissions
    mkdir -p /app/client/public/images /app/logs /app/uploads /app/skill ; \
    npm config set fetch-retry-maxtimeout 600000 ; \
    npm config set fetch-retries 5 ; \
    npm config set fetch-retry-mintimeout 15000 ; \
    attempt=1 ; \
    until timeout "$NPM_CI_TIMEOUT_SECONDS" npm ci --no-audit --no-fund ; do \
        status=$? ; \
        if [ "$attempt" -ge "$NPM_CI_ATTEMPTS" ]; then \
            exit "$status" ; \
        fi ; \
        echo "npm ci --no-audit failed with exit code $status; retrying attempt $((attempt + 1))/$NPM_CI_ATTEMPTS" ; \
        attempt=$((attempt + 1)) ; \
        rm -rf "$(npm config get cache)" ; \
        sleep 10 ; \
    done

COPY --chown=node:node . .

RUN node scripts/patch-observability.cjs

RUN NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}" npm run frontend

# Every production image depends on a successful test stage.
FROM node AS ci
RUN sh ci/test.sh

FROM ci AS pruned
# Audit runs on the host; `npm cache clean --force` would print a warning on every build.
RUN npm prune --omit=dev --no-audit --no-fund && rm -rf "$(npm config get cache)"

# Ship only /app on the runtime base, so the toolchain and build layers stay behind.
FROM runtime AS production
WORKDIR /app
USER node
COPY --from=pruned --chown=node:node /app /app

# Optional build metadata surfaced in Settings -> About for support triage.
# Declared here (after the heavy install/build steps) so that commit/date
# changing on every CI run does not bust the cache for dependency install
# and frontend build layers. When unset, the backend falls back to local
# git resolution (if .git is present), and finally to empty values.
ARG BUILD_COMMIT=
ARG BUILD_BRANCH=
ARG BUILD_DATE=
ENV BUILD_COMMIT=${BUILD_COMMIT}
ENV BUILD_BRANCH=${BUILD_BRANCH}
ENV BUILD_DATE=${BUILD_DATE}

# Node API setup
EXPOSE 3080
ENV HOST=0.0.0.0
CMD ["npm", "run", "backend"]

# Optional: for client with nginx routing
# FROM nginx:stable-alpine AS nginx-client
# WORKDIR /usr/share/nginx/html
# COPY --from=node /app/client/dist /usr/share/nginx/html
# COPY client/nginx.conf /etc/nginx/conf.d/default.conf
# ENTRYPOINT ["nginx", "-g", "daemon off;"]
