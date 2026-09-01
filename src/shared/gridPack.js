// Free 2-D tile placement helpers, shared by the server-side layout backfill and
// the client's "add tile" slot picker so the packing rule lives in one place.
//
// An "occupancy" is a sparse array indexed by row; each entry is a bitmask of the
// columns filled on that row. Column count is capped at 12 (see page grid options)
// so a 32-bit int per row is plenty.

const clampInt = (n, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(n) || 0)));

// Build an occupancy grid from tiles that already have {x,y,w,h}.
export function occupancyOf(tiles, columns) {
  const occ = [];
  for (const t of tiles || []) {
    const w = clampInt(t.w ?? 1, 1, columns);
    const h = Math.max(1, clampInt(t.h ?? 1, 1, 64));
    const x = clampInt(t.x ?? 0, 0, columns - w);
    const y = Math.max(0, clampInt(t.y ?? 0, 0, 4096));
    for (let dy = 0; dy < h; dy++) {
      occ[y + dy] = occ[y + dy] || 0;
      for (let dx = 0; dx < w; dx++) occ[y + dy] |= 1 << (x + dx);
    }
  }
  return occ;
}

// First-fit a w×h box into `occ` (scanning top→bottom, left→right). Marks the box
// as filled and returns its {x, y}. `occ` is mutated in place.
export function placeBox(occ, columns, w, h) {
  const width = clampInt(w, 1, columns);
  const height = Math.max(1, clampInt(h, 1, 64));
  for (let y = 0; ; y++) {
    for (let x = 0; x + width <= columns; x++) {
      let free = true;
      for (let dy = 0; dy < height && free; dy++) {
        const mask = occ[y + dy] || 0;
        for (let dx = 0; dx < width; dx++) {
          if (mask & (1 << (x + dx))) {
            free = false;
            break;
          }
        }
      }
      if (!free) continue;
      for (let dy = 0; dy < height; dy++) {
        occ[y + dy] = occ[y + dy] || 0;
        for (let dx = 0; dx < width; dx++) occ[y + dy] |= 1 << (x + dx);
      }
      return { x, y };
    }
  }
}

// Convenience: first free slot for a w×h box among already-placed `tiles`.
export function nextFreeSlot(tiles, columns, w, h) {
  return placeBox(occupancyOf(tiles, columns), columns, w, h);
}
