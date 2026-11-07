# Instalasi VEXAPACS-RIS di CachyOS / Arch Linux

## 1. Sebelum mulai

- CachyOS/Arch dengan `pacman` (skrip `installer/install.sh` menolak jalan di distro non-Arch).
- Minimal: 4 core, 16 GB RAM untuk uji; produksi ikuti spesifikasi (server 20 core/256 GB, NAS 20 TB).
- Storage DICOM terpisah lebih baik (mis. mount ke `/srv/vexadata`).
- Port yang harus bebas: 3001, 5001, 5757, 5656, 5994, 5992, 7771, 8080, 8899 (+80/443 untuk Caddy).

## 1b. Cek struktur (opsional, cepat)

```bash
bash scripts/linux/selfcheck.sh
```

Skrip ini memverifikasi: berkas yang dipanggil setiap unit systemd ada, `package.json`
punya skrip `build`/`start` yang dipakai installer, JSON config valid, dan tidak ada sisa
ketergantungan Windows (PowerShell/schtasks/NSSM) di jalur aktif. Jalankan juga setelah
memperbarui aplikasi.

## 2. Pasang aplikasi

```bash
git clone <repo> VEXA-LINUX   # atau salin folder VEXA-LINUX ke server
cd VEXA-LINUX
sudo bash installer/install.sh --dry-run                 # periksa rencana
sudo bash installer/install.sh --with-caddy --db-password='PASSWORD_POSTGRES'
```

Yang dilakukan `install.sh` (idempoten, boleh diulang):

1. `pacman -Sy --needed nodejs npm postgresql python python-pip base-devel cmake git rsync jq unzip` (+caddy).
2. Membuat user sistem `vexa` + direktori `/opt/vexapacs`, `/var/lib/vexapacs`, `/var/log/vexapacs`, `/srv/vexadata`.
3. Menyalin `apps/`, `scripts/`, `admin/`, `docs/`, `config/`, `systemd/` ke `/opt/vexapacs`.
4. Membuat venv `/opt/vexapacs/venv` + `pynetdicom`, `pydicom`, `psycopg`, `Pillow`, `pylibjpeg(-openjpeg)`, `imagecodecs`.
5. `npm ci` (atau `npm install`) + `npm run build` untuk tiap app; `sharp` dan `dicom-dimse-native` dikompilasi/diunduh di sini.
6. `systemctl enable --now postgresql`, membuat database `vexaris_db` + `vexapacs_db`.
7. Menulis `/etc/vexapacs/vexa.env` (mode 600) dari `config/vexa.env.template` bila belum ada.
8. Memasang unit systemd + polkit rule + timer backup, `daemon-reload`, `enable`.
9. Memverifikasi lisensi; bila belum valid, installer **otomatis membuat `install-request.json`**
   (berisi machineId server ini) di `/var/lib/vexapacs/`, mencetak langkah pengiriman, lalu berhenti.
   Ulangi dengan `--skip-deps --skip-build --skip-db --start` setelah `license.lic` + `public.pem` dipasang.

Alternatif paket: `cd installer && makepkg -si` lalu `sudo vexapacs-setup`.

Opsi berguna: `--skip-deps`, `--skip-build`, `--skip-db`, `--no-systemd`, `--python-bin=/usr/bin/python3.12`,
`--app-dir=`, `--data-dir=`, `--storage=`, `--start`.

## 3. Konfigurasi

1. **Env**: `/etc/vexapacs/vexa.env` — isi `DB_PASSWORD`, `PACS_DB_PASS`, path storage, dan sesuaikan
   `DICOMWEB_J2K_*` bila perlu (lihat komentar di file).
2. **Lisensi (diverifikasi saat install)**: `docs/LICENSE-ON-LINUX.md`. Installer memverifikasi
   `license.lic` terhadap `public.pem` — tanda tangan Ed25519, masa berlaku, **machineId server ini**,
   dan daftar modul — lalu **berhenti dengan pesan jelas** bila belum valid (status: missing/invalid).
   Dua kenyamanan: `--install-request` membuat `install-request.json` (machineId server ini) untuk
   dikirim ke tim lisensi, dan `--allow-invalid-license` kalau memang mau memasang dulu, lisensi
   menyusul (service RIS/PACS tetap menolak start selama `VEXA_LICENSE_ENFORCE=true`).
   Penerbitan lisensi di server ini memakai service `vexa-lic-manager` (port **8898**, hanya localhost):
   `ssh -L 8898:127.0.0.1:8898 user@IP-SERVER` lalu buka `http://localhost:8898`
   (login default `admin` / `VexaTeam12@#`, ganti segera). Rincian: `apps/lic-manager/README-LINUX.md`.
3. **Backup**: `sudo cp config/backup.config.linux.sample.json /var/lib/vexapacs/backup.config.json`
   lalu sesuaikan `backupRoot`, kredensial Postgres, `retention.keepLast`. Jadwal: `vexa-backup.timer` (23:00),
   ubah juga `OnCalendar` bila jamnya berbeda.
4. **Reverse proxy**: `systemctl restart caddy` setelah file `/etc/caddy/conf.d/vexapacs.caddy` terpasang
   (domain publik: sunting bloknya, Caddy mengurus HTTPS sendiri).
   Route yang tersedia: `/` RIS frontend, `/api` RIS backend, `/rs` + `/wado` PACS, `/viewer` (5994),
   `/mobile`, `/ecg`, dan **`/adminVEXA`** untuk admin web (pengganti VexaServiceMonitor).
   `vexa-admin.service` sengaja hanya listen `127.0.0.1:8899` — akses dari LAN selalu lewat Caddy,
   jadi tidak perlu membuka port tambahan di firewall dan otomatis ikut HTTPS bila domain publik dipakai.

## 4. Verifikasi (urutan yang saya pakai di Windows, sama di sini)

```bash
bash /opt/vexapacs/scripts/linux/services.sh status
curl -s http://127.0.0.1:3001/api/public/facility        # RIS backend hidup
curl -s http://127.0.0.1:5001/rs/studies?limit=1         # PACS DICOMweb hidup
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5994/   # viewer 5994
journalctl -u vexa-pacs -n 30 --no-pager                 # cek decoder J2K & DIMSE SCP
```

Yang paling sering perlu dicek:

- **Decoder JPEG 2000**: `journalctl -u vexa-pacs | grep -i openjpeg` harus bersih. Bila muncul
  `ModuleNotFoundError: No module named 'openjpeg'`, berarti `DICOMWEB_JPEG2000_DECODER_PYTHON` tidak
  menunjuk venv yang benar.
- **DIMSE SCP 5757**: kirim C-ECHO dari modalitas/modality simulator ke AET `VEXA_PACS`.
- **MWL 5656**: `journalctl -u vexa-mwl`; pastikan database PACS bisa dibaca (nama DB di env).

## 5. Kalau ada masalah

| Gejala | Cek |
|---|---|
| `pip install imagecodecs` gagal (wheel) | Python Arch terlalu baru; buat venv dengan 3.12/3.13 (`--python-bin=/usr/bin/python3.12`) |
| `dicom-dimse-native` gagal build | `pacman -S base-devel cmake`; cek prebuild untuk versi Node (`node -v`) |
| Service gagal start, log menyebut `LICENSE_FILE_ERROR` | Lisensi belum ada / `VEXA_LICENSE_FILE` salah (`docs/LICENSE-ON-LINUX.md`) |
| Halaman viewer kosong | `VIEWER_DIST_DIR` harus menunjuk `apps/DESKTOP VIEWER/dist`; jalankan `npm run build` di app itu |
| Port 80 sudah dipakai | `ss -lntp` — hentikan nginx/httpd atau ubah `systemd/Caddyfile` |
| Tombol start/stop di admin gagal | polkit rule `50-vexa-admin.rules` belum terpasang (`systemd/`) |
| `/adminVEXA` balas 404 | blok `handle_path /adminVEXA/*` belum ada di `/etc/caddy/conf.d/vexapacs.caddy` atau Caddy belum di-restart |
| Admin hanya bisa dari localhost | benar (by design); untuk akses langsung pakai `ssh -L 8899:127.0.0.1:8899 server` atau ubah `VEXA_ADMIN_HOST` |
| License Manager tidak bisa simpan lisensi | `keys/private.pem` belum disalin manual (`chmod 600`), atau `DB_PATH`/`LICENSES_DIR` tidak bisa ditulis user `vexa` |
| Install berhenti "Lisensi belum valid" | disengaja; jalankan `--install-request` lalu pasang `license.lic`, atau `--allow-invalid-license` untuk memasang dulu |
| Cek lisensi kapan saja | `node scripts/license/verify-license.js --license /var/lib/vexapacs/license.lic --public-key /var/lib/vexapacs/public.pem` |
