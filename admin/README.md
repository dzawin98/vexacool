# VEXA Admin (Linux)

Pengganti `VexaServiceMonitor.exe` (Windows Forms) — satu halaman web tanpa dependensi npm.

## Kenapa bukan port C#-nya

Utility Windows itu membaca status service, storage, ukuran DB, backup, lisensi, dan config
integrasi. Semua sumber data itu sudah ada di Linux: **systemd** (status/kontrol service),
**df + psql** (storage & ukuran database), **API RIS** (`/api/system/*`, `/api/dicom/*`),
dan file lisensi. Jadi yang dibutuhkan hanya perantara kecil, bukan aplikasi desktop baru.

## Menjalankan

```bash
sudo mkdir -p /etc/vexapacs
echo 'VEXA_ADMIN_TOKEN=ganti-token-panjang' | sudo tee /etc/vexapacs/admin.env
sudo -u vexa env $(cat /etc/vexapacs/admin.env) node /opt/vexapacs/admin/server.js
# buka http://IP-SERVER/adminVEXA  lalu isi token di kanan atas
```

Akses resmi adalah lewat Caddy: **http://IP-SERVER/adminVEXA** (unit systemd membatasi listen ke
`127.0.0.1:8899`, Caddy yang meneruskan). Halaman memakai path API relatif, jadi tetap benar baik
diakses di bawah `/adminVEXA/` maupun langsung di `http://IP:8899` (mis. lewat SSH tunnel:
`ssh -L 8899:127.0.0.1:8899 server`).

Sebagai service: unit `vexa-admin.service` + polkit rule `50-vexa-admin.rules` (agar user `vexa`
boleh start/stop unit `vexa-*` dari halaman admin). Route Caddy: `handle_path /adminVEXA/*`
di `systemd/Caddyfile` (menghapus prefix sebelum diteruskan ke 8899). Batasi akses dari LAN saja
(port 8899 jangan dibuka ke internet; taruh di belakang Caddy kalau perlu HTTPS).

## Endpoint

| Endpoint | Isi |
|---|---|
| `GET /api/status` | status semua unit + pemakaian disk |
| `POST /api/service/<unit>/<start|stop|restart>` | kontrol service via systemctl |
| `GET /api/metrics` | storage, ukuran DB, daftar backup, stats PACS, health RIS |
| `GET /api/logs/<unit>?lines=200` | ekor log `/var/log/vexapacs/<unit>.*.log` |
| `POST /api/backup/run` | `systemctl start --wait vexa-backup.service` (root, via polkit) |
| `GET /api/backup/status` | jadwal berikutnya dari `vexa-backup.timer` |
| `GET /api/license` | isi lisensi + verifikasi tanda tangan Ed25519 + status kedaluwarsa |
| `GET /api/ris/*` | proxy ke API RIS 3001 (dengan role administrator) |

## Yang belum ada dibanding utility Windows

- **Tab DICOM Config + firewall**: pindahkan ke settings RIS/viewer atau `ufw` (lihat docs/PORTING-NOTES.md).
- **Export PDF System Monitor**: bisa ditambahkan kemudian (data sudah tersedia di `/api/metrics`).
- **WhatsApp/Waha & SIMRS viewer links**: konfigurasinya tetap lewat API RIS (endpoint sudah ada),
  belum dibuatkan form di halaman ini.
