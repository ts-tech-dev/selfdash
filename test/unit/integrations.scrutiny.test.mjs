import test from 'node:test';
import assert from 'node:assert/strict';
import ScrutinyIntegration from '../../src/integrations/scrutiny.integration.js';

// Shape verified live against analogj/scrutiny (and a demo fixture baked into its
// shipped web bundle): the per-device map is nested at data.summary, not data itself —
// { success, data: { summary: { <wwn>: { device: {...}, smart?: {...} } } } }.
function makeHttp(summary) {
  return { fetchJson: async () => ({ success: true, data: { summary } }) };
}

const cfg = (url) => ({ url });

test('scrutiny status: a non-zero device_status fails the drive, smart.temp becomes the detail', async () => {
  const http = makeHttp({
    wwn1: { device: { device_name: '/dev/sda', device_status: 0 }, smart: { temp: 34 } },
    wwn2: { device: { device_name: '/dev/sdb', device_status: 1 }, smart: { temp: 55 } },
  });
  const { byView } = await new ScrutinyIntegration().fetchData({ config: cfg('http://scrutiny-a.local'), http });
  assert.deepEqual(byView.status.items, [
    { label: '/dev/sda', state: 'up', detail: '34°C' },
    { label: '/dev/sdb', state: 'down', detail: '55°C' },
  ]);
});

test('scrutiny status: a device with no smart data yet (no recent collector run) has no temp detail', async () => {
  const http = makeHttp({ wwn1: { device: { device_name: '/dev/sda', device_status: 0 } } });
  const { byView } = await new ScrutinyIntegration().fetchData({ config: cfg('http://scrutiny-b.local'), http });
  assert.deepEqual(byView.status.items, [{ label: '/dev/sda', state: 'up', detail: undefined }]);
});

test('scrutiny stats: counts passed vs failed drives', async () => {
  const http = makeHttp({
    a: { device: { device_status: 0 } },
    b: { device: { device_status: 0 } },
    c: { device: { device_status: 2 } },
  });
  const { byView } = await new ScrutinyIntegration().fetchData({ config: cfg('http://scrutiny-c.local'), http });
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
  const withModelOnly = makeHttp({ a: { device: { model_name: 'WDC WD40', device_status: 0 } } });
  const { byView } = await new ScrutinyIntegration().fetchData({ config: cfg('http://scrutiny-d.local'), http: withModelOnly });
  assert.equal(byView.status.items[0].label, 'WDC WD40');

  const empty = makeHttp({});
  const { byView: emptyView } = await new ScrutinyIntegration().fetchData({ config: cfg('http://scrutiny-e.local'), http: empty });
  assert.deepEqual(emptyView.stats.items, [
    { label: 'Passed', value: 0 },
    { label: 'Failed', value: 0 },
    { label: 'Total', value: 0 },
  ]);
});
