// The built-in colour themes. Each has matching `[data-theme='<id>'][data-mode='…']`
// token blocks in web/style.css. Shared so the settings route, the page-options
// sanitiser, and the settings UI all agree on the list.
export const THEMES = ['minimal', 'glass', 'terminal', 'gradient', 'nord', 'rosepine', 'dracula', 'oled'];

export const THEME_SET = new Set(THEMES);

export const isTheme = (v) => THEME_SET.has(v);
