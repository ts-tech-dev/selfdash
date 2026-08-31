import { useState } from 'preact/hooks';
import { api } from '../../api.js';

export function BackupSection() {
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState(null);

  async function onImportFile(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (
      !confirm(
        'This will overwrite ALL current pages, tiles, settings, and integrations with the contents of this backup. ' +
          'The current data is saved aside first, but this is not reversible from the UI. Continue?'
      )
    ) {
      return;
    }
    setImportBusy(true);
    setImportMessage(null);
    try {
      const result = await api.importBackup(file);
      setImportMessage(`${result.message} — reloading…`);
      setTimeout(() => window.location.reload(), 3000);
    } catch (err) {
      setImportMessage(`Import failed: ${err.message}`);
      setImportBusy(false);
    }
  }

  return (
    <section class="settings-section">
      <h2>Backup &amp; restore</h2>
      <p class="settings-hint">
        Export downloads everything — pages, tiles, settings, integration config, and uploaded assets — as a
        single .zip. Import restores from one, overwriting current data (a safety copy is kept on the server
        first).
      </p>
      <div class="backup-actions">
        <a class="backup-export-btn" href={api.exportBackupUrl}>
          Export backup (.zip)
        </a>
        <label class="backup-import-label">
          Import backup
          <input type="file" accept=".zip" onChange={onImportFile} disabled={importBusy} />
        </label>
      </div>
      {importMessage && <p class="import-message">{importMessage}</p>}
    </section>
  );
}
