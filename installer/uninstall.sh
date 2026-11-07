#!/usr/bin/env bash
# Cabut service VEXA dari server Linux. Data TIDAK dihapus kecuali pakai --purge.
set -euo pipefail

APP_DIR="${VEXA_APP_DIR:-/opt/vexapacs}"
DATA_DIR="${VEXA_DATA_DIR:-/var/lib/vexapacs}"
LOG_DIR="${VEXA_LOG_DIR:-/var/log/vexapacs}"
STORAGE_DIR="${VEXA_STORAGE_DIR:-/srv/vexadata}"
PURGE=0
[[ "${1:-}" == "--purge" ]] && PURGE=1

log() { printf '\n== %s\n' "$*"; }

log "Stop + disable unit systemd"
for unit in vexa-ris-backend vexa-ris-frontend vexa-pacs vexa-viewer vexa-viewer-mobile vexa-ecg vexa-mwl vexa-admin vexa-lic-manager; do
  systemctl disable --now "$unit" 2>/dev/null || true
  rm -f "/etc/systemd/system/$unit.service"
done
systemctl daemon-reload

log "Hapus aplikasi di $APP_DIR"
rm -rf "$APP_DIR"

if [[ "$PURGE" == "1" ]]; then
  log "PURGE: hapus $DATA_DIR, $LOG_DIR, $STORAGE_DIR, /etc/vexapacs"
  rm -rf "$DATA_DIR" "$LOG_DIR" "$STORAGE_DIR" /etc/vexapacs
  read -r -p "Hapus juga user vexa? (y/N) " answer
  [[ "$answer" =~ ^[Yy]$ ]] && userdel -r vexa 2>/dev/null || true
else
  log "Data dipertahankan: $DATA_DIR $LOG_DIR $STORAGE_DIR (lisensi aman)"
fi

log "Selesai"
