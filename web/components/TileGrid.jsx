import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { tiles, addTile, editTile, removeTile, reorderTiles, refreshTileHealth } from '../store.js';
import { TileCard } from './TileCard.jsx';
import { TileModal } from './TileModal.jsx';
import { t } from '../i18n.js';

const DEFAULT_ROW_HEIGHT = 96;
const MAX_H = 6;
const HEALTH_POLL_MS = 30_000;

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
  const sortableRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [modalTile, setModalTile] = useState(undefined);
  const [resizing, setResizing] = useState(null);
  const [collapsed, setCollapsed] = useState(() => loadCollapsed(page.id));

  const gridOpts = page.options?.grid || {};
  const columns = gridOpts.columns || 6;
  const gap = gridOpts.gap ?? 14;
  const rowHeight = gridOpts.rowHeight || DEFAULT_ROW_HEIGHT;

  const gridStyle = {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gridAutoRows: `${rowHeight}px`,
    gap: `${gap}px`,
  };

  useEffect(() => {
    setCollapsed(loadCollapsed(page.id));
  }, [page.id]);

  useEffect(() => {
    if (!gridRef.current) return;
    sortableRef.current = new Sortable(gridRef.current, {
      animation: 150,
      handle: '.tile-drag-handle',
      draggable: '.tile',
      disabled: !editing,
      onEnd: onDragEnd,
    });
    return () => sortableRef.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  useEffect(() => {
    sortableRef.current?.option('disabled', !editing);
  }, [editing]);

  const healthUrls = tiles.value.filter((t) => t.url).map((t) => t.url).join(',');
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
    for (const t of tiles.value) {
      const g = t.config?.group || '';
      if (!byGroup.has(g)) {
        byGroup.set(g, []);
        order.push(g);
      }
      byGroup.get(g).push(t);
    }
    order.sort((a, b) => (a === '' ? -1 : b === '' ? 1 : 0));
    return order.map((g) => ({ name: g, tiles: byGroup.get(g) }));
  }, [tiles.value]);

  const hasGroups = groups.some((g) => g.name !== '');

  async function onDragEnd() {
    const children = Array.from(gridRef.current.children);
    const byId = new Map(tiles.value.map((t) => [t.id, t]));
    let curGroup = '';
    const order = [];
    const moves = [];
    for (const el of children) {
      if (el.classList.contains('tile-group-header')) {
        curGroup = el.dataset.group || '';
        continue;
      }
      const id = Number(el.dataset.id);
      if (!id) continue;
      order.push(id);
      const t = byId.get(id);
      if (t && (t.config?.group || '') !== curGroup) moves.push({ t, group: curGroup });
    }
    await reorderTiles(order);
    for (const m of moves) {
      const cfg = { ...m.t.config };
      if (m.group) cfg.group = m.group;
      else delete cfg.group;
      await editTile(m.t.id, { config: cfg });
    }
  }

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

  function startResize(tile, e) {
    e.preventDefault();
    e.stopPropagation();
    const gridEl = gridRef.current;
    if (!gridEl) return;

    const rect = gridEl.getBoundingClientRect();
    const cs = getComputedStyle(gridEl);
    const numCols = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
    const colGap = parseFloat(cs.columnGap) || 0;
    const colWidth = (rect.width - colGap * (numCols - 1)) / numCols;

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = tile.w;
    const startH = tile.h;

    setResizing({ id: tile.id, w: startW, h: startH });
    sortableRef.current?.option('disabled', true);

    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const w = clamp(startW + Math.round(dx / (colWidth + colGap)), 1, numCols);
      const h = clamp(startH + Math.round(dy / (rowHeight + gap)), 1, MAX_H);
      setResizing({ id: tile.id, w, h });
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      sortableRef.current?.option('disabled', false);
      setResizing((r) => {
        if (r && (r.w !== tile.w || r.h !== tile.h)) editTile(tile.id, { w: r.w, h: r.h });
        return null;
      });
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function renderTile(tile) {
    return (
      <TileCard
        key={tile.id}
        tile={tile}
        editing={editing}
        sizeOverride={resizing?.id === tile.id ? resizing : null}
        onEdit={() => setModalTile(tile)}
        onResizeStart={(e) => startResize(tile, e)}
      />
    );
  }

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

      <div class={`tile-grid${editing ? ' tile-grid-editing' : ''}`} ref={gridRef} style={gridStyle}>
        {!hasGroups
          ? tiles.value.map(renderTile)
          : groups.flatMap((g) => {
              const rows = [];
              if (g.name !== '') {
                const isCollapsed = collapsed.has(g.name);
                rows.push(
                  <button
                    key={`h:${g.name}`}
                    type="button"
                    class="tile-group-header"
                    data-group={g.name}
                    data-collapsed={isCollapsed ? '' : undefined}
                    onClick={() => toggleGroup(g.name)}
                  >
                    <span class="tile-group-caret">▾</span>
                    {g.name}
                    <span class="tile-group-count">{g.tiles.length}</span>
                  </button>
                );
                if (isCollapsed) return rows;
              }
              rows.push(...g.tiles.map(renderTile));
              return rows;
            })}
      </div>

      {modalTile !== undefined && (
        <TileModal
          tile={modalTile}
          onClose={() => setModalTile(undefined)}
          onSave={async (data) => {
            if (modalTile) await editTile(modalTile.id, data);
            else await addTile(data);
            setModalTile(undefined);
          }}
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
