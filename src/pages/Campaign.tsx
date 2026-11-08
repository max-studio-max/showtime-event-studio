import { useState } from 'react';
import { channelById, channels } from '../data/channels';
import { nowIso, uid } from '../domain/factory';
import type { CampaignLine, ShowEvent } from '../domain/types';
import { buildUtmUrl, channelMetrics, mergeObserved, modeledTickets, parseMetricRows } from '../engine/operations';
import { useStore } from '../state/store';
import { ExternalLink, Field, MoneyInput, NeedEvent, NumInput, Panel, Tag, useFmtMoney } from '../ui/kit';

/** The five evidence classes the spec requires to be visually distinct. */
const Kind = ({ k }: { k: 'rule' | 'observed' | 'assumption' | 'estimate' | 'unavailable' }) => {
  const label = { rule: '§ Official published rule', observed: '● Observed (imported)', assumption: '≈ Your assumption', estimate: '∿ Scenario estimate', unavailable: '∅ Unavailable' }[k];
  return <span className={`kind kind-${k}`}>{label}</span>;
};


function Line({ ev, l }: { ev: ShowEvent; l: CampaignLine }) {
  const update = useStore((s) => s.updateEvent);
  const fmt = useFmtMoney();
  const ch = channelById(l.channelId)!;
  const [err, setErr] = useState<string | null>(null);
  const patch = (p: Partial<CampaignLine>, what: string) => update(ev.id, (e) => ({ ...e, campaign: e.campaign.map((x) => (x.id === l.id ? { ...x, ...p } : x)) }), `campaign ${ch.name}: ${what}`, { coalesceKey: `${l.id}-${what}` });
  const m = l.observed ? channelMetrics(l.observed) : null;
  const tix = modeledTickets(l);
  const url = l.landingUrl ? buildUtmUrl(l.landingUrl, l.utm) : null;
  return (
    <div className="card wide">
      <div className="row between">
        <strong>{ch.name}</strong>
        <div className="row gap"><Tag>integration: {ch.integration}</Tag><ExternalLink href={ch.officialUrl}>Open official platform</ExternalLink></div>
      </div>
      <p className="small"><Kind k="rule" /> {ch.pricingRule} <span className="muted">(checked {ch.ruleCheckedAt.slice(0, 10)})</span></p>
      <div className="grid-3">
        <Field label="Planned spend"><MoneyInput value={l.plannedMinor} currency={ev.currency} onChange={(v) => patch({ plannedMinor: v }, 'planned')} /></Field>
        <Field label="Committed spend"><MoneyInput value={l.committedMinor} currency={ev.currency} onChange={(v) => patch({ committedMinor: v }, 'committed')} /></Field>
        <Field label="Actual invoiced"><MoneyInput value={l.invoicedMinor} currency={ev.currency} onChange={(v) => patch({ invoicedMinor: v }, 'invoiced')} /></Field>
        <Field label="Start"><input type="date" value={l.startDate ?? ''} onChange={(e) => patch({ startDate: e.target.value }, 'start')} /></Field>
        <Field label="End"><input type="date" value={l.endDate ?? ''} onChange={(e) => patch({ endDate: e.target.value }, 'end')} /></Field>
      </div>
      <h4>Tracking link</h4>
      <div className="grid-3">
        <Field label="Landing / ticket URL"><input value={l.landingUrl ?? ''} onChange={(e) => patch({ landingUrl: e.target.value }, 'landing')} placeholder="https://…" /></Field>
        <Field label="utm_source"><input value={l.utm.source} onChange={(e) => patch({ utm: { ...l.utm, source: e.target.value } }, 'utm')} /></Field>
        <Field label="utm_medium"><input value={l.utm.medium} onChange={(e) => patch({ utm: { ...l.utm, medium: e.target.value } }, 'utm')} /></Field>
        <Field label="utm_campaign"><input value={l.utm.campaign} onChange={(e) => patch({ utm: { ...l.utm, campaign: e.target.value } }, 'utm')} /></Field>
        <Field label="utm_content"><input value={l.utm.content ?? ''} onChange={(e) => patch({ utm: { ...l.utm, content: e.target.value } }, 'utm')} /></Field>
      </div>
      {l.landingUrl && (url ? <div className="row gap"><code className="utm">{url}</code><button className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(url)}>Copy</button></div> : <p className="error small">Landing URL is not a valid link</p>)}
      <h4>Observed performance</h4>
      {l.observed && m ? (
        <>
          <p className="small"><Kind k="observed" /> from {l.observed.source}, imported {l.observed.importedAt.slice(0, 16).replace('T', ' ')}</p>
          <table className="table compact">
            <thead><tr><th>Impr.</th><th>Clicks</th><th>Conv.</th><th>Spend</th><th>CPM</th><th>CPC</th><th>CTR</th><th>CPA</th><th>ROAS*</th></tr></thead>
            <tbody><tr>
              <td>{l.observed.impressions}</td><td>{l.observed.clicks}</td><td>{l.observed.conversions}</td><td>{fmt(l.observed.spendMinor, ev.currency)}</td>
              <td>{m.cpm == null ? '—' : fmt(Math.round(m.cpm), ev.currency)}</td><td>{m.cpc == null ? '—' : fmt(Math.round(m.cpc), ev.currency)}</td>
              <td>{m.ctr == null ? '—' : `${(m.ctr * 100).toFixed(2)}%`}</td><td>{m.cpa == null ? '—' : fmt(Math.round(m.cpa), ev.currency)}</td><td>{m.roas == null ? '—' : m.roas.toFixed(2)}</td>
            </tr></tbody>
          </table>
          <p className="muted small">*ROAS = attributed gross ticket revenue ÷ spend, from the imported file. Conversions are as reported by the platform (gross, not deduplicated across channels).</p>
          <button className="btn ghost sm" onClick={() => patch({ observed: null }, 'clear observed')}>Clear imported data</button>
        </>
      ) : (
        <p className="small"><Kind k="unavailable" /> No connected account. Import a CSV export from the platform with columns <code>impressions, clicks, conversions, spend</code> (optional <code>revenue</code>).</p>
      )}
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label={`Import metrics CSV for ${ch.name}`}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const rows = parseMetricRows(await f.text());
          if (typeof rows === 'string') setErr(rows);
          else {
            const m = mergeObserved(l.observed, rows, f.name, nowIso());
            setErr(m.duplicates ? `${m.added} new row(s) imported; ${m.duplicates} already-imported row(s) skipped.` : null);
            if (m.added) patch({ observed: m.observed }, 'import metrics');
          }
          e.target.value = '';
        }}
      />
      {err && <p className="error small" role="alert">{err}</p>}
      <h4>Forecast model (optional)</h4>
      <p className="small muted">Ticket forecasts from spend appear only if you declare both inputs. They are your assumptions, not platform facts.</p>
      <div className="row gap wrap">
        <Field label="Assumed CPC"><MoneyInput value={l.model?.cpcMinor ?? null} currency={ev.currency} onChange={(v) => patch({ model: v == null ? null : { cpcMinor: v, clickToTicketPct: l.model?.clickToTicketPct ?? 1 } }, 'model')} /></Field>
        <Field label="Click → ticket %"><NumInput value={l.model?.clickToTicketPct ?? null} allowNull step={0.1} min={0} max={100} onChange={(v) => patch({ model: v == null || !l.model ? null : { ...l.model, clickToTicketPct: v } }, 'model')} /></Field>
      </div>
      {l.model && <p className="small"><Kind k="assumption" /> CPC {fmt(l.model.cpcMinor, ev.currency)}, {l.model.clickToTicketPct}% → <Kind k="estimate" /> {tix ?? '—'} tickets from planned spend</p>}
      <div className="row"><button className="btn danger ghost sm" onClick={() => update(ev.id, (e) => ({ ...e, campaign: e.campaign.filter((x) => x.id !== l.id) }), `remove channel ${ch.name}`)}>Remove channel</button></div>
    </div>
  );
}

function CampaignInner({ ev }: { ev: ShowEvent }) {
  const update = useStore((s) => s.updateEvent);
  const fmt = useFmtMoney();
  const used = new Set(ev.campaign.map((c) => c.channelId));
  const planned = ev.campaign.reduce((s, c) => s + (c.plannedMinor ?? 0), 0);
  const unplanned = ev.campaign.filter((c) => c.plannedMinor == null).length;
  return (
    <div className="stack">
      <h1>Campaign</h1>
      <p className="lede">Plan promotion on real platforms. SHOWTIME is not connected to any ad account: launching and spending happen on the platform itself, from the official links below. Nothing is posted or paid for from here.</p>
      <Panel title="Channel directory">
        <table className="table">
          <thead><tr><th>Channel</th><th>Formats</th><th>Pricing rule</th><th>Integration</th><th /></tr></thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.id}>
                <td><ExternalLink href={c.officialUrl}>{c.name}</ExternalLink>{c.docsUrl && <div className="small"><ExternalLink href={c.docsUrl}>Developer docs</ExternalLink></div>}</td>
                <td className="small">{c.formats}<div className="muted">{c.regions}</div></td>
                <td className="small"><Kind k="rule" /> {c.pricingRule}<div className="muted">{c.caveat}</div></td>
                <td><Tag>{c.integration}</Tag></td>
                <td><button className="btn sm" disabled={used.has(c.id)} onClick={() => update(ev.id, (e) => ({ ...e, campaign: [...e.campaign, { id: uid('cl'), channelId: c.id, plannedMinor: null, committedMinor: null, invoicedMinor: null, observed: null, utm: { source: c.id.replace('ch-', ''), medium: c.kind, campaign: e.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') }, model: null }] }), `add channel ${c.name}`)}>{used.has(c.id) ? 'In plan' : 'Add to plan'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Plan">
        <p>Planned spend {fmt(planned, ev.currency)}{unplanned ? ` · ${unplanned} channel(s) without a budget` : ''}. Spend flows into Finance as a marketing cost (invoice › committed › planned). It changes the ticket forecast only where you declared a conversion model.</p>
        <div className="stack">{ev.campaign.map((l) => <Line key={l.id} ev={ev} l={l} />)}</div>
      </Panel>
    </div>
  );
}

export function Campaign() {
  return <NeedEvent>{(ev) => <CampaignInner ev={ev} />}</NeedEvent>;
}
