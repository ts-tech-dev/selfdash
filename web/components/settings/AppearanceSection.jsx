import { useState } from 'preact/hooks';
import { settings, updateSettings } from '../../store.js';
import { api } from '../../api.js';
import { LOCALES, t } from '../../i18n.js';
import { THEMES } from '../../../src/shared/themes.js';
import { ContrastHint } from './ContrastHint.jsx';

const MODES = ['system', 'light', 'dark'];
const FONTS = [
  { value: '', label: 'Theme default' },
  { value: 'system', label: 'System UI' },
  { value: 'inter', label: 'Inter / sans' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Monospace' },
  { value: 'rounded', label: 'Rounded' },
];

// Portable "look" — the appearance-only slice of settings.
const THEME_KEYS = ['theme', 'dark_mode', 'accent', 'text_color', 'font_family', 'custom_css'];

export function AppearanceSection() {
  const [form, setForm] = useState({ ...settings.value });
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportText, setExportText] = useState('');
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState('');

  function update(field, value) {
    setSaved(false);
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function uploadTo(field, e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await api.upload(file);
      update(field, url);
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    await updateSettings(form);
    setSaved(true);
  }

  function doExport() {
    const blob = Object.fromEntries(THEME_KEYS.map((k) => [k, form[k] ?? null]));
    const json = JSON.stringify(blob, null, 2);
    setExportText(json);
    // best-effort; the textarea still holds it if the clipboard API is blocked
    try {
      navigator.clipboard?.writeText(json)?.catch(() => {});
    } catch {
      /* no clipboard API */
    }
  }

  async function doImport() {
    let parsed;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setImportMsg('Not valid JSON.');
      return;
    }
    const patch = {};
    for (const k of THEME_KEYS) if (parsed[k] !== undefined) patch[k] = parsed[k];
    if (!Object.keys(patch).length) {
      setImportMsg('No theme keys found.');
      return;
    }
    try {
      await updateSettings(patch); // server validates; bad values 400
      setForm((f) => ({ ...f, ...patch }));
      setImportMsg('Applied.');
    } catch (err) {
      setImportMsg(err.message || 'Rejected by the server.');
    }
  }

  return (
    <section class="settings-section">
      <h2>Appearance</h2>
      <form class="settings-form" onSubmit={submit}>
        <label>
          Site title
          <input value={form.site_title} onInput={(e) => update('site_title', e.target.value)} />
        </label>
        <label>
          Favicon URL
          <input
            value={form.favicon || ''}
            onInput={(e) => update('favicon', e.target.value || null)}
            placeholder="https://example.com/favicon.png"
          />
        </label>
        <label>
          Or upload a favicon
          <input type="file" accept="image/*" onChange={(e) => uploadTo('favicon', e)} disabled={uploading} />
        </label>

        <div class="settings-form-row">
          <label>
            Theme
            <select value={form.theme} onChange={(e) => update('theme', e.target.value)}>
              {THEMES.map((th) => (
                <option key={th} value={th}>
                  {th}
                </option>
              ))}
            </select>
          </label>
          <label>
            Appearance
            <select value={form.dark_mode} onChange={(e) => update('dark_mode', e.target.value)}>
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label>
            Accent color
            <input type="color" value={form.accent} onInput={(e) => update('accent', e.target.value)} />
          </label>
          <label>
            Font
            <select value={form.font_family || ''} onChange={(e) => update('font_family', e.target.value)}>
              {FONTS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('settings.language')}
            <select value={form.locale || 'en'} onChange={(e) => update('locale', e.target.value)}>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label class="checkbox-field">
          <input
            type="checkbox"
            checked={form.text_color != null}
            onChange={(e) => update('text_color', e.target.checked ? form.text_color || '#e6e6e6' : null)}
          />
          Custom text color (overrides the theme for all page text)
        </label>
        {form.text_color != null && (
          <label>
            Text color
            <input type="color" value={form.text_color} onInput={(e) => update('text_color', e.target.value)} />
            <ContrastHint color={form.text_color} />
          </label>
        )}

        <button type="button" class="modal-disclosure" onClick={() => setShareOpen((v) => !v)}>
          {shareOpen ? '▾' : '▸'} Theme sharing
        </button>
        {shareOpen && (
          <fieldset class="iframe-fields">
            <button type="button" class="settings-add-btn" onClick={doExport}>
              Export current look (copies to clipboard)
            </button>
            {exportText && <textarea class="code-textarea" rows="7" readonly value={exportText} />}
            <label>
              Import a look — paste JSON, then Apply
              <textarea
                class="code-textarea"
                rows="7"
                value={importText}
                onInput={(e) => {
                  setImportText(e.target.value);
                  setImportMsg('');
                }}
                placeholder='{ "theme": "dracula", "accent": "#bd93f9" }'
              />
            </label>
            <div class="settings-form-actions">
              <button type="button" onClick={doImport}>
                Apply imported look
              </button>
              {importMsg && <span class="settings-saved-hint">{importMsg}</span>}
            </div>
          </fieldset>
        )}

        <label>
          Global background URL
          <input
            value={form.global_background || ''}
            onInput={(e) => update('global_background', e.target.value || null)}
            placeholder="https://example.com/bg.jpg"
          />
        </label>
        <label>
          Or upload an image
          <input type="file" accept="image/*" onChange={(e) => uploadTo('global_background', e)} disabled={uploading} />
        </label>

        <label>
          Custom CSS (applied on every page)
          <textarea
            class="code-textarea"
            rows="14"
            spellcheck={false}
            value={form.custom_css || ''}
            placeholder=".tile { border-radius: 4px; }"
            onInput={(e) => update('custom_css', e.target.value)}
          />
        </label>

        <label class="checkbox-field">
          <input
            type="checkbox"
            checked={Boolean(form.custom_js_enabled)}
            onChange={(e) => update('custom_js_enabled', e.target.checked)}
          />
          Enable custom JavaScript
        </label>
        {form.custom_js_enabled && (
          <label>
            Custom JavaScript — runs on every page load with full access to the dashboard. Only use code you trust.
            <textarea
              class="code-textarea"
              rows="14"
              spellcheck={false}
              value={form.custom_js || ''}
              placeholder="console.log('hello from selfdash')"
              onInput={(e) => update('custom_js', e.target.value)}
            />
          </label>
        )}

        <div class="settings-form-actions">
          <button type="submit" disabled={uploading}>
            Save
          </button>
          {saved && <span class="settings-saved-hint">Saved</span>}
        </div>
      </form>
    </section>
  );
}
