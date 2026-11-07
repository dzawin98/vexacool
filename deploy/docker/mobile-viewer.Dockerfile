FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY ["apps/MOBILITY VIEWER/package.json", "apps/MOBILITY VIEWER/package-lock.json", "./MOBILITY VIEWER/"]
WORKDIR "/app/MOBILITY VIEWER"
RUN npm ci --no-audit --no-fund
COPY ["apps/MOBILITY VIEWER", "/app/MOBILITY VIEWER"]
# MOBILITY VIEWER: `vite build` mencetak "built in Xs" lalu TIDAK keluar (hang yang
# sama terjadi di installer Windows). Build di container tidak bisa "kill child",
# jadi beri batas waktu dan buktikan artefaknya ada — bukan percaya exit code.
RUN npx tsc -b
RUN timeout --signal=KILL 600 npx vite build || true; \
    test -f dist/index.html || (echo "Mobility Viewer: dist/index.html tidak terbentuk" && exit 1)

FROM node:20-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY ["apps/MOBILITY VIEWER/package.json", "apps/MOBILITY VIEWER/package-lock.json", "./MOBILITY VIEWER/"]
WORKDIR "/app/MOBILITY VIEWER"
RUN npm ci --omit=dev --no-audit --no-fund
WORKDIR /app
COPY ["apps/MOBILITY VIEWER", "/app/MOBILITY VIEWER"]
COPY ["scripts", "/app/scripts"]
COPY --from=build ["/app/MOBILITY VIEWER/dist", "/app/MOBILITY VIEWER/dist"]

ENV NODE_ENV=production \
    PORT=5992 \
    VIEWER_DIST_DIR="/app/MOBILITY VIEWER/dist"

WORKDIR "/app/MOBILITY VIEWER"
EXPOSE 5992
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/index.mjs"]
