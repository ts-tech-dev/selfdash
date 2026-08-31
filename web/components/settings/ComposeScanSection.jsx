import { useState } from 'preact/hooks';
import { settings, updateSettings, composeScan, loadComposeScan, pages } from '../../store.js';

export function ComposeScanSection() {
  const [form, setForm] = useState({
    compose_scan_enabled: Boolean(settings.value.compose_scan_enabled),
    compose_scan_dir: settings.value.compose_scan_dir || '',
    compose_scan_page_id:
      settings.value.compose_scan_page_id == null ? 'all' : String(settings.value.compose_scan_page_id),
  });
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);

  function update(field, value) {
    setSaved(false);
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    await updateSettings({
      compose_scan_enabled: form.compose_scan_enabled,
      compose_scan_dir: form.compose_scan_dir.trim() || null,
      compose_scan_page_id: form.compose_scan_page_id === 'all' ? null : Number(form.compose_scan_page_id),
    });
    setSaved(true);
    if (form.compose_scan_enabled) loadComposeScan(true);
  }

  async function test() {
    setTesting(true);
    await loadComposeScan(true);
    setTesting(false);
  }

  const scan = composeScan.value;
  const result = scan?.result;

  return (
    <section class="settings-section">
      <h2>Docker Compose scan</h2>
      <p class="settings-hint">
        Point selfdash at a directory of compose stacks and it lists every published port and volume per
        container. Files are only ever <strong>read</strong> — never created, edited, or moved. In Docker,
        bind-mount the directory into this container (read-only is fine), e.g.{' '}
        <code>- /opt/stacks:/stacks:ro</code>, and set the path below to the in-container path (<code>/stacks</code>).
      </p>
      <form class="settings-form" onSubmit={submit}>
        <label class="checkbox-field">
          <input
            type="checkbox"
            checked={form.compose_scan_enabled}
            onChange={(e) => update('compose_scan_enabled', e.target.checked)}
          />
          Enable compose scan
        </label>
        <label>
          Compose directory (absolute path)
          <input
            value={form.compose_scan_dir}
            onInput={(e) => update('compose_scan_dir', e.target.value)}
            placeholder="/stacks"
          />
        </label>
        <label>
          Show the panel on
          <select
            value={form.compose_scan_page_id}
            onChange={(e) => update('compose_scan_page_id', e.target.value)}
          >
            <option value="all">Every page</option>
            {pages.value.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div class="settings-form-actions">
          <button type="submit">Save</button>
          <button type="button" onClick={test} disabled={testing || !form.compose_scan_dir.trim()}>
            {testing ? 'Scanning…' : 'Test scan'}
          </button>
          {saved && <span class="settings-saved-hint">Saved</span>}
        </div>
      </form>

      {result && (
        <p class="settings-hint" style={{ marginTop: '10px' }}>
          {result.error ? (
            <span class="compose-err">Scan error: {result.error}</span>
          ) : (
            <>
              Found <strong>{result.stacks.length}</strong> stack(s),{' '}
              <strong>{result.stacks.reduce((n, s) => n + s.services.length, 0)}</strong> service(s)
              {result.errors?.length ? (
                <span class="compose-err"> · {result.errors.length} file(s) could not be parsed</span>
              ) : null}
              . Scanned <code>{scan.dir}</code>.
            </>
          )}
        </p>
      )}
    </section>
  );
}
