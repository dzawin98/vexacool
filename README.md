# VEXA-LINUX — VEXAPACS-RIS untuk CachyOS / Arch Linux

Folder ini **khusus Linux** dan terpisah dari project Windows (`D:\VELOPACS-RIS`).
Yang Windows tidak diubah sama sekali: installer Inno Setup, service NSSM, skrip PowerShell,
dan utility `VexaServiceMonitor.exe` tetap jalan di sana.

Di sini isinya versi Linux dengan padanan idiomatik Arch: **systemd** (bukan NSSM),
**bash + pg_dump/tar** (bukan PowerShell), **admin web** (bukan aplikasi WinForms),
dan installer `install.sh` (atau `PKGBUILD.template` untuk paket pacman).

## Struktur

```text
VEXA-LINUX/
  apps/
    RIS/                  backend (3001) + frontend (8080, dist + proxy /api)
    PACS/                 DICOMweb 5001 + DIMSE SCP 5757 (ts-node)
    DESKTOP VIEWER/       sumber viewer diagnostik
    DESKTOP VIEWER SSR/   server SSR yang melayani port 5994  <-- "viewer 5994"
    MOBILITY VIEWER/      mobile viewer 5992
    ECG VIEWER/           ECG viewer 7771
    lic-manager/          License Manager web (pengganti D:\VEXAlicmanager), 8898 internal
  scripts/
    license/              license-cli + core (Ed25519, machine binding)
    linux/                static-server.js, services.sh, backup.sh, restore.sh
  systemd/                unit semua service + Caddyfile + polkit rule + timer backup
  config/                 vexa.env.template, backup.config.linux.sample.json
  admin/                  halaman admin web (pengganti VexaServiceMonitor.exe)
  installer/              install.sh, uninstall.sh, PKGBUILD.template
  docs/                   LINUX-INSTALL.md, LICENSE-ON-LINUX.md, PORTING-NOTES.md,
                          PANDUAN-INSTALL-CACHYOS.md (panduan manusia),
                          AGENT-INSTALL-BRIEF.md (brief untuk agen AI yang mengeksekusi instalasi)
  deploy/                 contoh nginx/docker/coolify (warisan, opsional)
  tools/service-monitor/  README + sumber C# utility Windows (rujukan fitur saja)
```

## Paket pacman (opsional)

```bash
cd installer && makepkg -si      # memasang app + unit + skrip (tanpa venv/node_modules)
sudo vexapacs-setup             # sekali: venv python + npm build + database + enable unit
```

## Pasang cepat (server uji)

```bash
sudo bash installer/install.sh --with-caddy --start        # deps + db + build + systemd
sudo bash installer/install.sh --dry-run                   # lihat rencana dulu
```

Setelah itu: pasang lisensi (lihat `docs/LICENSE-ON-LINUX.md`), isi `config/backup.config.linux.sample.json`
ke `/var/lib/vexapacs/backup.config.json`, lalu buka admin web di **http://IP-SERVER/adminVEXA**
(service-nya sendiri listen di 127.0.0.1:8899; Caddy yang meneruskan).

## Port

| Service | Port |
|---|---|
| RIS backend | 3001 |
| RIS frontend | 8080 |
| PACS DICOMweb | 5001 |
| PACS DIMSE SCP | 5757 |
| MWL SCP | 5656 |
| Desktop Viewer (SSR) | 5994 |
| Mobile Viewer | 5992 |
| ECG Viewer | 7771 |
| VEXA Admin | 8899 (internal, diakses lewat Caddy: **http://IP-SERVER/adminVEXA**) |
| License Manager | 8898 (internal; SSH tunnel atau host Caddy sendiri) |
| Caddy | 80 / 443 |

## Lisensi saat install

Installer **memverifikasi lisensi di akhir instalasi** (tanda tangan, masa berlaku, machineId server
ini, daftar modul) dan berhenti bila belum valid — supaya tidak ada server yang jalan setengah siap:

```bash
sudo bash installer/install.sh --install-request     # buat install-request.json (machineId server ini)
# ... kirim ke tim lisensi, terima license.lic ...
sudo bash installer/install.sh --skip-deps --skip-build --skip-db
sudo bash installer/install.sh --allow-invalid-license   # opsi: pasang dulu, lisensi menyusul
```

Cek manual kapan saja: `node scripts/license/verify-license.js --license ... --public-key ...`

## Cek struktur sebelum install

```bash
bash scripts/linux/selfcheck.sh          # PASS/FAIL: unit <-> berkas <-> skrip npm, JSON, sisa Windows
```

## Status porting

- **Sudah jalan tanpa perubahan kode**: RIS backend, RIS frontend, PACS (DICOMweb + DIMSE), viewer 5994,
  mobile, ECG, MWL, license CLI — semua kodenya cross-platform.
- **Diganti padanannya**: service Windows → systemd, backup PowerShell → `scripts/linux/backup.sh`,
  utility WinForms → `admin/`, static server PowerShell → `scripts/linux/static-server.js`.
- **Belum diport (dan tidak akan)**: installer Inno Setup, NSSM, Caddy .exe, DICOM Print SCU Windows,
  tab firewall utility. Rincian: `docs/PORTING-NOTES.md`.
