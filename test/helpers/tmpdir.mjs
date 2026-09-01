import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Make a throwaway directory. `register(t)` wires cleanup to a node:test context
// so a test never leaves data behind, even on failure.
export function makeTmpDir(prefix = 'selfdash-test-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return {
    dir,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function tmpDir(t, prefix) {
  const { dir, cleanup } = makeTmpDir(prefix);
  t.after(cleanup);
  return dir;
}
