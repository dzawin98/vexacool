#!/usr/bin/env bash
# Diagnosa cepat VEXAPACS-RIS di server Linux/CachyOS — READ-ONLY.
# Jalankan di server:  bash /opt/vexapacs/scripts/linux/cek-di-server.sh
# Tujuan: mengumpulkan bukti (status unit, kode HTTP, isi API, log) supaya masalah
# "halaman error / kolom worklist hilang" bisa dipastikan di sisi mana (server atau browser).
set +e
line() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

line "1. Status unit systemd"
systemctl list-units 'vexa-*' --all --no-pager 2>/dev/null | head -20
for u in vexa-ris-backend vexa-ris-frontend vexa-pacs vexa-mwl vexa-viewer vexa-viewer-mobile vexa-ecg vexa-admin vexa-lic-manager; do
  printf '   %-22s %s\n' "$u" "$(systemctl is-active "$u" 2>/dev/null)"
done

line "2. Kode HTTP halaman & API (di server)"
check() { printf '   %-16s %s\n' "$2" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$1")"; }
check "http://127.0.0.1:3001/api/public/facility" "RIS API 3001"
check "http://127.0.0.1:8080/" "RIS UI 8080"
check "http://127.0.0.1:5001/rs/studies?limit=1" "PACS 5001"
check "http://127.0.0.1:5994/" "Viewer 5994"
check "http://127.0.0.1:5992/" "Mobile 5992"
check "http://127.0.0.1:7771/" "ECG 7771"
check "http://127.0.0.1:8899/" "Admin API 8899"
check "http://127.0.0.1:3001/api/mwl/orders?limit=1" "Worklist API"

line "3. Isi 1 baris worklist — apakah kolom pasien/modality ikut terisi?"
echo "   (kalau di sini hanya study_date yang ada isinya, masalahnya DATA, bukan tampilan)"
curl -s --max-time 15 -H 'x-user-role: administrator' -H 'x-user-username: diagnosa' \
  'http://127.0.0.1:3001/api/mwl/orders?limit=1' | head -c 1200; echo

line "4. Worklist PACS (QIDO) — jumlah study terbaca"
curl -s --max-time 15 'http://127.0.0.1:5001/rs/studies?limit=3' | head -c 400; echo

line "5. Log unit yang gagal (10 baris terakhir masing-masing)"
for u in $(systemctl list-units 'vexa-*' --no-pager --plain 2>/dev/null | awk '/failed/{print $1}'); do
  echo "   --- $u"
  journalctl -u "$u" -n 10 --no-pager 2>/dev/null | sed 's/^/       /'
done

line "6. Kunci SHARED_SECRET (kosong = semua halaman viewer ditolak)"
grep -n 'SHARED_SECRET' /etc/vexapacs/vexa.env 2>/dev/null | sed 's/^/   /'

line "7. Modul runtime viewer (harus ada 2 berkas)"
ls -la /opt/vexapacs/tools/runtime 2>&1 | sed 's/^/   /'

line "8. Versi berkas yang dipasang vs sumber"
printf '   install.sh di %s\n' "$(ls -la /opt/vexapacs/installer/install.sh 2>/dev/null | awk '{print $6,$7,$8,$9}')"
printf '   jumlah baris AGENT-INSTALL-BRIEF.md: %s\n' "$(wc -l < /opt/vexapacs/docs/AGENT-INSTALL-BRIEF.md 2>/dev/null)"

printf '\nSelesai. Kirim seluruh keluaran ini untuk dianalisis.\n'
