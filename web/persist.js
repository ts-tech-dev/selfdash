// Tiny localStorage helpers for "which of these are collapsed/expanded" style UI
// state (tile groups, compose stacks). Every access is wrapped: private-mode and
// quota errors just mean the preference doesn't stick, never a crash.

export function loadSet(key) {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) || '[]'));
  } catch {
    return new Set();
  }
}

export function saveSet(key, set) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    /* private mode / quota — preference just won't persist */
  }
}
