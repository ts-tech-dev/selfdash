-- Widen tiles.type beyond link/widget/iframe to cover the built-in info/data tile
-- types (clock, weather, notes, search, rss, calendar, bookmarks, customapi,
-- resources). SQLite can't ALTER a CHECK constraint, so the table is rebuilt.

CREATE TABLE tiles_new (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id        INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN (
                   'link', 'widget', 'iframe',
                   'clock', 'weather', 'notes', 'search', 'rss',
                   'calendar', 'bookmarks', 'customapi', 'resources'
                 )),
  x              INTEGER NOT NULL DEFAULT 0,
  y              INTEGER NOT NULL DEFAULT 0,
  w              INTEGER NOT NULL DEFAULT 1,
  h              INTEGER NOT NULL DEFAULT 1,
  position       INTEGER NOT NULL DEFAULT 0,
  title          TEXT,
  url            TEXT,
  icon           TEXT,
  description    TEXT,
  open_mode      TEXT NOT NULL DEFAULT 'newtab' CHECK (open_mode IN ('newtab', 'same', 'iframe')),
  integration_id INTEGER REFERENCES integrations(id) ON DELETE SET NULL,
  config_json    TEXT NOT NULL DEFAULT '{}'
);

INSERT INTO tiles_new
  (id, page_id, type, x, y, w, h, position, title, url, icon, description, open_mode, integration_id, config_json)
SELECT
  id, page_id, type, x, y, w, h, position, title, url, icon, description, open_mode, integration_id, config_json
FROM tiles;

DROP TABLE tiles;
ALTER TABLE tiles_new RENAME TO tiles;
CREATE INDEX idx_tiles_page_id ON tiles(page_id);
