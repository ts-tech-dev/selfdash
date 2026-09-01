// Host ports that more than one service publishes — an "address already in use"
// waiting to happen. Keyed by `host/proto` (tcp + udp on the same number don't
// clash); a service that lists the same mapping twice still counts once. Port
// ranges ("8000-8005") are compared as the literal string, not expanded.

export const portKey = (host, protocol) => `${host}/${protocol || 'tcp'}`;

// De-duplicated published host ports across a list of services, numeric-ascending.
// Returns `[{ host, protocol }]` where protocol is 'tcp' unless the mapping said
// otherwise. Used for both the panel-wide "Host ports" strip and each stack's
// summary chips (same shaping, previously copy-pasted).
export function uniqueHostPorts(services) {
  const seen = new Map();
  for (const svc of services || []) {
    for (const p of svc.ports || []) {
      if (!p.host) continue;
      const protocol = p.protocol === 'udp' ? 'udp' : 'tcp';
      const key = portKey(p.host, protocol);
      if (!seen.has(key)) seen.set(key, { host: p.host, protocol });
    }
  }
  return [...seen.values()].sort((a, b) => parseInt(a.host, 10) - parseInt(b.host, 10));
}

// stacks -> Map<portKey, Array<{ stack, service }>>, only entries with >1 owner.
export function hostPortConflicts(stacks) {
  const byPort = new Map();
  for (const stack of stacks || []) {
    for (const svc of stack.services || []) {
      const seenHere = new Set();
      for (const p of svc.ports || []) {
        if (!p.host) continue;
        const key = portKey(p.host, p.protocol);
        if (seenHere.has(key)) continue;
        seenHere.add(key);
        if (!byPort.has(key)) byPort.set(key, []);
        byPort.get(key).push({ stack: stack.name, service: svc.containerName || svc.name });
      }
    }
  }
  const conflicts = new Map();
  for (const [key, owners] of byPort) {
    if (owners.length > 1) conflicts.set(key, owners);
  }
  return conflicts;
}
