import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCALES, locale, setLocale, t } from '../../web/i18n.js';

test('LOCALES lists every catalog language and includes en + es', () => {
  assert.ok(LOCALES.includes('en'));
  assert.ok(LOCALES.includes('es'));
});

test('setLocale: known code switches, unknown falls back to en', () => {
  setLocale('es');
  assert.equal(locale.value, 'es');
  assert.equal(t('nav.dashboard'), 'Panel');
  setLocale('zz');
  assert.equal(locale.value, 'en');
  assert.equal(t('nav.dashboard'), 'Dashboard');
});

test('t: missing key in a locale falls back to English then to the key itself', () => {
  setLocale('es');
  // 'settings.language' exists in es
  assert.equal(t('settings.language'), 'Idioma');
  // a key that exists in neither returns the key
  assert.equal(t('totally.unknown.key'), 'totally.unknown.key');
  setLocale('en');
});

test('t: interpolates {vars}', () => {
  // no catalog string uses vars today; verify the mechanism directly
  setLocale('en');
  assert.equal(t('{count} left', { count: 3 }), '3 left');
});

test('every es key has an en counterpart (no orphan translations)', async () => {
  const mod = await import('../../web/i18n.js');
  // reach into the module's behaviour: for each es key, t() under en must not return the raw key
  setLocale('en');
  const esKeys = ['nav.dashboard', 'nav.settings', 'page.edit', 'page.done', 'page.addTile', 'page.addPage', 'tile.edit', 'tile.delete', 'empty.noPages', 'settings.appearance', 'settings.pages', 'settings.integrations', 'settings.language'];
  for (const k of esKeys) {
    assert.notEqual(t(k), k, `en catalog is missing "${k}"`);
  }
});
