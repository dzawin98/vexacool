# Desktop diagnostic viewer — SSR server (port 5994) + SPA hasil build.
# PENTING: yang dipakai produksi adalah "DESKTOP VIEWER SSR" (punya ssrRenderWs +
# thinVolumeStore untuk MPR). "DESKTOP VIEWER/server" hanya shell lama di 5991.
#
# Layout /app harus meniru repo root: server SSR memuat
#   await import('../../tools/runtime/cacheStore.mjs')  -> /app/tools/runtime/...
# jadi tools/ dan scripts/ wajib ikut di root image.

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY "apps/DESKTOP VIEWER/package.json" "apps/DESKTOP VIEWER/package-lock.json" "./DESKTOP VIEWER/"
WORKDIR "/app/DESKTOP VIEWER"
RUN npm ci --no-audit --no-fund
COPY "apps/DESKTOP VIEWER" "/app/DESKTOP VIEWER"
RUN npm run build

FROM node:20-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     python3 python3-pip ffmpeg ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

# Python untuk decode JPEG2000 / HTJ2K & DICOM print (server-side)
COPY "apps/DESKTOP VIEWER SSR/server/requirements.txt" /tmp/req.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /tmp/req.txt \
 && pip3 install --no-cache-dir --break-system-packages pylibjpeg-openjpeg imagecodecs \
 && rm -f /tmp/req.txt

WORKDIR /app

# Dependensi runtime SSR
COPY "apps/DESKTOP VIEWER SSR/package.json" "apps/DESKTOP VIEWER SSR/package-lock.json" "./DESKTOP VIEWER SSR/"
WORKDIR "/app/DESKTOP VIEWER SSR"
RUN npm ci --omit=dev --no-audit --no-fund

WORKDIR /app
COPY "apps/DESKTOP VIEWER SSR" "/app/DESKTOP VIEWER SSR"
COPY scripts /app/scripts
COPY tools /app/tools
COPY --from=build "/app/DESKTOP VIEWER/dist" "/app/DESKTOP VIEWER/dist"

ENV NODE_ENV=production \
    PORT=5994 \
    VIEWER_DIST_DIR="/app/DESKTOP VIEWER/dist" \
    DICOMWEB_JPEG2000_DECODER_PYTHON=/usr/bin/python3 \
    DICOMWEB_HTJ2K_DECODER_PYTHON=/usr/bin/python3 \
    DICOM_PRINT_PYTHON=/usr/bin/python3 \
    FFMPEG_PATH=/usr/bin/ffmpeg

WORKDIR "/app/DESKTOP VIEWER SSR"
EXPOSE 5994
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/index.mjs"]
