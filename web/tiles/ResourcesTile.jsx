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
const fmtRate = (b) => `${(b / 1024 / 1024).toFixed(1)} MB/s`;

export function ResourcesTile({ tile }) {
  const c = tile.config || {};
  const show = Array.isArray(c.show) && c.show.length ? c.show : ['cpu', 'mem', 'disk'];
  const paths = Array.isArray(c.diskPaths) ? c.diskPaths : c.diskPath ? [c.diskPath] : ['/'];
  const ifaces = Array.isArray(c.netIfaces) ? c.netIfaces : c.netIface ? [c.netIface] : [];
  const disksParam = paths.filter(Boolean).join(',') || '/';
  const ifacesParam = ifaces.filter(Boolean).join(',');
  const { data, error, loading } = useTileData(
    `/api/host/stats?disks=${encodeURIComponent(disksParam)}&ifaces=${encodeURIComponent(ifacesParam)}`,
    5,
    [disksParam, ifacesParam]
  );

  if (loading && !data) return <div class="tile-panel tile-res tile-panel-muted">Reading host stats…</div>;
  if (error) return <div class="tile-panel tile-res tile-panel-muted">{error}</div>;

  const disks = Array.isArray(data.disks) ? data.disks : data.disk ? [data.disk] : [];
  const nets = Array.isArray(data.nets) ? data.nets : data.net ? [data.net] : [];

  return (
    <div class="tile-panel tile-res">
      {show.includes('cpu') && data.cpu && <Bar label="CPU" pct={data.cpu.percent} />}
      {show.includes('mem') && data.mem && (
        <Bar label="Memory" pct={data.mem.percent} detail={`${fmtGB(data.mem.used)} / ${fmtGB(data.mem.total)}`} />
      )}
      {show.includes('disk') &&
        disks.map((d, i) =>
          d.error ? (
            <div class="tile-res-row tile-panel-muted" key={i}>
              {d.path}: {d.error}
            </div>
          ) : (
            <Bar
              key={i}
              label={disks.length > 1 ? d.path : `Disk ${d.path}`}
              pct={d.percent}
              detail={`${fmtGB(d.used)} / ${fmtGB(d.total)}`}
            />
          )
        )}
      {show.includes('net') &&
        nets.map((n, i) => (
          <div class="tile-res-row" key={i}>
            <div class="tile-res-head">
              <span>Net {n.iface}</span>
              <span>
                {n.error ? n.error : <>↓ {fmtRate(n.rxRate)} · ↑ {fmtRate(n.txRate)}</>}
              </span>
            </div>
          </div>
        ))}
    </div>
  );
}
