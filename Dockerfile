# --- build stage: full Node toolchain, only used to produce the frontend bundle ---
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# --- deps stage: production node_modules only, npm not needed after this -------
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund \
  && npm cache clean --force

# --- runtime stage: bare Alpine + just the Node binary + its shared libs -------
# node:22-alpine's own image bundles npm/corepack/yarn/headers this app never
# touches at runtime (only `npm install` above needs them) — dead weight in the
# final image. Alpine version must track the build/deps stages' so the copied
# Node binary's musl ABI lines up; bump together if the FROM tags above change.
FROM alpine:3.24 AS runtime
WORKDIR /app
ENV NODE_ENV=production

# libstdc++: the only shared lib (besides musl, already in the base) Node's
# binary links against. su-exec: drop from root to PUID:PGID in the entrypoint
# after fixing data-dir perms.
RUN apk add --no-cache libstdc++ su-exec

COPY --from=build /usr/local/bin/node /usr/local/bin/node

# package.json is read by Node itself at startup (the "type": "module" field) —
# package-lock.json is npm-only and not needed here.
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY src ./src
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /data

ENV PORT=3000
ENV DATA_DIR=/data
# Override if the host user owning ./data isn't uid/gid 1000.
ENV PUID=1000
ENV PGID=1000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Runs as root, chowns $DATA_DIR to $PUID:$PGID, re-execs the CMD via su-exec.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "--experimental-sqlite", "--disable-warning=ExperimentalWarning", "src/server.js"]
