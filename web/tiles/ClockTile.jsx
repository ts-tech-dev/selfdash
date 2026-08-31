import { useEffect, useState } from 'preact/hooks';

export function ClockTile({ tile }) {
  const c = tile.config || {};
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const period = c.showSeconds ? 1000 : 15000;
    const t = setInterval(() => setNow(new Date()), period);
    return () => clearInterval(t);
  }, [c.showSeconds]);

  const tzOpts = c.timezone ? { timeZone: c.timezone } : {};
  let time;
  try {
    time = now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      ...(c.showSeconds ? { second: '2-digit' } : {}),
      hour12: c.format === '12h',
      ...tzOpts,
    });
  } catch {
    time = now.toLocaleTimeString();
  }
  const date = now.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...tzOpts,
  });

  return (
    <div class="tile-panel tile-clock">
      {c.label && <div class="tile-clock-label">{c.label}</div>}
      <div class="tile-clock-time">{time}</div>
      {c.showDate && <div class="tile-clock-date">{date}</div>}
    </div>
  );
}
