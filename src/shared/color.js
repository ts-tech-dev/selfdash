// Small colour helpers shared by the settings/tile config sanitisers (server) and
// the appearance layer (web). Kept minimal on purpose — colour *parsing* for the
// contrast check lives in ./contrast.js.

const HEX6 = /^#[0-9a-f]{6}$/i;

// True for a `#rrggbb` string (the only colour form selfdash stores). Anything
// else — names, `#rgb`, `rgb(...)`, empty, non-string — is rejected so a bad value
// can't reach the DOM as an inline style.
export function isHexColor(value) {
  return HEX6.test(typeof value === 'string' ? value : '');
}

// The `--text-dim` companion for a custom `--text`: the chosen colour blended
// toward the page background so secondary text stays a notch quieter. Returned as
// a CSS `color-mix()` expression so it re-resolves whenever `--bg` changes (theme
// / per-page override).
export function dimmedTextColor(hex) {
  return `color-mix(in srgb, ${hex} 62%, var(--bg))`;
}
