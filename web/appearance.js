export function resolveMode(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const FONT_STACKS = {
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  inter: '"Inter", system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, "Courier New", monospace',
  rounded: '"SF Pro Rounded", "Nunito", "Segoe UI", system-ui, sans-serif',
};

function upsertEl(tag, id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement(tag);
    el.id = id;
    document.head.appendChild(el);
  }
  return el;
}

export function applyAppearance(settings, page) {
  const root = document.documentElement;
  root.setAttribute('data-theme', settings.theme);
  root.setAttribute('data-mode', resolveMode(settings.dark_mode));
  root.style.setProperty('--accent', settings.accent);
  // Optional text-colour override. Empty/null falls back to the theme's tokens.
  // Derive a dimmer companion by blending toward the page background.
  if (settings.text_color) {
    root.style.setProperty('--text', settings.text_color);
    root.style.setProperty('--text-dim', `color-mix(in srgb, ${settings.text_color} 62%, var(--bg))`);
  } else {
    root.style.removeProperty('--text');
    root.style.removeProperty('--text-dim');
  }
  const fontStack = FONT_STACKS[settings.font_family];
  if (fontStack) root.style.setProperty('--app-font', fontStack);
  else root.style.removeProperty('--app-font');
  document.title = settings.site_title;

  const existingIconLink = document.querySelector('link[rel="icon"]');
  if (settings.favicon) {
    const iconLink = existingIconLink || document.createElement('link');
    iconLink.rel = 'icon';
    iconLink.href = settings.favicon;
    if (!existingIconLink) document.head.appendChild(iconLink);
  } else if (existingIconLink) {
    existingIconLink.remove();
  }

  // --- background: per-page rich object > per-page legacy string > global string ---
  const pageBg = page?.options?.background;
  const legacy = page?.background || settings.global_background;
  const url = pageBg?.url || legacy || '';
  root.style.setProperty('--page-bg-url', url ? `url("${url.replaceAll('"', '%22')}")` : 'none');
  root.style.setProperty('--page-bg-blur', `${pageBg?.blur || 0}px`);
  root.style.setProperty('--page-bg-dim', `${1 - (pageBg?.dim || 0) / 100}`);
  root.style.setProperty('--page-bg-opacity', `${(pageBg?.opacity ?? 100) / 100}`);
  // The background pseudo-element is `body[data-has-bg]::before`, so the flag has
  // to live on <body> — setting it on <html> (root) never matches the selector.
  document.body.toggleAttribute('data-has-bg', Boolean(url));

  // --- custom CSS (global + per-page) ---
  upsertEl('style', 'selfdash-custom-css').textContent =
    `${settings.custom_css || ''}\n${page?.options?.customCss || ''}`;

  // --- custom JS (opt-in) — replacing the node re-executes it ---
  const oldJs = document.getElementById('selfdash-custom-js');
  if (settings.custom_js_enabled && settings.custom_js) {
    const s = document.createElement('script');
    s.id = 'selfdash-custom-js';
    s.textContent = settings.custom_js;
    if (oldJs) oldJs.remove();
    document.body.appendChild(s);
  } else if (oldJs) {
    oldJs.remove();
  }
}
