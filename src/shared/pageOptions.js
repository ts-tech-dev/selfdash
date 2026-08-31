const clampN = (v, min, max, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

// Keep only known page-option keys, bounded. Shared by the pages route and the
// YAML config importer.
export function sanitizePageOptions(o = {}) {
  const out = {};
  if (o.grid && typeof o.grid === 'object') {
    out.grid = {
      columns: clampN(o.grid.columns, 1, 12, 6),
      gap: clampN(o.grid.gap, 0, 48, 14),
      rowHeight: clampN(o.grid.rowHeight, 40, 240, 96),
      maxWidth: clampN(o.grid.maxWidth, 600, 2400, 1100),
    };
  }
  if (o.background && typeof o.background === 'object') {
    const b = o.background;
    out.background = {
      url: typeof b.url === 'string' ? b.url.slice(0, 1000) : '',
      blur: clampN(b.blur, 0, 40, 0),
      dim: clampN(b.dim, 0, 100, 0),
      opacity: clampN(b.opacity, 0, 100, 100),
    };
  }
  if (typeof o.customCss === 'string') out.customCss = o.customCss.slice(0, 40_000);
  return out;
}
