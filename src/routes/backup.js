import { ZipArchive } from 'archiver';
import unzipper from 'unzipper';
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, cpSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

const ASSET_DIRS = ['uploads', 'integrations'];

export default async function backupRoutes(app) {
  app.get('/api/backup/export', async (req, reply) => {
    const dataDir = app.config.dataDir;
    const dbPath = join(dataDir, 'selfdash.db');

    // Flush the WAL into the main db file so a plain copy of it is a consistent snapshot.
    app.db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();

    const manifestFiles = [{ path: 'selfdash.db', size: statSync(dbPath).size }];
    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('warning', (err) => req.log.warn(err, 'backup export warning'));
    archive.on('error', (err) => req.log.error(err, 'backup export failed'));
    archive.file(dbPath, { name: 'selfdash.db' });

    for (const dir of ASSET_DIRS) {
      const full = join(dataDir, dir);
      let entries = [];
      try {
        entries = readdirSync(full);
      } catch {
        continue;
      }
      for (const entry of entries) {
        const entryPath = join(full, entry);
        if (!statSync(entryPath).isFile()) continue;
        manifestFiles.push({ path: `${dir}/${entry}`, size: statSync(entryPath).size });
        archive.file(entryPath, { name: `${dir}/${entry}` });
      }
    }

    archive.append(JSON.stringify({ version: 1, createdAt: new Date().toISOString(), files: manifestFiles }, null, 2), {
      name: 'manifest.json',
    });

    const filename = `selfdash-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.send(archive);
    archive.finalize();
  });

  app.post('/api/backup/import', async (req, reply) => {
    // Override the global 5 MB upload limit (sized for icons/backgrounds) — a backup zip
    // bundling the db plus every uploaded asset needs much more headroom.
    const file = await req.file({ limits: { fileSize: 200 * 1024 * 1024 } });
    if (!file) return reply.code(400).send({ error: 'no file uploaded' });
    if (!file.filename?.toLowerCase().endsWith('.zip')) {
      return reply.code(400).send({ error: 'expected a .zip backup file' });
    }

    const dataDir = app.config.dataDir;
    const id = randomUUID();
    const tmpZipPath = join(dataDir, `.import-${id}.zip`);
    const tmpExtractDir = join(dataDir, `.import-extract-${id}`);

    const cleanupTmp = () => {
      rmSync(tmpZipPath, { force: true });
      rmSync(tmpExtractDir, { recursive: true, force: true });
    };

    try {
      await pipeline(file.file, createWriteStream(tmpZipPath));

      const directory = await unzipper.Open.file(tmpZipPath);
      for (const entry of directory.files) {
        if (entry.path.includes('..') || entry.path.startsWith('/')) {
          throw new Error(`unsafe path in archive: ${entry.path}`);
        }
      }
      mkdirSync(tmpExtractDir, { recursive: true });
      await directory.extract({ path: tmpExtractDir, concurrency: 4 });

      const extractedDb = join(tmpExtractDir, 'selfdash.db');
      if (!existsSync(extractedDb)) {
        throw new Error('backup is missing selfdash.db');
      }

      // Safety net: snapshot current data before overwriting anything, never deleted automatically.
      const snapshotDir = join(dataDir, `.pre-import-backup-${Date.now()}`);
      mkdirSync(snapshotDir, { recursive: true });
      for (const name of ['selfdash.db', 'selfdash.db-wal', 'selfdash.db-shm', ...ASSET_DIRS]) {
        const src = join(dataDir, name);
        if (existsSync(src)) cpSync(src, join(snapshotDir, name), { recursive: true });
      }

      app.poller.stopAll();
      app.db.close();

      for (const name of ['selfdash.db', 'selfdash.db-wal', 'selfdash.db-shm']) {
        rmSync(join(dataDir, name), { force: true });
      }
      cpSync(extractedDb, join(dataDir, 'selfdash.db'));

      for (const dir of ASSET_DIRS) {
        const extractedDir = join(tmpExtractDir, dir);
        if (!existsSync(extractedDir)) continue;
        const target = join(dataDir, dir);
        rmSync(target, { recursive: true, force: true });
        cpSync(extractedDir, target, { recursive: true });
      }

      cleanupTmp();

      reply.send({ ok: true, message: `restored — restarting (previous data saved to ${snapshotDir})` });
      // The db handle is closed and the poller stopped; rather than hot-reinitialize both plus the
      // integration registry in-process, exit and let Docker's `restart: unless-stopped` bring the
      // container back up through its normal boot sequence against the newly-restored data.
      setTimeout(() => process.exit(0), 500);
    } catch (err) {
      cleanupTmp();
      return reply.code(400).send({ error: err.message });
    }
  });
}
