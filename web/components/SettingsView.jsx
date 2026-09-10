import { useState, useEffect, useRef } from 'preact/hooks';
import { AppearanceSection } from './settings/AppearanceSection.jsx';
import { PagesSection } from './settings/PagesSection.jsx';
import { IntegrationsSection } from './settings/IntegrationsSection.jsx';
import { ComposeScanSection } from './settings/ComposeScanSection.jsx';
import { BackupSection } from './settings/BackupSection.jsx';

const SECTIONS = [
  { id: 'appearance', label: 'Appearance', Comp: AppearanceSection },
  { id: 'pages', label: 'Pages', Comp: PagesSection },
  { id: 'integrations', label: 'Integrations', Comp: IntegrationsSection },
  { id: 'compose', label: 'Compose scan', Comp: ComposeScanSection },
  { id: 'backup', label: 'Backup', Comp: BackupSection },
];

// All five sections stay mounted (so in-progress form state survives a tab click);
// the sticky nav just scroll-jumps between them and tracks which one you're looking at.
export function SettingsView() {
  const [active, setActive] = useState(SECTIONS[0].id);
  const rootRef = useRef(null);
  const suppressObserver = useRef(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (suppressObserver.current) return;
        const topmost = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (topmost) setActive(topmost.target.id.replace('settings-', ''));
      },
      // Trip when a section's top passes just under the sticky nav.
      { rootMargin: '-72px 0px -55% 0px' }
    );

    SECTIONS.forEach((s) => {
      const el = root.querySelector(`#settings-${s.id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const go = (id) => {
    setActive(id);
    const el = rootRef.current?.querySelector(`#settings-${id}`);
    if (!el) return;
    // Mute the observer during the programmatic scroll so it doesn't flicker
    // through the sections it passes over on the way.
    suppressObserver.current = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      suppressObserver.current = false;
    }, 700);
  };

  return (
    <div class="settings-view" ref={rootRef}>
      <nav class="settings-nav" aria-label="Settings sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            class={`settings-nav-tab${active === s.id ? ' active' : ''}`}
            aria-current={active === s.id ? 'true' : undefined}
            onClick={() => go(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>
      {SECTIONS.map(({ id, Comp }) => (
        <div key={id} id={`settings-${id}`} class="settings-anchor">
          <Comp />
        </div>
      ))}
    </div>
  );
}
