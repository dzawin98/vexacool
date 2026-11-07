# License Manager di Linux (pengganti `D:\VEXAlicmanager`)

Aplikasi yang sama (Express + better-sqlite3) dipakai apa adanya — hanya satu baris yang diubah:
`app.listen(PORT, HOST)` supaya bisa dibatasi ke localhost. Tidak ada porting lain.

## Menjalankan

```bash
sudo systemctl enable --now vexa-lic-manager
systemctl status vexa-lic-manager
```

Port **8898**, listen **127.0.0.1** (internal). Cara mengakses dari PC operator:

- **Default (paling aman, tanpa firewall/Caddy)**: `ssh -L 8898:127.0.0.1:8898 user@IP-SERVER`
  lalu buka `http://localhost:8898`.
- **Kalau perlu dari browser LAN**: aktifkan blok opt-in di `/etc/caddy/conf.d/` (lihat komentar di
  `systemd/Caddyfile`) — harus host/port sendiri, bukan sub-path, karena halaman aplikasi memakai
  path absolut `/api/*`, `/js/*`.

## Login

Seed default dari `db/database.js`: user **admin**, password **`VexaTeam12@#`** — ganti segera
setelah login pertama (menu user di aplikasi).

## Kunci dan data

| Hal | Lokasi di Linux |
|---|---|
| kunci publik | `/opt/vexapacs/apps/lic-manager/keys/public.pem` (ikut tersalin) |
| kunci privat | `/opt/vexapacs/apps/lic-manager/keys/private.pem` — **salin manual**, `chmod 600 chown root:root` |
| database SQLite | `/var/lib/vexapacs/lic-manager/license.db` (dibuat otomatis dari `db/schema.sql`) |
| lisensi terbit | `/var/lib/vexapacs/lic-manager/issued/` |

`keys/private.pem` **tidak** disalin otomatis ke folder ini (lihat `KEYS-README.txt`). Kalau
penerbitan lisensi tetap dilakukan di mesin Windows, server Linux tidak perlu kunci privat —
cukup terima `license.lic`.

## Alur yang dipakai server Linux

1. Di server Linux: `node /opt/vexapacs/scripts/license/license-cli.js install-request --out /tmp/install-request.json`
   (menghasilkan `machineId` server ini).
2. Upload file itu di halaman License Manager (`Upload install request`) lalu tanda tangani →
   dapat `license.lic`.
3. Copy ke `/var/lib/vexapacs/license.lic` + `public.pem`, lalu
   `sudo systemctl restart vexa-ris-backend vexa-pacs`.

Konfigurasi tambahan (kredensial lain, `SESSION_SECRET`) ditaruh di `/etc/vexapacs/lic-manager.env`
(mode 600); contoh variabelnya ada di `.env.example`.
