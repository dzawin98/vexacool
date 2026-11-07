# BRIEF UNTUK AGEN AI — Instalasi VEXAPACS-RIS di CachyOS (Arch Linux)

Berkas ini adalah instruksi operasional. Bacalah seluruhnya sebelum menjalankan perintah apa pun.
Dokumen pendamping untuk manusia: `docs/PANDUAN-INSTALL-CACHYOS.md`.

---

## 1. Peran dan hasil akhir yang diminta

Kamu adalah operator yang menjalankan instalasi VEXAPACS-RIS (RIS + PACS DICOMweb/DIMSE + Viewer Desktop 5994 +
Viewer Mobile 5992 + ECG 7771 + MWL + admin web + license manager) dari paket sumber
`vexapacs-linux-2026-09-23.tar.gz` di atas CachyOS.

Hasil akhir yang dianggap selesai:
1. Semua unit systemd bernama `vexa-*` berstatus `active (running)`.
2. `curl` internal mengembalikan data/HTTP 200 untuk RIS (3001), PACS (5001), Viewer (5994).
3. `node /opt/vexapacs/scripts/license/verify-license.js` mengeluarkan `HASIL: VALID ✓`.
4. Laporan akhir memakai format di bagian 8 (fakta hasil perintah, bukan ringkasan pekerjaan).

Kalau salah satu dari empat itu belum tercapai, pekerjaan BELUM selesai — jangan menyatakan berhasil.

---

## 2. Aturan keras (tidak boleh dilanggar)

1. **Rahasia tidak boleh dikarang.** Password PostgreSQL, `SIMRS_API_KEY`, `NEXIA_RIS_SHARED_SECRET`,
   `GOOGLE_CLIENT_ID` harus diminta ke manusia. Kalau nilainya belum diberikan, lanjutkan langkah lain
   dan tandai langkah itu "MENUNGGU NILAI DARI MANUSIA".
2. **Jangan tampilkan nilai rahasia** di keluaran terminal, ringkasan, atau transkrip. Tulis nilai ke berkas
   dengan `sudo tee` / python, lalu `sudo chmod 600`, dan hapus berkas sementara setelah dipakai.
3. **Verifikasi arsip dulu.** `sha256sum -c SHA256.txt` harus mengeluarkan `OK` sebelum ekstraksi.
   Jangan ekstrak arsip yang hash-nya tidak cocok — laporkan dan berhenti.
4. **JANGAN pakai `--skip-build` pada instalasi pertama.** Arsip ini hanya berisi sumber (tanpa `dist` dan
   `node_modules`); melewati build menghasilkan halaman kosong.
5. **JANGAN pakai `--allow-invalid-license`** dan **JANGAN ubah `VEXA_LICENSE_ENFORCE=true`** kecuali manusia
   memerintahkan secara eksplisit.
6. **JANGAN menghapus** `/srv/vexadata`, `/var/lib/vexapacs`, `/etc/vexapacs`, atau database `vexaris_db` /
   `vexapacs_db`. Semua operasi bersifat menambah/memperbarui.
7. **Semua perintah yang mengubah sistem memakai `sudo`.** Jangan jalankan installer sebagai root langsung.
8. **Simpan keluaran setiap perintah ke berkas log** di `/var/tmp/vexa-install-<YYYYMMDD-HHMM>/` supaya bisa
   dibaca ulang: `komando 2>&1 | tee -a <log>`.
9. **Kalau sebuah perintah gagal: BERHENTI.** Jangan mengimprovisasi, jangan mengubah skrip, jangan melanjutkan
   ke fase berikutnya. Jalankan langkah diagnosis di bagian 9, laporkan, lalu tunggu manusia.
10. **Jangan menyentuh** berkas di `/opt/src/vexapacs-linux` setelah ekstraksi, kecuali berkas konfigurasi yang
    memang diminta diubah. Folder itu adalah sumber asli.
11. Jalankan perintah dari folder tempat instalasi, bukan dari `$HOME`. Jangan pakai `cd` relatif tanpa cek.
12. Kalau ada keluaran yang artinya tidak jelas, tempel 3-10 baris terakhirnya di laporan; jangan menafsir sendiri.

---

## 3. Fase 0 — pemeriksaan awal (read-only, tidak mengubah apa pun)

Jalankan dan catat hasilnya:

```
uname -a
cat /etc/os-release | head -5
nproc && free -h | head -2 && df -h / /srv 2>/dev/null
ping -c 3 1.1.1.1
sudo -v
ss -ltnp | grep -E ':(80|3001|5001|5656|5757|5992|5994|7771|8080|8898|8899)\b' || echo "port bersih"
ls -d /opt/vexapacs /etc/vexapacs 2>/dev/null || echo "belum ada instalasi sebelumnya"
```

Yang harus benar sebelum lanjut:
- Ada koneksi internet (paket `pacman`, `npm`, `pip` diunduh saat instalasi).
- Ruang disk untuk `/srv` minimal 50 GB bebas.
- Port di atas bebas (kalau tidak, laporkan port yang bentrok dan tunggu keputusan manusia).
- Kalau `/opt/vexapacs` sudah ada, catat `sudo systemctl list-units 'vexa-*' --all` sebelum apa pun,
  karena ini berarti pembaruan, bukan instalasi baru.

---

## 4. Fase 1 — siapkan sumber (self-check sebelum menyentuh sistem)

```
cd /opt/src
sudo tar xzf /tmp/vexapacs-linux-2026-09-23.tar.gz -C /opt/src/vexapacs-linux
cd /opt/src/vexapacs-linux
ls -1                      # harus ada: admin apps config docs installer scripts systemd
bash scripts/linux/selfcheck.sh
sudo bash installer/install.sh --dry-run
```

Penerimaan: `selfcheck.sh` harus diakhiri `Ringkasan: 0 FAIL`. Bila ada FAIL, berhenti dan laporkan baris FAIL-nya
(WARN boleh, catat saja). `--dry-run` hanya mencetak rencana; tidak boleh ada perubahan apa pun.

---

## 5. Fase 2 — isi konfigurasi (butuh nilai dari manusia)

Imbauan: isi `DB_PASSWORD` dan `PACS_DB_PASS` dengan nilai yang sama, karena keduanya menunjuk ke satu PostgreSQL lokal.

Kunci yang WAJIB diberi nilai nyata di `/etc/vexapacs/vexa.env`:

| Kunci | Isi dengan |
|---|---|
| `DB_PASSWORD`, `PACS_DB_PASS` | password PostgreSQL lokal (dari manusia) |
| `SIMRS_API_KEY` | API key integrasi SIMRS (dari manusia; kosongkan kalau SIMRS belum dipakai) |
| `SIMRS_ALLOWED_IPS` | IP server SIMRS yang diizinkan (dari manusia) |

Tentang `NEXIA_RIS_SHARED_SECRET` — **jangan asal mengisi**, ini jebakan yang bikin SEMUA halaman viewer error:

- Kunci itu dibaca **hanya oleh viewer** (5994 dan 5992). RIS sendiri mengirim panggilannya memakai
  `VEXA_DESKTOP_RIS_SHARED_SECRET` dan `VEXA_MOBILE_RIS_SHARED_SECRET`.
- **Default yang benar (dan yang kami sarankan):** biarkan ketiganya TIDAK diaktifkan di `vexa.env`
  (barisnya tetap berawalan `#`). Kedua sisi lalu memakai nilai bawaan yang sudah cocok.
- Kalau operator memang minta rahasia sendiri: isi **ketiga** kunci itu dengan nilai **sama persis**.
- **Dilarang** menulis baris kosong `NEXIA_RIS_SHARED_SECRET=` (ada, tapi tanpa nilai). Viewer lalu
  mengharapkan string kosong → setiap panggilan viewer↔RIS DITOLAK walaupun unit-nya `active`.
- Verifikasi: `sudo grep -n 'SHARED_SECRET' /etc/vexapacs/vexa.env` — kalau ada baris tanpa nilai,
  hapus atau beri `#` di depannya, lalu `sudo systemctl restart vexa-viewer vexa-viewer-mobile`.

Kunci yang **jangan diubah** tanpa perintah: `VEXA_LICENSE_ENFORCE=true`, `DICOMWEB_PACS_STORAGE_PATH=/srv/vexadata`,
`DICOMWEB_JPEG2000_DECODER_PYTHON=/opt/vexapacs/venv/bin/python`, seluruh nilai port.

Cara mengisi yang aman (contoh, ganti `<...>` dengan nilai dari manusia):

```
sudo python3 - <<'PY'
import pathlib
p = pathlib.Path('/etc/vexapacs/vexa.env')
t = p.read_text()
t = t.replace('DB_PASSWORD=GANTI_PASSWORD_POSTGRES', 'DB_PASSWORD=<POSTGRES>')
t = t.replace('PACS_DB_PASS=GANTI_PASSWORD_POSTGRES', 'PACS_DB_PASS=<POSTGRES>')
# JANGAN mengisi NEXIA_RIS_SHARED_SECRET di sini kecuali ketiga kunci SHARED_SECRET
# (NEXIA_/VEXA_DESKTOP_/VEXA_MOBILE_) diisi nilai yang sama persis (lihat catatan di atas).
t = t.replace('# SIMRS_API_KEY=', 'SIMRS_API_KEY=<KEY>')
p.write_text(t)
PY
sudo chmod 600 /etc/vexapacs/vexa.env
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '<POSTGRES>';"
sudo grep -c 'GANTI_PASSWORD_POSTGRES' /etc/vexapacs/vexa.env   # harus 0 setelah diisi
```

Kalau manusia belum menyerahkan nilainya, tulis placeholder-nya sebagai daftar tunggu di laporan; jangan mengarang.

---

## 6. Fase 3 — jalankan instalasi (fase pertama)

```
cd /opt/src/vexapacs-linux
sudo bash installer/install.sh --with-caddy 2>&1 | tee -a /var/tmp/vexa-install-*/fase3.log
```

Durasi wajar: 5-25 menit (paket + build frontend). Yang terjadi berurutan: paket `pacman` → user `vexa` +
folder `/opt/vexapacs`, `/var/lib/vexapacs`, `/var/log/vexapacs`, `/srv/vexadata` → salin aplikasi (isi `apps/`
diletakkan di **root** `/opt/vexapacs`) → venv Python → `npm ci` + `npm run build` → PostgreSQL + database
`vexaris_db`/`vexapacs_db` → tulis `/etc/vexapacs/vexa.env` → unit systemd di-`enable` → **berhenti karena
lisensi belum ada** dan membuat `/var/lib/vexapacs/install-request.json`.

Penerimaan fase ini: berkas `/var/lib/vexapacs/install-request.json` ada, dan pesan penutup installer menyebut
langkah lisensi. Kalau installer berhenti dengan galat lain, lihat bagian 9.

---

## 7. Fase 4 — lisensi (butuh manusia)

```
sudo cat /var/lib/vexapacs/install-request.json        # kirim isinya ke manusia/team lisensi
```

Setelah manusia menyerahkan `license.lic` dan `public.pem`:

```
sudo install -m 640 -o vexa -g vexa license.lic /var/lib/vexapacs/license.lic
sudo install -m 644 -o vexa -g vexa public.pem  /var/lib/vexapacs/public.pem
node /opt/vexapacs/scripts/license/verify-license.js \
     --license /var/lib/vexapacs/license.lic \
     --public-key /var/lib/vexapacs/public.pem
```

Harus keluar `HASIL: VALID ✓`. Kalau keluar `SIGNATURE_INVALID`, `LICENSE_EXPIRED`, `MACHINE_ID_MISMATCH`, atau
`MODULE_NOT_LICENSED` — berhenti, laporkan alasannya apa adanya, dan minta lisensi baru untuk machineId server ini.

Lalu fase kedua untuk menjalankan service:

```
cd /opt/src/vexapacs-linux
sudo bash installer/install.sh --skip-deps --skip-build --skip-db --start
```

---

## 8. Fase 5 — verifikasi akhir + format laporan

```
bash /opt/vexapacs/scripts/linux/services.sh status
systemctl list-units 'vexa-*' --all --no-pager | head -20
systemctl list-timers vexa-backup.timer --no-pager
curl -s -o /dev/null -w 'RIS      %{http_code}\n' http://127.0.0.1:3001/api/public/facility
curl -s -o /dev/null -w 'PACS     %{http_code}\n' 'http://127.0.0.1:5001/rs/studies?limit=1'
curl -s -o /dev/null -w 'VIEWER   %{http_code}\n' http://127.0.0.1:5994/
curl -s -o /dev/null -w 'MOBILE   %{http_code}\n' http://127.0.0.1:5992/
curl -s -o /dev/null -w 'ECG      %{http_code}\n' http://127.0.0.1:7771/
curl -s -o /dev/null -w 'ADMINWEB %{http_code}\n' http://127.0.0.1:8899/          # lewat Caddy: http://<IP>/adminVEXA
ss -ltnp | grep -E ':(5757|5656)\b'      # DIMSE + MWL menerima koneksi
sudo caddy validate --config /etc/caddy/Caddyfile
```

Laporan akhir wajib memuat, dalam bentuk daftar (tanpa basa-basi):
1. Versi OS + kernel + jumlah CPU/RAM (dari fase 0).
2. Status tiap unit `vexa-*` (satu baris per unit, apa adanya dari `systemctl is-active`).
3. Lima kode HTTP di atas.
4. Hasil `verify-license.js` (baris `HASIL: ...`).
5. Path berkas log lengkap per fase.
6. Daftar langkah yang MENUNGGU keputusan manusia (mis. nilai rahasia yang belum diisi).
7. Kalau ada yang gagal: perintah yang gagal + 10 baris keluaran terakhirnya. Jangan menafsirkan penyebab;
   sebutkan apa adanya.

---

## 9. Kalau gagal — peta diagnosis (berhenti dulu, jangan improvisasi)

| Gejala | Periksa | Tindakan |
|---|---|---|
| `pacman` gagal / paket tidak ketemu | `ping -c3 1.1.1.1`, `sudo pacman -Sy` | laporkan; kalau internet mati, tunggu |
| pip gagal pada wheel `imagecodecs`/`openjpeg` (Python 3.14) | `python3 -V` | ulangi dengan `--python-bin=/usr/bin/python3.12` |
| build `dicom-dimse-native` gagal | `pacman -Q base-devel cmake` | `sudo pacman -S --needed base-devel cmake` lalu ulangi |
| decoder J2K gagal saat gambar dibuka | `/opt/vexapacs/venv/bin/python -c "import openjpeg"` | harus sukses; kalau tidak, laporkan (env `DICOMWEB_JPEG2000_DECODER_PYTHON`) |
| halaman kosong / 404 di viewer | `ls /opt/vexapacs/VIEWER/dist/index.html` (atau `DESKTOP VIEWER/dist`) | berarti langkah build terlewat: jalankan ulang tanpa `--skip-build` |
| unit `failed` | `sudo journalctl -u <unit> -n 40 --no-pager` | laporkan 10 baris terakhir |
| `/adminVEXA` 404 | `sudo caddy validate --config /etc/caddy/Caddyfile`; `grep adminVEXA /etc/caddy/conf.d/vexapacs.caddy` | laporkan; jangan mengubah konfigurasi Caddy sendiri |
| storage tidak bisa ditulis | `sudo -u vexa touch /srv/vexadata/.t && sudo -u vexa rm /srv/vexadata/.t` | perbaiki kepemilikan `/srv/vexadata` ke `vexa:vexa` |
| viewer 5994/5992 unit `failed`, log memuat `ERR_MODULE_NOT_FOUND ... tools/runtime/cacheStore.mjs` | `ls /opt/vexapacs/tools/runtime` | paket lama: pakai **arsip koreksi**, lalu `sudo rsync -a /opt/src/vexapacs-linux/tools/ /opt/vexapacs/tools/ && sudo chown -R vexa:vexa /opt/vexapacs/tools && sudo systemctl restart vexa-viewer vexa-viewer-mobile` |
| halaman viewer error / diminta "use a RIS launch token" padahal unit `active` | `sudo grep -n SHARED_SECRET /etc/vexapacs/vexa.env` | hapus baris kosong, atau isi ketiga kunci dengan nilai sama, lalu restart viewer |
| tabel di RIS hanya menampilkan sedikit kolom / kolom hilang | `sudo -u vexa grep -n columnOrder /opt/vexapacs/RIS/frontend/dist/assets/*.js \| head -1` (memastikan build ada), lalu di browser tekan tombol **Columns → Reset** / bersihkan data situs untuk origin server itu | pilihan kolom disimpan di **localStorage browser**, bukan di server: profil browser yang pernah dipakai server lama bisa membawa preferensi kolom yang tidak cocok |
| lisensi ditolak | keluaran `verify-license.js` | minta lisensi baru untuk machineId server ini |
| port sudah dipakai proses lain | `ss -ltnp` sesuai daftar port | laporkan proses pemiliknya, tunggu keputusan manusia |

---

## 10. Yang TIDAK boleh kamu lakukan

- Mengubah `VEXA_LICENSE_ENFORCE`, menambal skrip installer, atau menambah paket di luar daftar installer.
- Menjalankan `uninstall.sh` tanpa perintah manusia.
- Mengaktifkan unit `vexa-lic-manager` (port 8898, hanya 127.0.0.1) kecuali manusia memutuskan skenario penerbitan
  lisensi di server ini; kalau diaktifkan, kunci privat harus disalin manual dan `chmod 600` (lihat
  `apps/lic-manager/KEYS-README.txt`).
- Melaporkan "sepertinya berhasil" tanpa kode HTTP/status unit.
- Menutup laporan tanpa menyebut langkah yang belum selesai.

---

## 11. Peta cepat berkas dan port (untuk referensi jawaban)

- Sumber: `/opt/src/vexapacs-linux` · Aplikasi: `/opt/vexapacs` · Config: `/etc/vexapacs/vexa.env`
- Data: `/var/lib/vexapacs` · Storage DICOM: `/srv/vexadata` · Log: `/var/log/vexapacs` (Windows: `C:\ProgramData\VEXAPACS`)
- Caddy: `/etc/caddy/Caddyfile` + `/etc/caddy/conf.d/vexapacs.caddy`
- Admin web: `http://<IP>/adminVEXA` (token di `/etc/vexapacs/admin.env`)
- Port: RIS 3001 · RIS frontend 8080 · PACS 5001 · DIMSE 5757 · MWL 5656 · Viewer 5994 · Mobile 5992 ·
  ECG 7771 · License manager 8898 (localhost) · Admin API 8899 (localhost) · Caddy 80/443
- Unit: `vexa-ris-backend`, `vexa-ris-frontend`, `vexa-pacs`, `vexa-mwl`, `vexa-viewer`, `vexa-viewer-mobile`,
  `vexa-ecg`, `vexa-admin`, `vexa-lic-manager`, `vexa-backup.service` + `vexa-backup.timer`
- Perkakas: `scripts/linux/selfcheck.sh`, `scripts/linux/services.sh status`, `scripts/linux/backup.sh`,
  `scripts/linux/restore.sh`, `scripts/license/verify-license.js`, `installer/uninstall.sh`
