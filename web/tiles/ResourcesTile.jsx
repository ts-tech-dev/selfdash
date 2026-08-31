import { useTileData } from './useTileData.js';

function Bar({ label, pct, detail }) {
  const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return (
    <div class="tile-res-row">
      <div class="tile-res-head">
        <span>{label}</span>
        <span>{detail ?? `${p}%`}</span>
      </div>
      <div class="tile-res-track">
        <div class="tile-res-fill" style={{ width: `${p}%` }} data-hot={p >= 90 ? '' : undefined} />
      </div>
    </div>
  );
}

const fmtGB = (b) => `${(b / 1024 ** 3).toFixed(1)} GB`;

export function ResourcesTile({ tile }) {
  const c = tile.config || {};
  const show = Array.isArray(c.show) && c.show.length ? c.show : ['cpu', 'mem', 'disk'];
  const { data, error, loading } = useTileData(
    `/api/host/stats?disk=${encodeURIComponent(c.diskPath || '/')}&iface=${encodeURIComponent(c.netIface || '')}`,
    5,
    [c.diskPath, c.netIface]
  );

  if (loading && !data) return <div class="tile-panel tile-res tile-panel-muted">Reading host stats…</div>;
  if (error) return <div class="tile-panel tile-res tile-panel-muted">{error}</div>;

  return (
    <div class="tile-panel tile-res">
      {show.includes('cpu') && data.cpu && <Bar label="CPU" pct={data.cpu.percent} />}
      {show.includes('mem') && data.mem && (
        <Bar label="Memory" pct={data.mem.percent} detail={`${fmtGB(data.mem.used)} / ${fmtGB(data.mem.total)}`} />
      )}
      {show.includes('disk') && data.disk && (
        <Bar
          label={`Disk ${data.disk.path}`}
          pct={data.disk.percent}
          detail={`${fmtGB(data.disk.used)} / ${fmtGB(data.disk.total)}`}
        />
      )}
      {show.includes('net') && data.net && (
        <div class="tile-res-row">
          <div class="tile-res-head">
            <span>Net {data.net.iface}</span>
            <span>
              ↓ {(data.net.rxRate / 1024 / 1024).toFixed(1)} MB/s · ↑ {(data.net.txRate / 1024 / 1024).toFixed(1)} MB/s
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
