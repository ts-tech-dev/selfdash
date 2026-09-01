// WCAG relative-contrast helpers, used to warn when a chosen text colour would be
// hard to read on the surface behind it. Pure functions — unit-tested.

export const AA_NORMAL = 4.5; // WCAG 2.1 AA for normal-size text
export const AA_LARGE = 3;

// Accepts "#rgb", "#rrggbb", "rgb(r,g,b)", "rgba(r,g,b,a)". Returns [r,g,b] 0-255
// with any alpha flattened over `over` (default opaque white) — good enough for a
// legibility hint on translucent theme surfaces. null if unparseable.
export function parseColor(input, over = [255, 255, 255]) {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();

  let m = s.match(/^#([0-9a-f]{3})$/);
  if (m) {
    const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16));
    return [r, g, b];
  }
  m = s.match(/^#([0-9a-f]{6})$/);
  if (m) {
    const n = m[1];
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
  }
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    let a = m[4] == null ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
    if (!Number.isFinite(a)) a = 1;
    a = Math.min(1, Math.max(0, a));
    return [
      Math.round(r * a + over[0] * (1 - a)),
      Math.round(g * a + over[1] * (1 - a)),
      Math.round(b * a + over[2] * (1 - a)),
    ];
  }
  return null;
}

function relLuminance([r, g, b]) {
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

// Contrast ratio between two colours (1 … 21). Returns null if either won't parse.
export function contrastRatio(a, b) {
  const ca = parseColor(a);
  const cb = parseColor(b, ca || undefined);
  if (!ca || !cb) return null;
  const la = relLuminance(ca);
  const lb = relLuminance(cb);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}
