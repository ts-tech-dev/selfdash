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
