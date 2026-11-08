import { deriveEvent } from '../domain/derive';
import { STATUS_LABEL } from '../engine/lifecycle';
import { useStore } from '../state/store';
import { Empty, Panel, Tag, useFmtMoney, useWorkspaceData } from '../ui/kit';

const MODULE_ROUTE = { venue: 'venues', studio: 'studio', stagecraft: 'studio', spotlight: 'spotlight', catalog: 'catalog', finance: 'finance', service: 'service', production: 'production', campaign: 'campaign' } as const;

export function Home() {
  const events = useStore((s) => s.events);
  const activeId = useStore((s) => s.activeEventId);
  const setActive = useStore((s) => s.setActive);
  const go = useStore((s) => s.go);
  const ws = useWorkspaceData();
  const fmt = useFmtMoney();
  const live = events.filter((e) => e.status !== 'archived' && e.status !== 'cancelled');
  const archived = events.filter((e) => e.status === 'archived' || e.status === 'cancelled');
  const active = events.find((e) => e.id === activeId);
  const activeDerived = active ? deriveEvent(active, ws) : null;

  if (!events.length)
    return (
      <div className="hero">
        <h1>Plan it. Design it. Produce it. Promote it.</h1>
        <p>
          Start with a real venue, lay out the room and stage in 3D, line up talent and gear through traceable public sources, and see what every decision does to capacity,
          cost and revenue — with each fact labelled as verified, published, quoted, assumed or unknown.
        </p>
        <div className="row">
          <button className="btn primary" onClick={() => go('events')}>Create your first event</button>
          <button className="btn ghost" onClick={() => go('venues')}>Browse venues</button>
        </div>
      </div>
    );

  return (
    <div className="stack">
      <h1>Portfolio</h1>
      {active && activeDerived && (
        <Panel title={`Active: ${active.title}`} actions={<button className="btn ghost sm" onClick={() => go('studio')}>Open studio</button>}>
          <div className="grid-2">
            <div>
              <h3>Readiness {activeDerived.readiness.done}/{activeDerived.readiness.total}</h3>
              <ul className="checklist">
                {activeDerived.readiness.items.map((i) => (
                  <li key={i.label} className={i.ok ? 'ok' : 'todo'}>
                    <span aria-hidden>{i.ok ? '✔' : '○'}</span> {i.label}
                    <span className="sr-only">{i.ok ? ' (done)' : ' (outstanding)'}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Outstanding issues</h3>
              {activeDerived.issues.filter((i) => i.level !== 'info').length === 0 ? (
                <p className="muted">No open conflicts or review items.</p>
              ) : (
                <ul className="issues">
                  {activeDerived.issues
                    .filter((i) => i.level !== 'info')
                    .slice(0, 12)
                    .map((i, k) => (
                      <li key={k} className={`lvl-${i.level}`}>
                        <button className="link" onClick={() => go(MODULE_ROUTE[i.module])}>{i.module}</button> {i.message}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </Panel>
      )}
      <Panel title="Upcoming and in progress">
        <div className="cards">
          {live.map((e) => {
            const d = deriveEvent(e, ws);
            const b = d.finance.cases?.base;
            return (
              <button key={e.id} className={`card ev-card ${e.id === activeId ? 'is-active' : ''}`} onClick={() => setActive(e.id)}>
                <div className="row between">
                  <strong>{e.title}</strong>
                  <span className={`status-pill st-${e.status}`}>{STATUS_LABEL[e.status]}</span>
                </div>
                <div className="muted">{d.venue ? `${d.venue.space} · ${d.venue.market}` : 'No venue'} · {e.sessions[0]?.date}</div>
                <div className="meter" aria-label={`Readiness ${d.readiness.done} of ${d.readiness.total}`}>
                  <span style={{ width: `${(d.readiness.done / d.readiness.total) * 100}%` }} />
                </div>
                <div className="row gap">
                  <Tag tone={d.issues.some((i) => i.level === 'potential_conflict') ? 'bad' : 'neutral'}>{d.issues.filter((i) => i.level === 'potential_conflict').length} conflicts</Tag>
                  <Tag>{d.capacity.available ?? '—'} tickets</Tag>
                  <Tag tone={b && !b.costComplete ? 'warn' : 'neutral'}>{b ? `${fmt(b.totalCostMinor, e.currency)}${b.costComplete ? '' : '+'}` : 'no cost model'}</Tag>
                </div>
              </button>
            );
          })}
          {!live.length && <Empty title="No active events" />}
        </div>
      </Panel>
      {archived.length > 0 && (
        <Panel title="Archived & cancelled">
          <ul className="plain">
            {archived.map((e) => (
              <li key={e.id}>
                <button className="link" onClick={() => setActive(e.id)}>{e.title}</button> — {STATUS_LABEL[e.status]}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
