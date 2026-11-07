# MWL SCP (DICOM Modality Worklist, port 5656) — service python terpisah.
#
# PENTING soal layout: `nexia_mwl_scp.py` menghitung REPO_DIR = parents[3] dari
# lokasi berkasnya, jadi ia HARUS berada di <root>/RIS/backend/mwl_scp/. Kalau
# dicopy ke /app/mwl_scp (kurang dalam satu level), container langsung mati:
#   IndexError: 3   (pathlib parents[3] tidak ada)
# Root di sini = /app, dan scripts/ (license-cli) ikut supaya validasi lisensi
# modul PACS_MWL bisa dijalankan saat VEXA_LICENSE_ENFORCE=true.

FROM python:3.12-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     nodejs ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/RIS/backend/mwl_scp
COPY apps/RIS/backend/mwl_scp/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

WORKDIR /app
COPY apps/RIS/backend/mwl_scp /app/RIS/backend/mwl_scp
COPY scripts /app/scripts

WORKDIR /app/RIS/backend/mwl_scp
ENV PYTHONUNBUFFERED=1
EXPOSE 5656
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python", "-u", "nexia_mwl_scp.py"]
