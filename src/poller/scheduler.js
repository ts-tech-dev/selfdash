import { decodeConfig } from '../integrations/configCodec.js';

export function createPoller({ db, registry, http, crypto, log }) {
  const timers = new Map(); // integration id -> interval handle

  async function runPoll(id) {
    const row = db.prepare('SELECT * FROM integrations WHERE id = ?').get(id);
    if (!row || !row.enabled) return;

    const IntegrationClass = registry.get(row.key);
    if (!IntegrationClass) {
      db.prepare("UPDATE integrations SET last_status = 'error', last_error = ? WHERE id = ?").run(
        `integration type '${row.key}' is not available`,
        id
      );
      return;
    }

    let config;
    try {
      config = decodeConfig(row.config_json, crypto);
    } catch (err) {
      db.prepare("UPDATE integrations SET last_status = 'error', last_error = ? WHERE id = ?").run(
        `failed to decode config: ${err.message}`,
        id
      );
      return;
    }

    // Handed to fetchData as ctx.previous so a multi-view integration (see _views.js)
    // can fall back to last-good data for just the one view that failed this cycle,
    // instead of every failing view blanking out data that was fine a moment ago.
    let previous = null;
    try {
      previous = row.last_data_json ? JSON.parse(row.last_data_json) : null;
    } catch {
      previous = null;
    }

    try {
      const instance = new IntegrationClass();
      const data = await instance.fetchData({ config, http, previous });
      db.prepare(
        `UPDATE integrations
         SET last_status = 'ok', last_data_json = ?, last_ok_at = datetime('now'), last_error = NULL
         WHERE id = ?`
      ).run(JSON.stringify(data), id);
    } catch (err) {
      log?.warn?.(`integration "${row.name}" (#${id}) poll failed: ${err.message}`);
      // last_data_json is intentionally left untouched so the UI keeps showing the last good data.
      db.prepare("UPDATE integrations SET last_status = 'unreachable', last_error = ? WHERE id = ?").run(
        err.message,
        id
      );
    }
  }

  function schedule(row) {
    unschedule(row.id);
    const ms = Math.max(row.interval, 1) * 1000;
    runPoll(row.id);
    timers.set(row.id, setInterval(() => runPoll(row.id), ms));
  }

  function unschedule(id) {
    const timer = timers.get(id);
    if (timer) {
      clearInterval(timer);
      timers.delete(id);
    }
  }

  function reschedule(row) {
    if (row.enabled) schedule(row);
    else unschedule(row.id);
  }

  function initAll() {
    const rows = db.prepare('SELECT * FROM integrations WHERE enabled = 1').all();
    for (const row of rows) schedule(row);
  }

  function stopAll() {
    for (const id of timers.keys()) unschedule(id);
  }

  return { schedule, unschedule, reschedule, pollNow: runPoll, initAll, stopAll };
}
