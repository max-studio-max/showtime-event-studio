import { useState } from 'react';
import { genericProducts } from '../data/catalog';
import { allProducts, deriveEvent } from '../domain/derive';
import { nowIso, objectFromProduct, uid } from '../domain/factory';
import type { DimsSource, Ownership, PriceOffer, Product, SceneObjectKind, ShowEvent } from '../domain/types';
import { convert, findRate } from '../engine/money';
import { isHttpUrl, offerView } from '../engine/provenance';
import { useActiveEvent, useStore } from '../state/store';
import { Confirm, Empty, ExternalLink, Field, LengthInput, MoneyInput, NumInput, Panel, StatusBadge, Tag, useFmtMoney, useWorkspaceData } from '../ui/kit';

const KINDS: SceneObjectKind[] = ['stage_deck', 'riser', 'mic_stand', 'di_box', 'speaker', 'sub', 'wedge', 'mixer', 'light_fixture', 'truss', 'screen', 'projector', 'podium', 'bar', 'merch', 'checkin', 'table_round', 'barrier', 'generic'];

function ProductForm({ onDone }: { onDone: () => void }) {
  const upsert = useStore((s) => s.upsertProduct);
  const [p, setP] = useState<Product>({ id: uid('prod'), name: '', manufacturer: '', model: '', category: 'speaker', isGenericProxy: false, specUrl: '', sizeM: null, dimsSource: 'visual_only', weightKg: null, powerW: null, peakPowerW: null, createdBy: 'user' });
  const [hasDims, setHasDims] = useState(false);
  const [err, setErr] = useState<string[]>([]);
  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        const errs: string[] = [];
        if (!p.name.trim()) errs.push('Product name is required');
        if (p.dimsSource === 'manufacturer_spec' && !isHttpUrl(p.specUrl ?? '')) errs.push('Manufacturer-spec dimensions need the official spec URL');
        if (p.specUrl && !isHttpUrl(p.specUrl)) errs.push('Spec URL must be a link');
        setErr(errs);
        if (errs.length) return;
        upsert({ ...p, sizeM: hasDims ? p.sizeM : null, dimsSource: hasDims ? p.dimsSource : 'visual_only', specUrl: p.specUrl || null });
        onDone();
      }}
    >
      <Field label="Product name"><input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
      <Field label="Manufacturer"><input value={p.manufacturer ?? ''} onChange={(e) => setP({ ...p, manufacturer: e.target.value })} /></Field>
      <Field label="Model / SKU"><input value={p.model ?? ''} onChange={(e) => setP({ ...p, model: e.target.value })} /></Field>
      <Field label="Category"><select value={p.category} onChange={(e) => setP({ ...p, category: e.target.value as SceneObjectKind })}>{KINDS.map((k) => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}</select></Field>
      <Field label="Official spec sheet URL"><input value={p.specUrl ?? ''} onChange={(e) => setP({ ...p, specUrl: e.target.value })} placeholder="https://manufacturer…" /></Field>
      <label className="check"><input type="checkbox" checked={hasDims} onChange={(e) => { setHasDims(e.target.checked); if (e.target.checked && !p.sizeM) setP({ ...p, sizeM: [0.5, 0.5, 0.5], dimsSource: 'manufacturer_spec' }); }} /> I have documented dimensions</label>
      {hasDims && p.sizeM && (
        <>
          {(['Width', 'Height', 'Depth'] as const).map((l, i) => (
            <Field key={l} label={l}><LengthInput meters={p.sizeM![i]} onChange={(m) => { const s = [...p.sizeM!] as Product['sizeM'] & number[]; s[i] = m; setP({ ...p, sizeM: s as Product['sizeM'] }); }} /></Field>
          ))}
          <Field label="Dimension source"><select value={p.dimsSource} onChange={(e) => setP({ ...p, dimsSource: e.target.value as DimsSource })}><option value="manufacturer_spec">Manufacturer spec sheet</option><option value="user_measured">Measured by me</option></select></Field>
        </>
      )}
      {!hasDims && <p className="small warn-text">Without dimensions this item is “visual only” and cannot satisfy clearance checks.</p>}
      <Field label="Weight (kg)"><NumInput value={p.weightKg} allowNull min={0} onChange={(v) => setP({ ...p, weightKg: v })} /></Field>
      <Field label="Power nominal (W)"><NumInput value={p.powerW} allowNull min={0} onChange={(v) => setP({ ...p, powerW: v })} /></Field>
      <Field label="Power peak (W)"><NumInput value={p.peakPowerW} allowNull min={0} onChange={(v) => setP({ ...p, peakPowerW: v })} /></Field>
      {p.category === 'mixer' && <Field label="Inputs"><NumInput value={p.inputs ?? null} allowNull min={1} onChange={(v) => setP({ ...p, inputs: v ?? undefined })} /></Field>}
      {err.length > 0 && <ul className="error" role="alert">{err.map((x) => <li key={x}>{x}</li>)}</ul>}
      <div className="form-actions"><button className="btn primary" type="submit">Save product</button><button type="button" className="btn ghost" onClick={onDone}>Cancel</button></div>
    </form>
  );
}

function OfferForm({ productId, onDone }: { productId: string; onDone: () => void }) {
  const upsert = useStore((s) => s.upsertOffer);
  const [o, setO] = useState<PriceOffer>({ id: uid('off'), productId, vendor: '', vendorRegion: '', kind: 'rent', amountMinor: null, currency: 'CAD', basis: 'per day', exclusions: '', url: '', retrievedAt: nowIso().slice(0, 10), lastChecked: nowIso(), status: 'verified_supplier', privateQuote: false });
  const [err, setErr] = useState<string[]>([]);
  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        const errs: string[] = [];
        if (!o.vendor.trim()) errs.push('Vendor is required');
        if (!o.privateQuote && !isHttpUrl(o.url ?? '')) errs.push('A public offer needs the supplier listing URL');
        setErr(errs);
        if (errs.length) return;
        const retrieved = new Date(o.retrievedAt).toISOString();
        upsert({ ...o, retrievedAt: retrieved, lastChecked: retrieved, status: o.privateQuote ? 'user_confirmed_private' : o.amountMinor == null ? 'unavailable' : 'verified_supplier', url: o.url || null });
        onDone();
      }}
    >
      <Field label="Vendor"><input value={o.vendor} onChange={(e) => setO({ ...o, vendor: e.target.value })} /></Field>
      <Field label="Vendor region / service area"><input value={o.vendorRegion} onChange={(e) => setO({ ...o, vendorRegion: e.target.value })} /></Field>
      <Field label="Offer"><select value={o.kind} onChange={(e) => setO({ ...o, kind: e.target.value as PriceOffer['kind'], basis: e.target.value === 'buy' ? 'per item' : 'per day' })}><option value="rent">Rent</option><option value="buy">Buy</option></select></Field>
      <Field label="Price as listed" hint="Leave blank if the supplier shows no price — it becomes “Request quote”, never $0."><MoneyInput value={o.amountMinor} currency={o.currency} onChange={(v) => setO({ ...o, amountMinor: v })} /></Field>
      <Field label="Currency"><select value={o.currency} onChange={(e) => setO({ ...o, currency: e.target.value })}>{['CAD', 'USD', 'EUR', 'GBP'].map((c) => <option key={c}>{c}</option>)}</select></Field>
      <Field label="Price basis"><select value={o.basis} onChange={(e) => setO({ ...o, basis: e.target.value as PriceOffer['basis'] })}>{['per item', 'per day', 'per weekend', 'per week', 'package'].map((b) => <option key={b}>{b}</option>)}</select></Field>
      {o.kind === 'rent' && <Field label="Minimum rental days"><NumInput value={o.minRentalDays ?? null} allowNull min={1} onChange={(v) => setO({ ...o, minRentalDays: v ?? undefined })} /></Field>}
      <Field label="Exclusions (tax, delivery, setup, deposit)"><input value={o.exclusions} onChange={(e) => setO({ ...o, exclusions: e.target.value })} /></Field>
      <Field label="Supplier listing URL"><input value={o.url ?? ''} onChange={(e) => setO({ ...o, url: e.target.value })} placeholder="https://…" /></Field>
      <Field label="Date you read this listing"><input type="date" value={o.retrievedAt.slice(0, 10)} onChange={(e) => setO({ ...o, retrievedAt: e.target.value })} /></Field>
      <Field label="Valid until (if stated)"><input type="date" value={o.validUntil?.slice(0, 10) ?? ''} onChange={(e) => setO({ ...o, validUntil: e.target.value ? new Date(e.target.value).toISOString() : undefined })} /></Field>
      {o.amountMinor == null && <Field label="Why no price?"><input value={o.priceUnavailableReason ?? ''} onChange={(e) => setO({ ...o, priceUnavailableReason: e.target.value })} placeholder="e.g. Quote on request" /></Field>}
      <label className="check"><input type="checkbox" checked={o.privateQuote} onChange={(e) => setO({ ...o, privateQuote: e.target.checked })} /> This is a private quote I received (not a public listing)</label>
      {err.length > 0 && <ul className="error" role="alert">{err.map((x) => <li key={x}>{x}</li>)}</ul>}
      <div className="form-actions"><button className="btn primary" type="submit">Save offer</button><button type="button" className="btn ghost" onClick={onDone}>Cancel</button></div>
    </form>
  );
}

function ProductCard({ p, ev }: { p: Product; ev: ShowEvent | null }) {
  const offers = useStore((s) => s.offers.filter((o) => o.productId === p.id));
  const upsertOffer = useStore((s) => s.upsertOffer);
  const removeOffer = useStore((s) => s.removeOffer);
  const removeProduct = useStore((s) => s.removeProduct);
  const update = useStore((s) => s.updateEvent);
  const setToast = useStore((s) => s.setToast);
  const fmt = useFmtMoney();
  const [addOffer, setAddOffer] = useState(false);
  const now = new Date();
  const norm = (o: PriceOffer) => {
    if (!ev || o.amountMinor == null) return null;
    const r = findRate(ev.fxRates, o.currency, ev.currency);
    return r ? { v: convert(o.amountMinor, r), r } : null;
  };
  const buy = offers.find((o) => o.kind === 'buy' && o.amountMinor != null && offerView(o, now).displayable);
  const rentDay = offers.find((o) => o.kind === 'rent' && o.basis === 'per day' && o.amountMinor != null && offerView(o, now).displayable);
  return (
    <div className="card wide product-card">
      <div className="row between">
        <div>
          <strong>{p.name}</strong>
          <div className="muted small">{p.isGenericProxy ? 'Generic proxy — SHOWTIME working dimensions, not a real product' : [p.manufacturer, p.model].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="row gap">
          {p.isGenericProxy ? <Tag>generic</Tag> : <Tag tone={p.sizeM ? 'good' : 'bad'}>{p.sizeM ? p.dimsSource.replace('_', ' ') : 'visual only'}</Tag>}
          {p.specUrl && <ExternalLink href={p.specUrl}>Spec sheet</ExternalLink>}
        </div>
      </div>
      <div className="small">{p.sizeM ? `${p.sizeM.map((v) => v.toFixed(3)).join(' × ')} m (W×H×D)` : 'Dimensions unknown'} · power {p.powerW != null ? `${p.powerW} W` : 'unknown'}{p.weightKg != null && ` · ${p.weightKg} kg`}</div>
      {offers.length > 0 ? (
        <table className="table compact">
          <thead><tr><th>Vendor</th><th>Offer</th><th>Price</th><th>Status</th><th>Read</th><th /></tr></thead>
          <tbody>
            {offers.map((o) => {
              const v = offerView(o, now);
              const n = norm(o);
              return (
                <tr key={o.id}>
                  <td>{o.url ? <ExternalLink href={o.url}>{o.vendor}</ExternalLink> : o.vendor}<div className="muted small">{o.vendorRegion}</div></td>
                  <td>{o.kind} · {o.basis}{o.minRentalDays ? ` · min ${o.minRentalDays} d` : ''}{o.exclusions && <div className="muted small">Excl.: {o.exclusions}</div>}</td>
                  <td>{v.displayable ? <>{fmt(o.amountMinor, o.currency)}{n && ev && n.r.source !== 'identity' && <div className="muted small">≈ {fmt(n.v, ev.currency)} for comparison ({n.r.source}, {n.r.asOf.slice(0, 10)})</div>}</> : <span className="missing">{v.label}</span>}</td>
                  <td><StatusBadge status={v.status} /></td>
                  <td className="small">{o.lastChecked.slice(0, 10)}{o.validUntil && <div className="muted">valid to {o.validUntil.slice(0, 10)}</div>}</td>
                  <td className="row gap">
                    <button className="btn ghost sm" title="Attest that you re-read the listing today and the price is unchanged" onClick={() => upsertOffer({ ...o, lastChecked: nowIso() })}>Re-checked today</button>
                    <button className="btn ghost sm" onClick={() => removeOffer(o.id)}>Remove</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="missing small">No supplier offers recorded — Request quote</p>
      )}
      {buy && rentDay && buy.currency === rentDay.currency && <p className="small">Rent vs buy: buying ({fmt(buy.amountMinor, buy.currency)}) breaks even after ≈ {Math.ceil(buy.amountMinor! / rentDay.amountMinor!)} rental days, before delivery, storage, maintenance and resale (unknown).</p>}
      {addOffer ? <OfferForm productId={p.id} onDone={() => setAddOffer(false)} /> : null}
      <div className="row gap wrap">
        <button className="btn ghost sm" onClick={() => setAddOffer(true)}>+ Offer / quote</button>
        {ev && (
          <>
            <button
              className="btn sm"
              onClick={() => {
                update(ev.id, (e) => ({ ...e, procurement: [...e.procurement, { id: uid('bom'), productId: p.id, offerId: offers[0]?.id ?? null, quantity: 1, ownership: 'rent', rentalDays: 1 }] }), `BOM: add ${p.name}`);
                setToast(`${p.name} added to the equipment list${offers.length ? '' : ' (no offer — request quote)'}`);
              }}
            >
              Add to BOM
            </button>
            <button className="btn ghost sm" onClick={() => { update(ev.id, (e) => ({ ...e, scene: { ...e.scene, objects: [...e.scene.objects, objectFromProduct(p, [0, 0, 0])], version: e.scene.version + 1 } }), `place ${p.name}`); setToast(`${p.name} placed at room centre — position it in the Studio`); }}>Place in scene</button>
          </>
        )}
        {!p.isGenericProxy && <Confirm label="Delete product and its offers?" danger onConfirm={() => removeProduct(p.id)}>Delete</Confirm>}
      </div>
    </div>
  );
}

function Bom({ ev }: { ev: ShowEvent }) {
  const ws = useWorkspaceData();
  const update = useStore((s) => s.updateEvent);
  const setToast = useStore((s) => s.setToast);
  const fmt = useFmtMoney();
  const products = allProducts(ws);
  const d = deriveEvent(ev, ws);
  if (!ev.procurement.length) return <Empty title="Equipment list is empty">Add products from the catalog below.</Empty>;
  const patch = (id: string, p: Partial<ShowEvent['procurement'][number]>, what: string) => update(ev.id, (e) => ({ ...e, procurement: e.procurement.map((x) => (x.id === id ? { ...x, ...p } : x)) }), what, { coalesceKey: `${id}-${what}` });
  const replace = (lineId: string, oldId: string, newId: string) => {
    const np = products.find((x) => x.id === newId)!;
    const before = deriveEvent(ev, ws);
    const next: ShowEvent = {
      ...ev,
      procurement: ev.procurement.map((x) => (x.id === lineId ? { ...x, productId: newId, offerId: ws.offers.find((o) => o.productId === newId)?.id ?? null } : x)),
      scene: { ...ev.scene, version: ev.scene.version + 1, objects: ev.scene.objects.map((o) => (o.productId === oldId ? { ...objectFromProduct(np, o.position), id: o.id, rotationY: o.rotationY, channel: o.channel, ownership: o.ownership } : o)) },
    };
    const after = deriveEvent(next, ws);
    update(ev.id, () => next, `replace ${products.find((x) => x.id === oldId)?.name} with ${np.name}`);
    setToast(`Replaced. Scene issues ${before.analysis.issues.length} → ${after.analysis.issues.length}; usable seats ${before.analysis.seating.usable.length} → ${after.analysis.seating.usable.length}; known power ${before.analysis.power.nominalW} → ${after.analysis.power.nominalW} W.`);
  };
  return (
    <table className="table">
      <thead><tr><th>Item</th><th>Qty</th><th>Sourcing</th><th>Offer</th><th>Days</th><th>Line cost</th><th /></tr></thead>
      <tbody>
        {ev.procurement.map((l) => {
          const p = products.find((x) => x.id === l.productId);
          const cl = d.costLines.find((c) => c.id === `d-proc-${l.id}`);
          const offers = ws.offers.filter((o) => o.productId === l.productId);
          const placed = ev.scene.objects.filter((o) => o.productId === l.productId).length;
          return (
            <tr key={l.id}>
              <td>
                <select aria-label="Product" value={l.productId} onChange={(e) => replace(l.id, l.productId, e.target.value)}>{products.filter((x) => x.category === p?.category).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                <div className="muted small">{placed} placed in scene</div>
              </td>
              <td><NumInput ariaLabel="Quantity" value={l.quantity} min={1} width={60} onChange={(v) => patch(l.id, { quantity: v ?? 1 }, 'qty')} /></td>
              <td><select aria-label="Ownership" value={l.ownership} onChange={(e) => patch(l.id, { ownership: e.target.value as Ownership }, 'ownership')}><option value="venue_supplied">Venue supplied (no cost)</option><option value="organizer_owned">Owned (no cost)</option><option value="rent">Rent</option><option value="buy">Buy</option></select></td>
              <td><select aria-label="Offer" value={l.offerId ?? ''} onChange={(e) => patch(l.id, { offerId: e.target.value || null }, 'offer')}><option value="">— none (request quote) —</option>{offers.map((o) => <option key={o.id} value={o.id}>{o.vendor} · {o.kind} {o.basis}</option>)}</select></td>
              <td><NumInput ariaLabel="Rental days" value={l.rentalDays} min={1} width={60} onChange={(v) => patch(l.id, { rentalDays: v ?? 1 }, 'days')} /></td>
              <td>{cl ? (cl.amountMinor == null ? <span className="missing">{cl.sourceNote}</span> : fmt(cl.amountMinor * cl.quantity, cl.currency)) : <span className="muted">no cost</span>}</td>
              <td><button className="btn ghost sm" onClick={() => update(ev.id, (e) => ({ ...e, procurement: e.procurement.filter((x) => x.id !== l.id) }), `BOM: remove ${p?.name}`)}>Remove</button></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Catalog() {
  const ws = useWorkspaceData();
  const ev = useActiveEvent();
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [onlyReal, setOnlyReal] = useState(false);
  const list = allProducts(ws).filter((p) => (!cat || p.category === cat) && (!onlyReal || !p.isGenericProxy) && `${p.name} ${p.manufacturer ?? ''} ${p.model ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <h1>Catalog</h1>
      <p className="lede">A procurement research layer, not a store. The {genericProducts.length} built-in items are <b>generic proxies</b> for layout only. Real products and supplier prices are added by your team with their official spec sheet and listing link; a missing price is “Request quote”, and a listing older than 30 days is treated as stale.</p>
      {ev && <Panel title={`Equipment list (BOM) — ${ev.title}`}><Bom ev={ev} /></Panel>}
      <Panel title="Products" actions={<button className="btn sm" onClick={() => setAdding(true)}>+ Add real product</button>}>
        {adding && <ProductForm onDone={() => setAdding(false)} />}
        <div className="row gap wrap filters">
          <input aria-label="Search products" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{KINDS.map((k) => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}</select>
          <label className="check"><input type="checkbox" checked={onlyReal} onChange={(e) => setOnlyReal(e.target.checked)} /> Real products only</label>
        </div>
        <div className="stack">{list.map((p) => <ProductCard key={p.id} p={p} ev={ev} />)}</div>
        {!list.length && <Empty title="Nothing matches" />}
      </Panel>
    </div>
  );
}
