# test/

Full-validation suite for selfdash. See [`../TESTPLAN.md`](../TESTPLAN.md) for the
case-by-case catalog and the "add a case when you add a feature" process.

## Run it

```bash
npm test          # unit + API  (~10s, no network, no browser)  <- run this after every change
npm run test:unit # pure logic only (~0.3s)
npm run test:api  # HTTP routes only (~8s)
npm run test:e2e  # headless-browser smoke (skips if no Chrome)
npm run test:all  # unit + API + e2e
npm run test:watch
```

`pretest` runs `node build.js`, so `npm test` also fails if the frontend bundle
breaks.

Filter to one file or test:

```bash
node --experimental-sqlite --disable-warning=ExperimentalWarning --test test/api/tiles.test.mjs
node --experimental-sqlite --disable-warning=ExperimentalWarning --test --test-name-pattern="reorder" "test/**/*.test.mjs"
```

## Layout

```
test/
  helpers/
    server.mjs    boot the real src/server.js as a child process on a free port
                  against a temp DATA_DIR; returns { base, request(), stop, child }
    tmpdir.mjs    throwaway directories with test-scoped cleanup
    fixtures.mjs  sample RSS/Atom/ICS/JSON payloads, sample tiles & integration config
  unit/           import modules from src/ (and web/i18n.js) directly
  api/            one server per file via describe/before/after; every route + status code
  e2e/            headless Chrome loads the built app; auto-skips when no browser
```

## How the API tests work

Each `test/api/*.test.mjs` starts one real server in `before()`:

```js
const s = await startServer(null);                    // no APP_SECRET
const s = await startServer(null, { appSecret: 'x' }); // integration-crypto on
```

- Fresh `mkdtemp` `DATA_DIR` per file → tests never see each other's data.
- OS-assigned free port → files run in parallel without collisions.
- `s.request(path, { method, body, headers })` → `{ status, headers, body, text }`
  (JSON in/out; pass `raw: true` for `FormData`/streams, or use `fetch(s.base + …)`).
- `after(() => s.stop())` kills the child and removes the temp dir.

Feed / custom-API tests start a throwaway loopback HTTP server as the upstream —
**no public network is touched**.

Note: `test/api/backup.test.mjs` verifies that a successful `POST /api/backup/import`
makes the server `process.exit(0)` (Docker then restarts it). That suite's server
is expected to be dead after that test — it runs last in the file.

## Browser smoke

`test/e2e/smoke.test.mjs` looks for Chrome in `$CHROME_BIN`, then `PATH`, then the
Playwright cache (`~/.cache/ms-playwright`). If it finds none that can launch, the
suite **skips** (shown as `﹣`), it does not fail.

To enable it:

```bash
npx playwright install --with-deps chromium   # or:
export CHROME_BIN=/usr/bin/google-chrome
npm run test:e2e
```

On a minimal box where a downloaded Chromium is missing system libs, either
install them (`--with-deps`) or point `CHROME_BIN` at a working browser and set
`LD_LIBRARY_PATH` if needed.

## Conventions

- Node's built-in runner only. No Jest/Vitest/Mocha, no new deps — matches the
  project's "minimal dependencies, no build toolchain at runtime" stance.
- One behaviour + its failure mode per `it()`. Name it so a failure reads as a
  regression report.
- New shared sample data → `helpers/fixtures.mjs`.
- Every new route or exported helper gets a test **and** a row in `TESTPLAN.md`.
