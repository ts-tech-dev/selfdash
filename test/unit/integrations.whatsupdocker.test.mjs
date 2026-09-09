import test from 'node:test';
import assert from 'node:assert/strict';
import WhatsUpDockerIntegration from '../../src/integrations/whatsupdocker.integration.js';

function makeHttp(containers) {
  return { fetchJson: async () => containers };
}

const cfg = (url) => ({ url });

test('whatsupdocker list: only containers with updateAvailable, formats old -> new tag', async () => {
  const http = makeHttp([
    { name: 'nginx', updateAvailable: true, image: { tag: { value: '1.21' } }, result: { tag: '1.25' } },
    { name: 'redis', updateAvailable: false, image: { tag: { value: '7' } } },
  ]);
  const { byView } = await new WhatsUpDockerIntegration().fetchData({ config: cfg('http://wud-a.local'), http });
  assert.deepEqual(byView.list.items, [{ title: 'nginx', subtitle: '1.21 → 1.25' }]);
});

test('whatsupdocker list: shows an all-up-to-date row when nothing needs an update', async () => {
  const http = makeHttp([{ name: 'redis', updateAvailable: false, image: { tag: { value: '7' } } }]);
  const { byView } = await new WhatsUpDockerIntegration().fetchData({ config: cfg('http://wud-b.local'), http });
  assert.deepEqual(byView.list.items, [{ title: 'All containers up to date' }]);
});

test('whatsupdocker stats: counts monitored/updates/up-to-date', async () => {
  const http = makeHttp([
    { name: 'a', updateAvailable: true, image: { tag: { value: '1' } }, result: { tag: '2' } },
    { name: 'b', updateAvailable: true, image: { tag: { value: '1' } }, result: { tag: '2' } },
    { name: 'c', updateAvailable: false, image: { tag: { value: '1' } } },
  ]);
  const { byView } = await new WhatsUpDockerIntegration().fetchData({ config: cfg('http://wud-c.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Monitored', value: 3 },
      { label: 'Updates available', value: 2 },
      { label: 'Up to date', value: 1 },
    ],
  });
});
