# RIS backend (3001). Image ini juga dipakai untuk menjalankan backup
# (Coolify Scheduled Task) sehingga membawa postgresql-client + jq + gzip/tar.
#
# Script backup Linux memanggil pg_dump; tanpa client itu task backup gagal
# dengan "pg_dump: not found" dan tidak ada dump yang dibuat.

FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     postgresql-client jq gzip tar ca-certificates tini curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/RIS/backend
COPY apps/RIS/backend/package.json apps/RIS/backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

WORKDIR /app
COPY apps/RIS/backend ./RIS/backend
COPY scripts ./scripts

WORKDIR /app/RIS/backend
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "index.js"]
