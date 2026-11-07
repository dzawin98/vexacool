FROM node:20-bookworm-slim

# ECG viewer membaca file DICOM dari storage dan memakai scripts/license
# (require('../scripts/license/licenseRuntime') -> /app/scripts/...).
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR "/app/ECG VIEWER"
COPY ["apps/ECG VIEWER/package.json", "apps/ECG VIEWER/package-lock.json", "./"]
RUN npm ci --omit=dev --no-audit --no-fund

WORKDIR /app
COPY ["apps/ECG VIEWER", "/app/ECG VIEWER"]
COPY ["scripts", "/app/scripts"]

WORKDIR "/app/ECG VIEWER"
ENV NODE_ENV=production ECG_VIEWER_PORT=7771
EXPOSE 7771
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
