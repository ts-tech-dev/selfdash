import { useState } from 'preact/hooks';
import { api } from '../../api.js';

export function BackupSection() {
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState(null);
  const [cfgBusy, setCfgBusy] = useState(false);
  const [cfgMessage, setCfgMessage] = useState(null);

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

  async function onImportConfig(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (
      !confirm(
        'Import this YAML config? It replaces ALL pages, tiles, integrations, and settings. ' +
          'Uploaded images are left untouched. Continue?'
      )
    ) {
      return;
    }
    setCfgBusy(true);
    setCfgMessage(null);
    try {
      const r = await api.importConfig(file);
      const bits = [`${r.pages} pages, ${r.tiles} tiles, ${r.integrations} integrations`];
      if (r.unresolvedSecrets?.length) {
        bits.push(`missing env vars: ${r.unresolvedSecrets.join(', ')} — re-enter those secrets in Integrations`);
      }
      setCfgMessage(`Imported ${bits.join('. ')} — reloading…`);
      setTimeout(() => window.location.reload(), 3500);
    } catch (err) {
      setCfgMessage(`Import failed: ${err.message}`);
      setCfgBusy(false);
    }
  }

  return (
    <section class="settings-section">
      <h2>Backup &amp; restore</h2>
      <p class="settings-hint">
        <strong>Full backup (.zip)</strong> — everything, including uploaded images, as an opaque snapshot for
        disaster recovery.
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

      <p class="settings-hint" style={{ marginTop: '16px' }}>
        <strong>Configuration (.yaml)</strong> — a human-readable, version-controllable snapshot of pages,
        tiles, integrations, and settings (no images). Secrets are written as{' '}
        <code>${'{'}SELFDASH_SECRET_…{'}'}</code> placeholders and read back from the container environment on
        import. Commit it to git, diff it, share it.
      </p>
      <div class="backup-actions">
        <a class="backup-export-btn" href={api.exportConfigUrl}>
          Export config (.yaml)
        </a>
        <label class="backup-import-label">
          Import config
          <input type="file" accept=".yaml,.yml" onChange={onImportConfig} disabled={cfgBusy} />
        </label>
      </div>
      {cfgMessage && <p class="import-message">{cfgMessage}</p>}
    </section>
  );
}
