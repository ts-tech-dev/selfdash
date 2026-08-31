# --- build stage -----------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# --- runtime stage -----------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# su-exec: drop from root to PUID:PGID in the entrypoint after fixing data-dir perms.
RUN apk add --no-cache su-exec

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

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
