# Lisensi VEXAPACS di Linux

## Ringkas: cara kerjanya

1. Di server, buat **install-request** yang berisi `machineId` (fingerprint mesin):

   ```bash
   node /opt/vexapacs/scripts/license/license-cli.js install-request --out /tmp/install-request.json
   ```

2. Kirim file itu ke tim lisensi. Mereka menandatangani payload dengan **private key Ed25519**
   (`createSignedLicense`) dan mengirim `license.lic`.
3. Copy `license.lic` + `public.pem` ke `/var/lib/vexapacs/` (path dari `VEXA_LICENSE_FILE`
   dan `VEXA_LICENSE_PUBLIC_KEY_PATH` di `/etc/vexapacs/vexa.env`).
4. Restart service: `sudo systemctl restart vexa-ris-backend vexa-pacs`.

Verifikasi saat service start (`assertLicensed`) dan per-request (`createLicenseMiddleware` →
HTTP 403 `{"error":"This license is not valid for this module."}`). Kalau `VEXA_LICENSE_ENFORCE=true`
(production), service **menolak start** tanpa lisensi valid.

Urutan pemeriksaan dan kode kegagalannya:

| Kode | Arti |
|---|---|
| `LICENSE_MISSING` | file lisensi tidak ada / tidak terbaca |
| `LICENSE_FORMAT_INVALID` | bukan envelope `{alg, payload, signature}` |
| `SIGNATURE_INVALID` | tanda tangan tidak cocok dengan `public.pem` (lisensi diedit / kunci beda) |
| `LICENSE_NOT_ACTIVE` | `notBefore` di masa depan |
| `LICENSE_EXPIRED` | `expiresAt` sudah lewat |
| `MACHINE_ID_MISMATCH` | `machineId` lisensi ≠ fingerprint mesin ini |
| `MODULE_NOT_LICENSED` | modul (RIS/PACS_*/VIEWER/…) tidak ada di `payload.modules` |

## Yang berubah saat pindah ke Linux (penting)

`machineId` = `sha256("VEXAPACS-RIS|" + canonicalJson(fingerprint))`, dan fingerprint berisi:

- `machineGuid` — dibaca dari **registry Windows** (`reg query … MachineGuid`); di Linux **selalu kosong**,
- `platform` — `win32` di Windows, `linux` di CachyOS,
- `hostname`, `arch`, `cpuModel`, `macs[]` (semua MAC non-internal, diurutkan).

Akibatnya **lisensi yang diterbitkan untuk server Windows akan gagal di Linux**
(`MACHINE_ID_MISMATCH`) — bukan bug, memang binding mesin. Pilihan Anda:

1. **Terbitkan ulang** untuk `machineId` Linux (disarankan untuk produksi):
   jalankan `install-request` di server Linux, kirim ke tim lisensi, pasang `license.lic` baru.
2. **Lisensi tanpa binding**: isi `machineId: ""` saat menerbitkan. Kode melewati pemeriksaan
   bila `payload.machineId` kosong — praktis untuk server uji, tapi lisensi itu bisa dipakai
   di mesin mana pun (jangan untuk produksi).

Catatan operasional: karena `hostname` dan `macs[]` ikut masuk fingerprint, **ganti hostname,
ganti NIC, tambah/lepas adapter, atau clone VM akan membuat lisensi invalid**. Kalau server uji
sering berubah, pakai mode tanpa binding.

## Verifikasi otomatis saat install

`installer/install.sh` memeriksa lisensi di akhir proses (setelah unit systemd dipasang):

```bash
node scripts/license/verify-license.js --license /var/lib/vexapacs/license.lic      --public-key /var/lib/vexapacs/public.pem
```

Yang diperiksa, sama seperti saat service start: tanda tangan Ed25519 terhadap `public.pem`,
`notBefore`/`expiresAt`, kecocokan `machineId` dengan server ini, dan modul yang dilisensikan
(RIS, PACS_DIMSE, PACS_MWL, DESKTOP_VIEWER, MOBILE_VIEWER, ECG_VIEWER dicetak `ok/-`).
Keluar dengan kode 2 bila tidak valid, dan installer berhenti dengan instruksi (kecuali dipanggil
`--allow-invalid-license`). Perintah CLI-nya bisa dipakai kapan saja untuk diagnosa.

## Menampilkan status lisensi

- Halaman admin: tab **Lisensi** (`admin/`) — menampilkan customer, modul, `machineId`, masa berlaku,
  dan hasil verifikasi tanda tangan.
- CLI: `node /opt/vexapacs/scripts/license/license-cli.js help` untuk daftar perintah
  (issue/verify/install-request), termasuk `--machine-id` bila menerbitkan dari mesin lain.

## Env yang dipakai

```text
VEXA_LICENSE_ENFORCE=true
VEXA_LICENSE_FILE=/var/lib/vexapacs/license.lic
VEXA_LICENSE_PUBLIC_KEY_PATH=/var/lib/vexapacs/public.pem
```

Default path di kode masih `%ProgramData%\VEXAPACS\license.lic` (Windows), jadi di Linux
**wajib** set kedua variabel di atas lewat `/etc/vexapacs/vexa.env`.
