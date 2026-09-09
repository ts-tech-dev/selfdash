import { Agent, fetch as undiciFetch } from 'undici';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_PER_HOST = 4;

// Self-signed certs are the norm for Proxmox/TrueNAS/UniFi-family appliances — an
// integration surfaces an `allowInsecureTLS` checkbox and passes `insecureTLS: true`
// through to http.fetch()/fetchJson() when it's set. Uses undici's own fetch (not the
// Node-global one) paired with its own Agent: Node's built-in fetch is backed by an
// internal, older-pinned copy of undici, and handing it a Dispatcher built from the
// external `undici` package throws ("invalid onRequestStart method") on a version
// mismatch between the two. One shared Agent for every insecure-TLS call — the
// exception is inherently "skip verification everywhere", not per-host.
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

class HostSemaphore {
  constructor(max) {
    this.max = max;
    this.active = 0;
    this.queue = [];
  }

  acquire() {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  release() {
    this.active--;
    const next = this.queue.shift();
    if (next) {
      this.active++;
      next();
    }
  }
}

export class HttpClient {
  constructor({ maxPerHost = DEFAULT_MAX_PER_HOST, timeout = DEFAULT_TIMEOUT_MS } = {}) {
    this.maxPerHost = maxPerHost;
    this.timeout = timeout;
    this.semaphores = new Map();
  }

  #semaphoreFor(host) {
    let sem = this.semaphores.get(host);
    if (!sem) {
      sem = new HostSemaphore(this.maxPerHost);
      this.semaphores.set(host, sem);
    }
    return sem;
  }

  async fetch(url, opts = {}) {
    const { insecureTLS, timeout, ...rest } = opts;
    const host = new URL(url).host;
    const sem = this.#semaphoreFor(host);
    await sem.acquire();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout ?? this.timeout);
    try {
      const fetchOpts = { ...rest, signal: controller.signal };
      if (insecureTLS) fetchOpts.dispatcher = insecureAgent;
      return await undiciFetch(url, fetchOpts);
    } finally {
      clearTimeout(timer);
      sem.release();
    }
  }

  async fetchJson(url, opts) {
    const res = await this.fetch(url, opts);
    if (!res.ok) throw new Error(`${url} responded ${res.status} ${res.statusText}`);
    return res.json();
  }
}

export const httpClient = new HttpClient();
