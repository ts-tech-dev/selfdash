import { useState } from 'preact/hooks';
import { settings, updateSettings } from '../../store.js';
import { api } from '../../api.js';
import { LOCALES, t } from '../../i18n.js';

const THEMES = ['minimal', 'glass', 'terminal', 'gradient', 'nord', 'rosepine'];
const MODES = ['system', 'light', 'dark'];
const FONTS = [
  { value: '', label: 'Theme default' },
  { value: 'system', label: 'System UI' },
  { value: 'inter', label: 'Inter / sans' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Monospace' },
  { value: 'rounded', label: 'Rounded' },
];

export function AppearanceSection() {
  const [form, setForm] = useState({ ...settings.value });
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);

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
              {THEMES.map((t) => (
                <option key={t} value={t}>
                  {t}
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
            rows="5"
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
              rows="5"
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
