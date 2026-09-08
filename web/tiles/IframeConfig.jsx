const ASPECT_RATIOS = ['16/9', '4/3', '1/1', '21/9'];

export function IframeConfig({ value, onChange }) {
  const v = value || {};
  const sizing = v.sizing === 'height' ? 'height' : 'aspect';

  return (
    <>
      <label>
        URL
        <input
          required
          type="url"
          value={v.url || ''}
          onInput={(e) => onChange('url', e.target.value)}
          placeholder="https://example.com"
        />
      </label>

      <fieldset class="iframe-fields">
        <label>
          Sizing
          <select value={sizing} onChange={(e) => onChange('sizing', e.target.value)}>
            <option value="aspect">Aspect ratio</option>
            <option value="height">Fixed height</option>
          </select>
        </label>
        {sizing === 'aspect' ? (
          <label>
            Aspect ratio
            <select value={v.aspectRatio || '16/9'} onChange={(e) => onChange('aspectRatio', e.target.value)}>
              {ASPECT_RATIOS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            Height (px)
            <input
              type="number"
              min="100"
              max="2000"
              value={v.height ?? 400}
              onInput={(e) => onChange('height', Number(e.target.value))}
            />
          </label>
        )}
        <label>
          Sandbox (advanced)
          <input value={v.sandbox || ''} onInput={(e) => onChange('sandbox', e.target.value)} />
        </label>
      </fieldset>
    </>
  );
}
