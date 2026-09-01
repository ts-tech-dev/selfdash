export class BaseIntegration {
  static key = null;
  static title = null;
  static defaultInterval = 60;
  static configSchema = { fields: [] };

  // Which integrations a widget tile may combine ("Also include" / config.moreIntegrationIds).
  // Only integrations that share a mergeGroup *and* the selected view key are offered as
  // merge targets — so a download-client queue (qbittorrent + sabnzbd) never pulls in
  // radarr/sonarr, even though those also expose a `queue` view. Defaults to the key, i.e.
  // "only merges with other instances of the same integration type".
  static get mergeGroup() {
    return this.key;
  }

  async fetchData(_ctx) {
    throw new Error(`${this.constructor.key} integration must implement fetchData()`);
  }
}
