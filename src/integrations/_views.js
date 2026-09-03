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
export async function runAllViews(ctx, views) {
  const keys = Object.keys(views);
  const settled = await Promise.allSettled(keys.map((k) => views[k].run(ctx)));
  const previous = ctx?.previous?.type === 'multi' ? ctx.previous.byView || {} : {};

  const byView = {};
  const failures = [];
  settled.forEach((res, i) => {
    const key = keys[i];
    if (res.status === 'fulfilled') {
      byView[key] = res.value;
      return;
    }
    const error = res.reason?.message || String(res.reason);
    failures.push(`${views[key].label}: ${error}`);
    const prev = previous[key];
    byView[key] = prev && prev.type !== 'error' ? { ...prev, stale: true, error } : { type: 'error', error };
  });

  if (failures.length === keys.length) {
    throw new Error(failures.join('; '));
  }
  return { type: 'multi', byView };
}
