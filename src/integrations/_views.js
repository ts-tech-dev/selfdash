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
// web/components/WidgetTile.jsx. A view that fails independently becomes
// { type: 'error', error } in its slot rather than failing the whole poll; the poll
// only fails outright (keeping last-good data on screen) when every view failed.
export async function runAllViews(ctx, views) {
  const keys = Object.keys(views);
  const settled = await Promise.allSettled(keys.map((k) => views[k].run(ctx)));

  const byView = {};
  settled.forEach((res, i) => {
    byView[keys[i]] = res.status === 'fulfilled' ? res.value : { type: 'error', error: res.reason?.message || String(res.reason) };
  });

  if (keys.every((k) => byView[k].type === 'error')) {
    throw new Error(keys.map((k) => `${views[k].label}: ${byView[k].error}`).join('; '));
  }
  return { type: 'multi', byView };
}
