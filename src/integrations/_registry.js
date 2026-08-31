import { readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Loads *.integration.js from src/integrations (shipped) and DATA_DIR/integrations
// (user-dropped, runtime-loaded). A file in the runtime dir with the same `key` as a
// shipped one overrides it, so users can patch a built-in integration without a rebuild.
export async function loadIntegrations(dataDir) {
  const registry = new Map();
  await loadDir(__dirname, registry);

  const runtimeDir = join(dataDir, 'integrations');
  mkdirSync(runtimeDir, { recursive: true });
  await loadDir(runtimeDir, registry);

  return registry;
}

async function loadDir(dir, registry) {
  let files;
  try {
    files = readdirSync(dir);
  } catch {
    return;
  }

  for (const file of files) {
    if (!file.endsWith('.integration.js')) continue;
    try {
      const mod = await import(pathToFileURL(join(dir, file)).href);
      const IntegrationClass = mod.default;
      if (!IntegrationClass?.key) {
        console.warn(`skipping ${file}: default export missing a static "key"`);
        continue;
      }
      registry.set(IntegrationClass.key, IntegrationClass);
    } catch (err) {
      console.warn(`failed to load integration ${file}: ${err.message}`);
    }
  }
}
