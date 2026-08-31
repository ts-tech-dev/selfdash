import { useEffect, useRef, useState } from 'preact/hooks';
import Sortable from 'sortablejs';
import { tiles, addTile, editTile, removeTile, reorderTiles, refreshTileHealth } from '../store.js';
import { TileCard } from './TileCard.jsx';
import { TileModal } from './TileModal.jsx';

const ROW_HEIGHT = 96; // keep in sync with .tile-grid's grid-auto-rows in style.css
const MAX_H = 6;
const HEALTH_POLL_MS = 30_000;

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function TileGrid({ page }) {
  const gridRef = useRef(null);
  const sortableRef = useRef(null);
  const [editing, setEditing] = useState(false); // page-wide edit mode: reveals per-tile controls
  const [modalTile, setModalTile] = useState(undefined); // undefined = closed, null = new, object = edit
  const [resizing, setResizing] = useState(null); // { id, w, h } while a resize drag is in progress

  useEffect(() => {
    if (!gridRef.current) return;
    sortableRef.current = new Sortable(gridRef.current, {
      animation: 150,
      handle: '.tile-drag-handle',
      disabled: !editing,
      onEnd: () => {
        const ids = Array.from(gridRef.current.children).map((el) => Number(el.dataset.id));
        reorderTiles(ids);
      },
    });
    return () => sortableRef.current?.destroy();
  }, [page.id]);

  // Reordering is only possible in edit mode (the drag handles are hidden otherwise).
  useEffect(() => {
    sortableRef.current?.option('disabled', !editing);
  }, [editing]);

  // Ping the URL-backed tiles (link / iframe) so each one gets an online/offline dot.
  // Widget tiles derive their dot from the integration poller instead.
  const healthUrls = tiles.value.filter((t) => t.url).map((t) => t.url).join(',');
  useEffect(() => {
    if (!healthUrls) return undefined;
    const urls = healthUrls.split(',');
    refreshTileHealth(urls);
    const timer = setInterval(() => refreshTileHealth(urls), HEALTH_POLL_MS);
    return () => clearInterval(timer);
  }, [healthUrls]);

  function startResize(tile, e) {
    e.preventDefault();
    e.stopPropagation();
    const gridEl = gridRef.current;
    if (!gridEl) return;

    const rect = gridEl.getBoundingClientRect();
    const cs = getComputedStyle(gridEl);
    const numCols = cs.gridTemplateColumns.split(' ').filter(Boolean).length;
    const gap = parseFloat(cs.columnGap) || 0;
    const colWidth = (rect.width - gap * (numCols - 1)) / numCols;

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = tile.w;
    const startH = tile.h;

    setResizing({ id: tile.id, w: startW, h: startH });
    sortableRef.current?.option('disabled', true);

    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const w = clamp(startW + Math.round(dx / (colWidth + gap)), 1, numCols);
      const h = clamp(startH + Math.round(dy / (ROW_HEIGHT + gap)), 1, MAX_H);
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

  return (
    <section class="tile-section">
      <div class="tile-section-bar">
        <button
          class={`page-edit-btn${editing ? ' active' : ''}`}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? 'Done' : 'Edit page'}
        </button>
      </div>
      <div class={`tile-grid${editing ? ' tile-grid-editing' : ''}`} ref={gridRef}>
        {tiles.value.map((tile) => (
          <TileCard
            key={tile.id}
            tile={tile}
            editing={editing}
            sizeOverride={resizing?.id === tile.id ? resizing : null}
            onEdit={() => setModalTile(tile)}
            onResizeStart={(e) => startResize(tile, e)}
          />
        ))}
      </div>
      {editing && (
        <button class="add-tile-btn" onClick={() => setModalTile(null)}>
          + Add tile
        </button>
      )}
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
