export function resolveMode(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyAppearance(settings, page) {
  const root = document.documentElement;
  root.setAttribute('data-theme', settings.theme);
  root.setAttribute('data-mode', resolveMode(settings.dark_mode));
  root.style.setProperty('--accent', settings.accent);
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

  const bg = page?.background || settings.global_background;
  if (bg) {
    document.body.style.backgroundImage = `url("${bg.replaceAll('"', '%22')}")`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
  } else {
    document.body.style.backgroundImage = '';
    document.body.style.backgroundSize = '';
    document.body.style.backgroundPosition = '';
    document.body.style.backgroundAttachment = '';
  }
}
