import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, parseIcs } from '../../src/lib/feedParse.js';
import { RSS_2_0, ATOM_1_0, icsFixture } from '../helpers/fixtures.mjs';

test('parseFeed: RSS 2.0 title, items, entity + CDATA decoding', () => {
  const { title, items } = parseFeed(RSS_2_0);
  assert.equal(title, 'Example Blog');
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'First & oldest post');
  assert.equal(items[0].link, 'https://example.com/1');
  assert.equal(items[0].date, '2025-01-01T12:00:00.000Z');
  assert.equal(items[1].title, 'Second post');
});

test('parseFeed: honours the limit', () => {
  assert.equal(parseFeed(RSS_2_0, 1).items.length, 1);
});

test('parseFeed: Atom feed with alternate link + updated date', () => {
  const { title, items } = parseFeed(ATOM_1_0);
  assert.equal(title, 'Atom Example');
  assert.equal(items[0].link, 'https://example.com/atom/1');
  assert.equal(items[0].date, '2025-02-01T18:30:02.000Z');
});

test('parseFeed: junk input yields empty items, not a throw', () => {
  assert.deepEqual(parseFeed('not xml at all').items, []);
});

test('parseFeed: RSS items with no image tags at all get an empty image, not a throw', () => {
  assert.equal(parseFeed(RSS_2_0).items[0].image, '');
});

test('parseFeed: image priority — media:thumbnail beats media:content, enclosure, itunes:image, and body <img>', () => {
  const xml = `<rss version="2.0"><channel><item>
    <title>All the image tags</title>
    <link>https://example.com/1</link>
    <media:thumbnail url="https://img.example.com/thumb.jpg"/>
    <media:content url="https://img.example.com/media-content.jpg" medium="image"/>
    <enclosure url="https://img.example.com/enclosure.jpg" type="image/jpeg"/>
    <itunes:image href="https://img.example.com/itunes.jpg"/>
    <description><![CDATA[<img src="https://img.example.com/body.jpg">]]></description>
  </item></channel></rss>`;
  assert.equal(parseFeed(xml).items[0].image, 'https://img.example.com/thumb.jpg');
});

test('parseFeed: falls back through media:content -> enclosure -> itunes:image -> body <img> as each is dropped', () => {
  const withoutThumbnail = `<rss version="2.0"><channel><item>
    <title>t</title><link>https://example.com/1</link>
    <media:content url="https://img.example.com/media-content.jpg" medium="image"/>
    <enclosure url="https://img.example.com/enclosure.jpg" type="image/jpeg"/>
  </item></channel></rss>`;
  assert.equal(parseFeed(withoutThumbnail).items[0].image, 'https://img.example.com/media-content.jpg');

  const enclosureOnly = `<rss version="2.0"><channel><item>
    <title>t</title><link>https://example.com/1</link>
    <enclosure url="https://img.example.com/enclosure.jpg" type="image/jpeg"/>
    <enclosure url="https://example.com/ep.mp3" type="audio/mpeg"/>
  </item></channel></rss>`;
  assert.equal(parseFeed(enclosureOnly).items[0].image, 'https://img.example.com/enclosure.jpg');
});

test('parseFeed: no structured image tag falls back to the first <img> in content/description — Atom feeds with an inline body image (e.g. The Verge) still get a thumbnail', () => {
  const atomWithBodyImage = `<feed xmlns="http://www.w3.org/2005/Atom">
    <title>Atom Example</title>
    <entry>
      <title>Atom entry with only a body image</title>
      <link rel="alternate" href="https://example.com/atom/1"/>
      <updated>2025-02-01T18:30:02Z</updated>
      <content type="html"><![CDATA[<figure><img src="https://img.example.com/article.jpg" alt=""></figure><p>Text</p><img src="https://img.example.com/second.jpg">]]></content>
    </entry>
  </feed>`;
  assert.equal(parseFeed(atomWithBodyImage).items[0].image, 'https://img.example.com/article.jpg');
});

test('parseIcs: keeps events inside the horizon, sorted, and drops far-future ones', () => {
  const events = parseIcs(icsFixture(), { daysAhead: 30, limit: 10 });
  assert.equal(events.length, 1);
  assert.equal(events[0].summary, 'Dentist appointment');
  assert.ok(events[0].start);
});

test('parseIcs: daysAhead widening lets the far event through', () => {
  const events = parseIcs(icsFixture(), { daysAhead: 2000, limit: 10 });
  assert.equal(events.length, 2);
  assert.equal(events[0].summary, 'Dentist appointment'); // sorted ascending
});

test('parseIcs: unfolds continuation lines and parses all-day DATE values', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:Long title that is ',
    ' folded across lines',
    `DTSTART;VALUE=DATE:${new Date(Date.now() + 86400_000).toISOString().slice(0, 10).replace(/-/g, '')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const [ev] = parseIcs(ics);
  assert.equal(ev.summary, 'Long title that is folded across lines');
  assert.equal(ev.allDay, true);
});
