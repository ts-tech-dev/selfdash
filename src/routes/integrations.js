import { decodeConfig, encodeConfig, maskConfig, mergeConfig, validateConfig } from '../integrations/configCodec.js';

const MIN_INTERVAL_FLOOR = 5;

export default async function integrationsRoutes(app) {
  const db = app.db;
  const registry = app.integrationRegistry;
  const crypto = app.integrationCrypto;

  app.get('/api/integrations/available', async () => {
    return [...registry.entries()].map(([key, Cls]) => ({
      key,
      title: Cls.title || key,
      defaultInterval: Cls.defaultInterval || 60,
      configSchema: Cls.configSchema || { fields: [] },
      // { viewKey: label } — which views this integration type can produce, in its
      // declared order. Empty for integrations with a single fixed shape. Tiles use
      // this to build their own "Show" picker (view selection lives on the tile now,
      // not the integration, so two tiles on the same integration can show different
      // things — see web/components/TileModal.jsx).
      views: Cls.views || {},
    }));
  });

  app.get('/api/integrations', async () => {
    return db.prepare('SELECT * FROM integrations ORDER BY id').all().map((row) => mapIntegration(row, registry, crypto));
  });

  app.post('/api/integrations', async (req, reply) => {
    const body = req.body || {};
    const IntegrationClass = registry.get(body.key);
    if (!IntegrationClass) return reply.code(400).send({ error: `unknown integration key: ${body.key}` });

    const configObj = body.config || {};
    const errors = validateConfig(IntegrationClass, configObj);
    if (errors.length) return reply.code(400).send({ error: errors.join('; ') });

    const name = String(body.name || IntegrationClass.title || IntegrationClass.key).trim();
    const interval = clampInterval(Number(body.interval) || IntegrationClass.defaultInterval || 60, app.config.pollMinInterval);
    const enabled = body.enabled === false ? 0 : 1;

    const info = db
      .prepare(
        `INSERT INTO integrations (key, name, config_json, interval, enabled, last_status)
         VALUES (?, ?, ?, ?, ?, 'unknown')`
      )
      .run(body.key, name, encodeConfig(configObj, crypto), interval, enabled);

    const row = db.prepare('SELECT * FROM integrations WHERE id = ?').get(info.lastInsertRowid);
    if (enabled) app.poller.schedule(row);
    return reply.code(201).send(mapIntegration(row, registry, crypto));
  });

  app.patch('/api/integrations/:id', async (req, reply) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM integrations WHERE id = ?').get(id);
    if (!existing) return reply.code(404).send({ error: 'not found' });

    const IntegrationClass = registry.get(existing.key);
    if (!IntegrationClass) return reply.code(409).send({ error: `integration type '${existing.key}' is no longer available` });

    const body = req.body || {};

    // Only touch config_json if the caller is actually changing config — this way renaming,
    // enabling/disabling, or re-scheduling an integration never requires successfully decoding
    // its stored config first, and even a config edit can recover from an undecryptable stored
    // value (e.g. one written before APP_SECRET was set) as long as the caller resupplies it.
    let configJson = existing.config_json;
    if (body.config !== undefined) {
      let existingConfig;
      try {
        existingConfig = decodeConfig(existing.config_json, crypto);
      } catch {
        existingConfig = {};
      }
      const nextConfig = mergeConfig(existingConfig, body.config, IntegrationClass);
      const errors = validateConfig(IntegrationClass, nextConfig);
      if (errors.length) return reply.code(400).send({ error: errors.join('; ') });
      configJson = encodeConfig(nextConfig, crypto);
    }

    const next = {
      name: body.name !== undefined ? String(body.name).trim() || existing.name : existing.name,
      interval:
        body.interval !== undefined
          ? clampInterval(Number(body.interval), app.config.pollMinInterval)
          : existing.interval,
      enabled: body.enabled !== undefined ? (body.enabled ? 1 : 0) : existing.enabled,
    };

    db.prepare('UPDATE integrations SET name = ?, config_json = ?, interval = ?, enabled = ? WHERE id = ?').run(
      next.name,
      configJson,
      next.interval,
      next.enabled,
      id
    );

    const row = db.prepare('SELECT * FROM integrations WHERE id = ?').get(id);
    app.poller.reschedule(row);
    return mapIntegration(row, registry, crypto);
  });

  app.delete('/api/integrations/:id', async (req, reply) => {
    const id = Number(req.params.id);
    app.poller.unschedule(id);
    const info = db.prepare('DELETE FROM integrations WHERE id = ?').run(id);
    if (info.changes === 0) return reply.code(404).send({ error: 'not found' });
    // Tiles pointed at this integration as their *primary* binding are handled by the
    // integration_id FK's ON DELETE SET NULL. A tile that also merged this integration in
    // as an extra source (config.moreIntegrationIds — see tileConfig.js) isn't FK-tracked,
    // so prune it here.
    pruneIntegrationFromWidgetTiles(db, id);
    return reply.code(204).send();
  });

  app.post('/api/integrations/:id/poll', async (req, reply) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM integrations WHERE id = ?').get(id);
    if (!row) return reply.code(404).send({ error: 'not found' });
    await app.poller.pollNow(id);
    return mapIntegration(db.prepare('SELECT * FROM integrations WHERE id = ?').get(id), registry, crypto);
  });
}

function pruneIntegrationFromWidgetTiles(db, integrationId) {
  const rows = db.prepare("SELECT id, config_json FROM tiles WHERE type = 'widget'").all();
  db.exec('BEGIN');
  try {
    for (const t of rows) {
      let cfg;
      try {
        cfg = JSON.parse(t.config_json || '{}');
      } catch {
        continue;
      }
      if (!Array.isArray(cfg.moreIntegrationIds) || !cfg.moreIntegrationIds.includes(integrationId)) continue;
      cfg.moreIntegrationIds = cfg.moreIntegrationIds.filter((x) => x !== integrationId);
      if (!cfg.moreIntegrationIds.length) delete cfg.moreIntegrationIds;
      db.prepare('UPDATE tiles SET config_json = ? WHERE id = ?').run(JSON.stringify(cfg), t.id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function clampInterval(n, floor) {
  const min = Math.max(floor || MIN_INTERVAL_FLOOR, MIN_INTERVAL_FLOOR);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.round(n));
}

function mapIntegration(row, registry, crypto) {
  const IntegrationClass = registry.get(row.key);

  let config = {};
  try {
    config = decodeConfig(row.config_json, crypto);
  } catch {
    config = {};
  }

  let data = null;
  try {
    data = row.last_data_json ? JSON.parse(row.last_data_json) : null;
  } catch {
    data = null;
  }

  return {
    id: row.id,
    key: row.key,
    name: row.name,
    title: IntegrationClass?.title || row.key,
    available: Boolean(IntegrationClass),
    interval: row.interval,
    enabled: Boolean(row.enabled),
    last_status: row.last_status,
    last_ok_at: row.last_ok_at,
    last_error: row.last_error,
    data,
    config: IntegrationClass ? maskConfig(config, IntegrationClass) : config,
  };
}
