import { useState } from 'react';
import type { ProviderId } from '../domain/types';
import { useProviderStatus } from '../integrations/client';
import { PROVIDERS } from '../integrations/providers';
import { useStore } from '../state/store';
import { Confirm, download, ExternalLink, Field, Panel, Tag } from '../ui/kit';

function ProvidersPanel() {
  const toggles = useStore((x) => x.settings.providers);
  const set = useStore((x) => x.setSettings);
  const { status, refresh } = useProviderStatus();
  const byId = status?.ok ? new Map(status.data.map((p) => [p.id, p])) : null;
  return (
    <Panel title="Live data providers" actions={<button className="btn ghost sm" onClick={() => void refresh()}>Refresh status</button>}>
      <p className="small">All providers start <b>off</b>. When on, searches go through the local SHOWTIME gateway (<code>npm run gateway</code>), which holds any keys server-side and enforces each provider’s rate limits. Results stay “provider-reported” until you review them at source.</p>
      {status && !status.ok && <p className="error small" role="alert">Gateway: {status.error.message}</p>}
      <table className="table">
        <thead><tr><th>On</th><th>Provider</th><th>Gateway</th><th>Used today</th><th>Use & limits</th></tr></thead>
        <tbody>
          {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => {
            const p = PROVIDERS[id];
            const st = byId?.get(id);
            return (
              <tr key={id}>
                <td><input type="checkbox" aria-label={`Enable ${p.name}`} checked={toggles[id]} onChange={(e) => set({ providers: { ...toggles, [id]: e.target.checked } })} /></td>
                <td>
                  <ExternalLink href={p.homepage}>{p.name}</ExternalLink>
                  <div className="small muted">{p.authMode === 'server_key' ? 'Free API key (server-side)' : 'No key needed'} · <ExternalLink href={p.termsUrl}>terms</ExternalLink></div>
                </td>
                <td>
                  {!st ? <Tag tone="warn">unknown</Tag> : !st.configured ? <Tag tone="warn">not configured</Tag> : st.circuit === 'open' ? <Tag tone="bad">paused</Tag> : st.lastError ? <Tag tone="warn">last call failed</Tag> : <Tag tone="good">ready</Tag>}
                  {st?.lastError && <div className="small muted">{st.lastError.message}</div>}
                  {st?.lastSuccessAt && <div className="small muted">last success {new Date(st.lastSuccessAt).toLocaleTimeString()}</div>}
                  {st?.rateLimit?.available != null && <div className="small muted">quota left {st.rateLimit.available}/{st.rateLimit.limit}</div>}
                </td>
                <td className="num">{st ? `${st.budgetUsedToday}${st.dailyBudget ? ` / ${st.dailyBudget}` : ''}` : '—'}</td>
                <td className="small">{p.permittedUses}<div className="muted">{p.limitations}</div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="small muted">Ticketmaster needs a free key from developer.ticketmaster.com in <code>.env</code> as <code>TICKETMASTER_API_KEY</code> (never in a <code>VITE_</code> variable). Not used: Google Places (requires billing), ad-platform APIs (require approved developer access); those stay link-only.</p>
    </Panel>
  );
}

export function SettingsPage() {
  const s = useStore((x) => x.settings);
  const set = useStore((x) => x.setSettings);
  const org = useStore((x) => x.org);
  const user = useStore((x) => x.user);
  const setOrg = useStore((x) => x.setOrg);
  const setUser = useStore((x) => x.setUser);
  const exportWs = useStore((x) => x.exportWorkspace);
  const importWs = useStore((x) => x.importWorkspace);
  const reset = useStore((x) => x.resetWorkspace);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="stack">
      <h1>Team & Settings</h1>
      <Panel title="Workspace">
        <div className="form-grid">
          <Field label="Organization"><input value={org.name} onChange={(e) => setOrg(e.target.value)} /></Field>
          <Field label="Your name (used in the audit log)"><input value={user.name} onChange={(e) => setUser({ name: e.target.value })} /></Field>
          <Field label="Your role"><select value={user.role} onChange={(e) => setUser({ role: e.target.value })}>{['owner', 'admin', 'producer', 'technical', 'marketing', 'hospitality', 'finance', 'viewer'].map((r) => <option key={r}>{r}</option>)}</select></Field>
        </div>
        <p className="small warn-text">This build is single-user and stores everything in this browser. Roles are recorded for audit only — there are no accounts, sign-in, tenant isolation or shared collaboration yet (see docs/ARCHITECTURE.md).</p>
      </Panel>
      <Panel title="Display">
        <div className="form-grid">
          <Field label="Units"><select value={s.units} onChange={(e) => set({ units: e.target.value as typeof s.units })}><option value="metric">Metric (m)</option><option value="imperial">Imperial (ft/in)</option></select></Field>
          <Field label="Number & currency locale"><select value={s.locale} onChange={(e) => set({ locale: e.target.value })}>{['en-CA', 'en-US', 'fr-CA', 'en-GB'].map((l) => <option key={l}>{l}</option>)}</select></Field>
          <label className="check"><input type="checkbox" checked={s.highContrast} onChange={(e) => set({ highContrast: e.target.checked })} /> High contrast</label>
          <label className="check"><input type="checkbox" checked={s.reducedMotion} onChange={(e) => set({ reducedMotion: e.target.checked })} /> Reduce motion</label>
        </div>
        <p className="small muted">Geometry is always stored in metres and money in integer minor units of its own currency; these settings change display only.</p>
      </Panel>
      <Panel title="Workflow rules">
        <label className="check"><input type="checkbox" checked={s.requireReapproval} onChange={(e) => set({ requireReapproval: e.target.checked })} /> Editing an approved event withdraws approval (moves it to “pending external confirmation”, audited)</label>
      </Panel>
      <Panel title="Data">
        <div className="row gap wrap">
          <button className="btn" onClick={() => download(`showtime-workspace-${new Date().toISOString().slice(0, 10)}.json`, exportWs(), 'application/json')}>Export workspace (JSON)</button>
          <label className="btn ghost">
            Import workspace…
            <input type="file" accept="application/json,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const err = importWs(await f.text()); setMsg(err ?? `Imported ${f.name}`); e.target.value = ''; }} />
          </label>
          <Confirm label="Erase every event, act, product and setting in this browser? This cannot be undone." danger onConfirm={reset}>Reset workspace</Confirm>
        </div>
        {msg && <p className="small" role="status">{msg}</p>}
      </Panel>
      <ProvidersPanel />
      <Panel title="Connections">
        <p className="small">No external accounts are connected. Ad platforms, ticketing, calendars and supplier feeds are link-only until an authorized server-side integration exists — SHOWTIME never posts, books, buys or spends on your behalf.</p>
      </Panel>
    </div>
  );
}
