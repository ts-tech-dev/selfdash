import { BaseIntegration } from './_base.js';
import { seerrViews, seerrConfigFields, fetchSeerrData } from './_seerrBase.js';

// Jellyseerr is the Jellyfin/Emby-oriented fork of Overseerr; identical API. Shares
// `mergeGroup: 'requests'` with Overseerr so tiles from both can combine.
export default class JellyseerrIntegration extends BaseIntegration {
  static key = 'jellyseerr';
  static title = 'Jellyseerr';
  static mergeGroup = 'requests';
  static defaultInterval = 120;
  static views = seerrViews;

  static configSchema = { fields: seerrConfigFields };

  async fetchData(ctx) {
    return fetchSeerrData(ctx);
  }
}
