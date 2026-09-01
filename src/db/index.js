import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { backfillTileLayout } from './backfillLayout.js';

// node:sqlite is experimental on Node 22. The `--disable-warning=ExperimentalWarning`
// CLI flag (set alongside --experimental-sqlite in package.json / Dockerfile CMD)
// silences it; a `process.on('warning', ...)` listener does not, since Node's
// default stderr printer still runs even when a custom listener is attached.

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

export function openDatabase(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'selfdash.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  runMigrations(db);
  backfillTileLayout(db);
  ensureDefaultPage(db);
  return db;
}

function ensureDefaultPage(db) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM pages').get().c;
  if (count === 0) {
    db.prepare('INSERT INTO pages (name, slug, position) VALUES (?, ?, ?)').run('Home', 'home', 0);
  }
}

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id         TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db.prepare('SELECT id FROM migrations').all().map((row) => row.id)
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const insertMigration = db.prepare('INSERT INTO migrations (id) VALUES (?)');

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      insertMigration.run(file);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`migration ${file} failed: ${err.message}`, { cause: err });
    }
  }
}
