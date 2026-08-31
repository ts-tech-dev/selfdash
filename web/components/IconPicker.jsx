import { useEffect, useState } from 'preact/hooks';
import { resolveIcon, loadIconIndex } from '../tiles/icons.js';
import { api } from '../api.js';

// Icon field with live preview + name suggestions. `value` is the raw reference
// (URL or shorthand like "di:radarr" / "mdi:home" / "si:github").
export function IconPicker({ value, onChange }) {
  const [index, setIndex] = useState([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let alive = true;
    loadIconIndex().then((names) => alive && setIndex(names));
    return () => {
      alive = false;
    };
  }, []);

  const raw = value || '';
  const looksBare = /^[a-z0-9][a-z0-9._-]*$/i.test(raw);
  const suggestions =
    looksBare && index.length
      ? index.filter((n) => n.startsWith(raw.toLowerCase())).slice(0, 20)
      : [];
  const resolved = resolveIcon(raw);

  async function onFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await api.upload(file);
      onChange(url);
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div class="icon-picker">
      <label>
        Icon
        <div class="icon-picker-row">
          {resolved ? (
            <img class="icon-picker-preview" src={resolved} alt="" onError={(e) => (e.currentTarget.style.opacity = 0.2)} />
          ) : (
            <span class="icon-picker-preview icon-picker-empty" />
          )}
          <input
            list="selfdash-icon-list"
            value={raw}
            placeholder="di:radarr, mdi:home, si:github, or a URL"
            onInput={(e) => {
              e.currentTarget.style.opacity = 1;
              onChange(e.target.value);
            }}
          />
        </div>
      </label>
      <datalist id="selfdash-icon-list">
        {suggestions.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <label class="icon-picker-upload">
        Or upload
        <input type="file" accept="image/*" onChange={onFile} disabled={uploading} />
      </label>
      <p class="settings-hint">
        Shorthands: <code>di:</code> dashboard-icons · <code>mdi:</code> Material · <code>si:</code> Simple Icons ·{' '}
        <code>sh:</code> selfh.st. Browse names at dashboardicons.com.
      </p>
    </div>
  );
}
