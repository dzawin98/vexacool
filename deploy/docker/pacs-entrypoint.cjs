/**
 * Entrypoint PACS.
 *
 * Kenapa ada: `pacs_studies` / `pacs_series` / `pacs_instances` hanya dibuat oleh
 * `ensurePacsMetadataTables()` yang dipanggil dari jalur sync/scan — bukan saat
 * query. Kalau database `velopacs_db` masih kosong (volume baru, atau DB dibuat
 * oleh `db-init`), QIDO langsung gagal dengan:
 *   error: relation "pacs_studies" does not exist
 * dan DIMSE SCP ikut tidak siap.
 *
 * Jadi: pastikan skema dulu (idempoten, CREATE TABLE IF NOT EXISTS), baru
 * nyalakan server seperti biasa.
 */
const { ensurePacsMetadataTables } = require('./build/dimse/metadataDb');

(async () => {
  try {
    await ensurePacsMetadataTables();
    console.log('[pacs] metadata schema ready');
  } catch (err) {
    console.error('[pacs] metadata schema init failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
  require('./build/app.js');
})();
