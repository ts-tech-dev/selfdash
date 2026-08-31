import { renderMarkdown } from './md.js';

export function NotesTile({ tile }) {
  const md = tile.config?.markdown || '';
  if (!md.trim()) {
    return <div class="tile-panel tile-notes tile-notes-empty">Empty note — edit the tile to add Markdown.</div>;
  }
  return (
    <div
      class="tile-panel tile-notes tile-markdown"
      // md.js escapes HTML in the source before formatting, so this is safe to inject.
      dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }}
    />
  );
}
