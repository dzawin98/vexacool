#!/usr/bin/env bash
#
# VEXAPACS-RIS — installer untuk CachyOS / Arch Linux.
#
# Jalankan dari root folder ini (VEXA-LINUX):
#   sudo bash installer/install.sh                 # deps + db + build + systemd
#   sudo bash installer/install.sh --skip-deps     # kalau paket sudah dipasang
#   sudo bash installer/install.sh --dry-run       # lihat rencana tanpa eksekusi
#
# Opsi: --skip-deps --skip-build --skip-db --no-systemd --with-caddy --start --dry-run
#       --app-dir=DIR --data-dir=DIR --storage=DIR --python-bin=BIN --db-password=PASS
#       --install-request         buat install-request.json (machineId server ini) lalu keluar
#       --allow-invalid-license   jangan gagal walau lisensi belum ada/tidak valid
#
set -euo pipefail

APP_DIR=/opt/vexapacs
ETC_DIR=/etc/vexapacs
DATA_DIR=/var/lib/vexapacs
LOG_DIR=/var/log/vexapacs
STORAGE_DIR=/srv/vexadata
VEXA_USER=vexa
RIS_DB=vexaris_db
PACS_DB=vexapacs_db
DB_USER=postgres
DB_PASSWORD=""
PYTHON_BIN=""
SKIP_DEPS=0; SKIP_BUILD=0; SKIP_DB=0; WITH_SYSTEMD=1; WITH_CADDY=0; DO_START=0; DRY=0
ALLOW_INVALID_LICENSE=0; MAKE_INSTALL_REQUEST=0

for arg in "$@"; do
  case "$arg" in
    --skip-deps) SKIP_DEPS=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --skip-db) SKIP_DB=1 ;;
    --no-systemd) WITH_SYSTEMD=0 ;;
    --with-caddy) WITH_CADDY=1 ;;
    --start) DO_START=1 ;;
    --dry-run) DRY=1 ;;
    --allow-invalid-license) ALLOW_INVALID_LICENSE=1 ;;
    --install-request) MAKE_INSTALL_REQUEST=1 ;;
    --app-dir=*) APP_DIR="${arg#*=}" ;;
    --data-dir=*) DATA_DIR="${arg#*=}" ;;
    --storage=*) STORAGE_DIR="${arg#*=}" ;;
    --python-bin=*) PYTHON_BIN="${arg#*=}" ;;
    --db-password=*) DB_PASSWORD="${arg#*=}" ;;
    *) echo "Opsi tidak dikenal: $arg" >&2; exit 2 ;;
  esac
done

# Jalankan dari repo (install.sh) ATAU setelah dipasang paket (/usr/bin/vexapacs-setup):
# kalau tidak ada folder apps/ di sebelah skrip, pakai layout paket di /opt/vexapacs.
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ ! -d "$REPO_DIR/apps" ]]; then
  REPO_DIR="${VEXA_APP_DIR:-/opt/vexapacs}"
fi
UNITS="vexa-ris-backend vexa-ris-frontend vexa-pacs vexa-viewer vexa-viewer-mobile vexa-ecg vexa-mwl vexa-admin vexa-lic-manager"

info() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[WARN] %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m[ERROR] %s\033[0m\n' "$*" >&2; exit 1; }
run()  { if [[ "$DRY" == 1 ]]; then printf '   [dry-run] %s\n' "$*"; else "$@"; fi; }

[[ "$(id -u)" == "0" ]] || die "Jalankan sebagai root: sudo bash installer/install.sh"
command -v pacman >/dev/null || die "Skrip ini untuk Arch/CachyOS (pacman). Untuk distro lain, lihat docs/LINUX-INSTALL.md."
[[ -d "$REPO_DIR/apps" ]] || die "Folder apps/ tidak ditemukan di $REPO_DIR — jalankan skrip dari repo VEXA-LINUX."

info "Rencana"
cat <<EOF
  aplikasi   : $APP_DIR        (dari $REPO_DIR)
  config     : $ETC_DIR/vexa.env
  data       : $DATA_DIR       (lisensi, dose rules, frame cache)
  log        : $LOG_DIR
  storage    : $STORAGE_DIR    (DICOM)
  database   : $RIS_DB, $PACS_DB (user $DB_USER)
  user       : $VEXA_USER
  systemd    : $([[ $WITH_SYSTEMD == 1 ]] && echo ya || echo tidak)  |  caddy: $([[ $WITH_CADDY == 1 ]] && echo ya || echo tidak)
EOF

# ---------------------------------------------------------------- 1. dependencies
if [[ "$SKIP_DEPS" == 0 ]]; then
  info "Paket sistem (pacman)"
  PKGS=(nodejs npm postgresql python python-pip base-devel cmake git rsync jq unzip)
  [[ "$WITH_CADDY" == 1 ]] && PKGS+=(caddy)
  run pacman -Sy --needed --noconfirm "${PKGS[@]}"
  # sharp butuh libvips kalau biner siap-pakai tidak tersedia untuk versi node ini
  [[ "$DRY" == 0 ]] && (pacman -Qi libvips >/dev/null 2>&1 || run pacman -S --needed --noconfirm libvips)
else
  info "Deps dilewati (--skip-deps)"
fi

# ---------------------------------------------------------------- 2. user + direktori
info "User dan direktori"
if ! id "$VEXA_USER" >/dev/null 2>&1; then
  run useradd --system --create-home --home-dir "$APP_DIR" --shell /usr/bin/nologin "$VEXA_USER"
fi
run mkdir -p "$APP_DIR" "$ETC_DIR" "$DATA_DIR" "$LOG_DIR" "$STORAGE_DIR"
run chown -R "$VEXA_USER:$VEXA_USER" "$APP_DIR" "$DATA_DIR" "$LOG_DIR" "$STORAGE_DIR"

# ---------------------------------------------------------------- 3. salin aplikasi
info "Salin aplikasi ke $APP_DIR"
# Aplikasi dipasang di ROOT $APP_DIR (mis. /opt/vexapacs/RIS), bukan di bawah subfolder:
# modul mencari scripts/license lewat path relatif ke root repo
# (contoh RIS/backend/index.js -> '../../scripts/license/licenseRuntime'), jadi layout ini
# harus sama dengan installer Windows supaya tidak ada kode yang perlu diubah.
if [[ "$(readlink -f "$REPO_DIR")" == "$(readlink -f "$APP_DIR")" ]]; then
  echo "   sumber = tujuan ($APP_DIR), penyalinan dilewati (mode paket)"
else
run rsync -a --delete \
  --exclude 'node_modules' --exclude 'dist' --exclude '.git' --exclude 'venv' --exclude '.venv' \
  --exclude '*.log' --exclude 'data/' --exclude 'db/license.db*' \
  "$REPO_DIR/apps/" "$REPO_DIR/scripts" "$REPO_DIR/admin" "$REPO_DIR/docs" "$REPO_DIR/config" "$REPO_DIR/systemd" "$REPO_DIR/installer" "$REPO_DIR/tools" \
  "$APP_DIR/"
run chown -R "$VEXA_USER:$VEXA_USER" "$APP_DIR"
fi

# ---------------------------------------------------------------- 4. python venv
info "Python venv $APP_DIR/venv"
if [[ -z "$PYTHON_BIN" ]]; then
  # imagecodecs/pylibjpeg sering belum punya wheel untuk python terbaru Arch; pakai 3.12/3.13 bila ada.
  for candidate in python3.13 python3.12 python3; do
    command -v "$candidate" >/dev/null && { PYTHON_BIN="$candidate"; break; }
  done
fi
[[ -n "$PYTHON_BIN" ]] || die "Python 3 tidak ditemukan"
warn "Memakai $PYTHON_BIN. Kalau 'pip install imagecodecs' gagal (wheel belum tersedia), pasang python 3.12/3.13 dan ulangi dengan --python-bin=/usr/bin/python3.12"
run "$PYTHON_BIN" -m venv "$APP_DIR/venv"
run "$APP_DIR/venv/bin/pip" install --upgrade pip wheel
run "$APP_DIR/venv/bin/pip" install -r "$APP_DIR/RIS/backend/mwl_scp/requirements.txt"
run "$APP_DIR/venv/bin/pip" install -r "$APP_DIR/PACS/requirements-mwl.txt"
# imagecodecs hanya dipakai untuk frame HTJ2K (transfer syntax 1.2.840.10008.1.2.4.201)
if [[ "$DRY" == 0 ]]; then
  "$APP_DIR/venv/bin/pip" install imagecodecs || warn "imagecodecs gagal dipasang — frame HTJ2K tidak bisa didekode, frame JPEG2000 biasa tetap jalan"
fi
if [[ "$DRY" == 0 ]]; then
  if "$APP_DIR/venv/bin/python" -c 'import openjpeg' 2>/dev/null; then
    info "Decoder JPEG 2000 siap: $(APP_DIR="$APP_DIR" "$APP_DIR/venv/bin/python" -c 'import sys;print(sys.executable)')"
  else
    warn "Modul openjpeg belum bisa diimpor di venv (dipakai pylibjpeg-openjpeg). Periksa output pip di atas."
  fi
fi
run chown -R "$VEXA_USER:$VEXA_USER" "$APP_DIR/venv"

# ---------------------------------------------------------------- 5. node dependencies + build
if [[ "$SKIP_BUILD" == 0 ]]; then
  info "npm install + build per aplikasi (butuh waktu)"
  APPS=(RIS/backend RIS/frontend PACS "DESKTOP VIEWER" "DESKTOP VIEWER SSR" "MOBILITY VIEWER" "ECG VIEWER" lic-manager)
  for relative in "${APPS[@]}"; do
    appdir="$APP_DIR/$relative"
    [[ -f "$appdir/package.json" ]] || { echo "   (lewati $relative: tanpa package.json)"; continue; }
    echo "   -> $relative"
    if [[ "$DRY" == 0 ]]; then
      ( cd "$appdir" && (npm ci --no-audit --no-fund || npm install --no-audit --no-fund) )
      if grep -q '"build"' "$appdir/package.json"; then
        ( cd "$appdir" && npm run build ) || warn "build gagal di $appdir (lanjut, service mungkin perlu dist manual)"
      fi
    else
      printf '      [dry-run] npm ci + npm run build di %s\n' "$appdir"
    fi
  done
  run chown -R "$VEXA_USER:$VEXA_USER" "$APP_DIR"
else
  info "Build dilewati (--skip-build)"
fi

# ---------------------------------------------------------------- 6. postgresql
if [[ "$SKIP_DB" == 0 ]]; then
  info "PostgreSQL: database $RIS_DB + $PACS_DB"
  run systemctl enable --now postgresql
  if [[ "$DRY" == 0 ]]; then
    for db in "$RIS_DB" "$PACS_DB"; do
      if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1; then
        echo "   database $db sudah ada"
      else
        sudo -u postgres createdb -O "$DB_USER" "$db" && echo "   database $db dibuat"
      fi
    done
    if [[ -n "$DB_PASSWORD" ]]; then
      sudo -u postgres psql -tAc "ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD'" >/dev/null
      echo "   password user $DB_USER diset"
    else
      warn "Password $DB_USER tidak diubah. Isi DB_PASSWORD/PACS_DB_PASS di $ETC_DIR/vexa.env"
    fi
  fi
  echo "   catatan: tabel dibuat aplikasi saat pertama dijalankan (tidak perlu dump SQL)"
else
  info "Setup DB dilewati (--skip-db)"
fi

# ---------------------------------------------------------------- 7. env file
info "Environment $ETC_DIR/vexa.env"
if [[ -f "$ETC_DIR/vexa.env" ]]; then
  echo "   sudah ada — tidak ditimpa"
else
  run install -m600 "$REPO_DIR/config/vexa.env.template" "$ETC_DIR/vexa.env"
fi
if [[ "$DRY" == 0 && -n "$DB_PASSWORD" ]]; then
  sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$DB_PASSWORD|; s|^PACS_DB_PASS=.*|PACS_DB_PASS=$DB_PASSWORD|" "$ETC_DIR/vexa.env"
fi

# ---------------------------------------------------------------- 8. systemd
if [[ "$WITH_SYSTEMD" == 1 ]]; then
  info "Unit systemd"
  run install -m644 "$REPO_DIR/systemd/"vexa-*.service /etc/systemd/system/
  run install -m644 "$REPO_DIR/systemd/vexa-backup.timer" /etc/systemd/system/
  # polkit: izinkan user vexa mengontrol unit vexa-* dari halaman admin
  run install -Dm644 "$REPO_DIR/systemd/50-vexa-admin.rules" /etc/polkit-1/rules.d/50-vexa-admin.rules
  # izinkan backend RIS mengubah jadwal backup (systemd timer) tanpa hak root penuh
  run install -Dm440 "$REPO_DIR/systemd/sudoers.d-vexa-backup" /etc/sudoers.d/vexa-backup
  run mkdir -p /etc/systemd/system/vexa-backup.timer.d
  run systemctl enable --now vexa-backup.timer
  [[ "$WITH_CADDY" == 1 ]] && run install -Dm644 "$REPO_DIR/systemd/Caddyfile" /etc/caddy/conf.d/vexapacs.caddy
  run systemctl daemon-reload
  for unit in $UNITS; do run systemctl enable "$unit" >/dev/null; done
  if [[ "$DO_START" == 1 ]]; then
    for unit in $UNITS; do run systemctl restart "$unit"; done
  else
    echo "   unit di-enable, belum dijalankan (pakai --start atau systemctl start vexa-ris-backend ...)"
  fi
fi

# ---------------------------------------------------------------- 9. lisensi
info "Lisensi"
if [[ -f "$DATA_DIR/license.lic" && -f "$DATA_DIR/public.pem" ]]; then
  echo "   ditemukan: $DATA_DIR/license.lic + public.pem"
  echo "   memverifikasi tanda tangan, masa berlaku, machineId, dan modul..."
  if [[ "$DRY" == 1 ]]; then
    echo "   [dry-run] node $APP_DIR/scripts/license/verify-license.js --license $DATA_DIR/license.lic --public-key $DATA_DIR/public.pem"
    LICENSE_STATE="skip"
  elif node "$APP_DIR/scripts/license/verify-license.js" --license "$DATA_DIR/license.lic" --public-key "$DATA_DIR/public.pem"; then
    LICENSE_STATE="valid"
  else
    LICENSE_STATE="invalid"
  fi
else
  LICENSE_STATE="missing"
  warn "license.lic / public.pem belum ada di $DATA_DIR."
  cat <<EOF
   Terbitkan lisensi untuk server Linux ini:
     1) node $APP_DIR/scripts/license/license-cli.js install-request --out /tmp/install-request.json
     2) kirim /tmp/install-request.json ke tim lisensi -> terima license.lic
     3) copy license.lic + public.pem ke $DATA_DIR, lalu:
        sudo systemctl restart vexa-ris-backend vexa-pacs
   Selama lisensi belum ada dan VEXA_LICENSE_ENFORCE=true, service RIS/PACS menolak start.
   Rincian (termasuk kenapa lisensi Windows tidak otomatis valid): docs/LICENSE-ON-LINUX.md
EOF
fi

# install-request: dibuat juga otomatis kalau lisensi belum valid, supaya operator
# langsung punya berkas yang harus dikirim ke tim lisensi (tanpa langkah tambahan).
if [[ "$MAKE_INSTALL_REQUEST" == 1 || "${LICENSE_STATE:-missing}" != "valid" ]]; then
  REQUEST_OUT="${DATA_DIR}/install-request.json"
  info "Membuat install-request untuk server ini"
  run mkdir -p "$DATA_DIR"
  run chown "$VEXA_USER:$VEXA_USER" "$DATA_DIR"
  if [[ "$DRY" == 0 ]]; then
    if node "$APP_DIR/scripts/license/license-cli.js" request --out "$REQUEST_OUT"; then
      node "$APP_DIR/scripts/license/license-cli.js" machine || true
      echo "   kirim berkas ini ke tim lisensi: $REQUEST_OUT"
    else
      warn "gagal membuat install-request; jalankan manual:"
      echo "     node $APP_DIR/scripts/license/license-cli.js request --out $REQUEST_OUT"
    fi
  else
    echo "   [dry-run] node $APP_DIR/scripts/license/license-cli.js request --out $REQUEST_OUT"
  fi
fi

if [[ "${LICENSE_STATE:-missing}" != "valid" ]]; then
  warn "Lisensi belum valid (status: ${LICENSE_STATE:-missing})."
  if [[ "$ALLOW_INVALID_LICENSE" == 1 ]]; then
    warn "Dilanjutkan karena --allow-invalid-license. Service RIS/PACS akan MENOLAK start bila VEXA_LICENSE_ENFORCE=true."
  else
    cat <<EOF

Instalasi berhenti karena lisensi belum valid — disengaja, supaya server tidak dipakai tanpa
lisensi (VEXA_LICENSE_ENFORCE=true di $ETC_DIR/vexa.env).

Yang sudah selesai dijalankan sampai titik ini: paket sistem, user + direktori, salinan aplikasi,
venv python, build npm, database, env, dan unit systemd (sudah di-enable, belum dijalankan).

Langkah lanjutan:
  1) kirim ke tim lisensi:  $DATA_DIR/install-request.json
  2) terima license.lic, lalu copy license.lic + public.pem ke $DATA_DIR
  3) ulangi verifikasi + jalankan service:
       sudo bash $REPO_DIR/installer/install.sh --skip-deps --skip-build --skip-db --start
  Atau, kalau memang mau menyelesaikan instalasi dulu tanpa lisensi:
       sudo bash $REPO_DIR/installer/install.sh --allow-invalid-license
EOF
    exit 1
  fi
fi

info "Selesai"
cat <<EOF
  Status  : sudo systemctl status vexa-ris-backend
  Log     : journalctl -u vexa-ris-backend -f   (file: $LOG_DIR/*.log)
  Admin   : node $APP_DIR/admin/server.js   (lihat admin/README.md)
  Caddy   : sudo systemctl restart caddy    (Caddyfile: /etc/caddy/conf.d/vexapacs.caddy)
  Update  : rsync ulang + sudo bash $APP_DIR/installer/install.sh --skip-deps  (atau systemctl restart ...)
EOF
