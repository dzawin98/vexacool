# Deploy VEXA di Coolify

Panduan lengkap: **[COOLIFY.md](COOLIFY.md)**.

Ringkas:

- Compose yang dipakai: `docker-compose.coolify.yml` di root repo (bukan berkas di folder ini).
- Satu domain publik (`ris-web`, nginx) melayani RIS + `/viewer/` + `/mobile/`;
  ECG butuh domain sendiri; PACS DICOMweb tetap internal.
- Hanya dua port yang dibuka ke host: `5757` (DIMSE C-STORE) dan `5656` (MWL) — keduanya TCP
  mentah, tidak lewat reverse proxy.
- Semua state di `${VEXA_DATA_ROOT}`: `dicom/`, `postgres/`, `programdata/`, `frame-cache/`,
  `backups/`.
- Nilai `SERVICE_PASSWORD_*` dan `SERVICE_FQDN_RISWEB_80` diisi otomatis oleh Coolify;
  jangan ditulis manual di UI.
- `VEXA_LICENSE_ENFORCE=false` hanya untuk uji. Produksi: lihat COOLIFY.md §7 (machineId
  container berubah tiap redeploy — ini blocker nomor satu).
- Utility service (admin 8899) memanggil `systemctl` sehingga tidak jalan di container;
  COOLIFY.md §5 berisi tiga opsi penggantinya.
- Penjadwal backup diganti Coolify Scheduled Task; COOLIFY.md §6 berisi config dan cron-nya.

Validasi lokal sebelum deploy:

```bash
docker compose -f docker-compose.coolify.yml --env-file deploy/coolify/.env.example config
```
