// Resolve an icon reference to a URL. Accepts:
//   - a full URL / absolute path / data: URI  -> used as-is
//   - "di:name"  dashboard-icons (SVG)   |  "dib:name" dashboard-icons (PNG)
//   - "mdi:name" Material Design Icons    |  "si:name"  Simple Icons
//   - "sh:name"  selfh.st icons (SVG)     |  "shl:name" selfh.st icons (PNG)
//   - a bare "name" -> dashboard-icons SVG
const DI = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons';

export function resolveIcon(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (/^(https?:\/\/|\/|data:)/i.test(s)) return s;

  const m = s.match(/^([a-z]+):(.+)$/i);
  if (m) {
    const ns = m[1].toLowerCase();
    const n = m[2].toLowerCase().trim().replace(/\.(svg|png)$/, '');
    if (ns === 'di') return `${DI}/svg/${n}.svg`;
    if (ns === 'dib') return `${DI}/png/${n}.png`;
    if (ns === 'mdi') return `https://cdn.jsdelivr.net/npm/@mdi/svg/svg/${n}.svg`;
    if (ns === 'si') return `https://cdn.jsdelivr.net/npm/simple-icons/icons/${n}.svg`;
    if (ns === 'sh') return `https://cdn.jsdelivr.net/gh/selfhst/icons/svg/${n}.svg`;
    if (ns === 'shl') return `https://cdn.jsdelivr.net/gh/selfhst/icons/png/${n}.png`;
    return s;
  }

  if (/^[a-z0-9][a-z0-9._-]*$/i.test(s)) return `${DI}/svg/${s.toLowerCase()}.svg`;
  return s;
}

let indexPromise = null;

// Lazily fetch the dashboard-icons name list (for the picker's suggestions). Cached
// for the session; resolves to [] if the CDN is unreachable.
export function loadIconIndex() {
  if (!indexPromise) {
    indexPromise = fetch(
      'https://data.jsdelivr.com/v1/packages/gh/homarr-labs/dashboard-icons@latest?structure=flat'
    )
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .then((j) =>
        (j.files || [])
          .map((f) => (f.name || '').match(/^\/svg\/([^/]+)\.svg$/)?.[1])
          .filter(Boolean)
          .sort()
      )
      .catch(() => []);
  }
  return indexPromise;
}
