import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = resolve(import.meta.dirname, '..', '..');
const ENTRY = join(ROOT, 'src', 'server.js');

// node:sqlite is stable on Node 24 but still needs these flags on Node 22 (what the
// Docker image ships). Passing them always is harmless on newer Node.
const NODE_FLAGS = ['--experimental-sqlite', '--disable-warning=ExperimentalWarning'];

// Ask the OS for a free TCP port, then release it. There's a small TOCTOU window
// before the child re-binds it, but it's far tighter than any hashing scheme and
// has proven reliable for parallel test files.
function freePort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

/**
 * Boot the real src/server.js as a child process against a fresh temp data dir.
 * Returns { base, port, dataDir, env, stop, request }.
 *
 * Pass a node:test context (`t`) and cleanup is wired to `t.after`. In a
 * `describe()` suite there is no such context in `before()`, so omit `t` and
 * call `after(() => server.stop())` yourself.
 *
 * @param {import('node:test').TestContext} [t]
 * @param {{ appSecret?: string|null, env?: Record<string,string>, pollMinInterval?: number, port?: number }} [opts]
 */
export async function startServer(t, opts = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'selfdash-srv-'));
  const port = opts.port ?? (await freePort());
  const env = {
    ...process.env,
    PORT: String(port),
    DATA_DIR: dataDir,
    LOG_LEVEL: process.env.TEST_LOG_LEVEL || 'silent',
    POLL_MIN_INTERVAL: String(opts.pollMinInterval ?? 15),
    NODE_ENV: 'test',
    ...(opts.appSecret ? { APP_SECRET: opts.appSecret } : { APP_SECRET: '' }),
    ...(opts.env || {}),
  };

  const child = spawn(process.execPath, [...NODE_FLAGS, ENTRY], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  child.stdout.on('data', () => {});

  let exited = false;
  child.on('exit', () => (exited = true));

  const base = `http://127.0.0.1:${port}`;

  async function stop() {
    if (!exited) {
      child.kill('SIGTERM');
      await Promise.race([once(child, 'exit'), sleep(4000)]);
      if (!exited) child.kill('SIGKILL');
    }
    rmSync(dataDir, { recursive: true, force: true });
  }
  if (t && typeof t.after === 'function') t.after(stop);

  // Wait for /healthz. ~15s ceiling covers a cold Node start on a busy CI box.
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(`server exited during startup (code ${child.exitCode})\n--- stderr ---\n${stderr}`);
    }
    try {
      const res = await fetch(`${base}/healthz`);
      if (res.ok) {
        const body = await res.json();
        if (body.status === 'ok') break;
      }
    } catch {
      // not up yet
    }
    await sleep(150);
  }
  if (Date.now() >= deadline) {
    await stop();
    throw new Error(`server did not become healthy on ${base}\n--- stderr ---\n${stderr}`);
  }

  // Small fetch wrapper: JSON in, { status, headers, body } out.
  async function request(path, { method = 'GET', body, headers, raw } = {}) {
    const init = { method, headers: { ...(headers || {}) } };
    if (body !== undefined && !raw) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    } else if (raw) {
      init.body = body;
    }
    const res = await fetch(base + path, init);
    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, headers: res.headers, body: parsed, text };
  }

  return { base, port, dataDir, env, child, stop, request };
}
