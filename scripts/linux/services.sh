#!/usr/bin/env bash
# Kontrol semua service VEXA (padanan tombol Start/Stop/Restart di VexaServiceMonitor).
#   bash scripts/linux/services.sh status|start|stop|restart [nama-service]
set -uo pipefail

UNITS=(vexa-ris-backend vexa-ris-frontend vexa-pacs vexa-viewer vexa-viewer-mobile vexa-ecg vexa-mwl)
action="${1:-status}"
target="${2:-}"

if [[ -n "$target" ]]; then
  [[ "$target" == vexa-* ]] || target="vexa-$target"
  UNITS=("$target")
fi

case "$action" in
  status)
    printf '%-24s %-10s %-8s %s\n' SERVICE LOAD ACTIVE KETERANGAN
    for unit in "${UNITS[@]}"; do
      if systemctl cat "$unit" >/dev/null 2>&1; then
        printf '%-24s %-10s %-8s %s\n' "$unit" \
          "$(systemctl show -p LoadState --value "$unit")" \
          "$(systemctl is-active "$unit")" \
          "$(systemctl show -p SubState --value "$unit")"
      else
        printf '%-24s %-10s %-8s %s\n' "$unit" "-" "not-installed" ""
      fi
    done
    echo
    echo "Storage: $(df -h "${VEXA_STORAGE_DIR:-/srv/vexadata}" 2>/dev/null | tail -1)"
    ;;
  start|stop|restart)
    # urutan penting: backend dulu naik, viewer/ecg terakhir; saat stop dibalik
    units=("${UNITS[@]}")
    if [[ "$action" == "stop" ]]; then
      units=($(printf '%s\n' "${units[@]}" | tac))
    fi
    for unit in "${units[@]}"; do
      systemctl "$action" "$unit" && echo "$action $unit: ok" || echo "$action $unit: GAGAL"
    done
    ;;
  *)
    echo "Pemakaian: $0 {status|start|stop|restart} [nama-service]" >&2
    exit 2
    ;;
esac
