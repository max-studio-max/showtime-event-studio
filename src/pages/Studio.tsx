import { useMemo, useRef, useState } from 'react';
import { FIT_KINDS, STAGECRAFT_KINDS } from '../data/catalog';
import { allProducts, deriveEvent, type Derived } from '../domain/derive';
import { makeObject, nowIso, objectFromProduct, presetObjects, seatBlock, STAGE_PRESETS, uid, type StagePreset } from '../domain/factory';
import type { DimsSource, Scene, SceneLayer, SceneObject, ShowEvent } from '../domain/types';
import { footprintDistance, footprintOf, restingElevation, seatBlockSize } from '../engine/geometry';
import { inputList, patchIssues } from '../engine/sceneAnalysis';
import { formatArea } from '../engine/units';
import { useStore } from '../state/store';
import { CameraMode, Viewport } from '../studio/Viewport';
import { FidelityBadge } from './Venues';
import { Empty, Field, Len, LengthInput, NeedEvent, NumInput, Panel, Tag, useFmtMoney, useWorkspaceData } from '../ui/kit';

const LAYERS: SceneLayer[] = ['structure', 'stage', 'audio', 'lighting', 'video', 'seating', 'service', 'zone', 'decor'];
const snap = (v: number, g = 0.25) => Math.round(v / g) * g;

function Delta({ label, a, b, fmt = (v: number) => String(v) }: { label: string; a: number | null; b: number | null; fmt?: (v: number) => string }) {
  const d = a != null && b != null ? b - a : null;
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{b == null ? '—' : fmt(b)}</td>
      <td className={`num ${d == null || d === 0 ? '' : d > 0 ? 'up' : 'down'}`}>{d == null ? '—' : d === 0 ? '±0' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`}</td>
    </tr>
  );
}

function Inspector({ ev, obj, update, derived }: { ev: ShowEvent; obj: SceneObject; update: (fn: (s: Scene) => Scene, what: string, key?: string) => void; derived: Derived }) {
  const patch = (p: Partial<SceneObject>, what: string) => update((s) => ({ ...s, objects: s.objects.map((o) => (o.id === obj.id ? { ...o, ...p } : o)) }), `${obj.label}: ${what}`, `${obj.id}-${what}`);
  const lost = derived.analysis.seating.lost.filter((l) => l.seat.blockId === obj.id).length;
  const issues = derived.analysis.issues.filter((i) => i.objectIds.includes(obj.id));
  const verified = obj.dimsSource === 'verified';
  return (
    <div className="inspector">
      <Field label="Label"><input value={obj.label} onChange={(e) => patch({ label: e.target.value }, 'label')} /></Field>
      <div className="row gap wrap small">
        <Tag>{obj.kind.replace('_', ' ')}</Tag>
        <Tag tone={obj.dimsSource === 'visual_only' ? 'bad' : verified ? 'good' : 'neutral'}>dims: {obj.dimsSource.replace('_', ' ')}</Tag>
        {obj.locked && <Tag tone="warn">locked</Tag>}
      </div>
      <div className="grid-3">
        <Field label="X"><LengthInput meters={obj.position[0]} onChange={(m) => patch({ position: [m, obj.position[1], obj.position[2]] }, 'x')} /></Field>
        <Field label="Z"><LengthInput meters={obj.position[2]} onChange={(m) => patch({ position: [obj.position[0], obj.position[1], m] }, 'z')} /></Field>
        <Field label="Elevation"><LengthInput meters={obj.position[1]} onChange={(m) => patch({ position: [obj.position[0], m, obj.position[2]] }, 'elevation')} /></Field>
      </div>
      <Field label="Rotation (°)"><NumInput value={Math.round(((obj.rotationY * 180) / Math.PI) * 100) / 100} step={15} onChange={(v) => patch({ rotationY: ((v ?? 0) * Math.PI) / 180 }, 'rotation')} /></Field>
      {obj.seat ? (
        <>
          <div className="grid-2">
            <Field label="Rows"><NumInput value={obj.seat.rows} min={1} max={80} onChange={(v) => { const seat = { ...obj.seat!, rows: v ?? 1 }; patch({ seat, size: seatBlockSize(seat) }, 'rows'); }} /></Field>
            <Field label="Seats per row"><NumInput value={obj.seat.cols} min={1} max={80} onChange={(v) => { const seat = { ...obj.seat!, cols: v ?? 1 }; patch({ seat, size: seatBlockSize(seat) }, 'cols'); }} /></Field>
            <Field label="Seat pitch"><LengthInput meters={obj.seat.seatPitchM} onChange={(m) => { const seat = { ...obj.seat!, seatPitchM: Math.max(0.45, m) }; patch({ seat, size: seatBlockSize(seat) }, 'seat pitch'); }} /></Field>
            <Field label="Row pitch"><LengthInput meters={obj.seat.rowPitchM} onChange={(m) => { const seat = { ...obj.seat!, rowPitchM: Math.max(0.6, m) }; patch({ seat, size: seatBlockSize(seat) }, 'row pitch'); }} /></Field>
          </div>
          <p className="small">{obj.seat.rows * obj.seat.cols} nominal · <b>{obj.seat.rows * obj.seat.cols - lost}</b> usable · {lost} lost to clearances</p>
        </>
      ) : (
        <div className="grid-3">
          {(['Width', 'Height', 'Depth'] as const).map((l, i) => (
            <Field key={l} label={l}>
              <LengthInput meters={obj.size[i]} onChange={(m) => {
                const size = [...obj.size] as SceneObject['size'];
                size[i] = Math.max(0.01, m);
                let position = obj.position;
                // Decks keep their upstage (back) edge fixed and grow towards the audience.
                if (i === 2 && (obj.kind === 'stage_deck' || obj.kind === 'riser')) {
                  const dz = (size[2] - obj.size[2]) / 2;
                  position = [obj.position[0] + dz * Math.sin(obj.rotationY), obj.position[1], obj.position[2] + dz * Math.cos(obj.rotationY)];
                }
                patch({ size, position, dimsSource: verified ? 'user_proposed' : obj.dimsSource }, l.toLowerCase());
              }} />
            </Field>
          ))}
        </div>
      )}
      {verified && <p className="small muted">Width/depth come from the venue source. Editing them turns this into a user-proposed overlay that requires venue confirmation.</p>}
      <Field label="Dimension source">
        <select value={obj.dimsSource} disabled={verified} onChange={(e) => patch({ dimsSource: e.target.value as DimsSource }, 'dimension source')}>
          {verified && <option value="verified">verified (venue source)</option>}
          <option value="manufacturer_spec">manufacturer spec</option>
          <option value="user_measured">measured by me</option>
          <option value="user_proposed">proposed</option>
          <option value="generic_proxy">generic proxy</option>
          <option value="visual_only">visual only (unknown)</option>
        </select>
      </Field>
      {['speaker', 'sub', 'wedge', 'mixer', 'light_fixture', 'projector', 'screen'].includes(obj.kind) && (
        <div className="grid-2">
          <Field label="Power nominal (W)" hint="From the spec sheet; blank = unknown"><NumInput value={obj.powerW ?? null} allowNull min={0} onChange={(v) => patch({ powerW: v }, 'power')} /></Field>
          <Field label="Power peak (W)"><NumInput value={obj.peakPowerW ?? null} allowNull min={0} onChange={(v) => patch({ peakPowerW: v }, 'peak power')} /></Field>
        </div>
      )}
      {obj.kind === 'mixer' && <Field label="Console inputs"><NumInput value={obj.inputs ?? null} allowNull min={1} onChange={(v) => patch({ inputs: v ?? undefined }, 'inputs')} /></Field>}
      {(obj.kind === 'mic_stand' || obj.kind === 'di_box') && (
        <div className="grid-2">
          <Field label="Console channel"><NumInput value={obj.channel ?? null} allowNull min={1} onChange={(v) => patch({ channel: v }, 'channel')} /></Field>
          <Field label="Connector"><select value={obj.connector ?? 'XLR'} onChange={(e) => patch({ connector: e.target.value }, 'connector')}>{['XLR', 'TRS', 'TS', 'RCA', 'Wireless'].map((c) => <option key={c}>{c}</option>)}</select></Field>
        </div>
      )}
      {obj.layer !== 'seating' && obj.layer !== 'zone' && obj.layer !== 'structure' && (
        <Field label="Sourcing" hint="Venue-supplied and owned items carry no cost, so nothing is double counted.">
          <select value={obj.ownership ?? 'rent'} onChange={(e) => patch({ ownership: e.target.value as SceneObject['ownership'] }, 'ownership')}>
            <option value="venue_supplied">Venue supplied</option>
            <option value="organizer_owned">Organizer owned</option>
            <option value="rent">Rent</option>
            <option value="buy">Buy</option>
          </select>
        </Field>
      )}
      {obj.kind === 'zone' && <Field label="Zone type"><select value={obj.zoneType ?? 'general'} onChange={(e) => patch({ zoneType: e.target.value, label: obj.label }, 'zone type')}>{['general', 'queue', 'registration', 'restrooms', 'catering', 'merch', 'bar', 'VIP', 'production', 'storage', 'emergency path', 'backstage', 'accessible seating', 'standing'].map((z) => <option key={z}>{z}</option>)}</select></Field>}
      <div className="row gap wrap">
        <label className="check"><input type="checkbox" checked={!!obj.locked} onChange={(e) => patch({ locked: e.target.checked }, 'lock')} /> Lock</label>
        <label className="check"><input type="checkbox" checked={!!obj.hidden} onChange={(e) => patch({ hidden: e.target.checked }, 'visibility')} /> Hide</label>
      </div>
      <div className="row gap wrap">
        <button className="btn ghost sm" onClick={() => update((s) => ({ ...s, objects: [...s.objects, { ...JSON.parse(JSON.stringify(obj)), id: uid('obj'), label: `${obj.label} copy`, position: [obj.position[0] + 0.5, obj.position[1], obj.position[2] + 0.5] }] }), `duplicate ${obj.label}`)}>Duplicate</button>
        <button className="btn ghost sm" onClick={() => update((s) => ({ ...s, objects: [...s.objects, { ...JSON.parse(JSON.stringify(obj)), id: uid('obj'), label: `${obj.label} (mirror)`, position: [-obj.position[0], obj.position[1], obj.position[2]], rotationY: -obj.rotationY }] }), `mirror ${obj.label}`)}>Mirror copy</button>
        <button className="btn ghost sm" onClick={() => patch({ position: [0, obj.position[1], obj.position[2]] }, 'centre on axis')}>Centre X</button>
        <button className="btn danger ghost sm" disabled={obj.locked} onClick={() => update((s) => ({ ...s, objects: s.objects.filter((o) => o.id !== obj.id) }), `delete ${obj.label}`)}>Delete</button>
      </div>
      {issues.length > 0 && <ul className="issues small">{issues.map((i) => <li key={i.id} className={`lvl-${i.level}`}>{i.message}</li>)}</ul>}
      {ev.venueId && obj.kind === 'stage_deck' && !verified && <p className="small warn-text">Requires venue confirmation: stage geometry is user-proposed.</p>}
    </div>
  );
}

function Palette({ mode, add }: { mode: 'fit' | 'stagecraft'; add: (o: SceneObject[], what: string) => void }) {
  const ws = useWorkspaceData();
  const kinds = mode === 'fit' ? FIT_KINDS : STAGECRAFT_KINDS;
  const products = allProducts(ws).filter((p) => kinds.includes(p.category));
  const [q, setQ] = useState('');
  const list = products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="palette-list">
      <input aria-label="Filter items" placeholder="Filter items…" value={q} onChange={(e) => setQ(e.target.value)} />
      {mode === 'fit' && (
        <button className="pal-item" onClick={() => add([seatBlock('Seat block', 6, 10, [0, 0, 4])], 'add seat block')}>
          <b>Seat block</b><small>rows × seats, solver removes seats in clearances</small>
        </button>
      )}
      {list.map((p) => (
        <button key={p.id} className="pal-item" onClick={() => add([objectFromProduct(p, [0, 0, 2])], `add ${p.name}`)} title={p.isGenericProxy ? 'Generic proxy: SHOWTIME working dimensions, not a manufacturer spec' : p.manufacturer ?? ''}>
          <b>{p.name}</b>
          <small>{p.sizeM ? `${p.sizeM.map((v) => v.toFixed(2)).join(' × ')} m` : 'dimensions unknown — visual only'} · {p.isGenericProxy ? 'generic proxy' : p.dimsSource.replace('_', ' ')}</small>
        </button>
      ))}
    </div>
  );
}

function StudioInner({ ev }: { ev: ShowEvent }) {
  const updateEvent = useStore((s) => s.updateEvent);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => (s.past[ev.id]?.length ?? 0) > 0);
  const canRedo = useStore((s) => (s.future[ev.id]?.length ?? 0) > 0);
  const user = useStore((s) => s.user.name);
  const units = useStore((s) => s.settings.units);
  const ws = useWorkspaceData();
  const fmt = useFmtMoney();
  const [mode, setMode] = useState<'fit' | 'stagecraft'>('fit');
  const [cam, setCam] = useState<CameraMode>('perspective');
  const [selected, setSelected] = useState<string[]>([]);
  const [hidden, setHidden] = useState<Set<SceneLayer>>(new Set());
  const [labels, setLabels] = useState(true);
  const [tmode, setTmode] = useState<'translate' | 'rotate'>('translate');
  const [walkSpeed, setWalkSpeed] = useState(2.5);
  const [eye, setEye] = useState(1.6);
  const [snapName, setSnapName] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseline = useRef<ShowEvent>(ev);
  const [baselineLabel, setBaselineLabel] = useState('when you opened the studio');

  const derived = useMemo(() => deriveEvent(ev, ws), [ev, ws]);
  const base = useMemo(() => deriveEvent(baseline.current, ws), [ws, baselineLabel]); // eslint-disable-line react-hooks/exhaustive-deps
  const scene = ev.scene;

  const updateScene = (fn: (s: Scene) => Scene, what: string, key?: string) =>
    updateEvent(ev.id, (e) => {
      const next = fn(e.scene);
      return { ...e, scene: { ...next, version: e.scene.version + 1 } };
    }, what, key ? { coalesceKey: key } : undefined);

  const add = (objs: SceneObject[], what: string) => {
    updateScene((s) => {
      const placed = objs.map((o) => ({ ...o, position: [o.position[0], restingElevation({ ...s, objects: [...s.objects, o] }, o), o.position[2]] as SceneObject['position'] }));
      return { ...s, objects: [...s.objects, ...placed] };
    }, what);
    setSelected([objs[0].id]);
  };

  const onMove = (id: string, x: number, z: number) =>
    updateScene((s) => ({
      ...s,
      objects: s.objects.map((o) => {
        if (o.id !== id) return o;
        const moved = { ...o, position: [snap(x), o.position[1], snap(z)] as SceneObject['position'] };
        return { ...moved, position: [moved.position[0], restingElevation(s, moved), moved.position[2]] as SceneObject['position'] };
      }),
    }), 'move object');

  const onRotate = (id: string, r: number) => updateScene((s) => ({ ...s, objects: s.objects.map((o) => (o.id === id ? { ...o, rotationY: r } : o)) }), 'rotate object');
  const onSelect = (id: string | null, additive: boolean) => setSelected((cur) => (id == null ? [] : additive ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]));

  const sel = scene.objects.filter((o) => selected.includes(o.id));
  const blockedSet = useMemo(() => new Set(derived.analysis.sightlines.blocked.map((b) => `${b.seat.blockId}:${b.seat.row}:${b.seat.col}`)), [derived]);
  const stage = scene.objects.find((o) => o.kind === 'stage_deck');
  const patchList = patchIssues(scene.objects);
  const inputs = inputList(scene.objects);

  const distribute = () => {
    const sorted = [...sel].sort((a, b) => a.position[0] - b.position[0]);
    const x0 = sorted[0].position[0];
    const x1 = sorted[sorted.length - 1].position[0];
    const step = (x1 - x0) / (sorted.length - 1);
    const pos = new Map(sorted.map((o, i) => [o.id, x0 + i * step]));
    updateScene((s) => ({ ...s, objects: s.objects.map((o) => (pos.has(o.id) ? { ...o, position: [pos.get(o.id)!, o.position[1], o.position[2]] } : o)) }), `distribute ${sorted.length} objects`);
  };
  const alignZ = () => {
    const z = sel[0].position[2];
    updateScene((s) => ({ ...s, objects: s.objects.map((o) => (selected.includes(o.id) ? { ...o, position: [o.position[0], o.position[1], z] } : o)) }), `align ${sel.length} objects`);
  };

  return (
    <div className="studio">
      <div className="studio-toolbar" role="toolbar" aria-label="Studio tools">
        <div className="seg" role="group" aria-label="Studio mode">
          <button className={mode === 'fit' ? 'on' : ''} onClick={() => setMode('fit')}>FIT · space</button>
          <button className={mode === 'stagecraft' ? 'on' : ''} onClick={() => setMode('stagecraft')}>STAGECRAFT · technical</button>
        </div>
        <div className="seg" role="group" aria-label="Camera">
          <button className={cam === 'perspective' ? 'on' : ''} onClick={() => setCam('perspective')}>Orbit</button>
          <button className={cam === 'top' ? 'on' : ''} onClick={() => setCam('top')}>Plan (ortho)</button>
          <button className={cam === 'walk' ? 'on' : ''} onClick={() => setCam('walk')}>Walk</button>
        </div>
        <div className="seg" role="group" aria-label="Transform">
          <button className={tmode === 'translate' ? 'on' : ''} onClick={() => setTmode('translate')}>Move</button>
          <button className={tmode === 'rotate' ? 'on' : ''} onClick={() => setTmode('rotate')}>Rotate</button>
        </div>
        <button className="btn ghost sm" disabled={!canUndo} onClick={() => undo(ev.id)}>Undo</button>
        <button className="btn ghost sm" disabled={!canRedo} onClick={() => redo(ev.id)}>Redo</button>
        <label className="check small"><input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Labels</label>
        <button className="btn ghost sm" onClick={() => { const url = canvasRef.current?.toDataURL('image/png'); if (url) { const a = document.createElement('a'); a.href = url; a.download = `${ev.title.replace(/\s+/g, '_')}-${cam}.png`; a.click(); } }}>Screenshot</button>
        <FidelityBadge f={derived.analysis.fidelity} />
      </div>
      <div className="studio-body">
        <aside className="studio-left">
          <Panel title={mode === 'fit' ? 'Space items' : 'Technical items'}>
            <Palette mode={mode} add={add} />
          </Panel>
          {mode === 'stagecraft' && stage && (
            <Panel title="Stage presets">
              <p className="small muted">Starting arrangements relative to the main stage — not claims about any venue.</p>
              <div className="row gap wrap">
                {(Object.keys(STAGE_PRESETS) as StagePreset[]).map((k) => (
                  <button key={k} className="btn ghost sm" onClick={() => add(presetObjects(k, stage).filter((o) => o.kind !== 'mixer' || !scene.objects.some((x) => x.kind === 'mixer')), `preset ${STAGE_PRESETS[k]}`)}>{STAGE_PRESETS[k]}</button>
                ))}
              </div>
            </Panel>
          )}
          {mode === 'stagecraft' && !stage && <Panel title="Stage presets"><button className="btn sm" onClick={() => add([makeObject('stage_deck', 'Main stage', [8, 0.6, 5], [0, 0, -scene.room.depthM / 2 + 2.5], { id: 'main-stage', dimsSource: 'user_proposed' })], 'add stage')}>Add a main stage first</button></Panel>}
          <Panel title="Layers & objects">
            <div className="row gap wrap small">
              {LAYERS.map((l) => (
                <label key={l} className="check"><input type="checkbox" checked={!hidden.has(l)} onChange={(e) => { const n = new Set(hidden); if (e.target.checked) n.delete(l); else n.add(l); setHidden(n); }} /> {l}</label>
              ))}
            </div>
            <ul className="hierarchy">
              {scene.objects.map((o) => (
                <li key={o.id}>
                  <button className={selected.includes(o.id) ? 'sel' : ''} onClick={(e) => onSelect(o.id, e.shiftKey)}>
                    <span className={`dot layer-${o.layer}`} aria-hidden /> {o.label} {o.locked ? '🔒' : ''}{o.hidden ? ' (hidden)' : ''}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
        <section className="viewport-wrap">
          <Viewport scene={scene} cameraMode={cam} selected={selected} onSelect={onSelect} onMove={onMove} onRotate={onRotate} usableSeats={derived.analysis.seating.usable} lostSeats={derived.analysis.seating.lost.map((l) => l.seat)} blockedSeats={blockedSet} sightTarget={derived.analysis.sightlines.target} showLabels={labels} hiddenLayers={hidden} transformMode={tmode} walkSpeed={walkSpeed} eyeHeight={eye} canvasRef={canvasRef} />
          <div className="viewport-legend" aria-hidden>
            <span><i className="sw ok" /> usable seat</span>
            <span><i className="sw blocked" /> sightline flagged</span>
            <span><i className="sw lost" /> removed by clearance</span>
          </div>
          {cam === 'walk' && (
            <div className="walk-hud">
              <b>Walk:</b> W/A/S/D move · drag to look · Q/E turn ·
              <label> Eye <input type="range" min={1} max={2.2} step={0.05} value={eye} onChange={(e) => setEye(Number(e.target.value))} /> {eye.toFixed(2)} m</label>
              <label> Speed <input type="range" min={0.5} max={6} step={0.5} value={walkSpeed} onChange={(e) => setWalkSpeed(Number(e.target.value))} /></label>
              <span className="muted"> Collisions are basic footprint checks — not an evacuation study.</span>
            </div>
          )}
        </section>
        <aside className="studio-right">
          <Panel title={sel.length > 1 ? `${sel.length} selected` : sel[0] ? 'Inspector' : 'Room'}>
            {sel.length === 1 ? (
              <Inspector ev={ev} obj={sel[0]} update={updateScene} derived={derived} />
            ) : sel.length > 1 ? (
              <div className="stack">
                <p className="small">Clear distance between first two: <b><Len m={footprintDistance(footprintOf(sel[0]).corners, footprintOf(sel[1]).corners)} /></b> (edge to edge)</p>
                <div className="row gap wrap">
                  <button className="btn ghost sm" onClick={distribute} disabled={sel.length < 3}>Distribute along X</button>
                  <button className="btn ghost sm" onClick={alignZ}>Align Z to first</button>
                  <button className="btn ghost sm" onClick={() => updateScene((s) => ({ ...s, objects: s.objects.map((o) => (selected.includes(o.id) ? { ...o, locked: true } : o)) }), 'lock selection')}>Lock all</button>
                </div>
              </div>
            ) : (
              <div className="stack">
                <p className="small muted">{scene.room.note}</p>
                <div className="grid-3">
                  <Field label="Width"><LengthInput meters={scene.room.widthM} onChange={(m) => updateScene((s) => ({ ...s, room: { ...s.room, widthM: Math.max(2, m) } }), 'room width')} /></Field>
                  <Field label="Depth"><LengthInput meters={scene.room.depthM} onChange={(m) => updateScene((s) => ({ ...s, room: { ...s.room, depthM: Math.max(2, m) } }), 'room depth')} /></Field>
                  <Field label="Height"><LengthInput meters={scene.room.heightM} onChange={(m) => updateScene((s) => ({ ...s, room: { ...s.room, heightM: Math.max(2, m) } }), 'room height')} /></Field>
                </div>
                <Field label="Room dimension source" hint="Only choose “measured” if you or the venue measured this room.">
                  <select value={scene.room.source} onChange={(e) => updateScene((s) => ({ ...s, room: { ...s.room, source: e.target.value as DimsSource, note: e.target.value === 'user_measured' ? `Measured by ${user} ${nowIso().slice(0, 10)}` : s.room.note } }), 'room source')}>
                    <option value="user_proposed">Proposed / illustrative</option>
                    <option value="user_measured">Measured by me</option>
                  </select>
                </Field>
                <details>
                  <summary>Clearance & screening assumptions</summary>
                  <div className="grid-2">
                    {([
                      ['stageFrontClearanceM', 'Stage front clearance'],
                      ['aisleClearanceM', 'Clearance around objects'],
                      ['doorClearanceM', 'Door clearance'],
                      ['seatedEyeHeightM', 'Seated eye height'],
                      ['performerTargetHeightM', 'Performer target above deck'],
                    ] as const).map(([k, l]) => (
                      <Field key={k} label={l}><LengthInput meters={scene.assumptions[k]} onChange={(m) => updateScene((s) => ({ ...s, assumptions: { ...s.assumptions, [k]: Math.max(0, m) } }), `assumption ${l}`)} /></Field>
                    ))}
                    <Field label="Standing density (m²/person)"><NumInput value={scene.assumptions.standingM2PerPerson} step={0.05} min={0.25} onChange={(v) => updateScene((s) => ({ ...s, assumptions: { ...s.assumptions, standingM2PerPerson: v ?? 0.75 } }), 'standing density')} /></Field>
                  </div>
                  <p className="small muted">These are configurable planning assumptions, not code requirements. Your jurisdiction’s rules and a qualified reviewer decide compliance.</p>
                </details>
              </div>
            )}
          </Panel>
          <Panel title="Impact vs baseline" actions={<button className="btn ghost sm" onClick={() => { baseline.current = ev; setBaselineLabel(`set ${new Date().toLocaleTimeString()}`); }}>Reset baseline</button>}>
            <p className="small muted">Baseline: {baselineLabel}</p>
            <table className="table compact">
              <thead><tr><th /><th>Now</th><th>Δ</th></tr></thead>
              <tbody>
                <Delta label="Usable seats" a={base.analysis.seating.usable.length} b={derived.analysis.seating.usable.length} />
                <Delta label="Seats lost to clearances" a={base.analysis.seating.lost.length} b={derived.analysis.seating.lost.length} />
                <Delta label="Sightline flags" a={base.analysis.sightlines.blocked.length} b={derived.analysis.sightlines.blocked.length} />
                <Delta label="Available tickets" a={base.capacity.available} b={derived.capacity.available} />
                <Delta label="Base gross revenue" a={base.finance.cases?.base.grossTicketMinor ?? null} b={derived.finance.cases?.base.grossTicketMinor ?? null} fmt={(v) => fmt(v, ev.currency)} />
                <Delta label="Known power (W)" a={base.analysis.power.nominalW} b={derived.analysis.power.nominalW} />
              </tbody>
            </table>
            <p className="small">{derived.capacity.explanation}</p>
          </Panel>
          <Panel title={`Checks (${derived.analysis.issues.length + patchList.length})`}>
            <p className="small">Free floor {formatArea(derived.analysis.freeAreaM2, units)} of {formatArea(derived.analysis.floorAreaM2, units)} · standing model {derived.analysis.standingCapacityModel} at {scene.assumptions.standingM2PerPerson} m²/person</p>
            <p className="small">Power known: {derived.analysis.power.nominalW} W nominal / {derived.analysis.power.peakW} W peak{derived.analysis.power.unknownCount ? ` · ${derived.analysis.power.unknownCount} unrated (incomplete)` : ''}</p>
            {derived.analysis.issues.length + patchList.length === 0 ? <p className="muted small">No issues detected by screening.</p> : (
              <ul className="issues small">
                {derived.analysis.issues.map((i) => (
                  <li key={i.id} className={`lvl-${i.level}`}><button className="link" onClick={() => setSelected(i.objectIds.filter(Boolean))}>{i.level.replace('_', ' ')}</button> {i.message}</li>
                ))}
                {patchList.map((p) => <li key={p} className="lvl-needs_review">patch: {p}</li>)}
              </ul>
            )}
            {mode === 'stagecraft' && (
              <details>
                <summary>Input list ({inputs.length})</summary>
                <table className="table compact"><thead><tr><th>Ch</th><th>Source</th><th>Type</th><th>Conn.</th></tr></thead><tbody>{inputs.map((r) => <tr key={r.objectId}><td>{r.channel ?? '—'}</td><td>{r.source}</td><td>{r.kind}</td><td>{r.connector}</td></tr>)}</tbody></table>
              </details>
            )}
          </Panel>
          <Panel title="Snapshots">
            <form className="row gap" onSubmit={(e) => { e.preventDefault(); if (!snapName.trim()) return; updateEvent(ev.id, (x) => ({ ...x, sceneSnapshots: [...x.sceneSnapshots, { id: uid('snap'), name: snapName.trim(), createdAt: nowIso(), scene: JSON.parse(JSON.stringify(x.scene)) }] }), `snapshot "${snapName.trim()}"`); setSnapName(''); }}>
              <input aria-label="Snapshot name" placeholder="Name this layout…" value={snapName} onChange={(e) => setSnapName(e.target.value)} />
              <button className="btn sm" type="submit">Save</button>
            </form>
            {ev.sceneSnapshots.length === 0 ? <p className="muted small">No named layouts yet.</p> : (
              <ul className="plain small">
                {[...ev.sceneSnapshots].reverse().map((s) => {
                  const d = deriveEvent({ ...ev, scene: s.scene }, ws);
                  return (
                    <li key={s.id} className="row between gap">
                      <span><b>{s.name}</b> · {d.analysis.seating.usable.length} seats · {d.capacity.available ?? '—'} tickets</span>
                      <span className="row gap">
                        <button className="btn ghost sm" onClick={() => { baseline.current = { ...ev, scene: s.scene }; setBaselineLabel(`snapshot “${s.name}”`); }}>Compare</button>
                        <button className="btn ghost sm" onClick={() => updateEvent(ev.id, (x) => ({ ...x, scene: { ...JSON.parse(JSON.stringify(s.scene)), version: x.scene.version + 1 } }), `restore snapshot "${s.name}"`)}>Restore</button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
      {scene.objects.length === 0 && <div className="studio-empty"><Empty title="Empty scene">Add a stage or seat block from the left panel, or apply a venue.</Empty></div>}
    </div>
  );
}

export function Studio() {
  return <NeedEvent>{(ev) => <StudioInner key={ev.id} ev={ev} />}</NeedEvent>;
}
