import { useState } from 'preact/hooks';
import { settings, updateSettings } from '../../store.js';
import { api } from '../../api.js';

const THEMES = ['minimal', 'glass', 'terminal', 'gradient'];
const MODES = ['system', 'light', 'dark'];

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
