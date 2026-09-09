import test from 'node:test';
import assert from 'node:assert/strict';
import HomeAssistantIntegration from '../../src/integrations/homeassistant.integration.js';

function makeHttp(states) {
  const calls = [];
  return {
    calls,
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      return states;
    },
  };
}

const states = [
  { entity_id: 'light.kitchen', state: 'on', attributes: { friendly_name: 'Kitchen Light' } },
  { entity_id: 'sensor.temp', state: '21.5', attributes: { friendly_name: 'Living Room Temp' } },
  { entity_id: 'automation.morning', state: 'on', attributes: { friendly_name: 'Morning routine' } },
];

test('homeassistant stats: counts entities/automations and appends chosen entity states', async () => {
  const http = makeHttp(states);
  const { byView } = await new HomeAssistantIntegration().fetchData({
    config: { url: 'http://ha-a.local', token: 'tok', entities: 'light.kitchen, sensor.temp' },
    http,
  });
  assert.deepEqual(byView.stats, {
    type: 'stats',
    items: [
      { label: 'Entities', value: 3 },
      { label: 'Automations', value: 1 },
      { label: 'Kitchen Light', value: 'on' },
      { label: 'Living Room Temp', value: '21.5' },
    ],
  });
});

test('homeassistant stats: an unknown entity id shows "unavailable" instead of throwing', async () => {
  const http = makeHttp(states);
  const { byView } = await new HomeAssistantIntegration().fetchData({
    config: { url: 'http://ha-b.local', token: 'tok', entities: 'light.missing' },
    http,
  });
  assert.deepEqual(byView.stats.items[2], { label: 'light.missing', value: 'unavailable' });
});

test('homeassistant entities list: uses the chosen entities when given, else the first 20 states', async () => {
  const http = makeHttp(states);
  const { byView } = await new HomeAssistantIntegration().fetchData({
    config: { url: 'http://ha-c.local', token: 'tok', entities: 'sensor.temp' },
    http,
  });
  assert.deepEqual(byView.entities.items, [{ title: 'Living Room Temp', subtitle: '21.5' }]);

  const { byView: allView } = await new HomeAssistantIntegration().fetchData({
    config: { url: 'http://ha-d.local', token: 'tok' },
    http,
  });
  assert.equal(allView.entities.items.length, 3);
});

test('homeassistant: sends the token as a bearer header', async () => {
  const http = makeHttp([]);
  await new HomeAssistantIntegration().fetchData({ config: { url: 'http://ha-e.local', token: 'secret-tok' }, http });
  assert.equal(http.calls[0].opts.headers.Authorization, 'Bearer secret-tok');
});
