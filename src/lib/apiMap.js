// Resolve a dotted path against a JSON value. Supports numeric indices (`a.b[0]`)
// and a `[]` wildcard that spreads an array (`items[].name` -> array of names).
export function getPath(obj, path) {
  if (path == null || path === '') return obj;
  const tokens = String(path)
    .replace(/\[(\d+)\]/g, '.$1')
    .replace(/\[\]/g, '.[]')
    .split('.')
    .filter((t) => t !== '');

  let cur = [obj];
  let spread = false;
  for (const tok of tokens) {
    if (tok === '[]') {
      cur = cur.flatMap((v) => (Array.isArray(v) ? v : []));
      spread = true;
      continue;
    }
    cur = cur.map((v) => (v == null ? undefined : v[tok]));
  }
  return spread ? cur : cur[0];
}

function fmtValue(v) {
  if (v == null) return '—';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return Array.isArray(v) ? String(v.length) : JSON.stringify(v);
  return String(v).slice(0, 200);
}

// cfg: { display: 'stats'|'list', items: [{label,path}], listPath, titlePath, subtitlePath }
export function buildModel(json, cfg = {}) {
  if (cfg.display === 'list') {
    const arr = getPath(json, cfg.listPath);
    const list = Array.isArray(arr) ? arr : [];
    return {
      type: 'list',
      items: list.slice(0, 50).map((item) => ({
        title: fmtValue(getPath(item, cfg.titlePath)),
        subtitle: cfg.subtitlePath ? fmtValue(getPath(item, cfg.subtitlePath)) : undefined,
      })),
    };
  }
  return {
    type: 'stats',
    items: (Array.isArray(cfg.items) ? cfg.items : [])
      .filter((m) => m && m.label && m.path)
      .map((m) => ({ label: m.label, value: fmtValue(getPath(json, m.path)) })),
  };
}
