import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase } from '../../src/db/index.js';
import { makeTmpDir } from '../helpers/tmpdir.mjs';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', '..', 'src', 'db', 'migrations');
const sqlMigrations = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

// node:sqlite rows are null-prototype objects; normalise for deepEqual.
const plain = (row) => ({ ...row });

function withDb(t) {
  const { dir, cleanup } = makeTmpDir();
  const db = openDatabase(dir);
  t.after(() => {
    db.close();
    cleanup();
  });
  return db;
}

test('openDatabase: applies every .sql migration plus the JS layout backfill', (t) => {
  const db = withDb(t);
  const applied = db.prepare('SELECT id FROM migrations ORDER BY id').all().map((r) => r.id);
  for (const f of sqlMigrations) assert.ok(applied.includes(f), `sql migration ${f} applied`);
  assert.ok(applied.includes('js:backfill-tile-xy-1'), 'JS backfill marker recorded');
  assert.equal(applied.length, sqlMigrations.length + 1);
});

test('openDatabase: creates the core tables', (t) => {
  const db = withDb(t);
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => r.name);
  for (const name of ['settings', 'pages', 'integrations', 'tiles', 'migrations']) {
    assert.ok(tables.includes(name), `table ${name} exists`);
  }
});

test('openDatabase: seeds exactly one default page named Home', (t) => {
  const db = withDb(t);
  const pages = db.prepare('SELECT name, slug FROM pages').all().map(plain);
  assert.deepEqual(pages, [{ name: 'Home', slug: 'home' }]);
});

test('openDatabase: idempotent across reopens (no duplicate page, no migration re-run)', (t) => {
  const { dir, cleanup } = makeTmpDir();
  t.after(cleanup);
  let db = openDatabase(dir);
  const firstCount = db.prepare('SELECT COUNT(*) AS c FROM migrations').get().c;
  db.close();
  db = openDatabase(dir);
  t.after(() => db.close());
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM pages').get().c, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM migrations').get().c, firstCount);
});

test('tiles.type CHECK constraint accepts panel types, rejects unknown', (t) => {
  const db = withDb(t);
  const pageId = db.prepare('SELECT id FROM pages LIMIT 1').get().id;
  assert.doesNotThrow(() =>
    db.prepare('INSERT INTO tiles (page_id, type) VALUES (?, ?)').run(pageId, 'clock')
  );
  assert.throws(() =>
    db.prepare('INSERT INTO tiles (page_id, type) VALUES (?, ?)').run(pageId, 'not-a-type')
  );
});

test('deleting a page cascades to its tiles', (t) => {
  const db = withDb(t);
  const pageId = db.prepare('SELECT id FROM pages LIMIT 1').get().id;
  db.prepare('INSERT INTO tiles (page_id, type) VALUES (?, ?)').run(pageId, 'clock');
  db.prepare('DELETE FROM pages WHERE id = ?').run(pageId);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM tiles WHERE page_id = ?').get(pageId).c, 0);
});
