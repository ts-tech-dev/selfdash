import { useEffect } from 'preact/hooks';
import { settings, composeScan, loadComposeScan } from '../store.js';

const REFRESH_MS = 60_000;

export function ComposeScanPanel({ pageId }) {
  const enabled = Boolean(settings.value.compose_scan_enabled);
  const targetPage = settings.value.compose_scan_page_id; // null = every page
  const onTargetPage = enabled && (targetPage == null || targetPage === pageId);

  useEffect(() => {
    if (!onTargetPage) return undefined;
    loadComposeScan();
    const timer = setInterval(() => loadComposeScan(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [onTargetPage]);

  if (!onTargetPage) return null;

  const scan = composeScan.value;
  const result = scan?.result;
  const stacks = result && !result.error ? result.stacks : [];
  const totalServices = stacks.reduce((n, s) => n + s.services.length, 0);
  const scannedAt = scan?.result?.scannedAt ? new Date(scan.result.scannedAt) : null;

  return (
    <section class="compose-panel">
      <header class="compose-panel-head">
        <div class="compose-panel-title">
          <h2>Ports &amp; volumes</h2>
          {stacks.length > 0 && (
            <span class="compose-panel-sub">
              {stacks.length} stacks · {totalServices} services
            </span>
          )}
        </div>
        <div class="compose-panel-meta">
          {scan?.dir && <code class="compose-dir">{scan.dir}</code>}
          {scannedAt && (
            <span class="compose-scanned" title={scannedAt.toLocaleString()}>
              {scannedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button type="button" class="compose-rescan" onClick={() => loadComposeScan(true)}>
            Rescan
          </button>
        </div>
      </header>

      {!result && <p class="compose-muted">Loading…</p>}
      {result?.error && <p class="compose-err">{result.error}</p>}
      {result && !result.error && stacks.length === 0 && (
        <p class="compose-muted">No compose files found under this directory.</p>
      )}

      {stacks.length > 0 && (
        <>
          <HostPortSummary stacks={stacks} />
          <div class="compose-stacks">
            {stacks.map((stack) => (
              <Stack key={stack.file} stack={stack} />
            ))}
          </div>
        </>
      )}

      {result?.errors?.length > 0 && (
        <details class="compose-parse-errors">
          <summary>{result.errors.length} file(s) could not be parsed</summary>
          <ul>
            {result.errors.map((e, i) => (
              <li key={i}>
                <code>{e.file}</code> — {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function HostPortSummary({ stacks }) {
  const seen = new Map();
  for (const s of stacks) {
    for (const svc of s.services) {
      for (const p of svc.ports) {
        if (!p.host) continue;
        const proto = p.protocol && p.protocol !== 'tcp' ? p.protocol : null;
        const key = `${p.host}/${proto || 'tcp'}`;
        if (!seen.has(key)) seen.set(key, { host: p.host, proto });
      }
    }
  }
  const list = [...seen.values()].sort((a, b) => parseInt(a.host, 10) - parseInt(b.host, 10));
  if (!list.length) return null;

  return (
    <div class="compose-hostports">
      <span class="compose-hostports-label">Host ports</span>
      <div class="compose-chips">
        {list.map((p) => (
          <span key={`${p.host}/${p.proto}`} class={`chip chip-port${p.proto === 'udp' ? ' chip-udp' : ''}`}>
            <span class="chip-num">{p.host}</span>
            {p.proto && <span class="chip-suffix">{p.proto}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

function stackHostPorts(stack) {
  const seen = new Map();
  for (const svc of stack.services) {
    for (const p of svc.ports) {
      if (!p.host) continue;
      const proto = p.protocol === 'udp' ? 'udp' : 'tcp';
      const key = `${p.host}/${proto}`;
      if (!seen.has(key)) seen.set(key, { host: p.host, udp: proto === 'udp' });
    }
  }
  return [...seen.values()].sort((a, b) => parseInt(a.host, 10) - parseInt(b.host, 10));
}

function Stack({ stack }) {
  const svcCount = stack.services.length;
  const volCount =
    stack.services.reduce((n, s) => n + s.volumes.length, 0) + stack.namedVolumes.length;
  const hostPorts = stackHostPorts(stack);
  const fileName = stack.file.split('/').pop();
  return (
    <details class="compose-stack">
      <summary>
        <span class="compose-chevron" aria-hidden="true" />
        <span class="compose-stack-name">{stack.name}</span>
        <span class="compose-chips compose-stack-ports">
          {hostPorts.length === 0 && <span class="compose-none">no published ports</span>}
          {hostPorts.map((p) => (
            <span key={`${p.host}/${p.udp}`} class={`chip chip-port${p.udp ? ' chip-udp' : ''}`}>
              <span class="chip-num">:{p.host}</span>
              {p.udp && <span class="chip-suffix">udp</span>}
            </span>
          ))}
        </span>
        <span class="compose-stack-meta" title={stack.file}>
          {svcCount} service{svcCount === 1 ? '' : 's'} · {volCount} volume{volCount === 1 ? '' : 's'} ·{' '}
          <code>{fileName}</code>
        </span>
      </summary>
      <div class="compose-stack-body">
        {stack.services.map((svc) => (
          <Service key={svc.name} svc={svc} />
        ))}
        {stack.namedVolumes.length > 0 && (
          <div class="compose-namedvols">
            <span class="compose-row-label">named volumes</span>
            <div class="compose-chips">
              {stack.namedVolumes.map((v) => (
                <span key={v} class="chip chip-vol chip-vol-volume">
                  {v}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function Service({ svc }) {
  const noPorts = svc.ports.length === 0 && svc.expose.length === 0;
  return (
    <div class="compose-service">
      <div class="compose-service-head">
        <span class="compose-service-name">{svc.containerName || svc.name}</span>
        {svc.image && <span class="compose-service-image">{svc.image}</span>}
      </div>

      <div class="compose-service-row">
        <span class="compose-row-label">ports</span>
        <div class="compose-chips">
          {noPorts && <span class="compose-none">—</span>}
          {svc.ports.map((p, i) => (
            <span key={i} class={`chip chip-port${p.protocol === 'udp' ? ' chip-udp' : ''}`} title={p.raw}>
              {p.hostIp && <span class="chip-host">{p.hostIp}</span>}
              {p.host && (
                <>
                  <span class="chip-num">{p.host}</span>
                  <span class="chip-arrow">→</span>
                </>
              )}
              <span class="chip-num">{p.container}</span>
              {p.protocol && p.protocol !== 'tcp' && <span class="chip-suffix">{p.protocol}</span>}
            </span>
          ))}
          {svc.expose.map((e, i) => (
            <span key={`e${i}`} class="chip chip-expose" title="expose — reachable only inside the compose network">
              <span class="chip-num">{e}</span>
              <span class="chip-suffix">internal</span>
            </span>
          ))}
        </div>
      </div>

      <div class="compose-service-row">
        <span class="compose-row-label">volumes</span>
        <div class="compose-chips">
          {svc.volumes.length === 0 && <span class="compose-none">—</span>}
          {svc.volumes.map((v, i) => (
            <span key={i} class={`chip chip-vol chip-vol-${v.type}`} title={v.raw}>
              {v.source && (
                <>
                  <span class="chip-src">{v.source}</span>
                  <span class="chip-arrow">→</span>
                </>
              )}
              <span class="chip-tgt">{v.target}</span>
              {v.readOnly && <span class="chip-suffix">ro</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
