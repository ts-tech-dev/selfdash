import { BaseIntegration } from './_base.js';
import { embyViews, fetchEmbyData } from './_embyBase.js';

// Jellyfin: create the API key in Dashboard -> API Keys. Everything below is served from
// the same host/port as the web UI. See _embyBase.js for the shared Emby-family logic.
export default class JellyfinIntegration extends BaseIntegration {
  static key = 'jellyfin';
  static title = 'Jellyfin';
  static defaultInterval = 45;
  static views = embyViews;

  static configSchema = {
    fields: [
      { name: 'url', label: 'Server URL', type: 'url', required: true },
      { name: 'apiKey', label: 'API Key', type: 'password', required: true },
    ],
  };

  async fetchData(ctx) {
    return fetchEmbyData(ctx);
  }
}
