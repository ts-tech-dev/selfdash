import { useEffect, useRef, useState } from 'preact/hooks';

// Polls a server endpoint on an interval and returns { data, error, loading }.
// `path` is an /api path; `intervalSec` how often to refetch (min 5s).
export function useTileData(path, intervalSec = 60, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    let alive = true;
    let timer = null;

    async function tick() {
      try {
        const res = await fetch(pathRef.current);
        const body = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) setState({ data: null, error: body.error || `${res.status}`, loading: false });
        else setState({ data: body, error: null, loading: false });
      } catch (err) {
        if (alive) setState((s) => ({ ...s, error: err.message, loading: false }));
      }
      if (alive) timer = setTimeout(tick, Math.max(5, intervalSec) * 1000);
    }

    setState((s) => ({ ...s, loading: true }));
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, intervalSec, ...deps]);

  return state;
}
