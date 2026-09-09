// Combining the same view from several integrations into one widget-tile model
// (see web/components/WidgetTile.jsx and config.moreIntegrationIds / "Also include").
// Pure data shaping — no Preact — so it can be unit-tested directly.
//
// `perSource` is an array of { source, model }, where `source` is the integration's
// display name and `model` is its view model ({ type, items }).

// A shared, time-sorted calendar. Each event keeps a `source` tag.
export function mergeCalendar(perSource) {
  const items = [];
  for (const { source, model } of perSource) {
    if (!model || model.type !== 'calendar') continue;
    for (const it of model.items || []) items.push({ ...it, source });
  }
  items.sort((a, b) => a.ts - b.ts);
  return { type: 'calendar', items };
}

// Concatenated rows (list / queue). Every row's `subtitle` gains the source name so
// the merged tile shows which integration — e.g. which download client — it came from.
export function mergeListLike(type, perSource) {
  const items = [];
  for (const { source, model } of perSource) {
    if (!model || model.type !== type) continue;
    for (const it of model.items || []) {
      items.push({ ...it, subtitle: it.subtitle ? `${it.subtitle} · ${source}` : source });
    }
  }
  return { type, items };
}

// A merged status board — every monitor from every source in one list. Each row's
// `detail` gains the source name (same convention as mergeListLike) so a combined
// "monitor" tile (Uptime Kuma + Gatus, say) can still tell rows apart.
export function mergeStatus(perSource) {
  const items = [];
  for (const { source, model } of perSource) {
    if (!model || model.type !== 'status') continue;
    for (const it of model.items || []) {
      items.push({ ...it, detail: it.detail ? `${it.detail} · ${source}` : source });
    }
  }
  return { type: 'status', items };
}

// Which view types can meaningfully merge. stats/nowplaying don't collapse into one
// number/card, so those fall back to a section per source instead (handled by the caller).
export function mergeModel(type, perSource) {
  if (type === 'calendar') return mergeCalendar(perSource);
  if (type === 'list' || type === 'queue') return mergeListLike(type, perSource);
  if (type === 'status') return mergeStatus(perSource);
  return null;
}
