import { httpClient } from '../lib/httpClient.js';
import { parseFeed, parseIcs } from '../lib/feedParse.js';
import { buildModel } from '../lib/apiMap.js';
import { hostStats } from '../lib/hostStats.js';

const MAX_BODY = 4 * 1024 * 1024;

function assertHttpUrl(u) {
  let parsed;
  try {
    parsed = new URL(u);
  } catch {
    throw new Error('invalid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('URL must be http(s)');
  return parsed.href;
}

async function fetchText(url, opts) {
  const res = await httpClient.fetch(url, opts);
  const text = await res.text();
  if (text.length > MAX_BODY) throw new Error('response too large');
  return { res, text };
}

export default async function tileDataRoutes(app) {
  const db = app.db;

  app.get('/api/tile/weather', async (req, reply) => {
    const { lat, lon, units } = req.query || {};
    if (lat == null || lon == null) return reply.code(400).send({ error: 'lat and lon required' });
    const imperial = units === 'imperial';
    const qs = new URLSearchParams({
      latitude: String(Number(lat)),
      longitude: String(Number(lon)),
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
      temperature_unit: imperial ? 'fahrenheit' : 'celsius',
      wind_speed_unit: imperial ? 'mph' : 'kmh',
      timezone: 'auto',
    });
    try {
      const data = await httpClient.fetchJson(`https://api.open-meteo.com/v1/forecast?${qs}`);
      return { current: data.current || {} };
    } catch (err) {
      return reply.code(502).send({ error: `weather fetch failed: ${err.message}` });
    }
  });

  app.get('/api/tile/feed', async (req, reply) => {
    const { url, limit, ics, days } = req.query || {};
    let target;
    try {
      target = assertHttpUrl(url);
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }
    try {
      const { text } = await fetchText(target, { headers: { 'user-agent': 'selfdash' } });
      if (ics === '1' || /BEGIN:VCALENDAR/.test(text)) {
        return { events: parseIcs(text, { limit: Number(limit) || 10, daysAhead: Number(days) || 30 }) };
      }
      return parseFeed(text, Number(limit) || 20);
    } catch (err) {
      return reply.code(502).send({ error: `feed fetch failed: ${err.message}` });
    }
  });

  app.get('/api/tile/customapi/:id', async (req, reply) => {
    const row = db.prepare("SELECT * FROM tiles WHERE id = ? AND type = 'customapi'").get(Number(req.params.id));
    if (!row) return reply.code(404).send({ error: 'not found' });
    const cfg = JSON.parse(row.config_json || '{}');

    let target;
    try {
      target = assertHttpUrl(cfg.url);
    } catch (err) {
      return reply.code(400).send({ error: err.message });
    }

    const headers = { accept: 'application/json' };
    for (const h of cfg.headers || []) if (h.k) headers[h.k] = h.v;

    try {
      const { res, text } = await fetchText(target, {
        method: cfg.method || 'GET',
        headers,
        body: cfg.method === 'POST' ? cfg.body || '' : undefined,
      });
      if (!res.ok) return reply.code(502).send({ error: `upstream ${res.status}` });
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        return reply.code(502).send({ error: 'upstream did not return JSON' });
      }
      return buildModel(json, cfg);
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  app.get('/api/host/stats', async (req, reply) => {
    const raw = req.query?.disks || req.query?.disk || '/';
    const diskPaths = String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
    try {
      return await hostStats({ diskPaths: diskPaths.length ? diskPaths : ['/'], iface: req.query?.iface || '' });
    } catch (err) {
      return reply.code(500).send({ error: `host stats unavailable: ${err.message}` });
    }
  });
}
