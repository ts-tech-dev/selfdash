import { readFile, statfs } from 'node:fs/promises';
import { existsSync } from 'node:fs';

// Prefer a bind-mounted host /proc (see docker-compose.yml) so the numbers reflect
// the host rather than the container; fall back to the container's own /proc.
const PROC = existsSync('/host/proc/stat') ? '/host/proc' : '/proc';

let lastCpu = null; // { total, idle }
let lastNet = null; // { [iface]: { rx, tx }, t }

async function readCpu() {
  const line = (await readFile(`${PROC}/stat`, 'utf8')).split('\n')[0];
  const parts = line.trim().split(/\s+/).slice(1).map(Number);
  const idle = parts[3] + (parts[4] || 0);
  const total = parts.reduce((a, b) => a + b, 0);
  let percent = 0;
  if (lastCpu) {
    const dt = total - lastCpu.total;
    const di = idle - lastCpu.idle;
    if (dt > 0) percent = Math.max(0, Math.min(100, (1 - di / dt) * 100));
  }
  lastCpu = { total, idle };
  return { percent };
}

async function readMem() {
  const txt = await readFile(`${PROC}/meminfo`, 'utf8');
  const get = (k) => Number((txt.match(new RegExp(`^${k}:\\s+(\\d+)`, 'm')) || [])[1] || 0) * 1024;
  const total = get('MemTotal');
  const avail = get('MemAvailable') || total - get('MemFree');
  const used = Math.max(0, total - avail);
  return { total, used, percent: total ? (used / total) * 100 : 0 };
}

async function readDisk(path) {
  const s = await statfs(path || '/');
  const total = s.blocks * s.bsize;
  const used = (s.blocks - s.bavail) * s.bsize;
  return { path: path || '/', total, used, percent: total ? (used / total) * 100 : 0 };
}

async function readDisks(paths) {
  const list = (paths && paths.length ? paths : ['/']).slice(0, 8);
  const results = await Promise.all(
    list.map((p) => readDisk(p).catch((err) => ({ path: p, error: err.message })))
  );
  return results;
}

// /proc/net/* is network-namespace scoped, so a bind-mounted /host/proc still only
// shows the container's interfaces. When the host PID namespace is shared
// (`pid: host`), pid 1 lives in the host netns, so /host/proc/1/net/dev exposes the
// real host interfaces. Prefer that, fall back to our own.
async function readNetDev() {
  try {
    const t = await readFile(`${PROC}/1/net/dev`, 'utf8');
    if (t.includes(':')) return t;
  } catch {
    /* pid ns not shared */
  }
  return readFile(`${PROC}/net/dev`, 'utf8');
}

// `wanted` = array of interface names; empty means "just the busiest one".
async function readNets(wanted = []) {
  const txt = await readNetDev();
  const now = Date.now();
  const ifaces = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([^:]+):\s*(\d+)(?:\s+\d+){7}\s+(\d+)/);
    if (!m) continue;
    const name = m[1].trim();
    if (name === 'lo') continue;
    ifaces[name] = { rx: Number(m[2]), tx: Number(m[3]) };
  }
  const names = Object.keys(ifaces).sort();
  const busiest = Object.entries(ifaces).sort(
    (a, b) => b[1].rx + b[1].tx - a[1].rx - a[1].tx
  )[0]?.[0];

  let picks = wanted.filter(Boolean);
  if (!picks.length) picks = busiest ? [busiest] : [];

  const rateFor = (iface) => {
    if (!ifaces[iface]) return { iface, error: 'no such interface' };
    let rxRate = 0;
    let txRate = 0;
    if (lastNet && lastNet[iface] && lastNet.t) {
      const secs = (now - lastNet.t) / 1000;
      if (secs > 0) {
        rxRate = Math.max(0, (ifaces[iface].rx - lastNet[iface].rx) / secs);
        txRate = Math.max(0, (ifaces[iface].tx - lastNet[iface].tx) / secs);
      }
    }
    return { iface, rxRate, txRate };
  };

  const nets = picks.map(rateFor);
  lastNet = { ...ifaces, t: now };
  return { nets, names, busiest };
}

export async function hostStats({ diskPaths = ['/'], ifaces = [] } = {}) {
  const [cpu, mem, disks, netResult] = await Promise.all([
    readCpu().catch(() => null),
    readMem().catch(() => null),
    readDisks(diskPaths).catch(() => []),
    readNets(ifaces).catch(() => ({ nets: [], names: [], busiest: null })),
  ]);
  // `disk` / `net` kept as the first entry for backward compatibility.
  return {
    source: PROC,
    cpu,
    mem,
    disk: disks[0] || null,
    disks,
    net: netResult.nets[0] || null,
    nets: netResult.nets,
    netInterfaces: netResult.names,
    netBusiest: netResult.busiest || null,
  };
}
