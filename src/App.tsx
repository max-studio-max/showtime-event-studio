import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { STATUS_LABEL } from './engine/lifecycle';
import { useActiveEvent, useStore, type Route } from './state/store';
import { useDerived, useFmtMoney } from './ui/kit';
import { Home } from './pages/Home';
import { Events } from './pages/Events';
import { Venues } from './pages/Venues';
import { Spotlight } from './pages/Spotlight';
import { Catalog } from './pages/Catalog';
import { Campaign } from './pages/Campaign';
import { Service } from './pages/Service';
import { Finance } from './pages/Finance';
import { Production } from './pages/Production';
import { SettingsPage } from './pages/Settings';

// The 3D studio pulls in three.js; load it only when opened.
const Studio = lazy(() => import('./pages/Studio').then((m) => ({ default: m.Studio })));

const NAV: { route: Route; label: string; hint: string }[] = [
  { route: 'home', label: 'Home', hint: 'Portfolio & readiness' },
  { route: 'events', label: 'Events', hint: 'All events, templates, status' },
  { route: 'venues', label: 'Venue Explorer', hint: 'Real venues & evidence' },
  { route: 'studio', label: 'Studio', hint: 'FIT + STAGECRAFT 3D' },
  { route: 'spotlight', label: 'Spotlight', hint: 'Talent & lineup' },
  { route: 'catalog', label: 'Catalog', hint: 'Equipment & suppliers' },
  { route: 'campaign', label: 'Campaign', hint: 'Promotion' },
  { route: 'service', label: 'Service', hint: 'Guests, stations, staff' },
  { route: 'finance', label: 'Finance & Simulation', hint: 'Ledger & scenarios' },
  { route: 'production', label: 'Production', hint: 'Run of show & exports' },
  { route: 'settings', label: 'Team & Settings', hint: 'Units, data, access' },
];

function ContextBar() {
  const ev = useActiveEvent();
  const d = useDerived(ev);
  const saveState = useStore((s) => s.saveState);
  const saveError = useStore((s) => s.saveError);
  const events = useStore((s) => s.events);
  const setActive = useStore((s) => s.setActive);
  const fmt = useFmtMoney();
  const issues = d?.issues.filter((i) => i.level !== 'info').length ?? 0;
  const base = d?.finance.cases?.base;
  return (
    <header className="context-bar" aria-label="Active event context">
      <div className="ctx-event">
        <label className="sr-only" htmlFor="ctx-select">Active event</label>
        <select id="ctx-select" value={ev?.id ?? ''} onChange={(e) => setActive(e.target.value || null)}>
          <option value="">— No event selected —</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
        {ev && <span className={`status-pill st-${ev.status}`}>{STATUS_LABEL[ev.status]}</span>}
      </div>
      {ev && d && (
        <dl className="ctx-facts">
          <div><dt>Venue</dt><dd>{d.venue ? `${d.venue.space}, ${d.venue.market}` : 'None'}</dd></div>
          <div><dt>Date</dt><dd>{ev.sessions[0]?.date ?? '—'} <small>{ev.timezone}</small></dd></div>
          <div><dt>Tickets</dt><dd>{d.capacity.available ?? '—'}{!d.capacity.certified && d.capacity.available != null && <small title={d.capacity.explanation}> uncertified</small>}</dd></div>
          <div><dt>Cost</dt><dd>{base ? fmt(base.totalCostMinor, ev.currency) : '—'}{base && !base.costComplete && <small title="Some cost lines have no price"> incomplete</small>}</dd></div>
          <div><dt>Issues</dt><dd>{issues}</dd></div>
        </dl>
      )}
      <div className={`save save-${saveState}`} role="status" aria-live="polite" title={saveError ?? undefined}>
        {saveState === 'saved' ? 'Saved locally' : saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? `Save failed${saveError ? `: ${saveError}` : ''}` : 'Unsaved'}
      </div>
    </header>
  );
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const go = useStore((s) => s.go);
  const events = useStore((s) => s.events);
  const setActive = useStore((s) => s.setActive);
  const [q, setQ] = useState('');
  const items = useMemo(() => {
    const nav = NAV.map((n) => ({ key: `nav-${n.route}`, label: `Go to ${n.label}`, run: () => go(n.route) }));
    const evs = events.map((e) => ({ key: `ev-${e.id}`, label: `Open event: ${e.title}`, run: () => (setActive(e.id), go('home')) }));
    return [...nav, ...evs].filter((i) => i.label.toLowerCase().includes(q.toLowerCase()));
  }, [q, events, go, setActive]);
  const [sel, setSel] = useState(0);
  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" role="dialog" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Search modules and events…"
          value={q}
          onChange={(e) => (setQ(e.target.value), setSel(0))}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowDown') setSel((s) => Math.min(s + 1, items.length - 1));
            if (e.key === 'ArrowUp') setSel((s) => Math.max(s - 1, 0));
            if (e.key === 'Enter' && items[sel]) (items[sel].run(), onClose());
          }}
        />
        <ul role="listbox">
          {items.slice(0, 12).map((i, k) => (
            <li key={i.key} role="option" aria-selected={k === sel} className={k === sel ? 'sel' : ''} onMouseEnter={() => setSel(k)} onClick={() => (i.run(), onClose())}>
              {i.label}
            </li>
          ))}
          {!items.length && <li className="muted">No matches</li>}
        </ul>
      </div>
    </div>
  );
}

export function App() {
  const route = useStore((s) => s.route);
  const go = useStore((s) => s.go);
  const settings = useStore((s) => s.settings);
  const toast = useStore((s) => s.toast);
  const setToast = useStore((s) => s.setToast);
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast, setToast]);

  const page = (() => {
    switch (route) {
      case 'home': return <Home />;
      case 'events': return <Events />;
      case 'venues': return <Venues />;
      case 'studio': return <Suspense fallback={<div className="loading">Loading 3D studio…</div>}><Studio /></Suspense>;
      case 'spotlight': return <Spotlight />;
      case 'catalog': return <Catalog />;
      case 'campaign': return <Campaign />;
      case 'service': return <Service />;
      case 'finance': return <Finance />;
      case 'production': return <Production />;
      case 'settings': return <SettingsPage />;
    }
  })();

  return (
    <div className={`app ${settings.highContrast ? 'hc' : ''} ${settings.reducedMotion ? 'rm' : ''}`}>
      <a href="#main" className="skip">Skip to content</a>
      <nav className="sidebar" aria-label="Modules">
        <div className="brand">
          <span className="brand-mark" aria-hidden>▲</span>
          <div>
            <strong>SHOWTIME</strong>
            <small>Event Production Studio</small>
          </div>
        </div>
        <ul>
          {NAV.map((n) => (
            <li key={n.route}>
              <button className={route === n.route ? 'active' : ''} aria-current={route === n.route ? 'page' : undefined} onClick={() => go(n.route)}>
                <span>{n.label}</span>
                <small>{n.hint}</small>
              </button>
            </li>
          ))}
        </ul>
        <button className="palette-hint" onClick={() => setPalette(true)}>
          Search <kbd>Ctrl</kbd>+<kbd>K</kbd>
        </button>
      </nav>
      <div className="main-col">
        <ContextBar />
        <main id="main" className={`page page-${route}`}>{page}</main>
      </div>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button className="btn ghost sm" onClick={() => setToast(null)} aria-label="Dismiss">✕</button>
        </div>
      )}
    </div>
  );
}
