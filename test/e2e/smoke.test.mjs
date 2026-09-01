import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readdirSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { startServer } from '../helpers/server.mjs';

// Locate a headless-capable Chrome/Chromium. Honors $CHROME_BIN, then PATH, then a
// Playwright browser cache. Returns null if nothing usable is found.
function findChrome() {
  if (process.env.CHROME_BIN && existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  for (const name of ['google-chrome', 'chromium', 'chromium-browser', 'chrome']) {
    const hit = tryWhich(name);
    if (hit) return hit;
  }
  const pw = join(process.env.HOME || '', '.cache', 'ms-playwright');
  if (existsSync(pw)) {
    for (const d of readdirSync(pw)) {
      for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-headless-shell-linux64/chrome-headless-shell']) {
        const p = join(pw, d, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  return null;
}

function tryWhich(name) {
  try {
    return execSync(`command -v ${name}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch {
    return null;
  }
}

async function screenshot(chrome, url, outPath) {
  const args = [
    '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--hide-scrollbars', '--virtual-time-budget=8000', '--window-size=1200,800',
    `--screenshot=${outPath}`, url,
  ];
  const child = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => (err += d));
  const [code] = await once(child, 'exit');
  return { code, err };
}

async function dumpDom(chrome, url) {
  const child = spawn(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--virtual-time-budget=8000', '--dump-dom', url], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  await once(child, 'exit');
  return out;
}

// Verify the binary can actually start (system libs present, etc). A found-but-unlaunchable
// Chrome (common in minimal containers) skips the suite instead of failing it.
function chromeRuns(bin) {
  if (!bin) return false;
  try {
    execSync(`"${bin}" --headless --no-sandbox --disable-gpu --dump-dom about:blank`, {
      stdio: 'ignore',
      timeout: 20000,
    });
    return true;
  } catch {
    return false;
  }
}

const chrome = findChrome();
const chromeOk = chromeRuns(chrome);
const skipReason = chrome
  ? chromeOk
    ? false
    : `Chrome at ${chrome} could not launch (missing system libs?) — set $CHROME_BIN / LD_LIBRARY_PATH`
  : 'no Chrome/Chromium found (set $CHROME_BIN to enable)';

describe('browser smoke', { skip: skipReason }, () => {
  let s, workdir;
  before(async () => {
    s = await startServer(null);
    workdir = mkdtempSync(join(tmpdir(), 'selfdash-e2e-'));
  });
  after(() => { rmSync(workdir, { recursive: true, force: true }); return s.stop(); });

  it('renders the dashboard shell without a blank frame', async () => {
    const out = join(workdir, 'home.png');
    const { code, err } = await screenshot(chrome, s.base + '/', out);
    assert.equal(code, 0, `chrome exited ${code}: ${err.slice(0, 400)}`);
    assert.ok(existsSync(out), 'screenshot was written');
    assert.ok(readFileSync(out).length > 3000, 'screenshot is not an empty/near-blank PNG');
  });

  it('hydrates: the app root gets Preact content and shows the site title', async () => {
    const dom = await dumpDom(chrome, s.base + '/');
    assert.match(dom, /<div id="app">\s*<[a-z]/i, 'the #app root was populated by the client');
    assert.match(dom, /selfdash/i);
  });

  it('applies an uploaded global background (data-has-bg on <body>)', async () => {
    // set a bright background so a wrongly-wired pseudo-element is obvious
    await s.request('/api/settings', {
      method: 'PATCH',
      body: { global_background: 'data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2710%27%20height=%2710%27%3E%3Crect%20width=%2710%27%20height=%2710%27%20fill=%27%2300ff00%27/%3E%3C/svg%3E' },
    });
    await sleep(200);
    const dom = await dumpDom(chrome, s.base + '/');
    assert.match(dom, /<body[^>]*\bdata-has-bg\b/i, 'the background flag is on <body>, so body[data-has-bg]::before renders');
  });
});
