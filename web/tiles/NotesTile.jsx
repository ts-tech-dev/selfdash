import { useEffect, useRef, useState } from 'preact/hooks';
import { renderMarkdown } from './md.js';
import { editTile } from '../store.js';

// Notes are editable in place — double-click the note (or hit the ✎) without
// entering page edit mode.
export function NotesTile({ tile }) {
  const stored = tile.config?.markdown || '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(stored);
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(stored);
  }, [stored, editing]);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.selectionStart = ref.current.value.length;
    }
  }, [editing]);

  async function save() {
    if (!editing) return;
    setEditing(false);
    if (draft === stored) return;
    setSaving(true);
    try {
      await editTile(tile.id, { config: { ...tile.config, markdown: draft } });
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      setDraft(stored);
      setEditing(false);
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
  }

  if (editing) {
    return (
      <div class="tile-panel tile-notes tile-notes-editing">
        <textarea
          ref={ref}
          value={draft}
          placeholder="Markdown…  (Esc to cancel · ⌘/Ctrl+Enter to save)"
          onInput={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={save}
        />
      </div>
    );
  }

  return (
    <div class="tile-panel tile-notes tile-markdown" onDblClick={() => setEditing(true)}>
      <button
        class="tile-notes-edit"
        title="Edit note"
        onClick={() => setEditing(true)}
        disabled={saving}
      >
        ✎
      </button>
      {stored.trim() ? (
        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(stored) }} />
      ) : (
        <span class="tile-notes-hint">Double-click to write a note…</span>
      )}
    </div>
  );
}
