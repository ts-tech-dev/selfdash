# selfdash — Test Plan & Case Catalog

The single source of truth for **what "working" means** in selfdash. Every feature,
route, and shared helper is listed here with its test cases and where they are
verified. Run this after **every** change; extend it whenever you add a feature.

- **How to run:** [`test/README.md`](test/README.md)
- **Automated suite:** `npm test` (unit + API) — 150+ cases, ~10s, no network, no browser
- **Full suite:** `npm run test:all` (adds the browser smoke; needs Chrome)

---

## 1. Validation gate for every change

Before a change is considered done:

1. `npm test` is green (`pretest` rebuilds `public/` first, so a broken frontend
   build fails here too).
2. If the change touched the frontend UI or `web/appearance.js`, also run
   `npm run test:e2e` (or do the manual smoke in §9) — a real browser render.
3. If the change **added or changed behaviour**, this file has a new or updated
   case for it **and** a matching automated test. A PR that changes behaviour
   without touching `test/` is incomplete.
4. `git grep -n 'TODO\|FIXME' test/` is not growing.

Coverage philosophy: **every HTTP route and every pure helper in `src/shared` and
`src/lib` has automated tests**; UI wiring that needs a DOM is covered by the
browser smoke plus the manual checklist in §9.

---

## 2. Test layers

| Layer | Dir | What it exercises | Speed | Deps |
|---|---|---|---|---|
| Unit | `test/unit/` | Pure logic: sanitizers, parsers, crypto, path mapping, DB migrations, i18n, integration registry | ~0.3s | none |
| API | `test/api/` | The real `src/server.js` booted as a child process against a temp SQLite DB; every route via `fetch` | ~8s | none (uses a local throwaway HTTP upstream for feed/customapi) |
| E2E smoke | `test/e2e/` | Headless Chrome loads the built app, hydrates, applies an uploaded background | ~10s | Chrome/Chromium (`$CHROME_BIN`); **skips cleanly if absent** |

Helpers: `test/helpers/server.mjs` (boot/stop a server, `request()` wrapper),
`test/helpers/tmpdir.mjs`, `test/helpers/fixtures.mjs` (sample RSS/Atom/ICS/JSON,
sample tiles & integration config).

---

## 3. Feature catalog

Legend: ✅ automated · 🖐️ manual (§9) · ⏭️ intentionally not covered (reason given)

### 3.1 Pages (`src/routes/pages.js`)
| # | Case | Where |
|---|---|---|
| P1 | Fresh DB seeds exactly one page `Home`/`home` | ✅ `unit/db.migrations` · `api/pages` |
| P2 | `GET /api/pages` returns pages ordered by `position, id` with parsed `options` | ✅ `api/pages` |
| P3 | `POST` creates a page, slugifies the name | ✅ `api/pages` |
| P4 | `POST` de-duplicates slugs (`media-center`, `media-center-2`) | ✅ `api/pages` |
| P5 | `POST` rejects blank/whitespace name (400) | ✅ `api/pages` |
| P6 | `PATCH` updates name + legacy `background` string | ✅ `api/pages` |
| P7 | `PATCH` sanitizes `options` (grid clamp, background clamp, unknown keys dropped) | ✅ `api/pages` · `unit/shared.misc` |
| P8 | `PATCH` **merges** options rather than replacing | ✅ `api/pages` |
| P9 | `PATCH` unknown page → 404 | ✅ `api/pages` |
| P10 | `DELETE` a page (204); tiles cascade-delete | ✅ `api/pages` · `unit/db.migrations` |
| P11 | `DELETE` the last remaining page → 400 | ✅ `api/pages` |

### 3.2 Tiles (`src/routes/tiles.js`, `src/shared/tileConfig.js`)
| # | Case | Where |
|---|---|---|
| T1 | Create `link` tile; response has parsed `config: {}` and `open_mode: newtab` | ✅ `api/tiles` |
| T2 | `link` tile without a valid `http(s)` url → 400 | ✅ `api/tiles` · `unit/shared.tileConfig` |
| T3 | Create panel tile (`clock`) — sanitized config, `url: null` | ✅ `api/tiles` |
| T4 | `open_mode: iframe` builds `{sizing,aspectRatio,height,sandbox}`; bad aspect → `16/9`; bad sandbox tokens dropped | ✅ `api/tiles` · `unit/shared.tileConfig` |
| T5 | `widget` tile requires an existing `integration_id` (else 400) | ✅ `api/tiles` |
| T6 | Unknown `type` falls back to `link` | ✅ `api/tiles` · `unit/shared.tileConfig` |
| T7 | Geometry clamped on create (`w≤6,h≤6,x≤11,y≥0`) and on patch | ✅ `api/tiles` |
| T8 | `GET` tiles ordered by `position` | ✅ `api/tiles` |
| T9 | `PATCH` edits in place; switching type re-sanitizes config and clears `url` | ✅ `api/tiles` |
| T10 | `POST /reorder` sets positions from id order | ✅ `api/tiles` |
| T11 | `POST /reorder` non-array `order` → 400 | ✅ `api/tiles` |
| T12 | `DELETE` tile (204); repeat → 404 | ✅ `api/tiles` |
| T13 | `POST` to unknown page → 404 | ✅ `api/tiles` |
| T14 | Per-type config sanitizers (clock/weather/notes/search/rss/calendar/bookmarks/customapi/resources) coerce, clamp, drop unknown keys | ✅ `unit/shared.tileConfig` |
| T15 | `commonConfig` — group trim, appearance hex validation, `hideTitle` | ✅ `unit/shared.tileConfig` |
| T16 | 2-D packing: `occupancyOf` / `placeBox` / `nextFreeSlot` first-fit | ✅ `unit/shared.gridPack` |
| T17 | Size presets ↔ `w×h` round-trip | ✅ `unit/shared.misc` |
| T18 | Tile drag/resize UI, group collapse (localStorage), "Add tile" slot picker | 🖐️ §9 |
| T19 | `widgetConfig`: dedupes/caps `views` (max 8); `moreIntegrationIds` drops self-refs, dangling ids, non-integers, dedupes, caps at 12, and is dropped entirely unless exactly one view is selected (server-enforced, not just the tile modal's UI) | ✅ `unit/shared.tileConfig` · `api/tiles` |

### 3.3 Settings (`src/routes/settings.js`)
| # | Case | Where |
|---|---|---|
| S1 | `GET` returns full object = `DEFAULTS` ⊕ stored | ✅ `api/settings` |
| S2 | `PATCH` persists a valid subset, survives reload | ✅ `api/settings` |
| S3 | Enum/format validation: `theme`, `dark_mode`, `font_family`, `locale`, `accent` (#rrggbb), non-empty `site_title` | ✅ `api/settings` |
| S4 | Nullable fields cleared with `null` or `''` (`global_background`, `favicon`) | ✅ `api/settings` |
| S5 | `custom_css` / `custom_js` truncated to 40 000 chars, not rejected | ✅ `api/settings` |
| S6 | `compose_scan_dir` must be absolute | ✅ `api/settings` |
| S7 | `compose_scan_page_id` accepts a page id, `"all"`, `null` | 🖐️ (add ✅ when touched) |
| S8 | Appearance applied live: theme/mode/accent/font/title/favicon/**background** | ✅ `e2e/smoke` (background) · 🖐️ rest |

### 3.4 Appearance / background (`web/appearance.js`, `public/style.css`)
| # | Case | Where |
|---|---|---|
| A1 | Bundled `app.js` toggles `data-has-bg` on **`<body>`** (not `<html>`) | ✅ `api/health` (bundle assertion) |
| A2 | Uploaded/URL background renders full-page behind tiles | ✅ `e2e/smoke` · 🖐️ §9 |
| A3 | `--page-bg-blur/dim/opacity` vars honour per-page `options.background` | 🖐️ §9 |
| A4 | Per-page background overrides global; legacy string still works | 🖐️ §9 |
| A5 | Custom CSS (global + per-page) injected; opt-in custom JS executes | 🖐️ §9 |

### 3.5 Uploads (`src/routes/uploads.js`)
| # | Case | Where |
|---|---|---|
| U1 | PNG upload → `201 {url:/uploads/<uuid>.png}`, then that URL serves `image/png` | ✅ `api/uploads` |
| U2 | Each allowed mime → correct extension (png/jpg/gif/webp/svg) | ✅ `api/uploads` (png, svg) |
| U3 | Unsupported mime → 400 | ✅ `api/uploads` |
| U4 | No file part → 400 | ✅ `api/uploads` |
| U5 | > 5 MB → 413 | ⏭️ contract documented; skipped to keep the suite fast/quiet |

### 3.6 Integrations (`src/routes/integrations.js`, `src/integrations/*`)
| # | Case | Where |
|---|---|---|
| I1 | `GET /available` lists shipped integrations, each with `configSchema.fields` + `defaultInterval` + `views` catalog (`{viewKey: label}`, empty schema no longer carries a "Show" field) | ✅ `api/integrations` |
| I2 | Every `*.integration.js` registers under its static `key`, implements `fetchData()`, has a well-formed schema | ✅ `unit/integrations.registry` |
| I3 | Runtime-dropped `DATA_DIR/integrations/*.integration.js` overrides a shipped key | ✅ `unit/integrations.registry` |
| I4 | `POST` unknown key → 400 | ✅ `api/integrations` |
| I5 | `POST` missing required config → 400 (per `validateConfig`) | ✅ `api/integrations` · `unit/integrations.configCodec` |
| I6 | `POST` OK: interval floored at `POLL_MIN_INTERVAL`; response masks password fields to `true/false` | ✅ `api/integrations` |
| I7 | `GET` list returns masked config | ✅ `api/integrations` |
| I8 | `PATCH` rename/enable/interval without re-supplying config | ✅ `api/integrations` |
| I9 | `PATCH` blank password keeps the stored secret (`mergeConfig`) | ✅ `api/integrations` · `unit/integrations.configCodec` |
| I10 | `PATCH` validates the merged config → 400 | ✅ `api/integrations` |
| I11 | `POST /:id/poll` runs immediately, records `last_status`/`last_error` | ✅ `api/integrations` |
| I12 | `DELETE` (204); repeat → 404; unschedules poller; also prunes the id out of any tile's `config.moreIntegrationIds` (not FK-tracked, since it lives in JSON) | ✅ `api/integrations` |
| I13 | Config at rest: AES-256-GCM round-trip when `APP_SECRET` set; plaintext JSON when not | ✅ `unit/lib.crypto` · `unit/integrations.configCodec` |
| I14 | Wrong key / tampered ciphertext fails closed | ✅ `unit/lib.crypto` |
| I15 | Per-integration upstream parsing (qbit torrents, tautulli now-playing, …) | ⏭️ needs live services; covered indirectly by I2 + view helpers |
| I16 | Sonarr/Radarr `calendar` view: maps upstream records to `{ts,title,subtitle,image}`, drops undated records, sorts ascending, picks the earliest of several release dates, carries the series/movie poster URL through as `image`, honors `config.upcomingDays` for the window | ✅ `unit/integrations.arrCalendar` |
| I17 | `runAllViews`: fetches every declared view every poll (not just a configured subset), keyed by view key in `byView`; one view failing lands as `{type:'error'}` in its own slot without taking the rest down; every view failing throws so the poll is marked unreachable and last-good data stays on screen | ✅ `unit/integrations.views` |

### 3.7 Tile data proxies (`src/routes/tileData.js`)
| # | Case | Where |
|---|---|---|
| D1 | `GET /api/tile/weather` requires `lat`+`lon` (400) | ✅ `api/tileData` |
| D2 | `GET /api/tile/weather` happy path (open-meteo) | ⏭️ live network; contract asserted via D1 + `unit/lib.apiMap` |
| D3 | `GET /api/tile/feed` rejects non-`http(s)` URL (400) | ✅ `api/tileData` |
| D4 | `GET /api/tile/feed` parses RSS (and ICS) from an upstream | ✅ `api/tileData` (local upstream) · `unit/lib.feedParse` |
| D5 | `GET /api/tile/feed` upstream error → 502 | ✅ `api/tileData` |
| D6 | `GET /api/tile/customapi/:id` → 404 if tile isn't a `customapi` | ✅ `api/tileData` |
| D7 | `customapi` maps JSON to a stats/list model (`buildModel` + `getPath`) | ✅ `api/tileData` · `unit/lib.apiMap` |
| D8 | `customapi` non-JSON body / upstream 5xx → 502 | ✅ `api/tileData` |
| D9 | `GET /api/host/stats` returns cpu/mem/disk (200) or a clean 500 in a locked-down sandbox | ✅ `api/tileData` |
| D10 | `getPath` supports `a.b`, `a[0].b`, `a.b[].c` wildcard | ✅ `unit/lib.apiMap` |
| D11 | Feed/ICS parser edge cases: Atom alt links, CDATA/entities, ICS unfolding, all-day, horizon filter | ✅ `unit/lib.feedParse` |

### 3.8 Tile health (`src/routes/health.js`)
| # | Case | Where |
|---|---|---|
| H1 | Reachable host (even `401/403/500`) → `online` with `code` | ✅ `api/tileData` (health check suite) |
| H2 | Dead port / bad host → `offline` | ✅ `api/tileData` |
| H3 | Non-`http(s)` entries filtered out | ✅ `api/tileData` |
| H4 | Empty `urls` → `{}` | ✅ `api/tileData` |
| H5 | 15 s response cache | 🖐️ (add ✅ when touched) |

### 3.9 Compose scan (`src/routes/composeScan.js`, `src/lib/composeScan.js`)
| # | Case | Where |
|---|---|---|
| C1 | Disabled by default → `{enabled:false,result:null}` | ✅ `api/composeScan` |
| C2 | Enabled, no dir → `result.error:"no directory configured"` | ✅ `api/composeScan` · `unit/lib.composeScan` |
| C3 | Enabled + dir → stacks with services, images, ports, volumes | ✅ `api/composeScan` · `unit/lib.composeScan` |
| C4 | Bad YAML captured in `errors[]`, never thrown | ✅ `unit/lib.composeScan` |
| C5 | `${VAR}` interpolation from sibling `.env` | ✅ `unit/lib.composeScan` |
| C6 | Settings change invalidates the cache | ✅ `api/composeScan` |
| C7 | Nonexistent / non-dir path reports a read error | ✅ `unit/lib.composeScan` |
| C8 | Walk bounded by depth / file count / file size; skips `node_modules`, `.git`, symlink escapes | ⏭️ limits in code; add ✅ if changed |

### 3.10 Backup (`src/routes/backup.js`)
| # | Case | Where |
|---|---|---|
| B1 | `GET /api/backup/export` streams a `.zip` with `selfdash.db` + `manifest.json` (v1) | ✅ `api/backup` |
| B2 | `POST /api/backup/import` rejects a non-`.zip` (400) | ✅ `api/backup` |
| B3 | `POST /api/backup/import` rejects a zip missing `selfdash.db` (400) | ✅ `api/backup` |
| B4 | `POST /api/backup/import` of a real export → `200 {ok:true}` then `process.exit(0)` (Docker restarts) | ✅ `api/backup` |
| B5 | Path-traversal entries in the archive rejected | ⏭️ guarded in code; add ✅ if changed |
| B6 | Pre-import snapshot written to `.pre-import-backup-*` | 🖐️ |

### 3.11 Config as code (`src/routes/config.js`, `src/lib/configFile.js`)
| # | Case | Where |
|---|---|---|
| G1 | `GET /api/config/export` → YAML v1 with settings/pages/tiles/integrations | ✅ `api/config` |
| G2 | Password fields exported as `${SELFDASH_SECRET_*}` placeholders; real secret never present | ✅ `api/config` |
| G3 | `POST /api/config/import` (raw YAML body) replaces everything transactionally | ✅ `api/config` |
| G4 | Import round-trip preserves page names + settings | ✅ `api/config` |
| G5 | Import rejects empty body / wrong `version` (400) | ✅ `api/config` |
| G6 | `?settings=0` leaves settings untouched | ✅ `api/config` |
| G7 | `${ENV}` resolution + `unresolvedSecrets` reporting on import | 🖐️ (add ✅ when touched) |
| G8 | Multipart `.yaml` upload path (vs raw body) | 🖐️ |
| G9 | A widget tile's `config.moreIntegrationIds` exports as portable integration `ref` strings (not raw db ids) and resolves back to the *new*, re-imported integration's id on import | ✅ `api/config` |

### 3.12 Persistence / schema (`src/db/`)
| # | Case | Where |
|---|---|---|
| M1 | All `*.sql` migrations + JS layout backfill applied and recorded once | ✅ `unit/db.migrations` |
| M2 | Core tables exist (`settings,pages,integrations,tiles,migrations`) | ✅ `unit/db.migrations` |
| M3 | Reopen is idempotent (no dup page, no migration re-run) | ✅ `unit/db.migrations` |
| M4 | `tiles.type` CHECK allows all 12 types, rejects unknown | ✅ `unit/db.migrations` |
| M5 | `pages → tiles` ON DELETE CASCADE; `integrations → tiles` ON DELETE SET NULL | ✅ `unit/db.migrations` (cascade) · 🖐️ (set null) |

### 3.13 Server & static shell (`src/server.js`)
| # | Case | Where |
|---|---|---|
| E1 | `/healthz` → `{status:"ok"}` | ✅ `api/health` |
| E2 | `/` serves the SPA shell (`<div id="app"></div>`, `/app.js`) | ✅ `api/health` |
| E3 | `/app.js`, `/style.css`, `/sw.js` served; SW is network-first | ✅ `api/health` |
| E4 | Unknown `/api/*` → 404 | ✅ `api/health` |
| E5 | Boots against a fresh `DATA_DIR` with and without `APP_SECRET` | ✅ every `api/*` file (helper) |
| E6 | Graceful `SIGTERM` shutdown (poller stop, db close) | ✅ implicit via helper `stop()` |

### 3.14 Frontend (`web/`)
| # | Case | Where |
|---|---|---|
| F1 | App hydrates: `#app` populated by Preact, site title shown | ✅ `e2e/smoke` |
| F2 | Dashboard renders without a blank frame | ✅ `e2e/smoke` |
| F3 | i18n: locale switch, English fallback, `{var}` interpolation, no orphan `es` keys | ✅ `unit/web.i18n` |
| F4 | Settings forms (Appearance/Pages/Integrations/Backup/ComposeScan), tile modal, icon picker, dynamic config form | 🖐️ §9 |
| F5 | PWA install / offline shell / post-deploy auto-reload | 🖐️ §9 |
| F6 | Every built-in tile type renders its widget body | 🖐️ §9 (F1/F2 cover the shell) |

---

## 4. Adding cases when you add a feature

When you add or change a feature:

1. **Add rows to §3** under the right area (or a new subsection). Give each a
   stable id (`P12`, `T19`, …) and mark ✅/🖐️.
2. **Write the automated test** in the matching file:
   - Pure function → `test/unit/<area>.test.mjs`
   - New/changed route → `test/api/<area>.test.mjs`
   - Needs a DOM → `test/e2e/smoke.test.mjs` + a 🖐️ row in §9
3. **New shared fixture?** Put it in `test/helpers/fixtures.mjs`, not inline.
4. Run `npm test`; keep it green and under ~15s.
5. If a case genuinely can't be automated, mark it 🖐️ and add a concrete step to
   §9 — never leave a feature with no row at all.

### Case template (copy into §3)

```
| X# | <one-line behaviour, including the failure mode> | ✅ `api/<file>` / 🖐️ §9 |
```

### Test skeletons

Unit:
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { thing } from '../../src/<path>.js';

test('<area>: <behaviour> — <edge case>', () => {
  assert.equal(thing(input), expected);
});
```

API (one server per file):
```js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/server.mjs';

describe('<area> API', () => {
  let s;
  before(async () => { s = await startServer(null); });   // add { appSecret: 'x' } if the route needs encryption
  after(() => s.stop());

  it('<method path> — <behaviour>', async () => {
    const r = await s.request('/api/<path>', { method: 'POST', body: { ... } });
    assert.equal(r.status, 201);
    assert.equal(r.body.<field>, <expected>);
  });
});
```

---

## 5. What is deliberately NOT automated

| Area | Why | Mitigation |
|---|---|---|
| Live integration upstreams (Sonarr, Plex, qBittorrent, …) | Need real services + secrets | `unit/integrations.registry` proves every integration loads & has a valid schema; view/model helpers are unit-tested |
| open-meteo weather happy path | Third-party network in CI is flaky | 400-path tested; response shaping tested via `unit/lib.apiMap` |
| > 5 MB upload rejection, compose-walk limits, archive path-traversal | Slow / noisy to trigger; logic is small and guarded | Documented here; add a targeted test if that code is touched |
| Full visual regression of every theme/tile | Out of scope for a smoke suite | `e2e/smoke` proves the app renders; §9 manual pass for themes |

---

## 6. Environment notes

- **Node:** ≥ 22.5 (matches `package.json` engines). `node:sqlite` needs
  `--experimental-sqlite` on 22 (the npm scripts pass it; harmless on 24+).
- **No network required** for `npm test`. The feed/customapi tests spin up a
  loopback HTTP server; `host/stats` tolerates a sandbox that blocks `/proc`.
- **Browser smoke:** set `CHROME_BIN` to a Chrome/Chromium binary, or
  `npx playwright install --with-deps chromium` and it is auto-discovered. The
  suite **skips** (not fails) when no launchable browser is found.

---

## 7. Manual smoke checklist (§9)

Run after frontend changes or before a release. ~5 minutes.

1. `npm run build && npm start`, open `http://localhost:3000`.
2. **Shell:** dashboard loads, site title in the header, no console errors.
3. **Pages:** add a page, rename it, drag tabs to reorder, delete it.
4. **Tiles:** add one of each type (link, iframe, clock, weather, notes, search,
   rss, calendar, bookmarks, customapi, resources); each renders a body.
5. **Tile layout:** drag a tile to a new cell, resize it from the corner grip,
   collapse a named group, reload — layout persisted.
6. **Appearance:** change theme, dark mode, accent, font — applied live.
7. **Background:** paste a URL → Save → full-page image appears behind tiles.
   Upload an image → Save → same. Set per-page background + blur/dim/opacity on
   one page only; confirm it overrides the global on that page and not others.
8. **Custom CSS/JS:** add `.tile{border-radius:0}` globally; enable custom JS with
   `document.title='x'` — both take effect.
9. **Integrations:** add one (e.g. gluetun) with a bogus URL → shows an error
   status; edit the name without re-entering the password → still works.
   Add a Sonarr or Radarr integration against a real instance, then add a
   widget tile for it: the tile modal's "Show" list comes from the
   integration's type, not a global default. Add a second widget tile on the
   *same* integration with a different view checked — confirm the two tiles
   show different things (view selection is per-tile). With exactly one view
   checked and a second same-type integration configured, "Also include"
   appears; check it and confirm the tile merges both — for "Release
   calendar" specifically, events from every source merge into one grid and a
   day cell shows only the show/movie name (no source tag). Hover (or focus) a
   day with releases → a floating card lists each release that day with its
   poster + name + episode/release tag; the card escapes the tile's clipped
   box. The calendar shows one month at a time — ‹ › page between months
   (arrows disable past the data range), a "Today" chip returns to the current
   month.
10. **Tile scaling:** drop a **weather** tile and a **calendar** widget to the
    smallest (1×1) size → text isn't clipped: weather keeps icon + temp + one
    line, the calendar grid fills the tile with day tint/dots instead of event
    titles. Resize larger → detail comes back.
12. **Backup:** export a zip; re-import it → app restarts, data intact.
13. **Config:** export YAML, edit the site title, re-import → applied.
14. **PWA:** install, go offline, reload → shell still loads.

---

## 8. Suite health

| Metric | Target |
|---|---|
| `npm test` runtime | < 15 s |
| Network calls in `npm test` | 0 (loopback only) |
| Flaky tests | 0 — a failing test means a real regression |
| Route coverage | 100% of `src/routes/*` endpoints |
| `src/shared` + `src/lib` function coverage | 100% of exported functions |
