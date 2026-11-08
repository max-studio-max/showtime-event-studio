/** Constructors for events, scene objects, templates and stage presets. */
import { LAYER_OF } from '../data/catalog';
import { seatBlockSize } from '../engine/geometry';
import type { Product, Scene, ScheduleBlock, SceneObject, SceneObjectKind, ShowEvent, TicketTier, Venue, Vec3 } from './types';

let counter = 0;
export const uid = (p = 'id') => `${p}-${Date.now().toString(36)}-${(counter++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
export const nowIso = () => new Date().toISOString();

export const DEFAULT_ASSUMPTIONS: Scene['assumptions'] = {
  stageFrontClearanceM: 1.5,
  aisleClearanceM: 0.3,
  doorClearanceM: 1.2,
  seatedEyeHeightM: 1.15,
  performerTargetHeightM: 1.2,
  standingM2PerPerson: 0.75,
};

export function makeObject(kind: SceneObjectKind, label: string, size: Vec3, position: Vec3, extra: Partial<SceneObject> = {}): SceneObject {
  return { id: uid('obj'), kind, label, layer: LAYER_OF[kind], position, rotationY: 0, size, dimsSource: 'generic_proxy', ...extra };
}

export function objectFromProduct(p: Product, position: Vec3): SceneObject {
  const size: Vec3 = p.sizeM ?? [0.5, 0.5, 0.5];
  return makeObject(p.category, p.name.replace(' (generic)', ''), size, position, {
    productId: p.id,
    dimsSource: p.sizeM ? p.dimsSource : 'visual_only',
    powerW: p.powerW,
    peakPowerW: p.peakPowerW,
    inputs: p.inputs,
    connector: p.connector,
    ownership: 'rent',
  });
}

export function seatBlock(label: string, rows: number, cols: number, position: Vec3, seatPitchM = 0.55, rowPitchM = 0.9): SceneObject {
  const seat = { rows, cols, seatPitchM, rowPitchM };
  return makeObject('seat_block', label, seatBlockSize(seat), position, { seat, dimsSource: 'user_proposed' });
}

/** Room depth axis: stage at −z (back wall), audience towards +z. */
export function mainStage(room: Scene['room'], w: number, d: number, h: number, extra: Partial<SceneObject> = {}): SceneObject {
  return makeObject('stage_deck', 'Main stage', [w, h, d], [0, 0, -room.depthM / 2 + d / 2], { id: 'main-stage', dimsSource: 'user_proposed', ...extra });
}

/** Two proposed seat blocks filling the audience area behind the stage clearance, with a centre aisle. */
export function autoSeating(scene: Scene, stage: SceneObject | undefined): SceneObject[] {
  const r = scene.room;
  const front = stage ? stage.position[2] + stage.size[2] / 2 + scene.assumptions.stageFrontClearanceM + 0.3 : -r.depthM / 2 + 3;
  const back = r.depthM / 2 - 1.5; // rear cross-aisle
  const depth = back - front;
  if (depth < 1) return [];
  const rowPitch = 0.9;
  const pitch = 0.55;
  const rows = Math.floor(depth / rowPitch);
  const usableW = r.widthM - 2 * 1.2 - 1.5; // side aisles + centre aisle
  const cols = Math.max(1, Math.floor(usableW / 2 / pitch));
  const blockW = cols * pitch;
  const z = front + (rows * rowPitch) / 2;
  const x = 0.75 + blockW / 2;
  return [seatBlock('House left', rows, cols, [-x, 0, z]), seatBlock('House right', rows, cols, [x, 0, z])];
}

export type StagePreset = 'standup' | 'solo' | 'acoustic_trio' | 'full_band' | 'dj' | 'panel' | 'keynote';

export const STAGE_PRESETS: Record<StagePreset, string> = {
  standup: 'Stand-up comedy',
  solo: 'Solo act',
  acoustic_trio: 'Acoustic trio',
  full_band: 'Full band',
  dj: 'DJ',
  panel: 'Conference panel',
  keynote: 'Keynote',
};

/** Preset arrangement relative to the main stage — a starting point, not a claim about any venue. */
export function presetObjects(preset: StagePreset, stage: SceneObject): SceneObject[] {
  const top = stage.position[1] + stage.size[1];
  const sz = stage.position[2];
  const front = sz + stage.size[2] / 2;
  const hw = stage.size[0] / 2;
  const at = (x: number, dz: number): Vec3 => [x, top, sz + dz];
  const mic = (label: string, x: number, dz: number, ch: number) => makeObject('mic_stand', label, [0.3, 1.6, 0.3], at(x, dz), { channel: ch, connector: 'XLR' });
  const di = (label: string, x: number, dz: number, ch: number) => makeObject('di_box', label, [0.12, 0.06, 0.1], at(x, dz), { channel: ch, connector: 'XLR' });
  const wedge = (x: number) => makeObject('wedge', 'Wedge', [0.55, 0.35, 0.45], [x, top, front - 0.4], { rotationY: Math.PI });
  const pa = (side: number) => makeObject('speaker', side < 0 ? 'PA left' : 'PA right', [0.45, 1.9, 0.4], [side * (hw + 0.6), 0, front - 0.4]);
  const out: SceneObject[] = [pa(-1), pa(1)];
  const f = stage.size[2] / 2;
  switch (preset) {
    case 'standup':
      out.push(mic('Comic mic', 0, f - 1.2, 1), mic('Host mic', -hw + 1, f - 1.2, 2));
      break;
    case 'solo':
      out.push(mic('Vocal', 0, f - 1.2, 1), di('Guitar DI', 0.4, f - 1.4, 2), wedge(0));
      break;
    case 'acoustic_trio':
      out.push(mic('Vocal 1', -1.5, f - 1.2, 1), mic('Vocal 2', 0, f - 1.2, 2), mic('Vocal 3', 1.5, f - 1.2, 3), di('Guitar DI', -1.2, f - 1.5, 4), di('Bass DI', 1.8, f - 1.5, 5), wedge(-1.5), wedge(0), wedge(1.5));
      break;
    case 'full_band': {
      const riser = makeObject('riser', 'Drum riser', [2.4384, 0.4064, 1.8288], [0, top, sz - f + 1.4]);
      out.push(riser, mic('Lead vocal', 0, f - 1.2, 1), mic('BV left', -2, f - 1.4, 2), mic('BV right', 2, f - 1.4, 3), mic('Kick', 0, -f + 2.5, 4), mic('Snare', 0.4, -f + 1.4, 5), di('Bass DI', -2.5, -f + 2.2, 6), di('Keys DI L', 2.5, -f + 2.2, 7), di('Keys DI R', 2.7, -f + 2.2, 8), wedge(-2), wedge(0), wedge(2));
      out.push(makeObject('sub', 'Sub left', [0.6, 0.65, 0.7], [-(hw + 0.6), 0, front - 1.2]), makeObject('sub', 'Sub right', [0.6, 0.65, 0.7], [hw + 0.6, 0, front - 1.2]));
      break;
    }
    case 'dj':
      out.push(makeObject('generic', 'DJ table', [1.8, 0.95, 0.75], at(0, -0.5), { dimsSource: 'generic_proxy' }), di('DJ mixer L/R', 0, -0.2, 1), mic('DJ mic', 0.6, -0.2, 3), wedge(-1.2));
      break;
    case 'panel':
      for (let i = 0; i < 4; i++) out.push(mic(`Panelist ${i + 1}`, -2.25 + i * 1.5, f - 1.5, i + 1));
      out.push(mic('Moderator', -hw + 1.2, f - 1.3, 5), makeObject('screen', 'Screen', [3.1, 2.3, 0.15], [0, top, sz - f + 0.4]));
      break;
    case 'keynote':
      out.push(makeObject('podium', 'Lectern', [0.6, 1.15, 0.5], at(hw - 1.5, f - 1.2)), mic('Lectern mic', hw - 1.5, f - 1.7, 1), mic('Headset (wireless)', 0, f - 1.2, 2), makeObject('screen', 'Screen', [3.1, 2.3, 0.15], [0, top, sz - f + 0.4]));
      break;
  }
  out.push(makeObject('mixer', 'FOH console', [0.8, 0.25, 0.6], [0, 0, 0], { inputs: 16, label: 'FOH console' }));
  return out;
}

export interface Template {
  key: string;
  label: string;
  category: string;
  preset: StagePreset;
  tiers: Omit<TicketTier, 'id'>[];
  durationMin: number;
}

export const TEMPLATES: Template[] = [
  { key: 'comedy', label: 'Comedy night', category: 'comedy', preset: 'standup', tiers: [{ name: 'General', priceMinor: 3500, quantity: null }, { name: 'Front rows', priceMinor: 5500, quantity: 40 }], durationMin: 105 },
  { key: 'concert', label: 'Concert', category: 'concert', preset: 'full_band', tiers: [{ name: 'General', priceMinor: 4500, quantity: null }], durationMin: 150 },
  { key: 'panel', label: 'Panel discussion', category: 'panel', preset: 'panel', tiers: [{ name: 'General', priceMinor: 2000, quantity: null }], durationMin: 90 },
  { key: 'wedding', label: 'Wedding', category: 'wedding', preset: 'dj', tiers: [], durationMin: 360 },
  { key: 'conference', label: 'Conference', category: 'conference', preset: 'keynote', tiers: [{ name: 'Delegate', priceMinor: 25000, quantity: null }], durationMin: 480 },
  { key: 'gala', label: 'Gala', category: 'gala', preset: 'keynote', tiers: [{ name: 'Gala ticket', priceMinor: 30000, quantity: null }], durationMin: 240 },
  { key: 'festival', label: 'Festival', category: 'festival', preset: 'full_band', tiers: [{ name: 'Day pass', priceMinor: 8000, quantity: null }], durationMin: 600 },
  { key: 'market', label: 'Market', category: 'market', preset: 'dj', tiers: [{ name: 'Entry', priceMinor: 500, quantity: null }], durationMin: 360 },
  { key: 'community', label: 'Community event', category: 'community', preset: 'keynote', tiers: [], durationMin: 120 },
  { key: 'blank', label: 'Blank event', category: 'other', preset: 'standup', tiers: [], durationMin: 120 },
];

export function baseScene(): Scene {
  return {
    version: 1,
    room: { widthM: 18, depthM: 24, heightM: 8, source: 'user_proposed', note: 'Illustrative shell — replace with measured dimensions' },
    objects: [],
    assumptions: { ...DEFAULT_ASSUMPTIONS },
  };
}

const addMin = (hhmm: string, m: number) => {
  const [h, mm] = hhmm.split(':').map(Number);
  const t = (h * 60 + mm + m + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

export function createEvent(templateKey: string, title: string, orgId: string, actor: string, date: string, timezone = 'America/Toronto', currency = 'CAD'): ShowEvent {
  const t = TEMPLATES.find((x) => x.key === templateKey) ?? TEMPLATES[TEMPLATES.length - 1];
  const now = nowIso();
  const sessionId = uid('ses');
  const show = '20:00';
  const scene = baseScene();
  const stage = mainStage(scene.room, 8, 5, 0.6);
  scene.objects = templateKey === 'blank' ? [] : [stage, ...presetObjects(t.preset, stage), ...autoSeating(scene, stage)];
  const foh = scene.objects.find((o) => o.label === 'FOH console');
  if (foh) foh.position = [0, 0, scene.room.depthM / 2 - 3];
  if (foh) {
    // Keep FOH clear of seating by carving its own footprint.
    foh.size = [2.4, 1.1, 1.8];
    foh.label = 'FOH position';
  }
  const blocks = [
    { kind: 'access' as const, label: 'Venue access', start: addMin(show, -360), end: addMin(show, -300) },
    { kind: 'load_in' as const, label: 'Load-in', start: addMin(show, -300), end: addMin(show, -210) },
    { kind: 'setup' as const, label: 'Set-up & focus', start: addMin(show, -210), end: addMin(show, -150) },
    { kind: 'soundcheck' as const, label: 'Soundcheck', start: addMin(show, -150), end: addMin(show, -60) },
    { kind: 'doors' as const, label: 'Doors', start: addMin(show, -30), end: show },
    { kind: 'show' as const, label: 'Show', start: show, end: addMin(show, t.durationMin) },
    { kind: 'strike' as const, label: 'Strike & load-out', start: addMin(show, t.durationMin), end: addMin(show, t.durationMin + 90) },
  ].map((b): ScheduleBlock => ({ ...b, id: uid('blk'), sessionId }));
  for (let i = 1; i < blocks.length; i++) blocks[i] = { ...blocks[i], dependsOn: [blocks[i - 1].id] };

  return {
    id: uid('evt'),
    orgId,
    title,
    category: t.category,
    description: '',
    tags: [],
    visibility: 'private',
    status: 'draft',
    timezone,
    currency,
    sessions: [{ id: sessionId, name: 'Main session', date, doors: addMin(show, -30), show, curfew: addMin(show, t.durationMin + 60) }],
    venueId: null,
    venueConfigId: null,
    venueBooking: { state: 'none' },
    attendanceTarget: null,
    holds: { comps: 0, accessible: 0, production: 0 },
    scene,
    sceneSnapshots: [],
    ticketTiers: t.tiers.map((x) => ({ ...x, id: uid('tier') })),
    budgetLines: [],
    revenueLines: [],
    assumptions: { sellThrough: { low: 0.45, base: 0.7, high: 0.9 }, ticketFeeBps: 0, ticketFeeFixedMinor: 0, refundBps: 0, taxIncludedBps: 0, contingencyBps: 500, feeSourceNote: 'Enter your ticketing platform’s published fee for your country' },
    fxRates: [],
    lineup: [],
    procurement: [],
    campaign: [],
    cohorts: [{ id: uid('coh'), name: 'General admission', kind: 'general', projected: 0, verified: null, arrivalWindowMin: 30 }],
    stationAssumptions: [
      { kind: 'bar', servedPerHourPerStation: 60, usageShare: 0.5, staffPerStation: 2 },
      { kind: 'merch', servedPerHourPerStation: 40, usageShare: 0.1, staffPerStation: 1 },
      { kind: 'checkin', servedPerHourPerStation: 300, usageShare: 1, staffPerStation: 2 },
    ],
    staff: [],
    schedule: blocks,
    cues: [],
    tasks: [],
    documents: [],
    scenarios: [],
    audit: [{ id: uid('aud'), at: now, actor, action: 'created', detail: `Created from template "${t.label}"` }],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Point an event at a venue space. Only source-backed facts are imported:
 * stage width/depth when the venue publishes them (height remains an
 * assumption). The room shell stays an illustrative, user-proposed overlay.
 */
export function applyVenue(ev: ShowEvent, v: Venue, configId: string): { event: ShowEvent; changes: string[] } {
  const changes: string[] = [];
  const scene: Scene = JSON.parse(JSON.stringify(ev.scene));
  const prevStage = scene.objects.find((o) => o.kind === 'stage_deck');
  if (v.stage.widthM && v.stage.depthM) {
    const w = v.stage.widthM;
    const d = v.stage.depthM;
    scene.room.widthM = Math.max(scene.room.widthM, Math.ceil(w + 6));
    scene.room.depthM = Math.max(scene.room.depthM, Math.ceil(d + 18));
    const h = prevStage?.size[1] ?? 0.9;
    const stage = mainStage(scene.room, w, d, h, { dimsSource: 'verified', evidenceIds: v.stage.evidenceIds, label: `${v.space} stage (W×D per source; height assumed)` });
    const oldTop = prevStage ? prevStage.position[1] + prevStage.size[1] : 0;
    const dz = prevStage ? stage.position[2] + d / 2 - (prevStage.position[2] + prevStage.size[2] / 2) : 0;
    scene.objects = scene.objects.filter((o) => o.kind !== 'stage_deck' && o.kind !== 'seat_block');
    // Move on-stage items with the stage front so the preset arrangement survives.
    for (const o of scene.objects) {
      if (!prevStage) break;
      if (Math.abs(o.position[1] - oldTop) < 1e-6) o.position = [o.position[0], stage.size[1], o.position[2] + dz];
      else if ((o.kind === 'speaker' || o.kind === 'sub') && o.position[1] === 0) o.position = [Math.sign(o.position[0] || 1) * (w / 2 + 0.6), 0, o.position[2] + dz];
    }
    scene.objects.unshift(stage);
    scene.objects.push(...autoSeating(scene, stage));
    changes.push(`Stage set to ${w.toFixed(2)} × ${d.toFixed(2)} m from venue source; height ${h} m is an assumption`);
    changes.push('Proposed seating regenerated for the new stage footprint');
  } else {
    changes.push('Venue publishes no stage dimensions in SHOWTIME — existing stage kept as a user-proposed overlay');
  }
  scene.room.source = 'user_proposed';
  scene.room.note = `Illustrative shell for ${v.space} — venue geometry not measured`;
  const cfg = v.configurations.find((c) => c.id === configId);
  changes.push(`Capacity reference: ${cfg?.name ?? 'configuration'} = ${cfg?.capacity ?? 'unknown'}`);
  const currency = v.country === 'CA' ? 'CAD' : 'USD';
  if (currency !== ev.currency) changes.push(`Event currency changed ${ev.currency} → ${currency}; existing amounts keep their own currency`);
  if (v.timezone !== ev.timezone) changes.push(`Time zone changed ${ev.timezone} → ${v.timezone}`);
  if (!v.indoor) changes.push('Outdoor venue: add weather contingency to schedule and budget');
  return {
    event: { ...ev, venueId: v.id, venueConfigId: configId, timezone: v.timezone, currency, venueBooking: { state: 'none' }, scene: { ...scene, version: scene.version + 1 } },
    changes,
  };
}
