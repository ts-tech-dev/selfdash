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

async function readNet(want) {
  const txt = await readFile(`${PROC}/net/dev`, 'utf8');
  const now = Date.now();
  const ifaces = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([^:]+):\s*(\d+)(?:\s+\d+){7}\s+(\d+)/);
    if (!m) continue;
    const name = m[1].trim();
    if (name === 'lo') continue;
    ifaces[name] = { rx: Number(m[2]), tx: Number(m[3]) };
  }

  let iface = want && ifaces[want] ? want : null;
  if (!iface) {
    // busiest by total bytes
    iface = Object.entries(ifaces).sort((a, b) => b[1].rx + b[1].tx - a[1].rx - a[1].tx)[0]?.[0];
  }
  if (!iface) return null;

  let rxRate = 0;
  let txRate = 0;
  if (lastNet && lastNet[iface] && lastNet.t) {
    const secs = (now - lastNet.t) / 1000;
    if (secs > 0) {
      rxRate = Math.max(0, (ifaces[iface].rx - lastNet[iface].rx) / secs);
      txRate = Math.max(0, (ifaces[iface].tx - lastNet[iface].tx) / secs);
    }
  }
  lastNet = { ...ifaces, t: now };
  return { iface, rxRate, txRate };
}

export async function hostStats({ diskPath = '/', iface = '' } = {}) {
  const [cpu, mem, disk, net] = await Promise.all([
    readCpu().catch(() => null),
    readMem().catch(() => null),
    readDisk(diskPath).catch(() => null),
    readNet(iface).catch(() => null),
  ]);
  return { source: PROC, cpu, mem, disk, net };
}
