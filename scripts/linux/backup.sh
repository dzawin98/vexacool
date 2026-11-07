#!/usr/bin/env bash
#
# Backup VEXAPACS di Linux — padanan installer/scripts/backup/backup.ps1.
#
#   sudo bash scripts/linux/backup.sh [--config /var/lib/vexapacs/backup.config.json]
#                                    [--label manual] [--quiesce] [--dry-run]
#
# Isi backup: dump PostgreSQL (risDb + pacsDb), storage DICOM, dan programData
# (lisensi, dose rules, backup.config.json). Rotasi mengikuti retention.keepLast.
set -euo pipefail

CONFIG=/var/lib/vexapacs/backup.config.json
LABEL=""
QUIESCE=0
DRY=0
FORCE_NO_QUIESCE=0
INCLUDE_DICOM_FLAG=""
INCLUDE_PD_FLAG=""
JOB_LOG_ID=""
progress() { # format sama dengan backup.ps1 supaya progress bar di UI RIS tetap jalan
  printf '[PROGRESS] %s %s\n' "$1" "$2"
}
for arg in "$@"; do
  case "$arg" in
    --config=*) CONFIG="${arg#*=}" ;;
    --label=*) LABEL="${arg#*=}" ;;
    --quiesce) QUIESCE=1 ;;
    --no-stop-services) QUIESCE=0; FORCE_NO_QUIESCE=1 ;;
    --skip-dicom) INCLUDE_DICOM_FLAG=0 ;;
    --skip-programdata) INCLUDE_PD_FLAG=0 ;;
    --job-log-id=*) JOB_LOG_ID="${arg#*=}" ;;
    --dry-run) DRY=1 ;;
    --*) echo "Opsi tidak dikenal: $arg" >&2; exit 2 ;;
  esac
done

info() { printf '\n== %s\n' "$*"; }
run() { if [[ "$DRY" == 1 ]]; then printf '   [dry-run] %s\n' "$*"; else "$@"; fi; }
die() { printf '[ERROR] %s\n' "$*" >&2; exit 1; }

command -v jq >/dev/null || die "jq belum terpasang (pacman -S jq)"
[[ -f "$CONFIG" ]] || die "Config tidak ditemukan: $CONFIG (contoh: config/backup.config.linux.sample.json)"

cfg() { jq -r "$1" "$CONFIG"; }
BACKUP_ROOT="$(cfg '.backupRoot')"
DATA_PATH="$(cfg '.dataPath')"
PROGRAM_DATA="$(cfg '.programDataPath')"
KEEP_LAST="$(cfg '.retention.keepLast // 7')"
INCLUDE_DICOM="$(cfg '.includeDicomData // true')"
INCLUDE_PD="$(cfg '.includeProgramData // true')"
PG_HOST="$(cfg '.postgres.host // "localhost"')"
PG_PORT="$(cfg '.postgres.port // 5432')"
PG_USER="$(cfg '.postgres.user // "postgres"')"
PG_PASS="$(cfg '.postgres.password // ""')"
RIS_DB="$(cfg '.postgres.risDb // "vexaris_db"')"
PACS_DB="$(cfg '.postgres.pacsDb // "vexapacs_db"')"
mapfile -t SERVICES < <(jq -r '.services[]?' "$CONFIG")
QUIESCE_CFG="$(cfg '.quiesceServices // false')"
[[ "$QUIESCE_CFG" == "true" ]] && QUIESCE=1
[[ "$FORCE_NO_QUIESCE" == "1" ]] && QUIESCE=0
[[ -n "$INCLUDE_DICOM_FLAG" ]] && INCLUDE_DICOM="false"
[[ -n "$INCLUDE_PD_FLAG" ]] && INCLUDE_PD="false"

STAMP="$(date +%Y-%m-%d_%H%M%S)"
[[ -n "$LABEL" ]] && STAMP="$STAMP-$LABEL"
DEST="$BACKUP_ROOT/$STAMP"

progress 5 "Menyiapkan $DEST"
info "Backup ke $DEST"
run mkdir -p "$DEST"

if [[ "$QUIESCE" == 1 ]]; then
  info "Stop service dulu (--quiesce)"
  for unit in $(printf '%s\n' "${SERVICES[@]}" | tac); do run systemctl stop "$unit" || true; done
  trap 'for unit in "${SERVICES[@]}"; do systemctl start "$unit" 2>/dev/null || true; done' EXIT
fi

progress 20 "Dump PostgreSQL"
export PGPASSWORD="$PG_PASS"
for db in "$RIS_DB" "$PACS_DB"; do
  run pg_dump -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" --format=custom --file "$DEST/$db.dump" "$db"
done
run pg_dumpall -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" --roles-only --file "$DEST/roles.sql" || true
unset PGPASSWORD

if [[ "$INCLUDE_DICOM" == "true" && -d "$DATA_PATH" ]]; then
  progress 55 "Storage DICOM ($DATA_PATH)"
  run tar -C "$DATA_PATH" -czf "$DEST/vexadata.tar.gz" .
fi
if [[ "$INCLUDE_PD" == "true" && -d "$PROGRAM_DATA" ]]; then
  progress 80 "ProgramData ($PROGRAM_DATA)"
  run tar -C "$PROGRAM_DATA" -czf "$DEST/programdata.tar.gz" \
      --exclude='frame-cache' --exclude='*.log' .
fi

progress 92 "Metadata + rotasi"
if [[ "$DRY" == 0 ]]; then
  { echo "timestamp=$STAMP"; echo "host=$(hostname)"; echo "config=$CONFIG"; du -sh "$DEST"/* | sed 's/^/size: /'; } > "$DEST/MANIFEST.txt"
  mapfile -t OLD < <(ls -1dt "$BACKUP_ROOT"/*/ 2>/dev/null | tail -n +"$((KEEP_LAST + 1))")
  for entry in "${OLD[@]:-}"; do
    [[ -n "$entry" ]] || continue
    echo "   hapus backup lama: $entry"
    rm -rf "$entry"
  done
fi

progress 100 "Selesai"
info "Selesai: $DEST"
[[ "$DRY" == 1 ]] && echo "   (dry-run: tidak ada perubahan nyata)"
