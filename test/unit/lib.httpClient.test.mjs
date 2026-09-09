import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpClient } from '../../src/lib/httpClient.js';

// Proxmox/TrueNAS/UniFi-family appliances are almost always fronted by a self-signed
// cert. The `insecureTLS` fetch option (Phase 5's shared enabler) has to genuinely skip
// verification — worth proving against a real TLS handshake, not a mock, since this is
// exactly the kind of thing that silently no-ops if the dispatcher wiring is wrong.
const FIXTURES = join(import.meta.dirname, '..', 'fixtures');
const key = readFileSync(join(FIXTURES, 'selfsigned-key.pem'));
const cert = readFileSync(join(FIXTURES, 'selfsigned-cert.pem'));

function startTlsServer() {
  return new Promise((resolve) => {
    const server = https.createServer({ key, cert }, (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('HttpClient: rejects a self-signed cert by default (fails closed)', async (t) => {
  const server = await startTlsServer();
  t.after(() => server.close());
  const { port } = server.address();

  const client = new HttpClient();
  await assert.rejects(() => client.fetch(`https://127.0.0.1:${port}/`));
});

test('HttpClient: insecureTLS:true accepts the same self-signed cert', async (t) => {
  const server = await startTlsServer();
  t.after(() => server.close());
  const { port } = server.address();

  const client = new HttpClient();
  const data = await client.fetchJson(`https://127.0.0.1:${port}/`, { insecureTLS: true });
  assert.deepEqual(data, { ok: true });
});
