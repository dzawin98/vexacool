# Catatan porting Windows → Linux (CachyOS)

## Peta komponen

| Windows (`D:\VELOPACS-RIS`) | Linux (`D:\VEXA-LINUX` → `/opt/vexapacs`) |
|---|---|
| `installer/vexapacs-ris.iss` (Inno Setup) | `installer/install.sh`, paket: `installer/PKGBUILD` |
| Lisensi diperiksa service saat start (Windows) | sama di Linux **plus** verifikasi saat install (`scripts/license/verify-license.js`) |
| NSSM `install-services.ps1` | unit systemd di `systemd/vexa-*.service` |
| Caddy `.exe` + `Caddyfile.template` | paket `caddy` + `systemd/Caddyfile` (`/etc/caddy/conf.d/vexapacs.caddy`) |
| `installer/scripts/static-server.js` (dipanggil dari PS) | `scripts/linux/static-server.js` (node murni, +proxy `/api`) |
| `installer/scripts/backup/*.ps1` + Scheduled Task | `scripts/linux/backup.sh`, `restore.sh` + `vexa-backup.timer` |
| `tools/service-monitor/VexaServiceMonitor.exe` (C#) | `admin/` (server.js + index.html, systemd `vexa-admin.service`) |
| `D:\VEXAlicmanager` (Express + better-sqlite3) | `apps/lic-manager` — **tanpa porting**, hanya `app.listen(PORT, HOST)` + unit `vexa-lic-manager.service` |
| `C:\ProgramData\VEXAPACS` | `/var/lib/vexapacs` (env `ProgramData`/`VEXA_PROGRAM_DATA_DIR`) |
| `D:\VEXADATA` (storage) | `/srv/vexadata` (`DICOMWEB_PACS_STORAGE_PATH`) |
| Firewall Windows dibuka oleh utility | `ufw allow 5757/tcp` & `5656/tcp` (manual, dokumentasi saja) |
| DICOM Print SCU (Windows printer) | **tidak diport** — di Linux butuh printer CUPS khusus |
| `VexaServiceMonitor` tab DICOM Config | pindah ke env + settings RIS/viewer (belum ada form) |

## License Manager (vendor)

Aplikasi yang sama dipakai di Linux; hanya satu baris diubah (`listen(PORT, HOST)`, default
127.0.0.1) dan lokasi datanya dipindah ke `/var/lib/vexapacs/lic-manager/` supaya tidak hilang
saat update aplikasi. Halaman aplikasinya memakai **path absolut** (`/api/*`, `/js/*`), jadi tidak
bisa ditempel di sub-path Caddy seperti `/adminVEXA` — pakai SSH tunnel (default) atau host/port
Caddy sendiri. `keys/private.pem` sengaja **tidak** disalin otomatis: penerbitan lisensi sebaiknya
tetap di mesin vendor, dan server rumah sakit cukup menerima `license.lic`.

## Yang benar-benar berubah di kode (dan sudah dikerjakan di folder ini)

- `apps/RIS/backend/index.js` — tiga pemanggilan `powershell.exe` (runner backup/restore dari UI RIS)
  diganti dispatcher: Windows tetap PowerShell, Linux memanggil `scripts/linux/*.sh`.
  Tanpa ini, tombol backup/restore di halaman RIS akan gagal di Linux.
- Path default Windows (`ProgramData`) tidak diubah di kode — diselesaikan lewat env di
  `/etc/vexapacs/vexa.env`, supaya project Windows tidak tersentuh.

## Yang **tidak** perlu diubah (sudah cross-platform)

- PACS `src/**` bersih dari path/utility Windows (tidak ada `ProgramData`, PowerShell, NSSM, `taskkill`).
- RIS backend selain 3 titik PowerShell di atas; database lewat `pg` (murni JS) + shim MySQL→Postgres.
- Ketiga viewer, ECG, MWL (python), license CLI, dan skrip license core.
- `sharp` (punya biner linux-x64) dan `dicom-dimse-native` (dikompilasi saat `npm install`).

## Perbedaan perilaku yang perlu diketahui

1. **Lisensi terikat mesin** — fingerprint memuat `platform` + MachineGuid Windows; di Linux
   MachineGuid kosong dan platform `linux`, jadi lisensi harus diterbitkan ulang
   (`docs/LICENSE-ON-LINUX.md`).
2. **Backup**: versi Windows menghentikan service lalu menyalin folder; versi Linux memakai
   `pg_dump --format=custom` (tanpa stop) dan `tar`. Ada opsi `--quiesce` untuk perilaku lama.
   Restore tetap wajib `--confirm`.
3. **Log**: Windows `.out.log`/`.err.log` di ProgramData; di Linux tetap file yang sama
   (`/var/log/vexapacs/*.log`, dibaca admin web) **plus** `journalctl -u <unit>`.
4. **Kontrol service**: Windows punya service SCM; Linux pakai systemd + polkit rule agar
   user `vexa` boleh mengontrol unit `vexa-*` dari halaman admin.
5. **Storage NAS**: di Linux sebaiknya mount NFS/disk di `/srv/vexadata` sebelum install,
   dan pastikan user `vexa` punya izin tulis (systemd tidak menjalankan service sebagai root).

## Urutan uji yang saya sarankan di CachyOS

1. `install.sh --skip-deps --skip-db --dry-run` → periksa rencana.
2. `install.sh --with-caddy --start` → semua unit naik.
3. `services.sh status` + 4 curl verifikasi (`docs/LINUX-INSTALL.md` §4).
4. Terbitkan lisensi Linux → restart `vexa-ris-backend vexa-pacs` → pastikan tidak ada 403.
5. Buka viewer 5994 dari workstation lain, buka satu study (uji decode J2K + cache).
6. Kirim satu study dari modalitas ke DIMSE 5757 (uji store + MWL 5656).
7. Jalankan `backup.sh --dry-run`, lalu backup nyata, lalu uji `restore.sh --db-only --confirm` di DB uji.
