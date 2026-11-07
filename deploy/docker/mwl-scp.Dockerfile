# MWL SCP (DICOM Modality Worklist, port 5656) — service python terpisah.
FROM python:3.12-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends tini ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/mwl_scp
COPY apps/RIS/backend/mwl_scp/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/RIS/backend/mwl_scp ./

ENV PYTHONUNBUFFERED=1
EXPOSE 5656
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python", "-u", "nexia_mwl_scp.py"]
