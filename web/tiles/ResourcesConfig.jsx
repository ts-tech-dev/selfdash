import { useEffect, useState } from 'preact/hooks';

const METRICS = [
  ['cpu', 'CPU'],
  ['mem', 'Memory'],
  ['disk', 'Disk'],
  ['net', 'Network'],
];

function RepeatList({ label, hint, values, onChange, placeholder, datalistId }) {
  const rows = values.length ? values : [''];
  const set = (next) => onChange(next);
  return (
    <>
      <span class="tile-config-repeat-label">{label}</span>
      {hint && <p class="settings-hint">{hint}</p>}
      {rows.map((val, i) => (
        <div class="tile-config-repeat-row" key={i}>
          <input
            list={datalistId}
            placeholder={placeholder}
            value={val}
            onInput={(e) => set(rows.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <button
            type="button"
            onClick={() => set(rows.filter((_, j) => j !== i))}
            disabled={rows.length === 1 && !rows[0]}
            aria-label="Remove"
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" class="tile-config-repeat-add" onClick={() => onChange([...values, ''])}>
        + Add
      </button>
    </>
  );
}

export function ResourcesConfig({ value, onChange }) {
  const v = value || {};
  const show = Array.isArray(v.show) ? v.show : ['cpu', 'mem', 'disk'];
  const diskPaths = Array.isArray(v.diskPaths) ? v.diskPaths : v.diskPath ? [v.diskPath] : ['/'];
  const netIfaces = Array.isArray(v.netIfaces) ? v.netIfaces : v.netIface ? [v.netIface] : [];
  const [ifaceNames, setIfaceNames] = useState([]);

  useEffect(() => {
    let alive = true;
    fetch('/api/host/stats')
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => alive && setIfaceNames(d.netInterfaces || []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const toggle = (key) =>
    onChange('show', show.includes(key) ? show.filter((s) => s !== key) : [...show, key]);

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

      {show.includes('disk') && (
        <RepeatList
          label="Drives (one mount path per row)"
          values={diskPaths}
          onChange={(next) => onChange('diskPaths', next)}
          placeholder="/  ·  /mnt/data  ·  /host/mnt/media"
        />
      )}

      {show.includes('net') && (
        <>
          <datalist id="selfdash-iface-list">
            {ifaceNames
              .filter((n) => !/^veth/.test(n) && !/^br-[0-9a-f]{12}$/.test(n))
              .map((n) => (
                <option key={n} value={n} />
              ))}
          </datalist>
          <RepeatList
            label="Network interfaces"
            hint="Leave empty to auto-pick the busiest interface."
            values={netIfaces}
            onChange={(next) => onChange('netIfaces', next)}
            placeholder="eth0 · wg0 · br-lan"
            datalistId="selfdash-iface-list"
          />
        </>
      )}
    </div>
  );
}
