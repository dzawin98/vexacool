# PACS — DICOMweb (5001) + DIMSE SCP (5757) + MWL mirror.
# Catatan build:
#  - dicom-dimse-native adalah modul native (node-gyp/cmake-js) -> butuh
#    python3/make/g++/cmake/git.
#  - WAJIB `npm rebuild dicom-dimse-native --build-from-source`: paket ini membawa
#    prebuilt dcmtk.node yang dibangun di toolchain lebih baru (butuh
#    GLIBCXX_3.4.32), sedangkan bookworm hanya punya sampai 3.4.30. Tanpa rebuild,
#    container crash loop: "version `GLIBCXX_3.4.32' not found".
#  - decode JPEG2000/HTJ2K dijalankan sebagai proses python terpisah (j2kWorkerPool),
#    jadi interpreter-nya harus benar-benar punya pylibjpeg-openjpeg (env
#    DICOMWEB_JPEG2000_DECODER_PYTHON). Kalau tidak -> render/thumbnail HTTP 500.

FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     python3 python3-venv python3-pip make g++ cmake git ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

# venv terpisah supaya pip tidak bentrok dengan paket sistem (Debian PEP 668)
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app/PACS
COPY apps/PACS/package.json apps/PACS/package-lock.json ./
# full install (bukan --omit=dev) supaya `npm run warm-cache` / ts-node tetap bisa dipakai
RUN npm ci --no-audit --no-fund \
 && npm rebuild dicom-dimse-native --build-from-source --no-audit --no-fund

COPY apps/PACS/requirements-mwl.txt ./
RUN pip install --no-cache-dir -r requirements-mwl.txt imagecodecs

WORKDIR /app
COPY apps/PACS ./PACS
COPY scripts ./scripts
COPY deploy/docker/pacs-entrypoint.cjs ./PACS/entrypoint.cjs

WORKDIR /app/PACS
RUN npm run build

ENV NODE_ENV=production \
    DICOMWEB_JPEG2000_DECODER_PYTHON=/opt/venv/bin/python \
    DICOMWEB_HTJ2K_DECODER_PYTHON=/opt/venv/bin/python

EXPOSE 5001 5757
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "entrypoint.cjs"]
