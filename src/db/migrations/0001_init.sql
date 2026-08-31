CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE TABLE pages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  position     INTEGER NOT NULL DEFAULT 0,
  background   TEXT,
  options_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE integrations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key           TEXT NOT NULL,
  name          TEXT NOT NULL,
  config_json   TEXT NOT NULL DEFAULT '{}',
  interval      INTEGER NOT NULL DEFAULT 60,
  enabled       INTEGER NOT NULL DEFAULT 1,
  last_status   TEXT NOT NULL DEFAULT 'unknown',
  last_data_json TEXT,
  last_ok_at    TEXT,
  last_error    TEXT
);

CREATE TABLE tiles (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id        INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('link', 'widget', 'iframe')),
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

CREATE INDEX idx_tiles_page_id ON tiles(page_id);
