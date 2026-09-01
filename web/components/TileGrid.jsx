import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { tiles, addTile, editTile, removeTile, refreshTileHealth } from '../store.js';
import { occupancyOf, placeBox } from '../../src/shared/gridPack.js';
import { TileCard } from './TileCard.jsx';
import { TileModal } from './TileModal.jsx';
import { t } from '../i18n.js';

const DEFAULT_ROW_HEIGHT = 96;
const MAX_SPAN = 12;
const MAX_H = 8;
const MAX_ROW = 100; // guard rail on how far down a tile can be placed within a group
const HEALTH_POLL_MS = 30_000;
const NARROW_MQ = '(max-width: 640px)';
const NARROW_COLS = 2;

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function loadCollapsed(pageId) {
  try {
    return new Set(JSON.parse(localStorage.getItem(`selfdash:groups:${pageId}`) || '[]'));
  } catch {
    return new Set();
  }
}

export function TileGrid({ page }) {
  const gridRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [modalTile, setModalTile] = useState(undefined);
  const [drag, setDrag] = useState(null); // { id, x, y } — live snapped position while dragging
  const [resizing, setResizing] = useState(null); // { id, w, h } — live snapped size while resizing
  const [collapsed, setCollapsed] = useState(() => loadCollapsed(page.id));
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW_MQ).matches
  );

  const gridOpts = page.options?.grid || {};
  const columns = gridOpts.columns || 6;
  const gap = gridOpts.gap ?? 14;
  const rowHeight = gridOpts.rowHeight || DEFAULT_ROW_HEIGHT;

  useEffect(() => {
    const mq = window.matchMedia(NARROW_MQ);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    setCollapsed(loadCollapsed(page.id));
  }, [page.id]);

  const healthUrls = tiles.value.filter((tl) => tl.url).map((tl) => tl.url).join(',');
  useEffect(() => {
    if (!healthUrls) return undefined;
    const urls = healthUrls.split(',');
    refreshTileHealth(urls);
    const timer = setInterval(() => refreshTileHealth(urls), HEALTH_POLL_MS);
    return () => clearInterval(timer);
  }, [healthUrls]);

  // Group tiles by config.group; ungrouped first (no header), then groups in first-seen order.
  const groups = useMemo(() => {
    const order = [];
    const byGroup = new Map();
    for (const tl of tiles.value) {
      const g = tl.config?.group || '';
      if (!byGroup.has(g)) {
        byGroup.set(g, []);
        order.push(g);
      }
      byGroup.get(g).push(tl);
    }
    order.sort((a, b) => (a === '' ? -1 : b === '' ? 1 : 0));
    return order.map((g) => ({ name: g, tiles: byGroup.get(g) }));
  }, [tiles.value]);

  const hasGroups = groups.some((g) => g.name !== '');

  // Effective x/y/w/h for a tile, folding in the live drag/resize preview.
  function coordsOf(tl) {
    const d = drag && drag.id === tl.id ? drag : null;
    const r = resizing && resizing.id === tl.id ? resizing : null;
    return {
      x: d ? d.x : tl.x || 0,
      y: d ? d.y : tl.y || 0,
      w: r ? r.w : tl.w || 1,
      h: r ? r.h : tl.h || 1,
    };
  }

  // Turn the grouped tiles into flat render items with explicit grid-row placement.
  // Each named group occupies its header row plus `groupHeight` rows below it; a
  // tile's stored y is relative to the top of its own group so a group above can
  // grow/collapse without disturbing the ones below.
  const layout = useMemo(() => {
    const items = [];
    let rowCursor = 1; // CSS grid lines are 1-based
    for (const g of groups) {
      const named = g.name !== '';
      const isCollapsed = named && collapsed.has(g.name);
      if (named) {
        items.push({ kind: 'header', name: g.name, row: rowCursor, count: g.tiles.length, collapsed: isCollapsed });
        rowCursor += 1;
      }
      if (isCollapsed) continue;

      const base = rowCursor;
      let groupHeight = 1;
      for (const tl of g.tiles) {
        const c = coordsOf(tl);
        const w = Math.min(c.w, columns);
        const x = clamp(c.x, 0, Math.max(0, columns - w));
        const y = clamp(c.y, 0, MAX_ROW);
        items.push({
          kind: 'tile',
          tile: tl,
          colStart: x + 1,
          rowStart: base + y,
          w,
          h: c.h,
        });
        groupHeight = Math.max(groupHeight, y + c.h);
      }
      rowCursor = base + groupHeight;
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, collapsed, columns, drag, resizing]);

  function toggleGroup(name) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      try {
        localStorage.setItem(`selfdash:groups:${page.id}`, JSON.stringify([...next]));
      } catch {
        /* private mode */
      }
      return next;
    });
  }

  // Pixel size of one grid cell + gap, measured live so drag/resize snap correctly
  // regardless of viewport width or the page's column count.
  function cellMetrics() {
    const rect = gridRef.current.getBoundingClientRect();
    const cols = narrow ? NARROW_COLS : columns;
    return {
      cols,
      colStride: (rect.width + gap) / cols, // column width + one gap
      rowStride: rowHeight + gap,
    };
  }

  function startDrag(tile, e) {
    if (!editing || narrow) return;
    e.preventDefault();
    e.stopPropagation();
    const { cols, colStride, rowStride } = cellMetrics();
    const startX = e.clientX;
    const startY = e.clientY;
    const ox = tile.x || 0;
    const oy = tile.y || 0;
    const maxX = Math.max(0, cols - Math.min(tile.w || 1, cols));
    let latest = { x: ox, y: oy };
    setDrag({ id: tile.id, x: ox, y: oy });

    function onMove(ev) {
      const nx = clamp(ox + Math.round((ev.clientX - startX) / colStride), 0, maxX);
      const ny = clamp(oy + Math.round((ev.clientY - startY) / rowStride), 0, MAX_ROW);
      if (nx === latest.x && ny === latest.y) return; // only re-render on a cell change
      latest = { x: nx, y: ny };
      setDrag({ id: tile.id, x: nx, y: ny });
    }
    async function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (latest.x !== ox || latest.y !== oy) {
        await editTile(tile.id, { x: latest.x, y: latest.y });
      }
      setDrag(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startResize(tile, axis, e) {
    e.preventDefault();
    e.stopPropagation();
    const { cols, colStride, rowStride } = cellMetrics();
    const startX = e.clientX;
    const startY = e.clientY;
    const ow = tile.w || 1;
    const oh = tile.h || 1;
    const maxW = Math.min(MAX_SPAN, cols);
    let latest = { w: ow, h: oh };
    setResizing({ id: tile.id, w: ow, h: oh });

    function onMove(ev) {
      const dw = axis === 'y' ? 0 : Math.round((ev.clientX - startX) / colStride);
      const dh = axis === 'x' ? 0 : Math.round((ev.clientY - startY) / rowStride);
      const w = clamp(ow + dw, 1, maxW);
      const h = clamp(oh + dh, 1, MAX_H);
      if (w === latest.w && h === latest.h) return; // only re-render on a cell change
      latest = { w, h };
      setResizing({ id: tile.id, w, h });
    }
    async function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (latest.w !== ow || latest.h !== oh) {
        await editTile(tile.id, { w: latest.w, h: latest.h });
      }
      setResizing(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  async function onModalSave(data) {
    if (modalTile) {
      await editTile(modalTile.id, data);
    } else {
      // Drop new tiles into the first free slot of their target group so they
      // don't land on top of an existing tile at (0,0).
      const group = data.config?.group || '';
      const peers = tiles.value.filter((tl) => (tl.config?.group || '') === group);
      const slot = placeBox(occupancyOf(peers, columns), columns, data.w || 2, data.h || 1);
      await addTile({ ...data, x: slot.x, y: slot.y });
    }
    setModalTile(undefined);
  }

  function renderTile(item) {
    const tl = item.tile;
    return (
      <TileCard
        key={tl.id}
        tile={tl}
        editing={editing}
        narrow={narrow}
        placement={narrow ? { w: Math.min(tl.w || 1, NARROW_COLS), h: tl.h || 1 } : item}
        dragging={drag?.id === tl.id}
        resizing={resizing?.id === tl.id}
        sizeLabel={resizing?.id === tl.id ? `${resizing.w}×${resizing.h}` : null}
        onEdit={() => setModalTile(tl)}
        onDragStart={(e) => startDrag(tl, e)}
        onResizeStart={(axis, e) => startResize(tl, axis, e)}
      />
    );
  }

  function renderGroupHeader(name, count, isCollapsed, style) {
    return (
      <button
        key={`h:${name}`}
        type="button"
        class="tile-group-header"
        data-group={name}
        data-collapsed={isCollapsed ? '' : undefined}
        style={style}
        onClick={() => toggleGroup(name)}
      >
        <span class="tile-group-caret">▾</span>
        {name}
        <span class="tile-group-count">{count}</span>
      </button>
    );
  }

  // Narrow screens: fall back to auto-flow (explicit x/y can't fit 2 columns).
  function renderNarrow() {
    const out = [];
    for (const g of groups) {
      if (g.name !== '') {
        const isCollapsed = collapsed.has(g.name);
        out.push(renderGroupHeader(g.name, g.tiles.length, isCollapsed, { gridColumn: '1 / -1' }));
        if (isCollapsed) continue;
      }
      for (const tl of g.tiles) out.push(renderTile({ tile: tl }));
    }
    return out;
  }

  const gridStyle = {
    gridTemplateColumns: `repeat(${narrow ? NARROW_COLS : columns}, minmax(0, 1fr))`,
    gridAutoRows: `${rowHeight}px`,
    gap: `${gap}px`,
  };

  return (
    <section class="tile-section">
      <div class="tile-section-bar">
        {editing && (
          <button class="add-tile-btn add-tile-btn-inline" onClick={() => setModalTile(null)}>
            {t('page.addTile')}
          </button>
        )}
        <button class={`page-edit-btn${editing ? ' active' : ''}`} onClick={() => setEditing((v) => !v)}>
          {editing ? t('page.done') : t('page.edit')}
        </button>
      </div>

      {(drag || resizing) && (
        <div class="tile-drag-overlay" style={{ cursor: drag ? 'grabbing' : 'nwse-resize' }} />
      )}

      <div
        class={`tile-grid${editing ? ' tile-grid-editing' : ''}${narrow ? ' tile-grid-narrow' : ''}`}
        ref={gridRef}
        style={gridStyle}
      >
        {narrow
          ? renderNarrow()
          : !hasGroups
            ? layout.map(renderTile)
            : layout.map((item) =>
                item.kind === 'header'
                  ? renderGroupHeader(item.name, item.count, item.collapsed, {
                      gridColumn: '1 / -1',
                      gridRow: String(item.row),
                    })
                  : renderTile(item)
              )}
      </div>

      {modalTile !== undefined && (
        <TileModal
          tile={modalTile}
          onClose={() => setModalTile(undefined)}
          onSave={onModalSave}
          onDelete={
            modalTile
              ? async () => {
                  await removeTile(modalTile.id);
                  setModalTile(undefined);
                }
              : undefined
          }
        />
      )}
    </section>
  );
}
