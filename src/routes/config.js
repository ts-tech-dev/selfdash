import { exportConfigYaml, importConfigYaml } from '../lib/configFile.js';

// Human-readable, version-controllable YAML snapshot of pages / tiles / integrations
// / settings. SQLite stays the source of truth; this is for git, diffing, sharing,
// and reproducing an instance. Secrets are exported as ${SELFDASH_SECRET_*}
// placeholders and resolved from the environment on import.
export default async function configRoutes(app) {
  // Accept a raw YAML body (curl --data-binary @file) in addition to multipart.
  app.addContentTypeParser(
    ['application/yaml', 'application/x-yaml', 'text/yaml', 'text/plain'],
    { parseAs: 'string' },
    (_req, body, done) => done(null, body)
  );

  app.get('/api/config/export', async (_req, reply) => {
    const yaml = exportConfigYaml(app.db, app.integrationCrypto, app.integrationRegistry);
    const filename = `selfdash-config-${new Date().toISOString().slice(0, 10)}.yaml`;
    reply.header('Content-Type', 'application/yaml; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    return yaml;
  });

  app.post('/api/config/import', async (req, reply) => {
    let text = '';
    const ct = req.headers['content-type'] || '';

    if (ct.includes('multipart/form-data')) {
      const file = await req.file({ limits: { fileSize: 5 * 1024 * 1024 } });
      if (!file) return reply.code(400).send({ error: 'no file uploaded' });
      const name = (file.filename || '').toLowerCase();
      if (!name.endsWith('.yaml') && !name.endsWith('.yml')) {
        return reply.code(400).send({ error: 'expected a .yaml file' });
      }
      const chunks = [];
      for await (const c of file.file) chunks.push(c);
      text = Buffer.concat(chunks).toString('utf8');
    } else {
      text = typeof req.body === 'string' ? req.body : '';
      if (!text.trim()) return reply.code(400).send({ error: 'empty request body' });
    }

    const includeSettings = req.query?.settings !== '0';
    try {
      const result = importConfigYaml(app, text, { includeSettings });
      return { ok: true, ...result };
    } catch (err) {
      req.log.warn(err, 'config import failed');
      return reply.code(400).send({ error: err.message });
    }
  });
}
