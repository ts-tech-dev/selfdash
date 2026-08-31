import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyMultipart from '@fastify/multipart';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db/index.js';
import pagesRoutes from './routes/pages.js';
import tilesRoutes from './routes/tiles.js';
import settingsRoutes from './routes/settings.js';
import uploadsRoutes from './routes/uploads.js';
import integrationsRoutes from './routes/integrations.js';
import backupRoutes from './routes/backup.js';
import composeScanRoutes from './routes/composeScan.js';
import healthRoutes from './routes/health.js';
import tileDataRoutes from './routes/tileData.js';
import { loadIntegrations } from './integrations/_registry.js';
import { makeCrypto } from './lib/crypto.js';
import { httpClient } from './lib/httpClient.js';
import { createPoller } from './poller/scheduler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const config = {
  port: Number(process.env.PORT) || 3000,
  dataDir: process.env.DATA_DIR || join(__dirname, '..', 'data'),
  logLevel: process.env.LOG_LEVEL || 'info',
  pollMinInterval: Number(process.env.POLL_MIN_INTERVAL) || 15,
  appSecret: process.env.APP_SECRET || null,
};

const app = Fastify({ logger: { level: config.logLevel } });
app.decorate('config', config);

const db = openDatabase(config.dataDir);
app.decorate('db', db);

const uploadsDir = join(config.dataDir, 'uploads');
mkdirSync(uploadsDir, { recursive: true });
app.decorate('uploadsDir', uploadsDir);

app.register(fastifyMultipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

const integrationRegistry = await loadIntegrations(config.dataDir);
app.decorate('integrationRegistry', integrationRegistry);
app.log.info(`loaded ${integrationRegistry.size} integration(s): ${[...integrationRegistry.keys()].join(', ') || '(none)'}`);

const integrationCrypto = makeCrypto(config.appSecret);
app.decorate('integrationCrypto', integrationCrypto);

const poller = createPoller({ db, registry: integrationRegistry, http: httpClient, crypto: integrationCrypto, log: app.log });
app.decorate('poller', poller);
poller.initAll();

app.register(pagesRoutes);
app.register(tilesRoutes);
app.register(settingsRoutes);
app.register(uploadsRoutes);
app.register(integrationsRoutes);
app.register(backupRoutes);
app.register(composeScanRoutes);
app.register(healthRoutes);
app.register(tileDataRoutes);

app.register(fastifyStatic, {
  root: uploadsDir,
  prefix: '/uploads/',
  decorateReply: false,
});

app.register(fastifyStatic, {
  root: join(__dirname, '..', 'public'),
  index: 'index.html',
});

app.get('/healthz', async (_req, reply) => {
  try {
    db.prepare('SELECT 1').get();
    return { status: 'ok' };
  } catch (err) {
    app.log.error(err, 'healthz db check failed');
    return reply.code(503).send({ status: 'error' });
  }
});

app.addHook('onClose', (_instance, done) => {
  poller.stopAll();
  db.close();
  done();
});

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`selfdash listening on :${config.port}, data dir ${config.dataDir}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
