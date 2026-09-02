// Dependency-free parsing for RSS 2.0 / Atom feeds and iCalendar (ICS). Deliberately
// forgiving and regex-based — good enough for dashboard widgets, not a spec-complete
// parser.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#34': '"' };

function decode(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === '#') {
        const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e] ?? m;
    })
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
}

function toIso(d) {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(+t) ? null : t.toISOString();
}

function firstImgSrc(html) {
  if (!html) return '';
  const m = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  return m ? decode(m[1]) : '';
}

// Thumbnail for an item, tried in order: structured image tags (Media RSS,
// image enclosures, podcast art) first, since those are deliberately chosen by
// the feed; then a scrape for the first <img> in the item's HTML body, since
// plenty of feeds (e.g. The Verge's) carry the image only there.
function extractImage(block) {
  let m = block.match(/<media:thumbnail\b[^>]*\burl=["']([^"']+)["']/i);
  if (m) return decode(m[1]);

  for (const t of block.match(/<media:content\b[^>]*\/?>/gi) || []) {
    if (/\bmedium=["']image["']/i.test(t) || /\btype=["']image\//i.test(t)) {
      const u = t.match(/\burl=["']([^"']+)["']/i);
      if (u) return decode(u[1]);
    }
  }

  for (const t of block.match(/<enclosure\b[^>]*\/?>/gi) || []) {
    if (/\btype=["']image\//i.test(t)) {
      const u = t.match(/\burl=["']([^"']+)["']/i);
      if (u) return decode(u[1]);
    }
  }

  m = block.match(/<itunes:image\b[^>]*\bhref=["']([^"']+)["']/i);
  if (m) return decode(m[1]);

  const body = tag(block, 'content:encoded') || tag(block, 'content') || tag(block, 'description') || tag(block, 'summary');
  return firstImgSrc(body);
}

export function parseFeed(xml, limit = 20) {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const itemRe = isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi;
  const blocks = xml.match(itemRe) || [];

  // Feed title: the first <title> that isn't inside an item/entry.
  const head = xml.split(isAtom ? /<entry[\s>]/i : /<item[\s>]/i)[0];
  const feedTitle = tag(head, 'title');

  const items = blocks.slice(0, limit).map((b) => {
    let link = '';
    if (isAtom) {
      const alt = b.match(/<link[^>]*\brel=["']?alternate["']?[^>]*\bhref=["']([^"']+)["']/i);
      const any = b.match(/<link[^>]*\bhref=["']([^"']+)["']/i);
      link = decode((alt || any || [])[1] || '');
    } else {
      link = tag(b, 'link') || decode((b.match(/<link[^>]*\bhref=["']([^"']+)["']/i) || [])[1] || '');
    }
    return {
      title: tag(b, 'title'),
      link,
      date: toIso(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')),
      image: extractImage(b),
    };
  });

  return { title: feedTitle, items };
}

// ---- ICS --------------------------------------------------------------------

function icsDate(val, params) {
  // params like ";VALUE=DATE" or ";TZID=Europe/London"
  const allDay = /VALUE=DATE(?!-TIME)/i.test(params || '');
  let iso;
  if (/^\d{8}$/.test(val)) {
    iso = `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}T00:00:00`;
  } else {
    const m = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
    if (!m) return { start: null, allDay };
    iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ? 'Z' : ''}`;
  }
  const d = new Date(iso);
  return { start: Number.isNaN(+d) ? null : d.toISOString(), allDay };
}

export function parseIcs(text, { limit = 10, daysAhead = 30 } = {}) {
  // Unfold: continuation lines start with a space or tab.
  const unfolded = String(text).replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT') {
      if (cur && cur.start) events.push(cur);
      cur = null;
    } else if (cur) {
      const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/);
      if (!m) continue;
      const [, key, params, value] = m;
      if (key === 'SUMMARY') cur.summary = decode(value);
      else if (key === 'DTSTART') {
        const d = icsDate(value, params);
        cur.start = d.start;
        cur.allDay = d.allDay;
      } else if (key === 'DTEND') cur.end = icsDate(value, params).start;
    }
  }

  const now = Date.now();
  const horizon = now + daysAhead * 86400_000;
  return events
    .filter((e) => {
      const t = +new Date(e.start);
      return t >= now - 3600_000 && t <= horizon;
    })
    .sort((a, b) => +new Date(a.start) - +new Date(b.start))
    .slice(0, limit);
}
