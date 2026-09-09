import test from 'node:test';
import assert from 'node:assert/strict';
import PortainerIntegration from '../../src/integrations/portainer.integration.js';

function makeHttp(routes) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      for (const [match, payload] of routes) {
        const hit = typeof match === 'function' ? match(url) : match instanceof RegExp ? match.test(url) : url.includes(match);
        if (hit) return typeof payload === 'function' ? payload(url) : payload;
      }
      throw new Error(`unrouted: ${url}`);
    },
  };
}

const snap = (over) => ({
  RunningContainerCount: 5,
  StoppedContainerCount: 2,
  ImageCount: 20,
  VolumeCount: 8,
  StackCount: 3,
  DockerSnapshotRaw: {
    Containers: [
      { Names: ['/web'], State: 'running', Status: 'Up 2 days (healthy)' },
      { Names: ['/db'], State: 'exited', Status: 'Exited (0) 1 hour ago' },
      { Names: ['/cache'], State: 'running', Status: 'Up 1 day (unhealthy)' },
    ],
  },
  ...over,
});

test('portainer stats: sums the endpoint snapshot counts', async () => {
  const http = makeHttp([['/api/endpoints', [{ Id: 1, Name: 'local', Snapshots: [snap()] }]]]);
  const { byView } = await new PortainerIntegration().fetchData({ config: { url: 'http://portainer/', apiKey: 'k' }, http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Running', value: 5 },
      { label: 'Stopped', value: 2 },
      { label: 'Images', value: 20 },
      { label: 'Volumes', value: 8 },
      { label: 'Stacks', value: 3 },
    ],
  });
});

test('portainer down: lists stopped + unhealthy containers from the cached snapshot, skips healthy running ones', async () => {
  const http = makeHttp([['/api/endpoints', [{ Id: 1, Name: 'local', Snapshots: [snap()] }]]]);
  const { byView } = await new PortainerIntegration().fetchData({ config: { url: 'http://portainer', apiKey: 'k' }, http });
  assert.equal(byView.down.type, 'list');
  assert.deepEqual(
    byView.down.items.map((i) => i.title),
    ['db', 'cache']
  );
  assert.match(byView.down.items[0].subtitle, /Exited/);
});

test('portainer: endpointId narrows to one environment; otherwise every snapshotted endpoint is summed', async () => {
  const two = [
    { Id: 1, Name: 'a', Snapshots: [snap({ RunningContainerCount: 5, StackCount: 1 })] },
    { Id: 2, Name: 'b', Snapshots: [snap({ RunningContainerCount: 4, StackCount: 2 })] },
  ];
  const all = makeHttp([['/api/endpoints', two]]);
  const summed = await new PortainerIntegration().fetchData({ config: { url: 'http://p', apiKey: 'k' }, http: all });
  assert.equal(summed.byView.stats.items.find((i) => i.label === 'Running').value, 9);
  assert.equal(summed.byView.stats.items.find((i) => i.label === 'Stacks').value, 3);
  // multi-endpoint down rows are prefixed with the environment name
  assert.match(summed.byView.down.items[0].subtitle, /^a · /);

  const one = makeHttp([['/api/endpoints', two]]);
  const picked = await new PortainerIntegration().fetchData({ config: { url: 'http://p', apiKey: 'k', endpointId: 2 }, http: one });
  assert.equal(picked.byView.stats.items.find((i) => i.label === 'Running').value, 4);
});

test('portainer down: falls back to the Docker proxy when the snapshot has no raw container list', async () => {
  const http = makeHttp([
    // most-specific route first — '/api/endpoints/7/docker/...' also contains '/api/endpoints'
    [
      '/api/endpoints/7/docker/containers/json',
      [{ Names: ['/stuck'], State: 'exited', Status: 'Exited (137) 5 minutes ago' }],
    ],
    ['/api/endpoints', [{ Id: 7, Name: 'local', Snapshots: [snap({ DockerSnapshotRaw: undefined })] }]],
  ]);
  const { byView } = await new PortainerIntegration().fetchData({ config: { url: 'http://p', apiKey: 'k' }, http });
  assert.deepEqual(
    byView.down.items.map((i) => i.title),
    ['stuck']
  );
});

test('portainer sends the X-API-Key header', async () => {
  const http = makeHttp([['/api/endpoints', [{ Id: 1, Name: 'l', Snapshots: [snap()] }]]]);
  await new PortainerIntegration().fetchData({ config: { url: 'http://p', apiKey: 'secret-token' }, http });
  assert.ok(http.calls.every((c) => c.opts.headers['X-API-Key'] === 'secret-token'));
});
