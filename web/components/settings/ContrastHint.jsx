import { contrastRatio, AA_NORMAL } from '../../../src/shared/contrast.js';

// Reads the live page background so the hint reflects the current theme.
function surfaceColor() {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#111318';
  } catch {
    return '#111318';
  }
}

// Shows a warning when `color` would fail WCAG AA (4.5:1) against `against`
// (defaults to the live page background). Renders nothing when the pick is fine.
export function ContrastHint({ color, against }) {
  const ratio = contrastRatio(color, against || surfaceColor());
  if (ratio == null || ratio >= AA_NORMAL) return null;
  return (
    <span class="contrast-warn" title="WCAG AA wants at least 4.5:1 for body text">
      ⚠ Low contrast ({ratio.toFixed(1)}:1) — hard to read on this background
    </span>
  );
}
