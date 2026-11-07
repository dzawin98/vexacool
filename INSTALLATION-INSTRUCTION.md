# INSTALLATION INSTRUCTION — VEXAPACS-RIS di Coolify

Dokumen ini urutan kerja. Ikuti dari atas ke bawah. Setiap langkah punya perintah dan hasil
yang harus kamu lihat sebelum lanjut.

Referensi arsitektur dan alasan teknis: `deploy/coolify/COOLIFY.md`.
Yang dipakai Coolify: `docker-compose.coolify.yml` (root repo). Installer `.exe` **tidak** dipakai.

---

## 0. Yang harus sudah ada

| Kebutuhan | Besaran minimal | Catatan |
| --- | --- | --- |
| VM Linux | Ubuntu 24.04, 4 vCPU, 4 GB RAM, 40 GB sistem | 8 GB RAM kalau viewer dipakai bersamaan banyak orang |
| Disk data terpisah | ≥ 200 GB, bisa ditambah | untuk DICOM; mount di `/data` |
| Coolify | versi terbaru, sudah bisa login | install: `curl -fsSL https://cdn.coollabs.io/coolify/install.sh \| sudo bash` |
| Domain | 1 subdomain (mis. `vexa.contoh.id`) | + 1 lagi untuk ECG (opsional) |
| Akses firewall | 5757/tcp dan 5656/tcp dari subnet modalitas | jangan dibuka ke internet |

Cek cepat di VM:

```bash
docker --version && docker compose version
df -h /data
```

Kalau `/data` belum ada atau belum ter-mount ke disk besar, **berhenti di sini** dan selesaikan
mount-nya dulu. Memindahkan DICOM setelah produksi berjalan itu pekerjaan tambahan yang tidak perlu.

---

## 1. Siapkan folder data

```bash
sudo mkdir -p /data/vexa/{dicom,postgres,programdata,frame-cache,backups}
sudo chown -R 1000:1000 /data/vexa
sudo chmod -R 775 /data/vexa
```

Hasil yang benar: `ls -la /data/vexa` menampilkan 5 folder, tidak ada error permission.

Catatan: `/data/vexa/postgres` akan di-`chown` sendiri oleh image postgres saat pertama start.
Kalau nanti muncul `data directory has wrong ownership`, jalankan `sudo chown -R 999:999 /data/vexa/postgres`.

---

## 2. Clone repository di VM (opsional, untuk build manual)

Coolify bisa menarik repo langsung. Clone manual hanya perlu kalau kamu mau build/uji image
di VM lebih dulu:

```bash
git clone https://github.com/dzawin98/vexacool.git /opt/vexacool
cd /opt/vexacool
docker compose -f docker-compose.coolify.yml --env-file deploy/coolify/.env.example config >/dev/null && echo "compose OK"
```

Kalau `compose OK` tidak muncul, jangan lanjut — perbaiki dulu (biasanya variabel kurang di env).

---

## 3. Buat resource di Coolify

1. Login Coolify → **Projects** → **+ Add** → nama `VEXA`, environment `production`.
2. Di environment itu → **+ Add Resource** → **Docker Compose** (bukan "Application").
3. Pilih **Public Repository** → `https://github.com/dzawin98/vexacool.git`, branch `main`.
4. **Compose file path**: `docker-compose.coolify.yml`.
5. **Base directory**: `/` (kosongkan).
6. Jangan klik Deploy dulu — isi Environment Variables (langkah 4).

---

## 4. Environment Variables

Di tab **Environment Variables** resource tersebut, tambahkan (Buildtime tidak perlu dicentang):

| Variable | Nilai | Wajib |
| --- | --- | --- |
| `VEXA_DATA_ROOT` | `/data/vexa` | ya |
| `VEXA_LICENSE_ENFORCE` | `false` (uji) / `true` (produksi) | ya |
| `PACS_AE_TITLE` | `VEXA_PACS` | ya |
| `MWL_SCP_AET` | `NEXIARIS` | ya |
| `TZ` | `Asia/Jakarta` | ya |
| `PACS_DIMSE_PORT` | `5757` | ya |
| `MWL_SCP_PORT` | `5656` | ya |
| `DICOMWEB_J2K_WORKERS` | `2` | tidak (2 untuk 4 vCPU) |
| `DICOMWEB_FRAME_DISK_CACHE_MB` | `4096` | tidak |
| `VEXA_THIN_VOLUME_CACHE_MAX` | `2` | tidak |
| `VEXA_VIEWER_JOB_CONCURRENCY` | `2` | tidak |

**Jangan** menulis `SERVICE_PASSWORD_*` atau `SERVICE_FQDN_*`. Coolify membuatnya sendiri karena
variabel itu ada di compose. Kalau ditulis manual dengan nilai lemah, password DB jadi lemah.

---

## 5. Deploy pertama

Klik **Deploy**. Yang normal terjadi:

- 8 service dibuat: `postgres`, `pacs`, `mwl-scp`, `ris-api`, `ris-web`, `desktop-viewer`, `mobile-viewer`, `ecg-viewer`.
- Build 10–20 menit di 4 vCPU. Yang paling lama: `pacs` (kompilasi `dicom-dimse-native` + wheel
  python) dan `desktop-viewer` (bundle React ~4.5 MB).
- Log yang wajar: `Compressing`/`npm ci` panjang di awal, lalu `Listening on 5001` (pacs),
  `RIS backend listening` (ris-api), `viewer server` (5994/5992).

Berhenti dan perbaiki kalau:
- `node-gyp` gagal di `dicom-dimse-native` → image `pacs` tidak dapat toolchain. Pastikan build
  memakai `deploy/docker/pacs.Dockerfile` (bukan Dockerfile lama).
- `ERR_MODULE_NOT_FOUND ... cacheStore.mjs` → `tools/` tidak ikut ke image. Ini hanya mematikan
  viewer, RIS tetap jalan — jangan salah diagnosa.

Cek status semua container:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -i vexa
```

---

## 6. Pasang domain

1. Coolify → resource → service **`ris-web`** → tab **Domains** → isi `https://vexa.contoh.id`.
2. Tunggu Traefik menerbitkan sertifikat (± 30 detik, status hijau).
3. (Opsional) service **`ecg-viewer`** → domain sendiri, mis. `https://ecg.contoh.id`.
   ECG tidak punya prefix `/ecg`, jadi jangan dipaksa satu domain dengan RIS.

Semua URL lain memakai domain RIS:
`/` RIS · `/api/*` backend · `/rs/*` PACS · `/viewer/` viewer diagnostik · `/mobile/` viewer mobile.

---

## 7. Buka port DICOM

Coolify tidak mem-proxy DIMSE/MWL. Port dipublish langsung oleh Docker:

```bash
sudo ufw allow from 192.168.19.0/24 to any port 5757 proto tcp
sudo ufw allow from 192.168.19.0/24 to any port 5656 proto tcp
sudo ufw status | grep -E '5757|5656'
```

Ganti `192.168.19.0/24` dengan subnet modalitas kamu.

---

## 8. Konfigurasi awal di dalam container

### 8.1 Backup config (wajib sebelum task backup dipakai)

```bash
docker compose -f docker-compose.coolify.yml exec ris-api bash -lc 'cat > /data/programdata/backup.config.json <<EOF
{
  "backupRoot": "/data/backups",
  "dataPath": "/data/dicom",
  "programDataPath": "/data/programdata",
  "includeDicomData": true,
  "includeProgramData": true,
  "postgres": {
    "host": "postgres", "port": 5432, "user": "postgres",
    "password": "ISI_SERVICE_PASSWORD_POSTGRES",
    "risDb": "vexaris_db", "pacsDb": "velopacs_db"
  },
  "services": [],
  "retention": { "keepLast": 7 },
  "schedule": { "enabled": true, "frequency": "daily", "time": "23:00" },
  "quiesceServices": false
}
EOF'
```

Password diambil dari Coolify → Environment Variables → `SERVICE_PASSWORD_POSTGRES`.

Uji sekali (harus muncul `[PROGRESS] 100 Selesai`):

```bash
docker compose exec ris-api bash /app/scripts/linux/backup.sh --config /data/programdata/backup.config.json --no-stop-services --skip-dicom
ls -la /data/vexa/backups
```

### 8.2 Jadwalkan backup

Coolify → ris-api → **Scheduled Tasks** → **+ Add**:

```
Name:     daily-backup
Command:  bash /app/scripts/linux/backup.sh --config /data/programdata/backup.config.json --no-stop-services
Frequency: 0 23 * * *
```

Jangan pakai `--quiesce` (memanggil `systemctl`, gagal di container).

### 8.3 Lisensi (produksi)

`VEXA_LICENSE_ENFORCE=false` hanya untuk uji. Sebelum produksi baca `deploy/coolify/COOLIFY.md` §7:
machineId container berubah setiap redeploy, jadi lisensi Windows/Linux-host tidak otomatis valid.
Pilihan: (a) lisensi per container dengan `hostname`+`mac_address` dipatok, atau (b) tambahkan
`VEXA_MACHINE_ID_SEED` di `scripts/license/licenseCore.js` (disarankan, satu lisensi untuk stack).

---

## 9. Verifikasi — 4 langkah yang membuktikan stack benar

```bash
D=https://vexa.contoh.id

curl -fsS $D/healthz                          # ok
curl -fsS $D/api/system/health                # JSON, "status":"ok"
curl -fsS -H 'Accept: application/dicom+json' "$D/rs/studies?limit=1"   # JSON array
curl -s -o /dev/null -w 'viewer:%{http_code}\n' $D/viewer/
curl -s -o /dev/null -w 'mobile:%{http_code}\n' $D/mobile/
```

Lalu alur nyata (ini yang menentukan, bukan health check):

1. Buat order pemeriksaan di RIS.
2. Modalitas ambil worklist dari `IP-VM:5656`, AE `NEXIARIS`.
3. Modalitas kirim C-STORE ke `IP-VM:5757`, AE `VEXA_PACS`.
4. Dari RIS, klik buka viewer → gambar tampil, MPR jalan.
5. Panel backup di RIS menampilkan jadwal aktif.

Cek DIMSE langsung (kalau ada dcmtk di mesin lain):

```bash
echoscu -aet TEST -aec VEXA_PACS <IP-VM> 5757
findscu -aet TEST -aec NEXIARIS -W <IP-VM> 5656 -k "(0008,0050)="
```

---

## 10. Menambah storage DICOM nanti

Path di container **tidak pernah berubah** (`/data/dicom`). Yang berubah hanya isi
`/data/vexa/dicom`:

```bash
# disk sama, filesystem bisa membesar (LVM)
sudo lvextend -l +100%FREE /dev/vg0/vexa-data
sudo xfs_growfs /data            # ext4: sudo resize2fs /dev/vg0/vexa-data
df -h /data
```

Pindah disk: `rsync -aHAX /data/vexa/ /mnt/disk2/vexa/` → ubah `VEXA_DATA_ROOT` → Redeploy.
Jangan mengubah `DICOM_STORAGE_PATH` di compose: akar storage baru = seluruh studi lama hilang dari
daftar (file ada, QIDO kosong).

---

## 11. Update / rollback

- **Update**: Push ke `main` → Coolify → **Redeploy**. Data tidak tersentuh (semua state di
  `/data/vexa`). Jangan pernah `docker compose down -v`.
- **Rollback**: Coolify menyimpan deployment sebelumnya → **Deployments** → pilih yang lama →
  **Redeploy**. Butuh < 1 menit karena image sudah ada.

---

## 12. Troubleshooting

| Gejala | Sebab | Aksi |
| --- | --- | --- |
| `ris-web` 502 | `ris-api` belum siap / crash | `docker logs <ris-api>`; kalau `ECONNREFUSED postgres`, cek `postgres` healthy |
| Viewer 200 tapi halaman "can only be used with an integrated system" | prefix `/viewer` di-strip dua kali | pastikan `ris.conf` versi repo ini (`proxy_pass http://desktop-viewer:5994;` tanpa URI) |
| Semua panggilan RIS→viewer ditolak | `NEXIA_RIS_SHARED_SECRET=` kosong | hapus variabelnya; default kedua sisi sudah cocok |
| Render/thumbnail HTTP 500 `spawn python ENOENT` | decoder python salah | `docker exec <pacs> /opt/venv/bin/python -c "import openjpeg"` harus sukses |
| QIDO kosong padahal file ada | path storage berubah | `docker exec <pacs> env \| grep DICOM` → harus `/data/dicom`; lalu `POST /internal/metadata/sync` |
| Task backup gagal `pg_dump: not found` | image lama tanpa client | pakai `deploy/docker/ris-backend.Dockerfile` versi ini |
| Modalitas tidak bisa C-STORE | port 5757 tidak terbuka | `sudo ss -lntp \| grep 5757` di VM; cek ufw |
| Container restart loop dengan `MACHINE_ID_MISMATCH` | lisensi vs hostname/MAC container | set `VEXA_LICENSE_ENFORCE=false` sementara, lalu ikuti §8.3 |
| Build context > 1 GB / lambat | `.dockerignore` hilang | pastikan `.dockerignore` ada di root repo |

Untuk melihat semua log sekaligus:

```bash
cd /opt/vexacool && docker compose -f docker-compose.coolify.yml logs -f --tail=100
```

---

## 13. Checklist selesai

- [ ] `docker ps` menunjukkan 8 container `Up`
- [ ] `https://<domain>/healthz` = `ok`
- [ ] `/api/system/health` = ok, `/rs/studies` mengembalikan JSON
- [ ] `/viewer/` dan `/mobile/` = 200
- [ ] C-ECHO ke 5757 sukses, C-FIND ke 5656 mengembalikan worklist
- [ ] Order RIS → MWL → C-STORE → viewer tampil gambar + MPR
- [ ] Scheduled Task backup ada dan satu run manual sukses
- [ ] `/data/vexa` berada di disk data (bukan disk sistem)
- [ ] Keputusan lisensi sudah diambil (§8.3)
