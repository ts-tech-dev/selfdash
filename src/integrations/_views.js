// Multi-view support shared by every integration that can show more than one thing.
//
// An integration declares a `views` map — { key: { label, run(ctx) } } — and its
// `fetchData` is just:
//
//   async fetchData(ctx) {
//     return runAllViews(ctx, VIEWS);
//   }
//
// Every view is fetched on every poll (not just the ones a tile happens to be
// displaying right now) and cached as { type: 'multi', byView: { key: WidgetModel } }.
// This is what lets several tiles point at the same integration and each pick a
// different view — the view choice lives on the *tile*, not the integration; see
// web/components/WidgetTile.jsx. A view that fails independently keeps last-good
// data in its slot (tagged `stale: true`) rather than blanking it out — same
// "stale beats blank" principle as the whole-poll case below, but per view. This
// matters most for merged queue tiles (e.g. qbittorrent + sabnzbd): without it, a
// single download client having one bad poll (auth session hiccup, slow response
// while under load) would silently drop its rows from the merged queue for that
// cycle, making the tile look like it "isn't updating". Only falls back to a hard
// { type: 'error' } when there's no previous data for that view to fall back to.
// The poll only fails outright (keeping the whole integration's last-good data on
// screen, per scheduler.js) when every view failed this cycle.
//
// A view flagged `hidden: true` is machine data for the dashboard itself, not something
// a tile can show (e.g. `containerUpdates`, which feeds the per-tile update badge — see
// src/shared/containerUpdates.js). It runs and falls back exactly like the others but
// lands in `hidden` instead of `byView`, is left out of `viewCatalog` (so tiles never
// offer it), and doesn't count toward "every view failed".
export async function runAllViews(ctx, views) {
  const keys = Object.keys(views);
  const settled = await Promise.allSettled(keys.map((k) => views[k].run(ctx)));
  const prevMulti = ctx?.previous?.type === 'multi' ? ctx.previous : {};

  const byView = {};
  const hidden = {};
  const failures = [];
  let visibleCount = 0;
  settled.forEach((res, i) => {
    const key = keys[i];
    const isHidden = Boolean(views[key].hidden);
    const slot = isHidden ? hidden : byView;
    if (!isHidden) visibleCount++;
    if (res.status === 'fulfilled') {
      slot[key] = res.value;
      return;
    }
    const error = res.reason?.message || String(res.reason);
    if (!isHidden) failures.push(`${views[key].label}: ${error}`);
    const prev = (isHidden ? prevMulti.hidden : prevMulti.byView)?.[key];
    slot[key] = prev && prev.type !== 'error' ? { ...prev, stale: true, error } : { type: 'error', error };
  });

  if (visibleCount > 0 && failures.length === visibleCount) {
    throw new Error(failures.join('; '));
  }
  return Object.keys(hidden).length ? { type: 'multi', byView, hidden } : { type: 'multi', byView };
}

// { viewKey: label } for an integration's static `views` — the tile "Show" picker's
// catalog. Hidden views are excluded.
export function viewCatalog(views) {
  return Object.fromEntries(
    Object.entries(views)
      .filter(([, v]) => !v.hidden)
      .map(([k, v]) => [k, v.label]),
  );
}

// Shares one upstream fetch between the views of a single poll: every view gets the
// same ctx object from runAllViews, so memoizing on it (plus a key) means e.g. a list
// view and the hidden containerUpdates view hit the API once per poll, not twice. A
// rejected fetch stays rejected for that poll — each view reports the same error.
const pollMemo = new WeakMap();
export function perPoll(ctx, key, fn) {
  let memo = pollMemo.get(ctx);
  if (!memo) pollMemo.set(ctx, (memo = new Map()));
  if (!memo.has(key)) memo.set(key, fn());
  return memo.get(key);
}
