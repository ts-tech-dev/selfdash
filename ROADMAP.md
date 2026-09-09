# selfdash — service integration roadmap

Status: **all phases approved.** Phase 1 shipped in **v0.5.0**, Phase 2 in **v0.6.0**,
Phase 3 in **v0.7.0**, Phase 4 in **v0.8.0**; Phases 5–6 pending.

Reference point: [gethomepage.dev](https://gethomepage.dev) service-widget catalog, filtered to
what's actually common in self-hosting and to what fits selfdash's **read-only poller** +
six `WidgetModel` shapes (`stats`, `nowplaying`, `queue`, `list`, `calendar`, `status`).

## Shipped

**v0.1–0.4 (14):** qBittorrent · SABnzbd · Radarr · Sonarr · Readarr · Prowlarr · Plex ·
Tautulli · Audiobookshelf · Overseerr · Immich · Mealie · Gluetun · Bookdrop

**v0.5.0 — Phase 1 (5):** Jellyfin · Emby · Bazarr · Lidarr · Jellyseerr
(shared bases `_embyBase.js` + `_seerrBase.js`; Overseerr/Jellyseerr now `mergeGroup: 'requests'`;
Lidarr/Bazarr join `mergeGroup: 'arr'`. Tests: `test/unit/integrations.{jellyfin,lidarr,bazarr,jellyseerr}.test.mjs`,
TESTPLAN §3.6 I19–I22.)

**v0.6.0 — Phase 2 (5):** Pi-hole · AdGuard Home · Portainer · Traefik · Nginx Proxy Manager
(new `mergeGroup: 'dns'` on Pi-hole + AdGuard; Pi-hole tries v6 API then falls back to v5;
NPM caches its bearer token with in-flight dedup + 401 re-auth. Tests:
`test/unit/integrations.{pihole,adguard,portainer,traefik,npm}.test.mjs`, TESTPLAN §3.6 I23–I27.)

**v0.7.0 — Phase 3 (5):** Transmission · Deluge · NZBGet · Tdarr · What's Up Docker
(Transmission/Deluge/NZBGet join `mergeGroup: 'download'` alongside qbit/sab; Transmission
handles the RPC session-id 409 handshake, Deluge caches its login cookie and retries once on
any RPC error since Deluge reports auth failure inside a 200 body, not a status code; Tdarr
goes through its single generic `/api/v2/cruddb` endpoint with defensive field fallbacks — see
the README caveat, it's the least confidently sourced integration in the set. Tests:
`test/unit/integrations.{transmission,deluge,nzbget,tdarr,whatsupdocker}.test.mjs`,
TESTPLAN §3.6 I28–I32.)

**v0.8.0 — Phase 4 (6):** Uptime Kuma · Gatus · Healthchecks · Grafana · Speedtest Tracker ·
Scrutiny (shared enabler **E1**: new `status` WidgetModel `{label, state:'up'|'down'|'warn'|'paused',
detail?}`, a `StatusView` dot-list renderer in `WidgetTile.jsx`, a `mergeStatus` concat rule, and
`status` added to `SCROLLABLE_VIEW_TYPES`; Uptime Kuma/Gatus/Healthchecks share
`mergeGroup: 'monitor'`. Tests: `test/unit/integrations.{uptimekuma,gatus,healthchecks,grafana,
speedtest,scrutiny}.test.mjs`, `test/unit/shared.mergeModels.test.mjs`, TESTPLAN §3.2 T20/T20b +
§3.6 I33–I38. All 6 live-verified post-ship (2026-09-09): found and fixed two real bugs —
Speedtest Tracker's actual API has no `/api/v1` prefix and no history endpoint at all (only
`GET /api/speedtest/latest`; the "24h average" stat was dropped, not faked via a fallback), and
Scrutiny's per-device map is nested at `data.summary`, not `data` itself. Uptime Kuma, Gatus,
Healthchecks, and Grafana needed no changes.)

## Ground rules for every new integration

- One `src/integrations/<key>.integration.js`: `static key/title/defaultInterval/configSchema/views`,
  `fetchData(ctx) => runAllViews(ctx, VIEWS)`. No frontend change unless a new model shape is needed.
- Read-only. No enable/disable/toggle actions (Pi-hole disable, HA switches, *arr search) —
  the poller only fetches.
- Reuse helpers: `_arrBase.js` for the *arr family, `apiMap.js` for JSON→model mapping,
  `http` from ctx (never global fetch).
- Every integration: add a `TESTPLAN.md` §3.6 row (`I19`, `I20`, …) + a mock-HTTP unit test
  (`test/unit/integrations.<key>.test.mjs`) exercising each view's record→model mapping.
- Ship per phase: bump version, rebuild + push the Docker image, update the README count/list.

## Shared enablers (do once, when the phase that needs it lands)

| ID | What | Needed by |
|----|------|-----------|
| E1 | New `status` list model: `items[] = { label, state: 'up'\|'down'\|'warn'\|'paused', detail? }`, rendered as colored dots. Add `StatusView` to `WidgetTile.jsx` + merge rule (concat items) + README model table row. | Phase 4 (Uptime Kuma, Gatus, Healthchecks, Scrutiny) |
| E2 | `mergeGroup` values: `download` already exists (qbit + sab) — extend to Transmission/Deluge/NZBGet. Add `monitor` group for the status apps, `dns` group for Pi-hole + AdGuard. | Phases 2–4 |

---

## Phase 1 — Media servers & the obvious *arr gaps ✅ (v0.5.0)

Highest demand, lowest risk — most of these are near-copies of code we already have.

| Service | Homepage parity | Config | Views (model) | mergeGroup | Effort | Notes |
|---|---|---|---|---|---|---|
| **Jellyfin** | `jellyfin` | url, apiKey | `nowplaying` (nowplaying), `stats` (stats: movies/series/episodes/songs) | — | **S** | `/Sessions` + `/Items/Counts` with `X-Emby-Token`. Mirrors `plex.integration.js`. |
| **Emby** | `emby` | url, apiKey | same as Jellyfin | — | **S** | Same API surface as Jellyfin; factor a shared `_embyBase.js` when doing Jellyfin. |
| **Bazarr** | `bazarr` | url, apiKey | `stats` (missing movie/episode subs, today's downloads), `list` (wanted), `list` (history) | `arr` | **S** | `/api/*` with `X-API-KEY`. Uses `_arrBase` request helper. |
| **Lidarr** | `lidarr` | url, apiKey, upcomingDays | `queue` (queue), `calendar` (calendar), `list` (upcoming), `stats` (library) | `arr` | **S** | Straight `_arrBase` clone of `readarr.integration.js` (album/artist records). |
| **Jellyseerr** | `jellyseerr` | url, apiKey | `stats` (pending/approved/available), `list` (recent requests) | `requests` (new) | **S** | Overseerr fork, same `/api/v1` shape. Make `mergeGroup: 'requests'` and give Overseerr the same so one tile can show both. |

**Deliverable:** 5 integrations, 1 shared base file, README list → "19 integrations".

---

## Phase 2 — Network, DNS & reverse proxies ✅ (v0.6.0)

Ubiquitous in home labs; all clean `stats` + `list`, all read-only.

| Service | Homepage parity | Config | Views (model) | mergeGroup | Effort | Notes |
|---|---|---|---|---|---|---|
| **Pi-hole** | `pihole` | url, password/apiToken | `stats` (queries today, blocked, block %, domains on list, clients) | `dns` | **M** | Support both v5 (`/admin/api.php?summaryRaw&auth=`) and v6 (`/api/stats/summary` + session). Try v6 first, fall back. |
| **AdGuard Home** | `adguard` | url, username, password | `stats` (DNS queries, blocked, %, avg processing ms), `list` (top blocked domains) | `dns` | **M** | `/control/stats` + `/control/status`, HTTP basic auth. |
| **Portainer** | `portainer` | url, apiKey, endpointId (optional) | `stats` (containers running/stopped/total, images, volumes, stacks), `list` (stopped / unhealthy containers) | — | **M** | `/api/endpoints/{id}/docker/containers/json?all=1` with `X-API-Key`. Auto-pick the endpoint if only one. |
| **Traefik** | `traefik` | url, username, password (optional) | `stats` (routers, services, middlewares — enabled/total, http/tcp) | — | **M** | `/api/overview` + `/api/http/routers`. |
| **Nginx Proxy Manager** | `nginxproxymanager` | url, email, password | `stats` (proxy/redirect/stream hosts, dead hosts, certs), `list` (certs expiring < 30d) | — | **M** | Token via `/api/tokens` (POST email/password), then `/api/nginx/proxy-hosts` etc. Cache the token. |

**Deliverable:** 5 integrations, README → "24 integrations", new `dns` mergeGroup.

---

## Phase 3 — More download clients & transcoding ✅ (v0.7.0)

Rounds out the `download` merge group and adds the transcode-queue apps.

| Service | Homepage parity | Config | Views (model) | mergeGroup | Effort | Notes |
|---|---|---|---|---|---|---|
| **Transmission** | `transmission` | url, username, password | `queue` (torrents), `stats` (count, down/up rate, ratio) | `download` | **M** | RPC: POST `/transmission/rpc`, handle the `409` + `X-Transmission-Session-Id` handshake. |
| **Deluge** | `deluge` | url, password | `queue`, `stats` | `download` | **M** | JSON-RPC `/json`: `auth.login` → session cookie → `web.update_ui`. |
| **NZBGet** | `nzbget` | url, username, password | `queue` (`listgroups`), `stats` (remaining, speed, paused) | `download` | **S** | JSON-RPC `/jsonrpc`, basic auth. Near-copy of `sabnzbd.integration.js`. |
| **Tdarr** | `tdarr` | url | `stats` (queue, processed, errored, workers, space saved), `list` (staged / errored) | — | **M** | POST `/api/v2/cruddb` with a find-payload, or `/api/v2/status`. No auth by default. |
| **What's Up Docker** | `whatsupdocker` | url | `list` (containers with an update available: name → new tag), `stats` (monitored, updates) | — | **M** | `/api/containers`. Popular "is my image stale" widget. |

**Deliverable:** 5 integrations, README → "29 integrations".

---

## Phase 4 — Monitoring & status boards ✅ (v0.8.0)

Needs shared enabler **E1** (`status` model). After that these are quick.

| Service | Homepage parity | Config | Views (model) | mergeGroup | Effort | Notes |
|---|---|---|---|---|---|---|
| **Uptime Kuma** | `uptimekuma` | url, slug (status-page slug) | `status` (each monitor up/down/paused + uptime %), `stats` (up/down/total, overall uptime) | `monitor` | **M** | Read the public status page JSON: `/api/status-page/{slug}` + `/api/status-page/heartbeat/{slug}`. No socket.io needed. |
| **Gatus** | `gatus` | url | `status` (endpoint health), `stats` (healthy/total) | `monitor` | **M** | `/api/v1/endpoints/statuses`. |
| **Healthchecks** | `healthchecks` | url, apiKey | `status` (checks: up / late / down / paused), `stats` | `monitor` | **M** | `/api/v3/checks/` with `X-Api-Key`. Works with hosted healthchecks.io too. |
| **Grafana** | `grafana` | url, apiKey | `stats` (dashboards, datasources, alerts firing), `list` (firing alerts) | — | **M** | `/api/search`, `/api/datasources`, `/api/alertmanager/grafana/api/v2/alerts`. |
| **Speedtest Tracker** | `speedtest` | url, apiKey (optional) | `stats` (latest down / up / ping, 24h avg) | — | **M** | `/api/v1/results/latest`. Both the Ookla and the librespeed forks. |
| **Scrutiny** | `scrutiny` | url | `status` (each drive: passed / failed / warn + temp), `stats` (passed/failed) | — | **M** | `/api/summary`. SMART disk health. |

**Deliverable:** `status` model + 6 integrations, README → "35 integrations".

---

## Phase 5 — NAS, virtualization & home automation

Bigger API surface / auth handshakes — do these once the pattern library is mature.

| Service | Homepage parity | Config | Views (model) | Effort | Notes |
|---|---|---|---|---|---|
| **Proxmox VE** | `proxmox` | url, tokenId, tokenSecret | `stats` (nodes up, running VMs / LXC, cluster CPU / RAM / storage %), `list` (per-node load) | **L** | `/api2/json/cluster/resources` with `PVEAPIToken=`. Self-signed TLS is normal — needs an "allow insecure TLS" config toggle (new field pattern). |
| **TrueNAS** | `truenas` | url, apiKey | `stats` (pools, used %, alerts, updates), `list` (pool status + alerts) | **L** | SCALE `/api/v2.0/pool` + `/api/v2.0/alert/list`. |
| **Home Assistant** | `homeassistant` | url, token, entities (csv, optional) | `stats` (entities, automations, plus the state of each chosen entity), `list` (chosen entities) | **L** | `/api/states` with a long-lived token. Let the user name entities to surface; default to counts only. |
| **Nextcloud** | `nextcloud` | url, username, password (or app token) | `stats` (users active/total, files, storage used, version, updates) | **M** | `/ocs/v2.php/apps/serverinfo/api/v1/info?format=json`, `OCS-APIRequest: true`. |
| **UniFi Network** | `unifi` | url, apiKey (UniFi OS) *or* username/password, site | `stats` (clients wired / wifi, APs up, WAN status, throughput) | **L** | Prefer the UniFi OS `/proxy/network/integration/v1` API-key path; legacy `/api/login` cookie path as fallback. Insecure-TLS toggle. |

**Deliverable:** 5 integrations + an "allow insecure TLS" config field type, README → "40 integrations".

---

## Phase 6 — Content libraries & productivity (backlog)

Long tail. Pull individual items forward if you use them.

| Service | Homepage parity | Views (model) | Effort | Notes |
|---|---|---|---|---|
| **Navidrome** | `navidrome` | `stats` (songs / albums / artists), `nowplaying` (active streams) | **M** | Subsonic API `/rest/getScanStatus`, `/rest/getNowPlaying`. Also covers other Subsonic servers. |
| **Paperless-ngx** | `paperlessngx` | `stats` (documents, inbox, tags, correspondents), `list` (inbox) | **M** | `/api/statistics/`, `/api/documents/?tags__id__in=<inbox>`. Token auth. |
| **Komga** | `komga` | `stats` (series, books, read %) | **M** | `/api/v1/...`, basic auth. |
| **Kavita** | `kavita` | `stats` (series, volumes, words read) | **M** | JWT via `/api/Account/login`. |
| **Miniflux** | `miniflux` | `stats` (unread, feeds, read today) | **S** | `/v1/feeds/counters`, `X-Auth-Token`. |
| **FreshRSS** | `freshrss` | `stats` (unread, subscriptions) | **M** | Google Reader API `/api/greader.php`. |
| **Gotify** | `gotify` | `list` (recent messages) | **S** | `/message?limit=20`, `X-Gotify-Key`. |
| **ntfy** | *(customapi on homepage)* | `list` (recent messages on a topic) | **S** | `/<topic>/json?poll=1&since=…`. |
| **Vikunja** | `vikunja` | `list` (tasks due / overdue), `stats` | **M** | `/api/v1/tasks/all?sort_by=due_date`, JWT. |
| **Frigate** | `frigate` | `stats` (cameras, events today, storage %), `list` (recent events) | **L** | `/api/stats`, `/api/events?limit=20`. |
| **Prometheus** | `prometheus` | `stats` (targets up / down, active alerts), `list` (down targets) | **M** | `/api/v1/targets`, `/api/v1/alerts`. |
| **Mastodon** | `mastodon` | `stats` (users, statuses, connections) | **S** | `/api/v1/instance` — no auth for public instance stats. |
| **RomM** | `romm` | `stats` (platforms, roms, saves) | **M** | `/api/stats`. Retro-game library, rising fast. |

---

## Suggested order & sizing

| Phase | Integrations | New shared work | Rough size |
|-------|-------------|-----------------|-----------|
| 1 | Jellyfin, Emby, Bazarr, Lidarr, Jellyseerr | `_embyBase.js`, `requests` mergeGroup | 1 sitting |
| 2 | Pi-hole, AdGuard, Portainer, Traefik, NPM | `dns` mergeGroup | 1–2 sittings |
| 3 | Transmission, Deluge, NZBGet, Tdarr, WUD | extend `download` mergeGroup | 1–2 sittings |
| 4 | Uptime Kuma, Gatus, Healthchecks, Grafana, Speedtest Tracker, Scrutiny | **E1** `status` model + `StatusView` | 2 sittings |
| 5 | Proxmox, TrueNAS, Home Assistant, Nextcloud, UniFi | insecure-TLS config field | 2–3 sittings |
| 6 | backlog, cherry-pick | — | ongoing |

Approve whole phases, or strike/re-order individual rows before we start Phase 1.
