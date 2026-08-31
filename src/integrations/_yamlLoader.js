import { getPath, buildModel } from '../lib/apiMap.js';

// Builds an integration class from a declarative *.integration.yaml spec:
//
//   key: mything
//   title: My Thing
//   interval: 60
//   fields:                       # optional; defaults to a single "url" field
//     - { name: url, label: Base URL, type: url, required: true }
//     - { name: apiKey, label: API key, type: password }
//   request:
//     url: "{url}/api/v1/stats"    # {field} -> config value
//     method: GET
//     headers: { Authorization: "Bearer {apiKey}" }
//   view:
//     root: data                  # optional path to descend before mapping
//     display: stats              # stats | list
//     items:
//       - { label: Users, path: users }
//     # list mode: listPath / titlePath / subtitlePath

const interp = (str, cfg) => String(str).replace(/\{(\w+)\}/g, (_, k) => (cfg[k] ?? ''));

export function yamlIntegrationClass(spec) {
  if (!spec || !spec.key || !spec.request || !spec.request.url) {
    throw new Error('yaml integration needs "key" and "request.url"');
  }
  const fields =
    Array.isArray(spec.fields) && spec.fields.length
      ? spec.fields
      : [{ name: 'url', label: 'Base URL', type: 'url', required: true }];

  return class YamlIntegration {
    static key = String(spec.key);
    static title = spec.title || String(spec.key);
    static defaultInterval = Number(spec.interval) || 60;
    static configSchema = { fields };

    async fetchData({ config, http }) {
      const url = interp(spec.request.url, config);
      const headers = {};
      for (const [k, v] of Object.entries(spec.request.headers || {})) headers[k] = interp(v, config);
      const opts = { method: (spec.request.method || 'GET').toUpperCase(), headers };
      if (spec.request.body) opts.body = interp(spec.request.body, config);

      const json = await http.fetchJson(url, opts);
      const base = spec.view && spec.view.root ? getPath(json, spec.view.root) : json;
      return buildModel(base, spec.view || {});
    }
  };
}
