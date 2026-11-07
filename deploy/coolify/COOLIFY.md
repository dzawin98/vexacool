# VEXAPACS-RIS di Coolify — panduan implementasi

Installer Windows (`VEXAPACS-RIS-Setup.exe`) **tidak dipakai** di Coolify. Yang dipakai adalah
salinan Linux (`D:\VEXA-LINUX`) yang dibungkus image Docker, dijalankan sebagai satu resource
**Docker Compose** di Coolify. Installer `.exe` tetap hidup untuk server Windows; dua jalur ini
tidak saling mengganggu.

## 1. Bentuk akhirnya

```
                    ┌─────────────── VM Linux + Coolify ───────────────┐
  browser ──HTTPS──▶│ Traefik ─▶ ris-web (nginx :80)                   │
                    │              ├─ /api/*     ─▶ ris-api    :3001    │
                    │              ├─ /rs/*      ─▶ pacs       :5001    │
                    │              ├─ /viewer/*  ─▶ desktop-viewer:5994 │
                    │              └─ /mobile/*  ─▶ mobile-viewer:5992  │
  modalitas ──TCP──▶│ host:5757 ──▶ pacs (DIMSE C-STORE)               │
  modalitas ──TCP──▶│ host:5656 ──▶ mwl-scp (MWL C-FIND)               │
                    │ postgres :5432 (internal)                        │
                    └──────────────────────────────────────────────────┘
```

Satu domain publik untuk RIS **dan** kedua viewer. Ini bukan pilihan kosmetik: launch token
RIS→viewer memakai cookie/session satu origin, dan `detectRuntimeBasePath()` di kedua SPA memang
mendeteksi segmen `/viewer` dan `/mobile`. Memisahkan viewer ke domain lain mengembalikan bug
"Viewer can only be used with an integrated system" yang sudah pernah memakan waktu.

Dua port **tidak** lewat reverse proxy dan tidak bisa: 5757 (DIMSE) dan 5656 (MWL). Keduanya
TCP mentah yang dipublish ke host — Traefik hanya bicara HTTP.

## 2. Berkas yang dipakai

| Berkas | Isi |
| --- | --- |
| `docker-compose.coolify.yml` | 8 service: postgres, pacs, mwl-scp, ris-api, ris-web, desktop-viewer, mobile-viewer, ecg-viewer |
| `.dockerignore` | mengecualikan node_modules/dist/DATA/*.exe supaya build context tidak ikut 2 GB |
| `deploy/docker/pacs.Dockerfile` | PACS + venv python (pylibjpeg-openjpeg, imagecodecs) + toolchain `dicom-dimse-native` |
| `deploy/docker/ris-backend.Dockerfile` | RIS API + `postgresql-client`/`jq` (dipakai task backup) |
| `deploy/docker/ris-frontend.Dockerfile` | SPA RIS → nginx |
| `deploy/docker/desktop-viewer.Dockerfile` | build SPA lalu jalankan **DESKTOP VIEWER SSR** (5994), bukan shell 5991 |
| `deploy/docker/mobile-viewer.Dockerfile` | SPA + server 5992 |
| `deploy/docker/mwl-scp.Dockerfile` | service python `nexia_mwl_scp.py` |
| `deploy/docker/ecg-viewer.Dockerfile` | ECG viewer 7771 |
| `deploy/nginx/ris.conf` | gateway: /api, /rs, /dicom-web, /viewer/, /mobile/ (prefix TIDAK di-strip) |
| `deploy/coolify/.env.example` | daftar variabel; nilai `SERVICE_PASSWORD_*` diisi Coolify |

## 3. Deploy pertama

1. VM Linux (Ubuntu 24.04 cukup), Docker + Coolify terpasang, **disk data terpisah** untuk DICOM.
2. Coolify → Project → Environment → **+ New Resource → Docker Compose**.
3. Repository: repo ini. Compose file: `docker-compose.coolify.yml`.
4. Tab **Environment Variables**, isi:
   - `VEXA_DATA_ROOT=/data/vexa` (atau path disk data, lihat §4)
   - `VEXA_LICENSE_ENFORCE=false` untuk uji pertama
   - `PACS_AE_TITLE`, `MWL_SCP_AET`, `TZ`
   - `DIMSE_PORT`/`MWL_SCP_PORT` bila 5757/5656 sudah dipakai hal lain
5. Deploy. Build pertama lama (PACS mengompilasi `dicom-dimse-native` + install python wheel;
   viewer mengompilasi bundle React). Perkirakan 10–20 menit di VM 4 vCPU.
6. Service `ris-web` → isi **Domains** (mis. `vexa.contoh.id`). Coolify mengisi
   `SERVICE_FQDN_RISWEB_80` otomatis.
7. Service `ecg-viewer` butuh domain sendiri (server ECG tidak punya prefix `/ecg`).
8. Buka firewall VM: **5757/tcp** dan **5656/tcp** dari subnet modalitas saja. Jangan buka ke internet.
9. Arahkan modalitas: AE Title `VEXA_PACS` (default), host = IP VM, port 5757.
   MWL: AE Title `NEXIARIS`, port 5656.

## 4. Menambah/membesarkan storage DICOM

Aturan tunggal: **path di dalam container tidak pernah berubah** (`/data/dicom`). Yang berubah
adalah apa yang di-mount ke `$VEXA_DATA_ROOT/dicom` di host. Ini menghapus jebakan terbesar
installer Windows, di mana mengganti path storage membuat file lama "yatim" (file ada, QIDO kosong).

Tiga pola, pilih sesuai kondisi:

**a. Satu disk, filesystem masih bisa membesar (LVM — disarankan)**
```bash
# tambah vdisk/partisi baru ke volume group, lalu:
lvextend -l +100%FREE /dev/vg0/vexa-data
xfs_growfs /data/vexa            # ext4: resize2fs /dev/vg0/vexa-data
df -h /data/vexa
```
Container tidak perlu di-restart; PACS langsung melihat ruang baru.

**b. Pindah ke disk baru**
```bash
systemctl stop docker        # atau: coolify stop resource
rsync -aHAX --info=progress2 /data/vexa/ /mnt/disk2/vexa/
# ubah VEXA_DATA_ROOT=/mnt/disk2/vexa di Coolify, lalu Redeploy
```
Wajib: `rsync` sebelum container hidup lagi, dan `chown -R 999:999` untuk folder `postgres`
kalau user postgres di image berbeda.

**c. NAS (NFS) — untuk arsip, bukan untuk hot tier**
```
# /etc/fstab
nas:/volume1/vexa /data/vexa nfs4 defaults,_netdev,hard,timeo=600 0 0
```
Jangan taruh `postgres/` di NFS (fsync lambat → DB korup saat listrik putus). Pisahkan:
`VEXA_DATA_ROOT` tetap lokal, DICOM saja yang NFS. Untuk itu ubah dua baris volume di compose:
`${VEXA_DATA_ROOT}/dicom:/data/dicom` → `${DICOM_NFS_ROOT}:/data/dicom`.

Yang **jangan** dilakukan: mengubah `DICOM_STORAGE_PATH` di dalam container ke path baru.
Metadata PACS menyimpan path relatif ke akar storage; akar baru = semua studi lama hilang dari
daftar meski filenya masih ada.

Indexing tidak perlu manual: `syncPacsMetadataFromStorage()` berjalan otomatis (TTL 60 s) dan
setelah tiap C-STORE. Untuk migrasi massal ada `POST /internal/metadata/sync` (loopback saja).

## 5. Utility service (Vexa System Utility)

Di Windows: `VexaServiceMonitor.exe`. Di Linux: `admin/server.js` (port 8899) — **tetap tidak
bisa dipakai apa adanya di Coolify**, karena seluruh aksinya memanggil `systemctl`
(`systemctl show`, `start`, `stop`, `start --wait vexa-backup.service`). Di dalam container tidak
ada systemd.

Tiga opsi, urut dari termurah:

1. **Tidak dipakai (disarankan untuk fase 1).** Fungsi yang benar-benar dipakai sehari-hari sudah
   ada di Coolify: start/stop/restart per service, lihat log, redeploy, terminal. Tombol
   "Sinkron seluruh data" bisa dipanggil langsung:
   ```bash
   docker compose exec ris-api curl -fsS -X POST http://127.0.0.1:3001/api/system/sync/all
   ```
   Endpoint itu loopback-only, jadi harus dari dalam container — bukan dari browser.
2. **Admin versi docker.** Tambah `dockerode` di `admin/server.js`, ganti `sh('systemctl', ...)`
   menjadi operasi container (`restart`, `inspect`, `logs`). Butuh mount
   `/var/run/docker.sock:/var/run/docker.sock` — artinya container admin setara root di host.
   Hanya kalau admin web benar-benar dibutuhkan operator.
3. **Coolify API.** Admin jadi thin client ke REST Coolify (`/api/v1/applications/{uuid}/restart`).
   Paling aman (tidak menyentuh socket docker), tapi butuh token API Coolify dan menambah kode.

## 6. Backup

`scripts/linux/backup.sh` sudah benar (pg_dump kedua DB + tar DICOM + rotasi `keepLast`). Yang
hilang di Docker hanyalah **penjadwalnya** (`vexa-backup.timer`). Gantinya: **Coolify Scheduled
Task** pada service `ris-api` (image-nya sudah membawa `pg_dump`, `jq`, `tar`).

Buat file `/data/vexa/programdata/backup.config.json` (contoh ada di
`config/backup.config.linux.sample.json`) dengan path **di dalam container**:

```json
{
  "backupRoot": "/data/backups",
  "dataPath": "/data/dicom",
  "programDataPath": "/data/programdata",
  "includeDicomData": true,
  "includeProgramData": true,
  "postgres": {
    "host": "postgres", "port": 5432, "user": "postgres",
    "password": "<SERVICE_PASSWORD_POSTGRES>",
    "risDb": "vexaris_db", "pacsDb": "velopacs_db"
  },
  "services": [],
  "retention": { "keepLast": 7 },
  "schedule": { "enabled": true, "frequency": "daily", "time": "23:00" },
  "quiesceServices": false
}
```

Volume `${VEXA_DATA_ROOT}/backups:/data/backups` sudah ter-mount di `ris-api`. Lalu
Coolify → ris-api → **Scheduled Tasks**:

```
0 23 * * *   bash /app/scripts/linux/backup.sh --config /data/programdata/backup.config.json --no-stop-services
```

Catatan:
- `--no-stop-services` wajib; `--quiesce` memanggil `systemctl` dan akan gagal.
- `pg_dump` konsisten tanpa stop service; DICOM di-tar saat hidup (risiko: file yang sedang
  ditulis bisa terpotong — untuk arsip jangka panjang pakai snapshot LVM/ZFS atau
  `rsync` incremental ke NAS).
- Jangan simpan backup di disk yang sama dengan DICOM. Untuk off-site: mount NFS/S3 ke
  `/data/backups` dan biarkan `keepLast` mengurus rotasi.
- Restore: `scripts/linux/restore.sh` sama seperti di server systemd, jalankan lewat
  `docker compose exec ris-api bash /app/scripts/linux/restore.sh --config ...`.

## 7. Lisensi — ini yang akan menggigit

`scripts/license/licenseCore.js` menghitung `machineId` dari
`hostname + platform + arch + cpuModel + MAC[]`. Di container, **hostname = container ID** dan
**MAC berubah tiap container dibuat ulang**. Konsekuensinya, dengan `VEXA_LICENSE_ENFORCE=true`:

- setiap service yang memverifikasi lisensi (PACS, RIS, kedua viewer, ECG) melihat machineId
  berbeda-beda;
- setiap redeploy menghasilkan machineId baru → semua service menolak start.

Dua jalan:

**a. Uji coba / fase 1** — `VEXA_LICENSE_ENFORCE=false` (default compose). Cepat, tapi bukan
produksi.

**b. Produksi, tanpa ubah kode** — terbitkan **lisensi per container** (5 buah) dengan
`hostname` dan `mac_address` dipatok di compose:

```yaml
  pacs:
    hostname: vexa-pacs
    mac_address: "02:42:ac:11:00:11"
```

Syarat: MAC harus unik per container di network yang sama, dan nilai `hostname`/MAC yang dipakai
menerbitkan lisensi harus persis sama dengan yang ada di container. Ini rapuh — satu redeploy
dengan MAC berbeda = mati.

**c. Produksi, disarankan — satu perubahan kecil di kode.** Tambahkan override di
`getMachineFingerprintParts()`:

```js
const seed = process.env.VEXA_MACHINE_ID_SEED;
if (seed) return { machineGuid: '', hostname: 'vexa', platform: process.platform,
                   arch: process.arch, cpuModel: '', macs: [seed] };
```

lalu isi `VEXA_MACHINE_ID_SEED` dari satu variabel Coolify yang sama untuk semua service.
Satu lisensi untuk seluruh stack, tahan redeploy, dan tidak bergantung pada MAC container.
Perubahan 4 baris, nol efek di Windows (env tidak diset → perilaku lama).

## 8. Kenapa ini lebih hemat dari VM Windows

Yang hilang saat pindah ke container bukan "Windows"-nya, tapi idle overhead-nya:

| | VM Windows (sekarang) | Stack Coolify |
| --- | --- | --- |
| OS | Windows Server + antivirus + update | image Debian slim per service |
| Service manager | 7 service NSSM (masing-masing proses `nssm.exe` + wrapper) | 8 container, `tini` sebagai PID 1 |
| Runtime | 1 Node per service + Python global | Node per service + venv python hanya di PACS |
| Isolasi | semua di satu OS, satu disk | batas memori/CPU per container (bisa di-set di compose) |

Angka yang bisa dipakai untuk merencanakan VM (perkiraan; **ukur sendiri** dengan `docker stats`
setelah jalan karena RSS viewer/PACS sangat tergantung ukuran studi):

```
pacs            ~250–500 MB   (+ ~60 MB per J2K worker)
ris-api         ~150–250 MB
ris-web (nginx) ~10 MB
postgres        ~100–300 MB   (shared_buffers default 128 MB)
desktop-viewer  ~120–200 MB
mobile-viewer   ~80–120 MB
ecg-viewer      ~60–90 MB
mwl-scp         ~60–80 MB
──────────────────────────────
idle total      ~0.9–1.6 GB → VM 4 GB cukup, 8 GB nyaman
```

Perubahan terbesar bukan RAM, tapi:
- rebuild/deploy per service, bukan reinstall seluruh produk;
- rollback = pilih image sebelumnya di Coolify (detik, bukan menit);
- `frame-cache` dan DICOM bisa ditaruh di disk/NAS berbeda tanpa mengubah aplikasi;
- log per container; tidak ada lagi `nssm` yang harus di-RDP untuk restart.

Yang **tidak** lebih hemat: PACS tetap satu proses Node dengan CPU-bound decode. Kalau studi
multi-frame besar, CPU (bukan RAM) yang jadi batas — atur `DICOMWEB_J2K_WORKERS=2` untuk VM
4 vCPU, dan batasi `deploy.resources.limits` bila perlu.

## 9. Verifikasi setelah deploy

```bash
# dari VM
curl -fsS https://<domain>/healthz                       # ok
curl -fsS https://<domain>/api/system/health              # JSON RIS
curl -fsS -H 'Accept: application/dicom+json' \
     'https://<domain>/rs/studies?limit=1'                # QIDO PACS
curl -fsS -o /dev/null -w '%{http_code}\n' https://<domain>/viewer/   # 200
curl -fsS -o /dev/null -w '%{http_code}\n' https://<domain>/mobile/   # 200

# DIMSE dari mesin lain
echoscu -aet TEST -aec VEXA_PACS <IP-VM> 5757             # C-ECHO harus sukses
findscu -aet TEST -aec NEXIARIS -W <IP-VM> 5656 -k "(0008,0050)="  # MWL
```

Lalu uji alur nyata: buat order di RIS → modalitas ambil MWL → kirim C-STORE → buka viewer dari
RIS. Empat langkah itu yang membuktikan stack-nya benar, bukan health check.

## 10. Jebakan yang sudah diketahui

- **Jangan pakai `DESKTOP VIEWER` (ports 5991) untuk produksi.** Yang punya MPR/SSR adalah
  `DESKTOP VIEWER SSR` (5994). Dockerfile lama menjalankan 5991 → MPR hilang tanpa error.
- **`tools/runtime/*.mjs` wajib ikut ke root image `/app/tools`.** Kalau tidak, hanya viewer yang
  mati (`ERR_MODULE_NOT_FOUND cacheStore.mjs`) sementara RIS/PACS normal — gejalanya menyesatkan.
- **Jangan isi `NEXIA_RIS_SHARED_SECRET=` (kosong).** `??` hanya jatuh ke default kalau
  `undefined`; nilai kosong membuat semua panggilan RIS→viewer ditolak. Biarkan tidak diisi.
- **Prefix `/viewer` dan `/mobile` jangan di-strip di nginx.** Server viewer melakukan strip
  sendiri; strip dua kali → 404 di semua aset.
- **`dicom-dimse-native` butuh toolchain saat build.** Tanpa `make g++ cmake git python3` image
  gagal di `node-gyp`, bukan saat runtime.
- **PACS render/thumbnail 500 "spawn python ENOENT"** = `DICOMWEB_JPEG2000_DECODER_PYTHON` salah
  atau venv tidak punya `pylibjpeg-openjpeg`. Compose sudah menunjuk `/opt/venv/bin/python`.
- **Build context 2 GB** kalau `.dockerignore` hilang — build jadi lambat dan disk VM penuh.
- **ECG viewer tidak punya prefix `/ecg`.** Kalau dipaksa satu domain, harus rewrite path; lebih
  murah beri subdomain sendiri.
- **Redeploy ≠ data hilang.** Semua state ada di `${VEXA_DATA_ROOT}` (bind mount). Tapi
  `docker compose down -v` pada volume bernama akan menghapusnya — jangan pakai `-v`.

## 11. Status yang sudah & belum diverifikasi

Sudah (statis, di mesin dev ini):
- `docker-compose.coolify.yml` valid YAML, 8 service terdefinisi;
- setiap `COPY` di 7 Dockerfile menunjuk path yang benar-benar ada di repo (layout `apps/...`);
- bind mount dan file pendukung (`ris.conf`, `init-velopacs-db.sql`) ada.

Belum (butuh daemon Docker / VM):
- `docker compose config`, build image, dan run end-to-end;
- angka RSS/CPU nyata di `docker stats`;
- C-ECHO/C-FIND dari modalitas.

Jalankan `docker compose -f docker-compose.coolify.yml --env-file deploy/coolify/.env.example config`
di VM sebagai cek pertama sebelum deploy lewat UI.
