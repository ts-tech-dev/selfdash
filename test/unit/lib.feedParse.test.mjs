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
