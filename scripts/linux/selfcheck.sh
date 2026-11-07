#!/usr/bin/env bash
#
# Verifikasi struktur VEXA-LINUX: unit systemd <-> berkas yang dipanggil <-> skrip build.
# Bisa dijalankan di CachyOS maupun di Windows (git-bash), supaya kesalahan path ketahuan
# sebelum install, bukan setelah service gagal start.
#
#   bash scripts/linux/selfcheck.sh [--quiet]
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
QUIET=0
[[ "${1:-}" == "--quiet" ]] && QUIET=1
FAIL=0
WARN=0

ok()   { printf '  \033[32mPASS\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }
warn() { printf '  \033[33mWARN\033[0m %s\n' "$*"; WARN=$((WARN + 1)); }
section() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }

# python/node native di Windows tidak mengerti path MSYS (/d/...), jadi konversi bila perlu
native_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi
}
# 0 = valid, 1 = tidak valid, 2 = tidak ada alat untuk memeriksa
# (selfcheck sering dijalankan SEBELUM install, saat node belum terpasang -> jangan FAIL palsu)
json_valid() {
  local file
  file="$(native_path "$1")"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "import json,sys;json.load(open(sys.argv[1],encoding='utf-8'))" "$file" >/dev/null 2>&1 && return 0
  fi
  if command -v python >/dev/null 2>&1; then
    python -c "import json,sys;json.load(open(sys.argv[1],encoding='utf-8'))" "$file" >/dev/null 2>&1 && return 0
  fi
  if command -v node >/dev/null 2>&1; then
    node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$file" >/dev/null 2>&1 && return 0
  fi
  if ! command -v python3 >/dev/null 2>&1 && ! command -v python >/dev/null 2>&1 && ! command -v node >/dev/null 2>&1; then
    return 2
  fi
  return 1
}

check_json() { # file label
  json_valid "$1"
  case $? in
    0) ok "$2" ;;
    2) warn "$2 tidak bisa diverifikasi (python3/python/node belum terpasang) — akan diperiksa lagi setelah install" ;;
    *) bad "$2 (JSON tidak valid)" ;;
  esac
}

# Aplikasi ada di apps/ pada repo, tetapi dipasang di root /opt/vexapacs saat install.
# Terima kedua layout supaya skrip yang sama bisa dipakai sebelum dan sesudah dipasang.
resolve_layout_path() {
  local candidate="$1"
  if [[ -e "$ROOT/$candidate" ]]; then printf '%s' "$candidate"; return 0; fi
  if [[ -e "$ROOT/apps/$candidate" ]]; then printf 'apps/%s' "$candidate"; return 0; fi
  return 1
}
check_file() { # path [penjelasan]
  local resolved
  if resolved="$(resolve_layout_path "$1")"; then ok "$resolved"; else bad "$1 ${2:-(tidak ditemukan)}"; fi
}
check_dir() {
  if [[ -d "$ROOT/$1" ]]; then ok "$1/"; else bad "$1/ ${2:-(tidak ditemukan)}"; fi
}

section "Berkas aplikasi"
for f in \
  "RIS/backend/index.js" \
  "RIS/frontend/package.json" \
  "PACS/src/app.ts" \
  "PACS/requirements-mwl.txt" \
  "RIS/backend/mwl_scp/nexia_mwl_scp.py" \
  "DESKTOP VIEWER SSR/server/index.mjs" \
  "DESKTOP VIEWER/package.json" \
  "MOBILITY VIEWER/server/index.mjs" \
  "ECG VIEWER/server.js" \
  "scripts/license/license-cli.js" \
  "scripts/license/verify-license.js" \
  "scripts/linux/static-server.js" \
  "scripts/linux/backup.sh" \
  "scripts/linux/restore.sh" \
  "config/vexa.env.template" \
  "config/backup.config.linux.sample.json" \
  "installer/install.sh" \
  "admin/server.js" \
  "admin/index.html" ; do
  check_file "$f"
done

section "Unit systemd"
UNITS=(vexa-ris-backend vexa-ris-frontend vexa-pacs vexa-viewer vexa-viewer-mobile vexa-ecg vexa-mwl vexa-admin vexa-lic-manager vexa-backup)
for unit in "${UNITS[@]}"; do
  file="$ROOT/systemd/$unit.service"
  [[ -f "$file" ]] || { bad "systemd/$unit.service"; continue; }
  SECTIONS=('\[Unit\]' '\[Service\]')
  # unit oneshot yang hanya dipicu timer (backup) memang tidak punya [Install]
  grep -q '^Type=oneshot' "$file" || SECTIONS+=('\[Install\]')
  for want in "${SECTIONS[@]}"; do
    grep -q "$want" "$file" || bad "systemd/$unit.service: bagian $want hilang"
  done
  grep -qE '^(ExecStart|ExecStartPre)=' "$file" || bad "systemd/$unit.service: ExecStart tidak ada"
  grep -q '^User=' "$file" || warn "systemd/$unit.service: tanpa User= (akan jalan sebagai root)"
  ok "systemd/$unit.service"
done
[[ -f "$ROOT/systemd/vexa-backup.timer" ]] && ok "systemd/vexa-backup.timer" || bad "systemd/vexa-backup.timer"

section "ExecStart -> berkas nyata"
declare -A EXEC_TARGETS=(
  [vexa-ris-backend]="RIS/backend/index.js"
  [vexa-ris-frontend]="scripts/linux/static-server.js"
  [vexa-viewer]="DESKTOP VIEWER SSR/server/index.mjs"
  [vexa-viewer-mobile]="MOBILITY VIEWER/server/index.mjs"
  [vexa-ecg]="ECG VIEWER/server.js"
  [vexa-mwl]="RIS/backend/mwl_scp/nexia_mwl_scp.py"
  [vexa-admin]="admin/server.js"
  [vexa-lic-manager]="lic-manager/server.js"
)
for unit in "${!EXEC_TARGETS[@]}"; do
  target="${EXEC_TARGETS[$unit]}"
  if resolved="$(resolve_layout_path "$target")"; then ok "$unit -> $resolved"; else bad "$unit -> $target (hilang)"; fi
done
grep -q "node build/app.js\|npm start" "$ROOT/systemd/vexa-pacs.service" \
  && ok "vexa-pacs -> npm start (ts-node src/app.ts)" \
  || warn "vexa-pacs: ExecStart tidak dikenali"

section "Caddyfile (reverse proxy)"
CADDY="$ROOT/systemd/Caddyfile"
if [[ -f "$CADDY" ]]; then
  OPEN=$(tr -cd '{' < "$CADDY" | wc -c)
  CLOSE=$(tr -cd '}' < "$CADDY" | wc -c)
  [[ "$OPEN" == "$CLOSE" ]] && ok "kurung blok seimbang ($OPEN pasang)" || bad "kurung tidak seimbang: { $OPEN vs } $CLOSE"
  PORTS_OK=1
  while IFS= read -r port; do
    case "$port" in
      3001|5001|5994|5992|7771|8080|8899|8898) ok "reverse_proxy -> $port" ;;
      *) bad "reverse_proxy -> port $port tidak dikenal" ; PORTS_OK=0 ;;
    esac
  done < <(grep -oE 'reverse_proxy 127\.0\.0\.1:[0-9]+' "$CADDY" | grep -oE '[0-9]+$' | sort -u)
  grep -q 'handle_path /adminVEXA/\*' "$CADDY" && ok "route /adminVEXA terpasang" || warn "route /adminVEXA tidak ditemukan"
else
  bad "systemd/Caddyfile tidak ada"
fi

section "Layout install (aplikasi di root, bukan di bawah subfolder)"
if grep -q '"\$REPO_DIR/apps/" "\$REPO_DIR/scripts"' "$ROOT/installer/install.sh"; then
  ok "install.sh menyalin isi apps/ ke root \$APP_DIR"
else
  bad "install.sh tidak menyalin apps/ ke root — path '../../scripts/license' akan rusak saat dipasang"
fi
if grep -qE 'WorkingDirectory=/opt/vexapacs/(RIS|PACS|lic-manager)' "$ROOT/systemd/"*.service; then
  ok "unit systemd menunjuk aplikasi di root /opt/vexapacs"
else
  bad "unit systemd masih memakai /opt/vexapacs/apps/... — tidak sesuai layout"
fi

section "Path lintas-aplikasi (di server aplikasi dipasang di root)"
# RIS, PACS, kedua viewer, mobile, dan ECG semuanya mencari scripts/license lewat path
# relatif yang menganggap aplikasi berada TEPAT DI BAWAH root install, contoh:
#   RIS/backend/index.js        -> ../../scripts/license/licenseRuntime
#   DESKTOP VIEWER/server/*.mjs -> ../../scripts/license/licenseRuntime
#   ECG VIEWER/server.js        -> ../scripts/license/licenseRuntime
# Di repo letaknya di bawah apps/, jadi pemeriksaan ini mengevaluasi layout install
# (awalan apps/ dibuang) dan memastikan targetnya benar-benar ada.
CROSS_OK=1
# Termasuk import ESM (`import('../../tools/runtime/cacheStore.mjs')` / `from '../tools/...'`),
# bukan hanya require(): viewer 5994 pernah gagal start di server karena cacheStore.mjs + jobQueue.mjs
# tidak ikut tersalin, sementara pemeriksaan yang hanya melihat require() melaporkan 0 FAIL.
while IFS= read -r line; do
  file="${line%%:*}"
  spec="$(printf '%s' "$line" | sed -E "s/.*(require|import|from)[[:space:]]*\(?'([^']+)'.*/\2/")"
  [[ -n "$spec" && "$spec" == *'/'* ]] || continue
  rel="${file#$ROOT/}"
  rel="${rel#apps/}"
  target="$(realpath -m "$ROOT/$(dirname "$rel")/$spec" 2>/dev/null)"
  # tanpa ekstensi: coba juga .js/.mjs dan index.*
  if [[ -e "$target" || -e "$target.js" || -e "$target.mjs" || -e "$target/index.js" || -e "$target/index.mjs" ]]; then
    ok "$rel -> $spec"
  else
    bad "$rel -> $spec (tidak ada di layout install)"
    CROSS_OK=0
  fi
done < <(grep -rIn --include='*.js' --include='*.mjs' --include='*.cjs' --include='*.ts' --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build \
  -E "require\('\.\./(scripts|tools)/|require\('\.\./\.\./(scripts|tools)/|import\('\.\./(scripts|tools)/|import\('\.\./\.\./(scripts|tools)/|from '[^']*\.\./(scripts|tools)/|from '[^']*\.\./\.\./(scripts|tools)/" "$ROOT" 2>/dev/null | awk 'length($0) < 200')
if [[ "$CROSS_OK" == 1 ]]; then
  ok "semua modul menemukan scripts/license dan tools/runtime pada layout install (aplikasi di root)"
fi
# install.sh wajib ikut menyalin tools/ — tanpa ini viewer 5994 mati dengan ERR_MODULE_NOT_FOUND.
if grep -q '"\$REPO_DIR/tools"' "$ROOT/installer/install.sh"; then
  ok "install.sh menyalin tools/ ke \$APP_DIR"
else
  bad "install.sh tidak menyalin tools/ — viewer 5994 akan gagal import cacheStore.mjs/jobQueue.mjs"
fi

section "Skrip npm yang dipakai install.sh"
for app in "RIS/frontend" "DESKTOP VIEWER" "DESKTOP VIEWER SSR" "MOBILITY VIEWER" "ECG VIEWER" "PACS"; do
  pkg="$ROOT/apps/$app/package.json"
  [[ -f "$pkg" ]] || { warn "apps/$app/package.json tidak ada"; continue; }
  python - "$pkg" <<'PY' 2>/dev/null || true
import json,sys
p=json.load(open(sys.argv[1],encoding='utf-8'))
print("scripts:", ",".join(sorted((p.get("scripts") or {}).keys())))
PY
  ok "apps/$app/package.json (scripts terbaca)"
done

section "JSON valid"
for f in config/vexa.env.template config/backup.config.linux.sample.json; do
  case "$f" in
    *.json)
      check_json "$ROOT/$f" "$f" 
      ;;
    *) ok "$f (bukan JSON)";;
  esac
done
while IFS= read -r f; do
  check_json "$f" "${f#$ROOT/}"
done < <(find "$ROOT/apps" -maxdepth 2 -name package.json -not -path "*node_modules*" 2>/dev/null)

section "Sisa ketergantungan Windows di aplikasi"
# Hanya berkas kode (dokumen .md dan data .json besar tidak relevan dan bisa berisi base64)
HITS=$(grep -rIn --include='*.js' --include='*.mjs' --include='*.cjs' --include='*.ts' --include='*.tsx' \
  --exclude-dir=node_modules --exclude-dir=dist \
  -e 'powershell\.exe' -e 'schtasks\.exe' -e 'nssm' \
  "$ROOT/apps" 2>/dev/null | grep -v "process.platform" | awk 'length($0) < 200' | /usr/bin/head -20)
if [[ -z "$HITS" ]]; then
  ok "tidak ada pemanggilan PowerShell/schtasks/nssm di apps/"
else
  warn "perlu ditinjau (mungkin memang punya cabang Linux):"
  printf '%s\n' "$HITS" | sed 's/^/       /'
fi

section "Pelaporan path C:\\ProgramData di apps/"
HITS2=$(grep -rIn --include='*.js' --include='*.mjs' --include='*.ts' --include='*.tsx' --include='*.py' \
  --exclude-dir=node_modules --exclude-dir=dist -e 'ProgramData' "$ROOT/apps" 2>/dev/null \
  | grep -v "process.env" | awk 'length($0) < 200' | /usr/bin/head -10)
if [[ -z "$HITS2" ]]; then ok "tidak ada path Windows hardcoded (env dipakai)"; else warn "$(printf '%s' "$HITS2" | wc -l) baris perlu ditinjau"; printf '%s\n' "$HITS2" | sed 's/^/       /'; fi

printf '\n\033[1mRingkasan: %d FAIL, %d WARN\033[0m\n' "$FAIL" "$WARN"
[[ "$FAIL" == 0 ]]
