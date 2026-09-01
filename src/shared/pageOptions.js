import { THEME_SET } from './themes.js';
import { isHexColor } from './color.js';

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
      // 0 = full width (default); otherwise a pixel cap on the tile canvas.
      maxWidth: clampN(o.grid.maxWidth, 0, 2400, 0),
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
  // Per-page appearance overrides — each optional; absent means "inherit the global".
  if (o.appearance && typeof o.appearance === 'object') {
    const a = o.appearance;
    const app = {};
    if (THEME_SET.has(a.theme)) app.theme = a.theme;
    if (isHexColor(a.accent)) app.accent = a.accent;
    if (isHexColor(a.textColor)) app.textColor = a.textColor;
    if (Object.keys(app).length) out.appearance = app;
  }

  if (typeof o.customCss === 'string') out.customCss = o.customCss.slice(0, 40_000);
  // Per-page custom JS still rides the global "Enable custom JavaScript" master
  // switch (see appearance.js) — this per-page flag is an extra gate, not a bypass.
  if (typeof o.customJs === 'string') out.customJs = o.customJs.slice(0, 40_000);
  if (o.customJsEnabled) out.customJsEnabled = true;
  return out;
}
