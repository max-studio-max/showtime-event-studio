import { useState } from 'react';
import { useStore } from '../state/store';
import { Confirm, download, Field, Panel } from '../ui/kit';

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
      <Panel title="Connections">
        <p className="small">No external accounts are connected. Ad platforms, ticketing, calendars and supplier feeds are link-only until an authorized server-side integration exists — SHOWTIME never posts, books, buys or spends on your behalf.</p>
      </Panel>
    </div>
  );
}
