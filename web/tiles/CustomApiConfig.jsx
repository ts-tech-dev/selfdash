// Config editor for the Custom API tile: endpoint + headers + JSON path mappings.
// Paths use dot / bracket notation with a [] wildcard, e.g. `data.items[].name`.

function Row({ children }) {
  return <div class="tile-config-repeat-row">{children}</div>;
}

export function CustomApiConfig({ value, onChange }) {
  const v = value || {};
  const headers = Array.isArray(v.headers) ? v.headers : [];
  const items = Array.isArray(v.items) ? v.items : [];

  const setHeaders = (n) => onChange('headers', n);
  const setItems = (n) => onChange('items', n);

  return (
    <div class="tile-config-repeat">
      <label>
        Endpoint URL
        <input value={v.url || ''} placeholder="https://host/api/…" onInput={(e) => onChange('url', e.target.value)} />
      </label>
      <div class="settings-form-row">
        <label>
          Method
          <select value={v.method || 'GET'} onChange={(e) => onChange('method', e.target.value)}>
            <option>GET</option>
            <option>POST</option>
          </select>
        </label>
        <label>
          Refresh (seconds)
          <input
            type="number"
            min="5"
            value={v.refreshSec || 60}
            onInput={(e) => onChange('refreshSec', Number(e.target.value))}
          />
        </label>
        <label>
          Display
          <select value={v.display || 'stats'} onChange={(e) => onChange('display', e.target.value)}>
            <option value="stats">Stat grid</option>
            <option value="list">List</option>
          </select>
        </label>
      </div>

      {v.method === 'POST' && (
        <label>
          Request body
          <textarea rows="3" value={v.body || ''} onInput={(e) => onChange('body', e.target.value)} />
        </label>
      )}

      <span class="tile-config-repeat-label">Headers</span>
      {headers.map((h, i) => (
        <Row key={i}>
          <input
            placeholder="Header"
            value={h.k || ''}
            onInput={(e) => setHeaders(headers.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))}
          />
          <input
            placeholder="Value"
            value={h.v || ''}
            onInput={(e) => setHeaders(headers.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))}
          />
          <button type="button" onClick={() => setHeaders(headers.filter((_, j) => j !== i))}>
            ✕
          </button>
        </Row>
      ))}
      <button type="button" class="tile-config-repeat-add" onClick={() => setHeaders([...headers, { k: '', v: '' }])}>
        + Add header
      </button>

      {v.display === 'list' ? (
        <>
          <span class="tile-config-repeat-label">List mapping</span>
          <label>
            Array path
            <input
              value={v.listPath || ''}
              placeholder="data.items"
              onInput={(e) => onChange('listPath', e.target.value)}
            />
          </label>
          <label>
            Title path (relative to each item)
            <input value={v.titlePath || ''} placeholder="name" onInput={(e) => onChange('titlePath', e.target.value)} />
          </label>
          <label>
            Subtitle path (optional)
            <input value={v.subtitlePath || ''} placeholder="status" onInput={(e) => onChange('subtitlePath', e.target.value)} />
          </label>
        </>
      ) : (
        <>
          <span class="tile-config-repeat-label">Stat fields</span>
          {items.map((m, i) => (
            <Row key={i}>
              <input
                placeholder="Label"
                value={m.label || ''}
                onInput={(e) => setItems(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <input
                placeholder="Path e.g. data.count"
                value={m.path || ''}
                onInput={(e) => setItems(items.map((x, j) => (j === i ? { ...x, path: e.target.value } : x)))}
              />
              <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                ✕
              </button>
            </Row>
          ))}
          <button type="button" class="tile-config-repeat-add" onClick={() => setItems([...items, { label: '', path: '' }])}>
            + Add field
          </button>
        </>
      )}
    </div>
  );
}
