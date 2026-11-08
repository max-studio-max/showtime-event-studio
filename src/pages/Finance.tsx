import { useState } from 'react';
import { nowIso, uid } from '../domain/factory';
import type { BudgetLine, CostCategory, RevenueLine, ShowEvent } from '../domain/types';
import { computeFinance, type CaseResult } from '../engine/finance';
import { compareScenarios, reproduce, snapshotScenario } from '../engine/scenario';
import { api } from '../integrations/client';
import type { FxObservation } from '../integrations/contracts';
import { useStore } from '../state/store';
import { Confirm, Empty, Field, MoneyInput, NeedEvent, NumInput, Panel, Tag, useDerived, useFmtMoney } from '../ui/kit';

const CATS: CostCategory[] = ['venue', 'deposit', 'staffing', 'talent', 'travel', 'tax', 'permits_insurance', 'equipment', 'delivery', 'crew', 'catering_bar', 'marketing', 'ticketing_fees', 'merchandise', 'contingency', 'accessibility', 'other'];

function FinanceInner({ ev }: { ev: ShowEvent }) {
  const update = useStore((s) => s.updateEvent);
  const d = useDerived(ev)!;
  const fmt = useFmtMoney();
  const [scName, setScName] = useState('');
  const [cmp, setCmp] = useState<string | null>(null);
  const [fxErr, setFxErr] = useState<string | null>(null);
  const c = ev.currency;
  const set = (fn: (e: ShowEvent) => ShowEvent, what: string) => update(ev.id, fn, what, { coalesceKey: what });
  const setLine = (id: string, p: Partial<BudgetLine>, w: string) => set((e) => ({ ...e, budgetLines: e.budgetLines.map((l) => (l.id === id ? { ...l, ...p } : l)) }), `budget ${id} ${w}`);
  const setRev = (id: string, p: Partial<RevenueLine>, w: string) => set((e) => ({ ...e, revenueLines: e.revenueLines.map((l) => (l.id === id ? { ...l, ...p } : l)) }), `revenue ${id} ${w}`);
  const a = ev.assumptions;
  const cases = d.finance.cases;
  const row = (label: string, f: (x: CaseResult) => number | null, strong = false) =>
    cases && (
      <tr className={strong ? 'strong' : ''}>
        <td>{label}</td>
        {(['low', 'base', 'high'] as const).map((k) => { const v = f(cases[k]); return <td key={k} className="num">{v == null ? <span className="missing">not computable</span> : fmt(v, c)}</td>; })}
      </tr>
    );
  const compareTo = ev.scenarios.find((s) => s.id === cmp);
  return (
    <div className="stack">
      <h1>Finance & Simulation</h1>
      <div className="grid-2">
        <Panel title="Ticket inventory">
          <p className="big num">{d.capacity.available ?? '—'}</p>
          <p className="small">{d.capacity.explanation}</p>
          <p className="small">Venue figure: {d.venueCapacity.value ?? 'unknown'} ({d.venueCapacity.status.replace(/_/g, ' ')}) · planned layout: {d.layoutSellable ?? 'none'} · holds: {ev.holds.comps + ev.holds.accessible + ev.holds.production}</p>
        </Panel>
        <Panel title="Break-even">
          <p className="big num">{d.finance.breakEven.attendance ?? '—'}</p>
          <p className="small">{d.finance.breakEven.explanation}</p>
        </Panel>
      </div>
      <Panel title="Ticket tiers" actions={<button className="btn ghost sm" onClick={() => update(ev.id, (e) => ({ ...e, ticketTiers: [...e.ticketTiers, { id: uid('tier'), name: 'New tier', priceMinor: 0, quantity: 0 }] }), 'add tier')}>+ Tier</button>}>
        {ev.ticketTiers.length === 0 ? <Empty title="No ticket tiers">Free or private events can have none.</Empty> : (
          <table className="table">
            <thead><tr><th>Tier</th><th>Face price (incl. any tax you set below)</th><th>Quantity (blank = remainder)</th><th /></tr></thead>
            <tbody>{ev.ticketTiers.map((t) => (
              <tr key={t.id}>
                <td><input aria-label="Tier name" value={t.name} onChange={(e) => set((x) => ({ ...x, ticketTiers: x.ticketTiers.map((y) => (y.id === t.id ? { ...y, name: e.target.value } : y)) }), `tier ${t.id} name`)} /></td>
                <td><MoneyInput ariaLabel="Face price" value={t.priceMinor} currency={c} onChange={(v) => set((x) => ({ ...x, ticketTiers: x.ticketTiers.map((y) => (y.id === t.id ? { ...y, priceMinor: v ?? 0 } : y)) }), `tier ${t.id} price`)} /></td>
                <td><NumInput ariaLabel="Quantity" value={t.quantity} allowNull min={0} onChange={(v) => set((x) => ({ ...x, ticketTiers: x.ticketTiers.map((y) => (y.id === t.id ? { ...y, quantity: v } : y)) }), `tier ${t.id} qty`)} /></td>
                <td><button className="btn ghost sm" onClick={() => update(ev.id, (x) => ({ ...x, ticketTiers: x.ticketTiers.filter((y) => y.id !== t.id) }), 'remove tier')}>Remove</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Panel>
      <Panel title="Assumptions">
        <div className="grid-3">
          {(['low', 'base', 'high'] as const).map((k) => (
            <Field key={k} label={`Sell-through ${k} (%)`}><NumInput value={Math.round(a.sellThrough[k] * 1000) / 10} min={0} max={100} step={5} onChange={(v) => set((x) => ({ ...x, assumptions: { ...x.assumptions, sellThrough: { ...x.assumptions.sellThrough, [k]: (v ?? 0) / 100 } } }), `sell-through ${k}`)} /></Field>
          ))}
          <Field label="Ticketing + processing fee (%)" hint={a.feeSourceNote}><NumInput value={a.ticketFeeBps / 100} step={0.1} min={0} max={100} onChange={(v) => set((x) => ({ ...x, assumptions: { ...x.assumptions, ticketFeeBps: Math.round((v ?? 0) * 100) } }), 'fee %')} /></Field>
          <Field label="Fixed fee per ticket"><MoneyInput value={a.ticketFeeFixedMinor} currency={c} onChange={(v) => set((x) => ({ ...x, assumptions: { ...x.assumptions, ticketFeeFixedMinor: v ?? 0 } }), 'fixed fee')} /></Field>
          <Field label="Fee source note"><input value={a.feeSourceNote} onChange={(e) => set((x) => ({ ...x, assumptions: { ...x.assumptions, feeSourceNote: e.target.value } }), 'fee note')} /></Field>
          <Field label="Refund allowance (%)"><NumInput value={a.refundBps / 100} step={0.5} min={0} max={100} onChange={(v) => set((x) => ({ ...x, assumptions: { ...x.assumptions, refundBps: Math.round((v ?? 0) * 100) } }), 'refunds')} /></Field>
          <Field label="Sales tax included in face price (%)"><NumInput value={a.taxIncludedBps / 100} step={0.5} min={0} max={50} onChange={(v) => set((x) => ({ ...x, assumptions: { ...x.assumptions, taxIncludedBps: Math.round((v ?? 0) * 100) } }), 'tax')} /></Field>
          <Field label="Contingency on known costs (%)"><NumInput value={a.contingencyBps / 100} step={1} min={0} max={100} onChange={(v) => set((x) => ({ ...x, assumptions: { ...x.assumptions, contingencyBps: Math.round((v ?? 0) * 100) } }), 'contingency')} /></Field>
        </div>
      </Panel>
      <Panel title="Results">
        {!cases ? <Empty title="Not computable">{d.capacity.explanation}</Empty> : (
          <table className="table">
            <thead><tr><th /><th>Low</th><th>Base</th><th>High</th></tr></thead>
            <tbody>
              <tr><td>Attendance (tickets sold)</td>{(['low', 'base', 'high'] as const).map((k) => <td key={k} className="num">{cases[k].attendance}</td>)}</tr>
              {row('Gross ticket receipts', (x) => x.grossTicketMinor)}
              {row('− Platform & processing fees', (x) => -x.feesMinor)}
              {row('− Refund allowance', (x) => -x.refundsMinor)}
              {row('− Included sales tax (remitted)', (x) => -x.taxMinor)}
              {row('= Net ticket sales', (x) => x.netTicketMinor, true)}
              {row('+ Other revenue (known)', (x) => x.otherRevenueMinor)}
              {row('− Total cost (known + contingency)', (x) => -x.totalCostMinor)}
              {row('= Contribution', (x) => x.contributionMinor, true)}
            </tbody>
          </table>
        )}
        {d.finance.warnings.length > 0 && <ul className="issues small">{d.finance.warnings.map((w) => <li key={w} className="lvl-needs_review">{w}</li>)}</ul>}
        <details>
          <summary>Explain these numbers ({d.finance.calcVersion})</summary>
          <table className="table compact">
            <thead><tr><th>Value</th><th>Equation</th><th>Result (minor units)</th></tr></thead>
            <tbody>{d.finance.trace.map((t) => <tr key={t.label}><td>{t.label}</td><td><code>{t.formula}</code></td><td className="num">{t.value}</td></tr>)}</tbody>
          </table>
          <p className="small muted">Money is integer cents; percentages use banker’s rounding; a line with no price is listed as missing and never counted as zero.</p>
        </details>
      </Panel>
      <Panel title="Cost ledger" actions={<button className="btn ghost sm" onClick={() => update(ev.id, (e) => ({ ...e, budgetLines: [...e.budgetLines, { id: uid('bl'), category: 'other', label: 'New cost', amountMinor: null, currency: c, basis: 'fixed', quantity: 1, state: 'estimated', source: 'assumption' }] }), 'add cost line')}>+ Manual line</button>}>
        <table className="table">
          <thead><tr><th>Category</th><th>Line</th><th>Unit amount</th><th>Basis</th><th>Qty</th><th>State</th><th>Source</th><th /></tr></thead>
          <tbody>
            {ev.budgetLines.map((l) => (
              <tr key={l.id}>
                <td><select aria-label="Category" value={l.category} onChange={(e) => setLine(l.id, { category: e.target.value as CostCategory }, 'cat')}>{CATS.map((x) => <option key={x}>{x}</option>)}</select></td>
                <td><input aria-label="Label" value={l.label} onChange={(e) => setLine(l.id, { label: e.target.value }, 'label')} /></td>
                <td><MoneyInput ariaLabel="Amount" value={l.amountMinor} currency={l.currency} onChange={(v) => setLine(l.id, { amountMinor: v }, 'amount')} /> <select aria-label="Currency" value={l.currency} onChange={(e) => setLine(l.id, { currency: e.target.value }, 'currency')}>{['CAD', 'USD', 'EUR', 'GBP'].map((x) => <option key={x}>{x}</option>)}</select></td>
                <td><select aria-label="Basis" value={l.basis} onChange={(e) => setLine(l.id, { basis: e.target.value as BudgetLine['basis'] }, 'basis')}><option value="fixed">fixed</option><option value="per_attendee">per attendee</option><option value="per_ticket">per ticket</option></select></td>
                <td><NumInput ariaLabel="Quantity" value={l.quantity} min={0} width={60} onChange={(v) => setLine(l.id, { quantity: v ?? 0 }, 'qty')} /></td>
                <td><select aria-label="State" value={l.state} onChange={(e) => setLine(l.id, { state: e.target.value as BudgetLine['state'] }, 'state')}>{['estimated', 'quoted', 'committed', 'paid'].map((x) => <option key={x}>{x}</option>)}</select></td>
                <td><select aria-label="Source" value={l.source} onChange={(e) => setLine(l.id, { source: e.target.value as BudgetLine['source'] }, 'source')}>{['assumption', 'published', 'private_quote', 'invoice'].map((x) => <option key={x}>{x.replace('_', ' ')}</option>)}</select></td>
                <td><button className="btn ghost sm" onClick={() => update(ev.id, (e) => ({ ...e, budgetLines: e.budgetLines.filter((x) => x.id !== l.id) }), 'remove cost line')}>Remove</button></td>
              </tr>
            ))}
            {d.costLines.filter((l) => l.derivedFrom).map((l) => (
              <tr key={l.id} className="derived">
                <td>{l.category}</td>
                <td>{l.label} <Tag tone="info">from {l.derivedFrom!.module}</Tag></td>
                <td>{l.amountMinor == null ? <span className="missing">Missing</span> : fmt(l.amountMinor, l.currency)}</td>
                <td>{l.basis}</td>
                <td>{l.quantity}</td>
                <td>{l.state}</td>
                <td className="small">{l.sourceNote}</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Lines tagged “from …” are recalculated from the venue, lineup, BOM, campaign and roster. Add a manual venue line (e.g. your private quote) to override the derived venue line.</p>
      </Panel>
      <Panel title="Other revenue" actions={<button className="btn ghost sm" onClick={() => update(ev.id, (e) => ({ ...e, revenueLines: [...e.revenueLines, { id: uid('rl'), kind: 'sponsor', label: 'Sponsor', amountMinor: null, currency: c, state: 'assumption' }] }), 'add revenue line')}>+ Revenue</button>}>
        {ev.revenueLines.length === 0 ? <p className="muted small">None.</p> : (
          <table className="table"><tbody>{ev.revenueLines.map((r) => (
            <tr key={r.id}>
              <td><select aria-label="Kind" value={r.kind} onChange={(e) => setRev(r.id, { kind: e.target.value as RevenueLine['kind'] }, 'kind')}>{['sponsor', 'grant', 'bar', 'merch', 'donation', 'vendor_fee', 'other'].map((x) => <option key={x}>{x}</option>)}</select></td>
              <td><input aria-label="Label" value={r.label} onChange={(e) => setRev(r.id, { label: e.target.value }, 'label')} /></td>
              <td><MoneyInput ariaLabel="Amount" value={r.amountMinor} currency={r.currency} onChange={(v) => setRev(r.id, { amountMinor: v }, 'amount')} /></td>
              <td><select aria-label="State" value={r.state} onChange={(e) => setRev(r.id, { state: e.target.value as RevenueLine['state'] }, 'state')}>{['assumption', 'agreed', 'received'].map((x) => <option key={x}>{x}</option>)}</select></td>
              <td><button className="btn ghost sm" onClick={() => update(ev.id, (e) => ({ ...e, revenueLines: e.revenueLines.filter((x) => x.id !== r.id) }), 'remove revenue line')}>Remove</button></td>
            </tr>
          ))}</tbody></table>
        )}
      </Panel>
      <Panel title="Exchange rates" actions={<button className="btn ghost sm" onClick={() => update(ev.id, (e) => ({ ...e, fxRates: [...e.fxRates, { from: c === 'CAD' ? 'USD' : 'CAD', to: c, rate: '', source: '', asOf: nowIso() }] }), 'add fx rate')}>+ Rate</button>}>
        {fxErr && <p className="error small" role="alert">{fxErr}</p>}
        <p className="small muted">Used to convert foreign-currency lines into {c}. Original amounts and currencies are kept. Enter a rate from a source you trust and record it.</p>
        {ev.fxRates.map((r, i) => (
          <div key={i} className="row gap wrap">
            <input aria-label="From" value={r.from} size={4} onChange={(e) => set((x) => ({ ...x, fxRates: x.fxRates.map((y, j) => (j === i ? { ...y, from: e.target.value.toUpperCase() } : y)) }), `fx ${i} from`)} /> →
            <span>{r.to}</span>
            <input aria-label="Rate" value={r.rate} placeholder="e.g. 1.3700" onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && set((x) => ({ ...x, fxRates: x.fxRates.map((y, j) => (j === i ? { ...y, rate: e.target.value } : y)) }), `fx ${i} rate`)} />
            <input aria-label="Source" value={r.source} placeholder="Source (e.g. Bank of Canada)" onChange={(e) => set((x) => ({ ...x, fxRates: x.fxRates.map((y, j) => (j === i ? { ...y, source: e.target.value } : y)) }), `fx ${i} source`)} />
            <input aria-label="As of" type="date" value={r.asOf.slice(0, 10)} onChange={(e) => set((x) => ({ ...x, fxRates: x.fxRates.map((y, j) => (j === i ? { ...y, asOf: new Date(e.target.value).toISOString() } : y)) }), `fx ${i} date`)} />
            {(r.from === 'CAD' || r.to === 'CAD') && r.from !== r.to && (
              <button
                className="btn ghost sm"
                title="Fetch the latest Bank of Canada daily average through the SHOWTIME gateway"
                onClick={async () => {
                  const res = await api<FxObservation>('/api/fx', { from: r.from, to: r.to }, 'bank_of_canada');
                  if (!res.ok) return setFxErr(res.error.message);
                  setFxErr(null);
                  update(ev.id, (x) => ({ ...x, fxRates: x.fxRates.map((y, j) => (j === i ? { ...y, rate: res.data.rate, source: res.data.source, asOf: new Date(`${res.data.date}T00:00:00Z`).toISOString() } : y)) }), `fx ${r.from}→${r.to} from Bank of Canada`);
                }}
              >
                Fetch Bank of Canada rate
              </button>
            )}
            <button className="btn ghost sm" onClick={() => update(ev.id, (x) => ({ ...x, fxRates: x.fxRates.filter((_, j) => j !== i) }), 'remove fx')}>Remove</button>
          </div>
        ))}
      </Panel>
      <Panel title="Scenarios">
        <form className="row gap" onSubmit={(e) => { e.preventDefault(); if (!scName.trim()) return; update(ev.id, (x) => ({ ...x, scenarios: [...x.scenarios, snapshotScenario(scName.trim(), d.financeInputs, uid('scn'), nowIso())] }), `save scenario "${scName.trim()}"`); setScName(''); }}>
          <input aria-label="Scenario name" placeholder="Name this scenario…" value={scName} onChange={(e) => setScName(e.target.value)} />
          <button className="btn sm" type="submit">Save immutable snapshot</button>
        </form>
        {ev.scenarios.length === 0 ? <p className="muted small">No saved scenarios.</p> : (
          <table className="table">
            <thead><tr><th>Scenario</th><th>Saved</th><th>Input hash</th><th>Reproduces?</th><th /></tr></thead>
            <tbody>{ev.scenarios.map((s) => {
              const rep = reproduce(s);
              return (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="small">{new Date(s.createdAt).toLocaleString()} · {s.calcVersion}</td>
                  <td><code>{s.inputHash}</code></td>
                  <td>{rep.matches && rep.hashMatches ? <Tag tone="good">✔ identical result</Tag> : <Tag tone="bad">⚠ differs (calculator changed)</Tag>}</td>
                  <td className="row gap"><button className="btn ghost sm" onClick={() => setCmp(cmp === s.id ? null : s.id)}>{cmp === s.id ? 'Hide' : 'Compare to now'}</button><Confirm label="Delete scenario?" onConfirm={() => update(ev.id, (x) => ({ ...x, scenarios: x.scenarios.filter((y) => y.id !== s.id) }), 'delete scenario')}>Delete</Confirm></td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
        {compareTo && (
          <table className="table compact">
            <thead><tr><th>Metric</th><th>{compareTo.name}</th><th>Now</th><th>Δ</th></tr></thead>
            <tbody>{compareScenarios(reproduce(compareTo).result, computeFinance(d.financeInputs)).map((r) => {
              const money = !/attendance|tickets/i.test(r.metric);
              const f = (v: number | null) => (v == null ? '—' : money ? fmt(v, c) : String(v));
              return <tr key={r.metric}><td>{r.metric}</td><td className="num">{f(r.left)}</td><td className="num">{f(r.right)}</td><td className="num">{r.delta == null ? '—' : f(r.delta)}</td></tr>;
            })}</tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

export function Finance() {
  return <NeedEvent>{(ev) => <FinanceInner ev={ev} />}</NeedEvent>;
}
