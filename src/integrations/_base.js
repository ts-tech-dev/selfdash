export class BaseIntegration {
  static key = null;
  static title = null;
  static defaultInterval = 60;
  static configSchema = { fields: [] };

  async fetchData(_ctx) {
    throw new Error(`${this.constructor.key} integration must implement fetchData()`);
  }
}
