import { readdirSync, readFileSync, statSync, realpathSync } from 'node:fs';
import { join, relative, basename, sep } from 'node:path';
import YAML from 'yaml';

// Read-only inspection of a directory tree of docker-compose stacks. This module
// NEVER writes, moves, or deletes anything — it only readdir/stat/readFile's compose
// files and parses them in memory. Bounded by depth / file count / file size so a
// mistyped path (e.g. "/") can't turn into an unbounded walk.

const COMPOSE_NAMES = new Set([
  'compose.yaml',
  'compose.yml',
  'docker-compose.yaml',
  'docker-compose.yml',
  'compose.override.yaml',
  'compose.override.yml',
  'docker-compose.override.yaml',
  'docker-compose.override.yml',
]);

const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', 'vendor', '.cache']);

const LIMITS = {
  maxDepth: 6,
  maxFiles: 250,
  maxFileSize: 512 * 1024, // 512 KB — a compose file well past this is almost certainly not one
};

export function scanComposeDir(rawDir, limits = {}) {
  const opts = { ...LIMITS, ...limits };
  const result = { dir: rawDir, scannedAt: new Date().toISOString(), stacks: [], errors: [] };

  if (!rawDir || typeof rawDir !== 'string') {
    result.error = 'no directory configured';
    return result;
  }

  let root;
  try {
    root = realpathSync(rawDir);
    if (!statSync(root).isDirectory()) {
      result.error = `not a directory: ${rawDir}`;
      return result;
    }
  } catch (err) {
    result.error = `cannot read ${rawDir}: ${err.code || err.message}`;
    return result;
  }
  result.dir = root;

  const files = [];
  walk(root, root, 0, files, result.errors, opts);

  for (const file of files) {
    try {
      const raw = readFileSync(file, 'utf8');
      const env = loadDotEnv(join(file, '..'));
      const doc = YAML.parse(interpolate(raw, env)) || {};
      result.stacks.push(buildStack(file, root, doc));
    } catch (err) {
      result.errors.push({ file: relative(root, file), message: err.message });
    }
  }

  result.stacks.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

function walk(dir, root, depth, out, errors, opts) {
  if (depth > opts.maxDepth || out.length >= opts.maxFiles) return;

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    // Can't descend into this subdirectory (permissions, races). Not a parse failure —
    // a data dir like postgres/ is expected to be unreadable — so skip it silently
    // rather than surfacing noise as a compose "error". The configured root itself
    // being unreadable is caught earlier and reported as result.error.
    return;
  }

  for (const entry of entries) {
    if (out.length >= opts.maxFiles) return;
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      // Don't follow a symlink that escapes the configured root.
      try {
        const realChild = realpathSync(full);
        if (realChild !== root && !realChild.startsWith(root + sep)) continue;
      } catch {
        continue;
      }
      walk(full, root, depth + 1, out, errors, opts);
    } else if (entry.isFile() && COMPOSE_NAMES.has(entry.name)) {
      try {
        if (statSync(full).size <= opts.maxFileSize) out.push(full);
      } catch {
        /* ignore unreadable file */
      }
    }
  }
}

function buildStack(file, root, doc) {
  const rel = relative(root, file);
  const parentDir = join(file, '..');
  const dirName = basename(parentDir);
  // Stack name: the parent directory unless the file sits directly in the root, in which
  // case fall back to the compose file's own basename so root-level files stay distinct.
  const name = parentDir !== root && dirName ? dirName : basename(file);

  const servicesObj = isObject(doc.services) ? doc.services : {};
  const services = Object.entries(servicesObj).map(([svcName, svc]) => {
    const s = isObject(svc) ? svc : {};
    return {
      name: svcName,
      image: typeof s.image === 'string' ? s.image : null,
      containerName: typeof s.container_name === 'string' ? s.container_name : null,
      ports: toArray(s.ports).map(parsePort).filter(Boolean),
      expose: toArray(s.expose).map((e) => String(e)),
      volumes: toArray(s.volumes).map(parseVolume).filter(Boolean),
    };
  });

  return {
    name,
    file: rel,
    projectName: typeof doc.name === 'string' ? doc.name : null,
    namedVolumes: isObject(doc.volumes) ? Object.keys(doc.volumes) : [],
    services,
  };
}

// ---- port / volume spec parsing --------------------------------------------

function parsePort(spec) {
  if (spec == null) return null;

  if (isObject(spec)) {
    const target = spec.target != null ? String(spec.target) : null;
    const published = spec.published != null && spec.published !== '' ? String(spec.published) : null;
    const hostIp = spec.host_ip != null ? String(spec.host_ip) : null;
    return {
      raw: [hostIp, published, target].filter((x) => x != null && x !== '').join(':') || String(target),
      hostIp,
      host: published,
      container: target,
      protocol: spec.protocol ? String(spec.protocol) : null,
    };
  }

  const raw = String(spec);
  let body = raw;
  let protocol = null;
  const slash = body.lastIndexOf('/');
  if (slash !== -1) {
    protocol = body.slice(slash + 1) || null;
    body = body.slice(0, slash);
  }

  const parts = body.split(':');
  let hostIp = null;
  let host = null;
  let container = null;
  if (parts.length === 1) {
    container = parts[0];
  } else if (parts.length === 2) {
    [host, container] = parts;
  } else {
    // [hostIp...]:host:container — an IPv6 host_ip itself contains ':'
    container = parts.pop();
    host = parts.pop();
    hostIp = parts.join(':');
  }

  return {
    raw,
    hostIp: hostIp || null,
    host: host ? host.trim() : null,
    container: container ? container.trim() : null,
    protocol,
  };
}

function parseVolume(spec) {
  if (spec == null) return null;

  if (isObject(spec)) {
    const source = spec.source != null ? String(spec.source) : null;
    const target = spec.target != null ? String(spec.target) : null;
    return {
      raw: [source, target].filter(Boolean).join(':') || target || '',
      type: spec.type ? String(spec.type) : source ? guessVolumeType(source) : 'volume',
      source,
      target,
      readOnly: Boolean(spec.read_only),
    };
  }

  const raw = String(spec);
  // Linux container targets only — no Windows drive-letter handling.
  const parts = raw.split(':');
  let source = null;
  let target = null;
  let mode = null;
  if (parts.length === 1) {
    target = parts[0]; // anonymous volume
  } else if (parts.length === 2) {
    [source, target] = parts;
  } else {
    [source, target, mode] = parts;
  }

  return {
    raw,
    type: source ? guessVolumeType(source) : 'volume',
    source: source || null,
    target: target || null,
    readOnly: mode === 'ro',
  };
}

function guessVolumeType(source) {
  return /^[./~]/.test(source) || source.startsWith('${') ? 'bind' : 'volume';
}

// ---- ${VAR} interpolation ------------------------------------------------------

// Best-effort compose-style interpolation. Resolves ${VAR:-default} / ${VAR-default}
// forms (which need no env) and anything found in a sibling .env file; any other
// ${VAR} is left literal so the reader can see the value is environment-driven.
function interpolate(text, env) {
  const SENTINEL = '_ESC_DOLLAR_'; // stand-in for a literal `$$`
  return text
    .split('$$')
    .join(SENTINEL)
    .replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(:?[-+?])?([^}]*)\}/g, (whole, name, op, rest) => {
      const val = env[name];
      const wantsDefault = op === ':-' || op === '-';
      const wantsAlt = op === ':+' || op === '+';
      if (val != null && val !== '') return wantsAlt ? rest : val;
      if (wantsDefault) return rest;
      return whole; // unresolved
    })
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (whole, name) => (env[name] != null ? env[name] : whole))
    .split(SENTINEL)
    .join('$');
}

function loadDotEnv(dir) {
  const env = {};
  try {
    const raw = readFileSync(join(dir, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  } catch {
    /* no .env — fine */
  }
  return env;
}

// ---- small helpers -------------------------------------------------------------

function isObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function toArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  if (isObject(v)) return Object.values(v);
  return [v];
}
