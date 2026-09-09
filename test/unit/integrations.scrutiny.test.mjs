import test from 'node:test';
import assert from 'node:assert/strict';
import ScrutinyIntegration from '../../src/integrations/scrutiny.integration.js';

function makeHttp(devicesByWwn) {
  return { fetchJson: async () => ({ data: devicesByWwn }) };
}

const cfg = (url) => ({ url });

test('scrutiny status: a non-zero smart.status fails the drive, temp becomes the detail', async () => {
  const http = makeHttp({
    wwn1: { device: { device_name: '/dev/sda' }, smart: { status: 0, temp: 34 } },
    wwn2: { device: { device_name: '/dev/sdb' }, smart: { status: 1, temp: 55 } },
  });
  const { byView } = await new ScrutinyIntegration().fetchData({ config: cfg('http://scrutiny-a.local'), http });
  assert.deepEqual(byView.status.items, [
    { label: '/dev/sda', state: 'up', detail: '34°C' },
    { label: '/dev/sdb', state: 'down', detail: '55°C' },
  ]);
});

test('scrutiny stats: counts passed vs failed drives', async () => {
  const http = makeHttp({
    a: { device: {}, smart: { status: 0 } },
    b: { device: {}, smart: { status: 0 } },
    c: { device: {}, smart: { status: 2 } },
  });
  const { byView } = await new ScrutinyIntegration().fetchData({ config: cfg('http://scrutiny-b.local'), http });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Passed', value: 2 },
      { label: 'Failed', value: 1 },
      { label: 'Total', value: 3 },
    ],
  });
});

test('scrutiny: falls back to model_name when device_name is missing, and handles an empty summary', async () => {
  const withModelOnly = makeHttp({ a: { device: { model_name: 'WDC WD40' }, smart: { status: 0 } } });
  const { byView } = await new ScrutinyIntegration().fetchData({ config: cfg('http://scrutiny-c.local'), http: withModelOnly });
  assert.equal(byView.status.items[0].label, 'WDC WD40');

  const empty = makeHttp({});
  const { byView: emptyView } = await new ScrutinyIntegration().fetchData({ config: cfg('http://scrutiny-d.local'), http: empty });
  assert.deepEqual(emptyView.stats.items, [
    { label: 'Passed', value: 0 },
    { label: 'Failed', value: 0 },
    { label: 'Total', value: 0 },
  ]);
});
