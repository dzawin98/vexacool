#!/usr/bin/env bash
#
# Restore VEXAPACS di Linux — WAJIB eksplisit, sama seperti versi Windows.
#
#   sudo bash scripts/linux/restore.sh --backup /srv/vexabackup/2026-09-22_230000 --confirm
#   opsi tambahan: --db-only  --storage-only  --programdata-only
set -euo pipefail

BACKUP=""
CONFIRM=0
SCOPE="all"
SKIP_DB=0
SKIP_STORAGE=0
SKIP_PROGRAMDATA=0
STOP_SERVICES=1
START_SERVICES=1
CONFIG_OVERRIDE=""
JOB_LOG_ID=""
progress() { printf '[PROGRESS] %s %s\n' "$1" "$2"; }
for arg in "$@"; do
  case "$arg" in
    --backup=*) BACKUP="${arg#*=}" ;;
    --backup) BACKUP="${2:-}"; shift ;;
    --confirm) CONFIRM=1 ;;
    --db-only) SCOPE="db" ;;
    --storage-only) SCOPE="storage" ;;
    --programdata-only) SCOPE="programdata" ;;
    --config=*) CONFIG_OVERRIDE="${arg#*=}" ;;
    --no-db) SKIP_DB=1 ;;
    --no-storage) SKIP_STORAGE=1 ;;
    --no-programdata) SKIP_PROGRAMDATA=1 ;;
    --no-stop-services) STOP_SERVICES=0 ;;
    --no-start-services) START_SERVICES=0 ;;
    --job-log-id=*) JOB_LOG_ID="${arg#*=}" ;;
    *) echo "Opsi tidak dikenal: $arg" >&2; exit 2 ;;
  esac
done

[[ -n "$BACKUP" && -d "$BACKUP" ]] || { echo "Gunakan --backup <folder backup> (isi: pg dump + tar)." >&2; exit 2; }
[[ "$CONFIRM" == 1 ]] || { echo "Restore menimpa data. Tambahkan --confirm kalau sudah yakin." >&2; exit 3; }

CONFIG="${CONFIG_OVERRIDE:-${VEXA_BACKUP_CONFIG:-/var/lib/vexapacs/backup.config.json}}"
cfg() { jq -r "$1" "$CONFIG"; }
DATA_PATH="$(cfg '.dataPath')"
PROGRAM_DATA="$(cfg '.programDataPath')"
PG_HOST="$(cfg '.postgres.host // "localhost"')"; PG_PORT="$(cfg '.postgres.port // 5432')"
PG_USER="$(cfg '.postgres.user // "postgres"')"; PG_PASS="$(cfg '.postgres.password // ""')"
RIS_DB="$(cfg '.postgres.risDb // "vexaris_db"')"; PACS_DB="$(cfg '.postgres.pacsDb // "vexapacs_db"')"
mapfile -t SERVICES < <(jq -r '.services[]?' "$CONFIG")

info() { printf '\n== %s\n' "$*"; }

if [[ "$STOP_SERVICES" == 1 ]]; then
  progress 5 "Stop service VEXA"
  for unit in $(printf '%s\n' "${SERVICES[@]}" | tac); do systemctl stop "$unit" 2>/dev/null || true; done
fi

if [[ "$SKIP_DB" == 0 && ( "$SCOPE" == "all" || "$SCOPE" == "db" ) ]]; then
  progress 25 "Restore database"
  info "Restore database"
  export PGPASSWORD="$PG_PASS"
  for db in "$RIS_DB" "$PACS_DB"; do
    dump="$BACKUP/$db.dump"
    [[ -f "$dump" ]] || { echo "   lewati $db (dump tidak ada)"; continue; }
    psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE);"
    psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -c "CREATE DATABASE \"$db\" OWNER \"$PG_USER\";"
    pg_restore -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$db" --no-owner "$dump"
    echo "   $db: restored"
  done
  unset PGPASSWORD
fi

if [[ "$SKIP_STORAGE" == 0 && ( "$SCOPE" == "all" || "$SCOPE" == "storage" ) && -f "$BACKUP/vexadata.tar.gz" ]]; then
  progress 65 "Restore storage DICOM"
  info "Restore storage DICOM -> $DATA_PATH"
  mkdir -p "$DATA_PATH"
  tar -C "$DATA_PATH" -xzf "$BACKUP/vexadata.tar.gz"
fi

if [[ "$SKIP_PROGRAMDATA" == 0 && ( "$SCOPE" == "all" || "$SCOPE" == "programdata" ) && -f "$BACKUP/programdata.tar.gz" ]]; then
  progress 85 "Restore programData"
  info "Restore programData -> $PROGRAM_DATA"
  mkdir -p "$PROGRAM_DATA"
  tar -C "$PROGRAM_DATA" -xzf "$BACKUP/programdata.tar.gz"
fi

if [[ "$START_SERVICES" == 1 ]]; then
  progress 95 "Start service kembali"
  for unit in "${SERVICES[@]}"; do systemctl start "$unit" 2>/dev/null || true; done
fi
progress 100 "Selesai"
echo
echo "Selesai. Periksa: bash scripts/linux/services.sh status"
