import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.mjs';

// 1x1 transparent PNG
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function upload(base, { bytes = PNG_1PX, type = 'image/png', filename = 'bg.png' } = {}) {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), filename);
  const res = await fetch(`${base}/api/uploads`, { method: 'POST', body: form });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

describe('uploads API', () => {
  let s;
  before(async () => { s = await startServer(null); });
  after(() => s.stop());

  it('accepts a PNG and returns a /uploads/<uuid>.png url that then serves', async () => {
    const u = await upload(s.base);
    assert.equal(u.status, 201);
    assert.match(u.body.url, /^\/uploads\/[0-9a-f-]{36}\.png$/);

    const got = await s.request(u.body.url);
    assert.equal(got.status, 200);
    assert.match(got.headers.get('content-type'), /image\/png/);
  });

  it('rejects an unsupported mime type', async () => {
    const u = await upload(s.base, { bytes: Buffer.from('hello'), type: 'text/plain', filename: 'x.txt' });
    assert.equal(u.status, 400);
    assert.match(u.body.error, /unsupported file type/);
  });

  it('rejects a request with no file part', async () => {
    const res = await fetch(`${s.base}/api/uploads`, { method: 'POST', body: new FormData() });
    assert.equal(res.status, 400);
  });

  it('maps each allowed mime to the right extension', async () => {
    const svg = await upload(s.base, {
      bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      type: 'image/svg+xml',
      filename: 'i.svg',
    });
    assert.match(svg.body.url, /\.svg$/);
  });
});
