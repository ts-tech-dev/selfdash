// Registry of built-in "panel" tile types (everything that isn't link / widget /
// iframe). Each entry drives both the Add/Edit modal (label, category, config
// fields) and the rendered tile body (Component).

import { ClockTile } from './ClockTile.jsx';
import { SearchTile } from './SearchTile.jsx';
import { NotesTile } from './NotesTile.jsx';
import { BookmarksTile } from './BookmarksTile.jsx';
import { BookmarksConfig } from './BookmarksConfig.jsx';
import { WeatherTile } from './WeatherTile.jsx';
import { RssTile } from './RssTile.jsx';
import { CalendarTile } from './CalendarTile.jsx';
import { ResourcesTile } from './ResourcesTile.jsx';
import { CustomApiTile } from './CustomApiTile.jsx';
import { CustomApiConfig } from './CustomApiConfig.jsx';

export const TILE_REGISTRY = {
  clock: {
    label: 'Clock',
    category: 'Info',
    defaults: { w: 2, h: 1, config: { format: '24h', showDate: true, showSeconds: false } },
    fields: [
      { name: 'label', label: 'Label (optional)', type: 'text' },
      { name: 'format', label: 'Hour format', type: 'select', options: [
        { value: '24h', label: '24-hour' }, { value: '12h', label: '12-hour' } ] },
      { name: 'showDate', label: 'Show date', type: 'checkbox' },
      { name: 'showSeconds', label: 'Show seconds', type: 'checkbox' },
      { name: 'timezone', label: 'Timezone (IANA, blank = local)', type: 'text' },
    ],
    Component: ClockTile,
  },

  search: {
    label: 'Search bar',
    category: 'Info',
    defaults: { w: 4, h: 1, config: { provider: 'duckduckgo', bangs: true } },
    fields: [
      { name: 'provider', label: 'Provider', type: 'select', options: [
        { value: 'duckduckgo', label: 'DuckDuckGo' }, { value: 'google', label: 'Google' },
        { value: 'bing', label: 'Bing' }, { value: 'brave', label: 'Brave' },
        { value: 'startpage', label: 'Startpage' }, { value: 'custom', label: 'Custom URL' } ] },
      { name: 'customUrl', label: 'Custom URL (use %s for the query)', type: 'text' },
      { name: 'placeholder', label: 'Placeholder text', type: 'text' },
      { name: 'bangs', label: 'Enable !bang shortcuts (!g, !yt, !gh, …)', type: 'checkbox' },
    ],
    Component: SearchTile,
  },

  notes: {
    label: 'Notes / Markdown',
    category: 'Info',
    defaults: { w: 2, h: 2, config: { markdown: '' } },
    fields: [{ name: 'markdown', label: 'Markdown', type: 'textarea', rows: 10 }],
    Component: NotesTile,
  },

  bookmarks: {
    label: 'Bookmarks',
    category: 'Info',
    defaults: { w: 2, h: 2, config: { columns: 1, links: [] } },
    ConfigForm: BookmarksConfig,
    Component: BookmarksTile,
  },

  weather: {
    label: 'Weather',
    category: 'Data',
    defaults: { w: 2, h: 1, config: { latitude: 0, longitude: 0, units: 'metric' } },
    fields: [
      { name: 'label', label: 'Label (e.g. city name)', type: 'text' },
      { name: 'latitude', label: 'Latitude', type: 'number', required: true },
      { name: 'longitude', label: 'Longitude', type: 'number', required: true },
      { name: 'units', label: 'Units', type: 'select', options: [
        { value: 'metric', label: 'Metric (°C, km/h)' }, { value: 'imperial', label: 'Imperial (°F, mph)' } ] },
    ],
    Component: WeatherTile,
  },

  rss: {
    label: 'RSS / Atom feed',
    category: 'Data',
    defaults: { w: 2, h: 2, config: { url: '', limit: 8, showDate: true } },
    fields: [
      { name: 'url', label: 'Feed URL', type: 'url', required: true },
      { name: 'limit', label: 'Max items', type: 'number' },
      { name: 'showDate', label: 'Show dates', type: 'checkbox' },
    ],
    Component: RssTile,
  },

  calendar: {
    label: 'Calendar (iCal/ICS)',
    category: 'Data',
    defaults: { w: 2, h: 2, config: { url: '', limit: 10, daysAhead: 30 } },
    fields: [
      { name: 'url', label: 'ICS URL', type: 'url', required: true },
      { name: 'limit', label: 'Max events', type: 'number' },
      { name: 'daysAhead', label: 'Days ahead to show', type: 'number' },
    ],
    Component: CalendarTile,
  },

  resources: {
    label: 'Host resources',
    category: 'Data',
    defaults: { w: 2, h: 1, config: { show: ['cpu', 'mem', 'disk'], diskPath: '/' } },
    fields: [
      { name: 'show', label: 'Show', type: 'multiselect', options: [
        { value: 'cpu', label: 'CPU' }, { value: 'mem', label: 'Memory' },
        { value: 'disk', label: 'Disk' }, { value: 'net', label: 'Network' } ] },
      { name: 'diskPath', label: 'Disk path', type: 'text' },
      { name: 'netIface', label: 'Network interface (blank = busiest)', type: 'text' },
    ],
    Component: ResourcesTile,
  },

  customapi: {
    label: 'Custom API',
    category: 'Data',
    defaults: { w: 2, h: 2, config: { url: '', method: 'GET', display: 'stats', refreshSec: 60, items: [] } },
    ConfigForm: CustomApiConfig,
    Component: CustomApiTile,
  },
};

export function isPanelType(type) {
  return Object.prototype.hasOwnProperty.call(TILE_REGISTRY, type);
}

export function registryEntry(type) {
  return TILE_REGISTRY[type] || null;
}
