const METRICS = [
  ['cpu', 'CPU'],
  ['mem', 'Memory'],
  ['disk', 'Disk'],
  ['net', 'Network'],
];

export function ResourcesConfig({ value, onChange }) {
  const v = value || {};
  const show = Array.isArray(v.show) ? v.show : ['cpu', 'mem', 'disk'];
  const paths = Array.isArray(v.diskPaths) ? v.diskPaths : v.diskPath ? [v.diskPath] : ['/'];

  const toggle = (key) =>
    onChange('show', show.includes(key) ? show.filter((s) => s !== key) : [...show, key]);
  const setPaths = (next) => onChange('diskPaths', next);

  return (
    <div class="tile-config-repeat">
      <span class="tile-config-repeat-label">Show</span>
      <div class="settings-form-row">
        {METRICS.map(([key, label]) => (
          <label class="checkbox-field" key={key}>
            <input type="checkbox" checked={show.includes(key)} onChange={() => toggle(key)} />
            {label}
          </label>
        ))}
      </div>

      <span class="tile-config-repeat-label">Drives (one mount path per row)</span>
      {paths.map((p, i) => (
        <div class="tile-config-repeat-row" key={i}>
          <input
            placeholder="/  ·  /mnt/data  ·  /host/mnt/media"
            value={p}
            onInput={(e) => setPaths(paths.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <button
            type="button"
            onClick={() => setPaths(paths.filter((_, j) => j !== i))}
            disabled={paths.length === 1}
            aria-label="Remove drive"
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" class="tile-config-repeat-add" onClick={() => setPaths([...paths, ''])}>
        + Add drive
      </button>

      <label>
        Network interface (blank = busiest)
        <input value={v.netIface || ''} onInput={(e) => onChange('netIface', e.target.value)} />
      </label>
    </div>
  );
}
