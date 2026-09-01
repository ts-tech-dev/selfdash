// Reusable sample payloads for tests. Keep these representative of what a real
// client / feed / upstream API sends.

export const RSS_2_0 = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Example Blog</title>
  <link>https://example.com</link>
  <item>
    <title>First &amp; oldest post</title>
    <link>https://example.com/1</link>
    <pubDate>Wed, 01 Jan 2025 12:00:00 GMT</pubDate>
  </item>
  <item>
    <title><![CDATA[Second post]]></title>
    <link>https://example.com/2</link>
    <pubDate>Thu, 02 Jan 2025 12:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

export const ATOM_1_0 = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Example</title>
  <entry>
    <title>Atom entry one</title>
    <link rel="alternate" href="https://example.com/atom/1"/>
    <updated>2025-02-01T18:30:02Z</updated>
  </entry>
</feed>`;

// An ICS with one event well inside a 30-day horizon and one event years away.
export function icsFixture() {
  const soon = new Date(Date.now() + 3 * 86400_000);
  const far = new Date(Date.now() + 900 * 86400_000);
  const stamp = (d) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Dentist appointment
DTSTART:${stamp(soon)}
DTEND:${stamp(new Date(soon.getTime() + 3600_000))}
END:VEVENT
BEGIN:VEVENT
SUMMARY:Halley's comet
DTSTART:${stamp(far)}
END:VEVENT
END:VCALENDAR`;
}

// Sample JSON body for the custom-api tile mapper.
export const CUSTOM_API_JSON = {
  status: 'green',
  counts: { active: 3, queued: 12 },
  torrents: [
    { name: 'ubuntu.iso', progress: 1, state: 'seeding' },
    { name: 'debian.iso', progress: 0.42, state: 'downloading' },
  ],
};

export const LINK_TILE = {
  type: 'link',
  title: 'Router',
  url: 'https://192.168.1.1',
  icon: 'mdi:router',
  description: 'LAN gateway',
};

export const CLOCK_TILE = {
  type: 'clock',
  title: 'Clock',
  config: { format: '12h', showSeconds: true, timezone: 'America/New_York', label: 'NYC' },
};

export const GLUETUN_INTEGRATION = {
  key: 'gluetun',
  name: 'VPN',
  config: { url: 'http://127.0.0.1:8000' },
  interval: 30,
};
