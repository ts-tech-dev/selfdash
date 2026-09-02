export const SIZE_PRESETS = {
  S: { w: 1, h: 1 },
  M: { w: 2, h: 1 },
  L: { w: 2, h: 2 },
  wide: { w: 4, h: 1 },
  full: { w: 6, h: 1 },
};

export function sizeKeyFromWH(w, h) {
  const match = Object.entries(SIZE_PRESETS).find(([, v]) => v.w === w && v.h === h);
  return match ? match[0] : 'M';
}

// View render types meant to scroll — an open-ended list (a download queue,
// "recently imported", health issues, …). Left alone by autoLinkTileHeight below.
export const SCROLLABLE_VIEW_TYPES = new Set(['queue', 'list']);
export const MIN_HEIGHT_NO_SCROLL = 2;

// A combined link+integration tile's icon/title header eats into the row height a
// plain widget tile doesn't spend on itself, so a single non-scrollable view (stats,
// now-playing, the calendar grid) can end up scrolling at the shortest preset. Bumps
// h up to MIN_HEIGHT_NO_SCROLL for those; a scrollable view type (or none known yet —
// the integration hasn't been polled) leaves h untouched.
export function autoLinkTileHeight(h, viewType) {
  if (!viewType || SCROLLABLE_VIEW_TYPES.has(viewType)) return h;
  return Math.max(h, MIN_HEIGHT_NO_SCROLL);
}
