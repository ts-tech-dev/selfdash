import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeName,
  containerKeys,
  collectContainerUpdates,
  parseContainerSetting,
  tileContainerUpdates,
  updateBadgeLabel,
} from '../../src/shared/containerUpdates.js';

// Container names below are the real ones from the dev host's Docker (as Dockhand
// reported them during live verification), matched against real tile titles.
const integ = (id, name, items, extra = {}) => ({
  id,
  name,
  enabled: true,
  data: { type: 'multi', byView: {}, hidden: { containerUpdates: { type: 'containerUpdates', items } } },
  ...extra,
});
const u = (name, image = null, environment = 'local') => ({ name, image, environment });

const UPDATES = collectContainerUpdates([
  integ(1, 'Dockhand', [
    u('tautulli', 'lscr.io/linuxserver/tautulli:latest'),
    u('adminapps-cloudcmd-1', 'coderaiser/cloudcmd'),
    u('immich_server', 'ghcr.io/immich-app/immich-server:v3'),
    u('immich_redis', 'redis:7'),
    u('dvd-burner'),
    u('docker-backup'),
    u('MAMqt', 'linuxserver/qbittorrent:latest'),
    u('media-abs-theme-1'),
  ]),
]);
const link = (title, config = {}) => ({ type: 'link', title, config });
const names = (matches) => matches.map((m) => m.name);

test('normalizeName: lowercase, letters and digits only', () => {
  assert.equal(normalizeName('DVD Burner'), 'dvdburner');
  assert.equal(normalizeName('Docker-Backup'), 'dockerbackup');
  assert.equal(normalizeName(null), '');
});

test('containerKeys: compose replica suffix, service run, and stack prefix', () => {
  assert.deepEqual([...containerKeys('adminapps-cloudcmd-1')].sort(), ['adminapps', 'adminappscloudcmd', 'adminappscloudcmd1', 'cloudcmd'].sort());
  assert.ok(containerKeys('media-abs-theme-1').has('abstheme'), 'service name with a hyphen survives');
  assert.ok(containerKeys('immich_server').has('immich'));
  assert.deepEqual([...containerKeys('tautulli')], ['tautulli']);
});

test('auto match: plain title, separators ignored, compose names, stack helpers', () => {
  assert.deepEqual(names(tileContainerUpdates(link('Tautulli'), UPDATES)), ['tautulli']);
  assert.deepEqual(names(tileContainerUpdates(link('DVD Burner'), UPDATES)), ['dvd-burner']);
  assert.deepEqual(names(tileContainerUpdates(link('Docker-Backup'), UPDATES)), ['docker-backup']);
  assert.deepEqual(names(tileContainerUpdates(link('CloudCmd'), UPDATES)), ['adminapps-cloudcmd-1']);
  assert.deepEqual(names(tileContainerUpdates(link('Immich'), UPDATES)), ['immich_server', 'immich_redis']);
});

test('auto match: no false positives on unrelated or too-short titles', () => {
  assert.deepEqual(tileContainerUpdates(link('qBittorrent MAM'), UPDATES), [], 'MAMqt needs an explicit setting');
  assert.deepEqual(tileContainerUpdates(link('Plex'), UPDATES), []);
  assert.deepEqual(tileContainerUpdates(link('Docker Admin'), UPDATES), []);
  assert.deepEqual(tileContainerUpdates(link('TV'), [u('tv')].map((x) => ({ ...x, source: 'D' }))), [], 'titles under 3 chars never auto-match');
  assert.deepEqual(tileContainerUpdates(link(''), UPDATES), []);
});

test('explicit containers setting: exact names, case-insensitive, comma-separated; overrides title', () => {
  const t = link('qBittorrent MAM', { containers: 'mamqt, dvd-burner' });
  assert.deepEqual(names(tileContainerUpdates(t, UPDATES)), ['dvd-burner', 'MAMqt']);
  assert.deepEqual(tileContainerUpdates(link('Tautulli', { containers: 'something-else' }), UPDATES), [], 'explicit list replaces auto-matching');
});

test('"-" turns the badge off for the tile', () => {
  assert.deepEqual(parseContainerSetting(' - '), { mode: 'off', names: [] });
  assert.deepEqual(tileContainerUpdates(link('Tautulli', { containers: '-' }), UPDATES), []);
});

test('only link and widget tiles get badges; untitled widgets match on their integration name', () => {
  assert.deepEqual(tileContainerUpdates({ type: 'clock', title: 'Tautulli', config: {} }, UPDATES), []);
  assert.deepEqual(names(tileContainerUpdates({ type: 'widget', title: '', config: {} }, UPDATES, 'Tautulli')), ['tautulli']);
});

test('collectContainerUpdates: skips disabled integrations and dedupes the same container reported twice', () => {
  const list = collectContainerUpdates([
    integ(1, 'Dockhand', [u('plex', 'plexinc/pms-docker')]),
    integ(2, "What's Up Docker", [u('plex', 'plexinc/pms-docker'), u('sonarr', null, 'nas')]),
    integ(3, 'Old', [u('radarr')], { enabled: false }),
    { id: 4, name: 'Plain', enabled: true, data: { type: 'multi', byView: {} } },
  ]);
  assert.deepEqual(list, [
    { name: 'plex', image: 'plexinc/pms-docker', environment: 'local', source: 'Dockhand' },
    { name: 'sonarr', image: null, environment: 'nas', source: "What's Up Docker" },
  ]);
});

test('updateBadgeLabel: names the container(s), image, host and source', () => {
  assert.equal(
    updateBadgeLabel(tileContainerUpdates(link('Tautulli'), UPDATES)),
    'Container update available: tautulli (lscr.io/linuxserver/tautulli:latest) on local — via Dockhand',
  );
  assert.match(updateBadgeLabel(tileContainerUpdates(link('Immich'), UPDATES)), /^2 container updates available: immich_server .*immich_redis/);
  assert.equal(updateBadgeLabel([]), '');
});
