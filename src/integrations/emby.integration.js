import { BaseIntegration } from './_base.js';
import { embyViews, fetchEmbyData } from './_embyBase.js';

// Emby: create the API key in Settings -> Advanced -> API Keys. Shares its API surface
// with Jellyfin for the bits we use — see _embyBase.js.
export default class EmbyIntegration extends BaseIntegration {
  static key = 'emby';
  static title = 'Emby';
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
