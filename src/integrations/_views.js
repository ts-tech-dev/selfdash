// Multi-view support shared by every integration that can show more than one thing.
//
// An integration declares a `views` map — { key: { label, run(ctx) } } — where each `run`
// returns a normalized WidgetModel. The config schema gets a `views` multiselect (via
// `viewField`), and `fetchData` becomes:
//
//   async fetchData(ctx) {
//     return runViews(ctx, VIEWS, resolveViews(ctx.config, VIEWS, 'defaultKey'));
//   }
//
// One selected view → that view's model, unchanged. Several selected → a composite
// { type: 'sections', sections: [{ title, ...model }] } which the frontend renders as
// stacked sections in a single tile.

export function viewField(views, { name = 'views', label = 'Show', defaultKey } = {}) {
  return {
    name,
    label,
    type: 'multiselect',
    options: Object.entries(views).map(([value, v]) => ({ value, label: v.label })),
    default: defaultKey ? [defaultKey] : [],
    required: false,
  };
}

// Selected view keys, in the order the integration declares them (stable tile layout,
// independent of the order boxes were ticked). Falls back to the legacy single `view`
// string, then to `defaultKey`.
export function resolveViews(config, views, defaultKey) {
  const raw = config.views;
  const wanted = new Set(
    Array.isArray(raw) ? raw : raw ? [raw] : config.view ? [config.view] : []
  );
  const keys = Object.keys(views).filter((k) => wanted.has(k));
  return keys.length ? keys : [defaultKey];
}

export async function runViews(ctx, views, keys) {
  if (keys.length === 1) return views[keys[0]].run(ctx);

  const settled = await Promise.allSettled(keys.map((k) => views[k].run(ctx)));
  const sections = settled.map((res, i) => {
    const title = views[keys[i]].label;
    if (res.status === 'fulfilled') return { title, ...res.value };
    return { title, type: 'error', error: res.reason?.message || String(res.reason) };
  });

  // Every view failed → throw, so the scheduler marks the integration unreachable and keeps
  // the last good data on screen (same contract as a single-view integration going down).
  if (sections.every((s) => s.type === 'error')) {
    throw new Error(sections.map((s) => `${s.title}: ${s.error}`).join('; '));
  }
  return { type: 'sections', sections };
}
