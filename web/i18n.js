import { signal } from '@preact/signals';

// Lightweight i18n scaffold. `t()` reads the `locale` signal, so any component that
// calls it re-renders on language change. Add a language by extending CATALOG; keys
// missing from a locale fall back to English.
const CATALOG = {
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.settings': 'Settings',
    'page.edit': 'Edit page',
    'page.done': 'Done',
    'page.addTile': '+ Add tile',
    'page.addPage': '+ Add page',
    'tile.edit': 'Edit',
    'tile.delete': 'Delete',
    'empty.noPages': 'No pages yet. Add one to get started.',
    'settings.appearance': 'Appearance',
    'settings.pages': 'Pages',
    'settings.integrations': 'Integrations',
    'settings.language': 'Language',
  },
  es: {
    'nav.dashboard': 'Panel',
    'nav.settings': 'Ajustes',
    'page.edit': 'Editar página',
    'page.done': 'Listo',
    'page.addTile': '+ Añadir tarjeta',
    'page.addPage': '+ Añadir página',
    'tile.edit': 'Editar',
    'tile.delete': 'Eliminar',
    'empty.noPages': 'Aún no hay páginas. Añade una para empezar.',
    'settings.appearance': 'Apariencia',
    'settings.pages': 'Páginas',
    'settings.integrations': 'Integraciones',
    'settings.language': 'Idioma',
  },
};

export const LOCALES = Object.keys(CATALOG);
export const locale = signal('en');

export function setLocale(l) {
  locale.value = CATALOG[l] ? l : 'en';
}

export function t(key, vars) {
  const cat = CATALOG[locale.value] || CATALOG.en;
  let s = cat[key] ?? CATALOG.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
