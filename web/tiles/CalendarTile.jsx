import { useTileData } from './useTileData.js';

function fmtWhen(ev) {
  const start = new Date(ev.start);
  if (Number.isNaN(+start)) return '';
  const dateStr = start.toLocaleDateString([], { month: 'short', day: 'numeric' });
  if (ev.allDay) return dateStr;
  const timeStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} ${timeStr}`;
}

export function CalendarTile({ tile }) {
  const c = tile.config || {};
  const { data, error, loading } = useTileData(
    `/api/tile/feed?url=${encodeURIComponent(c.url || '')}&ics=1&limit=${c.limit || 10}&days=${c.daysAhead || 30}`,
    1800,
    [c.url, c.limit, c.daysAhead]
  );

  if (!c.url) return <div class="tile-panel tile-cal tile-panel-muted">Set an ICS URL in the tile settings.</div>;
  if (loading && !data) return <div class="tile-panel tile-cal tile-panel-muted">Loading calendar…</div>;
  if (error) return <div class="tile-panel tile-cal tile-panel-muted">Calendar error: {error}</div>;

  const events = data?.events || [];
  return (
    <div class="tile-panel tile-cal">
      <ul>
        {events.map((ev, i) => (
          <li key={i}>
            <span class="tile-cal-when">{fmtWhen(ev)}</span>
            <span class="tile-cal-what">{ev.summary || '(busy)'}</span>
          </li>
        ))}
        {!events.length && <li class="tile-panel-muted">Nothing in the next {c.daysAhead || 30} days.</li>}
      </ul>
    </div>
  );
}
