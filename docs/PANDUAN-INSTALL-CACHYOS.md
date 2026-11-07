# Panduan Install VEXAPACS-RIS di CachyOS — untuk yang belum pernah pakai Linux

Dokumen ini ditulis untuk dijalankan **berurutan dari atas ke bawah**. Setiap perintah ditulis
lengkap (bisa copy-paste), dan di setiap langkah ada "yang harus Anda lihat" supaya Anda tahu
apakah langkahnya berhasil.

Ganti bagian bertanda `<...>` dengan data Anda:
- `<IP-SERVER>` = alamat IP server CachyOS, mis. `192.168.19.120`
- `<USER>` = user login server Anda, mis. `dzawin`
- `<PASSWORD-POSTGRES>` = password user `postgres` yang Anda pilih nanti

---

## 0. Istilah singkat (biar tidak bingung)

| Istilah | Artinya |
|---|---|
| **terminal** | jendela tempat mengetik perintah |
| **sudo** | "jalankan sebagai administrator"; akan minta password Anda (saat mengetik, layar tidak menampilkan apa pun — itu normal) |
| **scp** | kirim/ambil berkas lewat jaringan (dari PC Windows ke server) |
| **service** | program yang jalan terus di belakang (RIS, PACS, viewer) |
| **systemctl** | perintah untuk start/stop/lihat status service |
| **journalctl** | perintah untuk membaca catatan/log service (keluar dengan tombol `q`) |

---

## 1. Persiapan di PC Windows Anda

1. Buka **PowerShell** (Start → ketik "PowerShell").
2. Pastikan bisa masuk ke server:
   ```powershell
   ssh <USER>@<IP-SERVER>
   ```
   Pertama kali akan muncul pertanyaan `Are you sure you want to continue connecting?` → ketik
   `yes` lalu Enter. Masukkan password server. Kalau sudah masuk, prompt berubah jadi
   `[<USER>@namaserver ~]$` → **ketik `exit`** untuk kembali (kita belum mulai).
3. Kirim paket instalasi ke server:
   ```powershell
   scp D:\VEXA-LINUX-export\vexapacs-linux-2026-09-23.tar.gz <USER>@<IP-SERVER>:/tmp/
   scp D:\VEXA-LINUX-export\SHA256.txt <USER>@<IP-SERVER>:/tmp/
   ```
   Berkasnya ~521 MB, tunggu sampai muncul `100%` dan kembali ke prompt.

---

## 2. Masuk ke server dan cek paket

```bash
ssh <USER>@<IP-SERVER>
```

Cek dulu server punya koneksi internet (dibutuhkan `pacman`, `npm`, dan `pip`):

```bash
ping -c 3 1.1.1.1
curl -s -o /dev/null -w '%{http_code}\n' https://archlinux.org
```

**Yang harus Anda lihat:** `3 packets transmitted, 3 received` dan `200`. Kalau gagal, sambungkan
server ke internet dulu — instalasi tidak bisa lanjut tanpa itu.

Lalu (semua perintah di bawah dijalankan **di server**):

```bash
cd /tmp
sha256sum -c SHA256.txt
```

**Yang harus Anda lihat:** `vexapacs-linux-2026-09-23.tar.gz: OK`
Kalau tertulis `FAILED`, paket rusak saat dikirim — ulangi langkah 1.3.

```bash
sudo mkdir -p /opt/src/vexapacs-linux
sudo tar xzf /tmp/vexapacs-linux-2026-09-23.tar.gz -C /opt/src/vexapacs-linux
cd /opt/src/vexapacs-linux
ls
```

**Yang harus Anda lihat:** ada folder `apps`, `admin`, `config`, `docs`, `installer`, `scripts`, `systemd`.

---

## 3. Cek struktur + lihat rencana instalasi (belum mengubah apa pun)

```bash
bash scripts/linux/selfcheck.sh
```

**Yang harus Anda lihat:** baris terakhir `Ringkasan: 0 FAIL, 2 WARN`.
(2 WARN itu normal — itu penanda kode jalur Windows yang memang tidak dipakai di Linux.)

```bash
sudo bash installer/install.sh --dry-run
```

**Yang harus Anda lihat:** daftar "Rencana" (aplikasi, config, data, log, storage, database, user)
dan baris `[dry-run] ...` untuk setiap langkah. **Tidak ada yang berubah** di server.

---

## 4. Instalasi fase 1 (pasang semuanya, berhenti di lisensi)

```bash
sudo bash installer/install.sh --with-caddy
```

Yang dikerjakan (otomatis, 5-20 menit tergantung kecepatan internet):
1. pasang paket: `nodejs`, `npm`, `postgresql`, `python`, `base-devel`, `cmake`, `jq`, `rsync`, `caddy`
2. buat user sistem `vexa` + folder `/opt/vexapacs`, `/var/lib/vexapacs`, `/var/log/vexapacs`, `/srv/vexadata`
3. salin aplikasi ke `/opt/vexapacs`
4. buat venv python + pasang pustaka DICOM/JPEG2000
5. `npm install` + build untuk RIS, PACS, viewer 5994, viewer mobile, ECG, license manager
6. siapkan PostgreSQL + database `vexaris_db` dan `vexapacs_db`
7. tulis file konfigurasi `/etc/vexapacs/vexa.env`
8. pasang service systemd (status: aktif tapi belum dijalankan)
9. **berhenti** karena lisensi belum ada, dan membuat `/var/lib/vexapacs/install-request.json`

**Yang harus Anda lihat di akhir:** pesan

```
Instalasi berhenti karena lisensi belum valid — disengaja ...
  1) kirim ke tim lisensi:  /var/lib/vexapacs/install-request.json
```

Kalau muncul error di tengah, catat **baris 5 terakhir** yang berwarna merah dan lihat bagian
**Troubleshooting** di bawah.

---

## 5. Isi konfigurasi (password database & kunci integrasi)

```bash
sudo nano /etc/vexapacs/vexa.env
```

Cara pakai `nano`: panah untuk pindah, ketik seperti biasa. Yang perlu Anda isi/lengkapi:

| Baris | Isi |
|---|---|
| `DB_PASSWORD=` | password user `postgres` (yang dipakai RIS) |
| `PACS_DB_PASS=` | password yang sama untuk PACS |
| `# SIMRS_API_KEY=` | hapus tanda `#` lalu isi API key SIMRS (kalau dipakai) |
| `# NEXIA_RIS_SHARED_SECRET=` | **biarkan berkomentar `#`** (paling aman). Viewer memakai nilai bawaan; RIS memakai `VEXA_DESKTOP_RIS_SHARED_SECRET`/`VEXA_MOBILE_RIS_SHARED_SECRET`. Kalau mau nilai sendiri: isi KETIGA kunci itu dengan nilai sama persis. Jangan pernah menulis baris kosong `NEXIA_RIS_SHARED_SECRET=` (= semua halaman viewer ditolak). |
| `# GOOGLE_CLIENT_ID=` | hapus `#`, isi kalau login Google dipakai |
| `DB_NAME=` / `PACS_DB_NAME=` | biarkan `vexaris_db` / `vexapacs_db` (kecuali Anda restore dump dev `veloris_db`/`velopacs_db`) |

Menyimpan: tekan **Ctrl+O** lalu **Enter**, keluar dengan **Ctrl+X**.

Kalau password `postgres` belum pernah Anda set, set dulu:

```bash
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '<PASSWORD-POSTGRES>';"
```

---

## 6. Lisensi (fase 2)

1. Ambil berkas permintaan lisensi ke PC Anda:
   ```powershell
   scp <USER>@<IP-SERVER>:/var/lib/vexapacs/install-request.json D:\
   ```
2. Kirim berkas itu ke tim lisensi. Setelah selesai, Anda menerima **`license.lic`**.
3. Kirim balik ke server (bersama `public.pem` bila belum ada):
   ```powershell
   scp D:\license.lic <USER>@<IP-SERVER>:/tmp/
   scp D:\public.pem  <USER>@<IP-SERVER>:/tmp/
   ```
4. Di server, pindahkan ke lokasi yang benar dan kunci izinnya:
   ```bash
   sudo mv /tmp/license.lic /var/lib/vexapacs/license.lic
   sudo mv /tmp/public.pem  /var/lib/vexapacs/public.pem
   sudo chown vexa:vexa /var/lib/vexapacs/license.lic /var/lib/vexapacs/public.pem
   sudo chmod 640 /var/lib/vexapacs/license.lic
   ```
5. Cek ulang lisensinya kapan saja:
   ```bash
   node /opt/vexapacs/scripts/license/verify-license.js --license /var/lib/vexapacs/license.lic \
        --public-key /var/lib/vexapacs/public.pem
   ```
   **Yang harus Anda lihat:** `HASIL: VALID ✓` dan daftar modul `RIS=ok PACS_DIMSE=ok ...`

---

## 7. Jalankan semua service + verifikasi

```bash
cd /opt/src/vexapacs-linux
sudo bash installer/install.sh --skip-deps --skip-build --skip-db --start
bash /opt/vexapacs/scripts/linux/services.sh status
```

**Yang harus Anda lihat:** tabel service dengan kolom ACTIVE = `active` untuk: `vexa-ris-backend`,
`vexa-ris-frontend`, `vexa-pacs`, `vexa-mwl`, `vexa-viewer`, `vexa-viewer-mobile`, `vexa-ecg`.

Empat uji cepat:

```bash
curl -s http://127.0.0.1:3001/api/public/facility      # RIS backend
curl -s http://127.0.0.1:5001/rs/studies?limit=1       # PACS DICOMweb
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5994/   # viewer 5994 -> 200
journalctl -u vexa-pacs -n 30 --no-pager                # baca log PACS (keluar: q)
```

Kalau `-u vexa-pacs` menampilkan error `No module named 'openjpeg'`, berarti decoder JPEG 2000
belum siap → lihat Troubleshooting bagian D.

---

## 8. Akses dari PC Anda (browser)

| Alamat | Isi |
|---|---|
| `http://<IP-SERVER>/` | halaman RIS |
| `http://<IP-SERVER>/viewer` | viewer diagnostik (port 5994) |
| `http://<IP-SERVER>/mobile` | viewer mobile |
| `http://<IP-SERVER>/ecg` | viewer ECG |
| `http://<IP-SERVER>/rs` | PACS DICOMweb |
| `http://<IP-SERVER>/adminVEXA` | admin web (status service, storage, backup, lisensi) — isi token dari `/etc/vexapacs/admin.env` |

Kalau `http://<IP-SERVER>/` tidak terbuka: cek firewall.
```bash
sudo ufw status          # kalau ada, izinkan: sudo ufw allow 80,443/tcp
sudo systemctl status caddy
```

License Manager (menerbitkan lisensi) sengaja tidak terbuka ke jaringan. Dari PowerShell PC Anda:
```powershell
ssh -L 8898:127.0.0.1:8898 <USER>@<IP-SERVER>
```
biarkan jendela itu terbuka, lalu buka `http://localhost:8898` (login default `admin` /
`VexaTeam12@#` — segera ganti). Admin web juga bisa diakses langsung:
`ssh -L 8899:127.0.0.1:8899 <USER>@<IP-SERVER>` lalu `http://localhost:8899`.

---

## 9. Operasi harian (cheat sheet)

```bash
bash /opt/vexapacs/scripts/linux/services.sh status          # status semua service
sudo systemctl restart vexa-ris-backend                      # restart satu service
sudo systemctl restart vexa-pacs
journalctl -u vexa-ris-backend -f                            # ikuti log langsung (Ctrl+C berhenti)
tail -f /var/log/vexapacs/ris-backend.out.log                # log file
sudo systemctl list-timers | grep vexa                       # jadwal backup
sudo bash /opt/vexapacs/scripts/linux/backup.sh              # backup manual
sudo bash /opt/vexapacs/scripts/linux/restore.sh --backup /srv/vexabackup/<folder> --confirm
sudo bash /opt/vexapacs/installer/uninstall.sh               # lepas service (data tetap)
```

---

## 10. Troubleshooting

**A. `pacman` gagal / ada paket tidak ditemukan** → perbarui daftar paket: `sudo pacman -Syu` lalu
ulangi `sudo bash installer/install.sh --skip-build --skip-db` (jangan `--skip-deps`).

**B. `pip install imagecodecs` gagal (wheel belum ada untuk Python 3.14)** → pakai Python 3.12:
```bash
sudo pacman -S python312
rm -rf /opt/vexapacs/venv
sudo bash installer/install.sh --skip-deps --skip-db --python-bin=/usr/bin/python3.12
```

**C. `dicom-dimse-native` gagal dikompilasi** → pastikan alat build ada:
```bash
sudo pacman -S base-devel cmake nodejs npm
cd /opt/vexapacs/PACS && sudo -u vexa npm rebuild dicom-dimse-native
```

**D. Gambar tidak muncul, log menyebut `openjpeg`** → interpreter decoder salah:
```bash
/opt/vexapacs/venv/bin/python -c "import openjpeg; print('ok')"
# kalau gagal: /opt/vexapacs/venv/bin/pip install --force-reinstall pylibjpeg-openjpeg
sudo systemctl restart vexa-pacs
```

**E. Halaman RIS/viewer kosong** → hasil build belum ada (biasanya karena `--skip-build`):
```bash
sudo bash installer/install.sh --skip-deps --skip-db       # jalankan build
```

**F. Install berhenti di "Lisensi belum valid"** → memang begitu; ulangi langkah 6, lalu
`sudo bash installer/install.sh --skip-deps --skip-build --skip-db --start`.

**G. `verify-license.js` bilang `MACHINE_ID_MISMATCH`** → lisensi diterbitkan untuk mesin lain.
Kirim isi `install-request.json` (machineId) yang baru ke tim lisensi.

**H. Service tidak mau start, log menyebut `LICENSE_FILE_ERROR`** → `license.lic`/`public.pem`
belum ada atau path-nya salah (lihat `VEXA_LICENSE_FILE` di `/etc/vexapacs/vexa.env`).

**I. `/adminVEXA` 404** → Caddy belum memuat file konfigurasi:
```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

**J. Storage tidak bisa ditulis** (`/srv/vexadata`) → perbaiki kepemilikan:
`sudo chown -R vexa:vexa /srv/vexadata`

**K. Port bentrok** (mis. 80 dipakai nginx) → `ss -lntp | grep :80`, hentikan pemakainya
(`sudo systemctl disable --now nginx`) atau ubah port di `/etc/caddy/conf.d/vexapacs.caddy`.

---

## 11. Yang belum pernah diuji dari mesin developer (jujur)

Yang **tidak** bisa saya uji karena hanya ada Windows di sini: paket `pacman`, wheel Python Arch,
kompilasi `dicom-dimse-native`, dan Caddy. Kalau salah satu gagal, kirim ke saya output lengkap
perintah yang gagal (copy dari terminal) — 5 baris terakhir biasanya sudah cukup untuk menunjuk
penyebabnya.

## 12. Siapkan juga (kalau perlu)

- **Data DICOM lama**: kirim folder `D:\VELOPACS-RIS\DATA` → `/srv/vexadata`, dan dump database
  `velopacs_db`/`veloris_db` bila ingin data RIS ikut pindah (set `DB_NAME`/`PACS_DB_NAME` sesuai).
- **Kunci privat license manager**: hanya kalau Anda ingin menerbitkan lisensi dari server Linux —
  `scp D:\VEXAlicmanager\keys\private.pem <USER>@<IP-SERVER>:/tmp/` lalu
  `sudo mv /tmp/private.pem /opt/vexapacs/lic-manager/keys/ && sudo chmod 600 /opt/vexapacs/lic-manager/keys/private.pem && sudo chown vexa:vexa /opt/vexapacs/lic-manager/keys/private.pem`
