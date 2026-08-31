const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_PER_HOST = 4;

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
    const host = new URL(url).host;
    const sem = this.#semaphoreFor(host);
    await sem.acquire();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeout ?? this.timeout);
    try {
      return await fetch(url, { ...opts, signal: controller.signal });
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
