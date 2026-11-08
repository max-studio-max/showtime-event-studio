/**
 * Workspace state. Local-first: persisted to localStorage with an explicit
 * save status. Every event mutation goes through `updateEvent`, which keeps
 * an undo/redo history, bumps `updatedAt`, writes an audit row, and — when
 * the workspace rule is on — withdraws approval after an edit.
 */
import { create } from 'zustand';
import { createEvent, nowIso, uid } from '../domain/factory';
import type { WorkspaceData } from '../domain/derive';
import type { PriceOffer, Product, ProviderId, SavedReference, ServiceSupplier, ShowEvent, SourceEvidence, TalentAct, Venue } from '../domain/types';
import type { UnitSystem } from '../engine/units';
import { migrateWorkspace, SCHEMA } from './migrate';

export type Route = 'home' | 'discover' | 'events' | 'venues' | 'studio' | 'spotlight' | 'catalog' | 'campaign' | 'service' | 'finance' | 'production' | 'settings';

export interface Settings {
  units: UnitSystem;
  hour24: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  requireReapproval: boolean;
  locale: string;
  /** Live-data providers the user has switched on (all off by default). */
  providers: Record<ProviderId, boolean>;
}

export type SaveState = 'saved' | 'saving' | 'unsaved' | 'failed';

interface Persisted extends WorkspaceData {
  schema: number;
  org: { id: string; name: string };
  user: { name: string; role: string };
  events: ShowEvent[];
  activeEventId: string | null;
  settings: Settings;
}

interface State extends Persisted {
  route: Route;
  saveState: SaveState;
  saveError: string | null;
  past: Record<string, ShowEvent[]>;
  future: Record<string, ShowEvent[]>;
  toast: string | null;
  go: (r: Route) => void;
  setToast: (t: string | null) => void;
  setActive: (id: string | null) => void;
  addEvent: (e: ShowEvent) => void;
  removeEvent: (id: string) => void;
  /** Apply a change to an event. `action` is recorded in the audit log. */
  updateEvent: (id: string, fn: (e: ShowEvent) => ShowEvent, action: string, opts?: { coalesceKey?: string; skipAudit?: boolean }) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
  setSettings: (s: Partial<Settings>) => void;
  setOrg: (name: string) => void;
  setUser: (u: Partial<Persisted['user']>) => void;
  upsertProduct: (p: Product) => void;
  removeProduct: (id: string) => void;
  upsertOffer: (o: PriceOffer) => void;
  removeOffer: (id: string) => void;
  upsertAct: (a: TalentAct) => void;
  removeAct: (id: string) => void;
  addEvidence: (e: SourceEvidence) => void;
  removeEvidence: (id: string) => void;
  upsertVenue: (v: Venue) => void;
  removeVenue: (id: string) => void;
  upsertSupplier: (s: ServiceSupplier) => void;
  removeSupplier: (id: string) => void;
  upsertReference: (r: SavedReference) => void;
  removeReference: (id: string) => void;
  /** Add evidence rows, replacing same-id rows (re-saving refreshes the snapshot). */
  mergeEvidence: (rows: SourceEvidence[]) => void;
  migrationNotice: string | null;
  importWorkspace: (json: string) => string | null;
  exportWorkspace: () => string;
  resetWorkspace: () => void;
}

const KEY = 'showtime.workspace.v1';
const DEFAULT_PROVIDERS: Record<ProviderId, boolean> = { ticketmaster: false, osm_overpass: false, osm_nominatim: false, musicbrainz: false, bank_of_canada: false };

function initial(): Persisted {
  const org = { id: uid('org'), name: 'My production company' };
  return {
    schema: SCHEMA,
    org,
    user: { name: 'Producer', role: 'owner' },
    events: [],
    activeEventId: null,
    products: [],
    offers: [],
    acts: [],
    evidence: [],
    venues: [],
    suppliers: [],
    references: [],
    settings: { units: 'metric', hour24: false, highContrast: false, reducedMotion: false, requireReapproval: true, locale: 'en-CA', providers: { ...DEFAULT_PROVIDERS } },
  };
}

let migrationNotice: string | null = null;

function hydrate(p: Persisted): Persisted {
  const i = initial();
  return { ...i, ...p, settings: { ...i.settings, ...p.settings, providers: { ...DEFAULT_PROVIDERS, ...(p.settings?.providers ?? {}) } } };
}

function keep(name: string, raw: string) {
  try {
    localStorage.setItem(`${KEY}.${name}-${Date.now()}`, raw);
  } catch {
    /* storage full: the original key is still untouched */
  }
}

function load(): Persisted {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return initial();
  }
  if (!raw) return initial();
  try {
    const m = migrateWorkspace(JSON.parse(raw));
    if (!m.ok) {
      keep('unreadable', raw);
      migrationNotice = `Your saved workspace could not be opened (${m.reason}). A copy was kept in browser storage; starting empty.`;
      return initial();
    }
    if (m.changed) {
      keep(`backup-schema${m.from}`, raw);
      migrationNotice = `Workspace upgraded from schema ${m.from} to ${SCHEMA}. A backup of the previous version was kept in browser storage.`;
    }
    return hydrate(m.data as unknown as Persisted);
  } catch {
    keep('unreadable', raw);
    migrationNotice = 'Your saved workspace was corrupt. A copy was kept in browser storage; starting empty.';
    return initial();
  }
}

const pick = (s: State): Persisted => ({
  schema: SCHEMA,
  org: s.org,
  user: s.user,
  events: s.events,
  activeEventId: s.activeEventId,
  products: s.products,
  offers: s.offers,
  acts: s.acts,
  evidence: s.evidence,
  venues: s.venues,
  suppliers: s.suppliers,
  references: s.references,
  settings: s.settings,
});

const HISTORY = 60;
let lastCoalesce: { key: string; at: number } | null = null;

export const useStore = create<State>((set, get) => ({
  ...load(),
  route: 'home',
  saveState: 'saved',
  saveError: null,
  past: {},
  future: {},
  toast: null,
  migrationNotice,
  go: (route) => set({ route }),
  setToast: (toast) => set({ toast }),
  setActive: (activeEventId) => set({ activeEventId }),
  addEvent: (e) => set((s) => ({ events: [e, ...s.events], activeEventId: e.id })),
  removeEvent: (id) => set((s) => ({ events: s.events.filter((e) => e.id !== id), activeEventId: s.activeEventId === id ? null : s.activeEventId })),
  updateEvent: (id, fn, action, opts) =>
    set((s) => {
      const cur = s.events.find((e) => e.id === id);
      if (!cur) return {};
      let next = fn(cur);
      if (next === cur) return {};
      const now = nowIso();
      const audit = [...next.audit];
      // Coalesce rapid edits of the same field (typing, dragging) into one undo step and one audit row.
      const t = Date.now();
      const coalesce = !!opts?.coalesceKey && lastCoalesce?.key === `${id}:${opts.coalesceKey}` && t - lastCoalesce.at < 1500;
      lastCoalesce = opts?.coalesceKey ? { key: `${id}:${opts.coalesceKey}`, at: t } : null;
      if (!opts?.skipAudit && !coalesce) audit.push({ id: uid('aud'), at: now, actor: s.user.name, action: 'edit', detail: action });
      if (s.settings.requireReapproval && cur.status === 'approved' && next.status === 'approved' && action !== 'status_change') {
        next = { ...next, status: 'pending_external_confirmation' };
        audit.push({ id: uid('aud'), at: now, actor: 'workspace rule', action: 'status_change', detail: 'approved → pending_external_confirmation', reason: `Approval withdrawn by edit: ${action}` });
      }
      next = { ...next, audit: audit.slice(-500), updatedAt: now };
      const past = coalesce ? s.past[id] ?? [] : [...(s.past[id] ?? []), cur].slice(-HISTORY);
      return { events: s.events.map((e) => (e.id === id ? next : e)), past: { ...s.past, [id]: past }, future: { ...s.future, [id]: [] } };
    }),
  undo: (id) =>
    set((s) => {
      const p = s.past[id];
      const cur = s.events.find((e) => e.id === id);
      if (!p?.length || !cur) return {};
      const prev = p[p.length - 1];
      return { events: s.events.map((e) => (e.id === id ? prev : e)), past: { ...s.past, [id]: p.slice(0, -1) }, future: { ...s.future, [id]: [cur, ...(s.future[id] ?? [])] } };
    }),
  redo: (id) =>
    set((s) => {
      const f = s.future[id];
      const cur = s.events.find((e) => e.id === id);
      if (!f?.length || !cur) return {};
      return { events: s.events.map((e) => (e.id === id ? f[0] : e)), future: { ...s.future, [id]: f.slice(1) }, past: { ...s.past, [id]: [...(s.past[id] ?? []), cur] } };
    }),
  setSettings: (x) => set((s) => ({ settings: { ...s.settings, ...x } })),
  setOrg: (name) => set((s) => ({ org: { ...s.org, name } })),
  setUser: (u) => set((s) => ({ user: { ...s.user, ...u } })),
  upsertProduct: (p) => set((s) => ({ products: s.products.some((x) => x.id === p.id) ? s.products.map((x) => (x.id === p.id ? p : x)) : [...s.products, p] })),
  removeProduct: (id) => set((s) => ({ products: s.products.filter((x) => x.id !== id), offers: s.offers.filter((o) => o.productId !== id) })),
  upsertOffer: (o) => set((s) => ({ offers: s.offers.some((x) => x.id === o.id) ? s.offers.map((x) => (x.id === o.id ? o : x)) : [...s.offers, o] })),
  removeOffer: (id) => set((s) => ({ offers: s.offers.filter((x) => x.id !== id) })),
  upsertAct: (a) => set((s) => ({ acts: s.acts.some((x) => x.id === a.id) ? s.acts.map((x) => (x.id === a.id ? a : x)) : [...s.acts, a] })),
  removeAct: (id) => set((s) => ({ acts: s.acts.filter((x) => x.id !== id) })),
  addEvidence: (e) => set((s) => ({ evidence: [...s.evidence, e] })),
  removeEvidence: (id) => set((s) => ({ evidence: s.evidence.filter((x) => x.id !== id) })),
  upsertVenue: (v) => set((s) => ({ venues: s.venues.some((x) => x.id === v.id) ? s.venues.map((x) => (x.id === v.id ? v : x)) : [...s.venues, v] })),
  removeVenue: (id) =>
    set((s) => {
      const v = s.venues.find((x) => x.id === id);
      const owned = new Set([id, ...(v?.configurations.map((c) => c.id) ?? [])]);
      // Drop the venue's saved provider facts and any reviews of them.
      const dropped = new Set(s.evidence.filter((e) => owned.has(e.entityId) && e.providerId).map((e) => e.id));
      return { venues: s.venues.filter((x) => x.id !== id), evidence: s.evidence.filter((e) => !dropped.has(e.id) && !dropped.has(e.fieldPath.replace(/^review:/, ''))) };
    }),
  upsertSupplier: (v) => set((s) => ({ suppliers: s.suppliers.some((x) => x.id === v.id) ? s.suppliers.map((x) => (x.id === v.id ? v : x)) : [...s.suppliers, v] })),
  removeSupplier: (id) =>
    set((s) => {
      const ids = new Set(s.suppliers.find((x) => x.id === id)?.evidenceIds ?? []);
      return { suppliers: s.suppliers.filter((x) => x.id !== id), evidence: s.evidence.filter((e) => !ids.has(e.id)) };
    }),
  upsertReference: (r) => set((s) => ({ references: s.references.some((x) => x.id === r.id) ? s.references.map((x) => (x.id === r.id ? r : x)) : [...s.references, r] })),
  removeReference: (id) => set((s) => ({ references: s.references.filter((x) => x.id !== id) })),
  mergeEvidence: (rows) =>
    set((s) => {
      const ids = new Set(rows.map((r) => r.id));
      return { evidence: [...s.evidence.filter((e) => !ids.has(e.id)), ...rows] };
    }),
  exportWorkspace: () => JSON.stringify(pick(get()), null, 2),
  importWorkspace: (json) => {
    try {
      const m = migrateWorkspace(JSON.parse(json));
      if (!m.ok) return m.reason;
      set({ ...hydrate(m.data as unknown as Persisted), past: {}, future: {} });
      return null;
    } catch (e) {
      return `Could not read file: ${(e as Error).message}`;
    }
  },
  resetWorkspace: () => set({ ...initial(), past: {}, future: {}, route: 'home' }),
}));

// ---- autosave with visible status
let timer: ReturnType<typeof setTimeout> | null = null;
let lastSerialized = JSON.stringify(pick(useStore.getState()));
useStore.subscribe((s) => {
  const ser = JSON.stringify(pick(s));
  if (ser === lastSerialized) return;
  if (s.saveState !== 'saving') useStore.setState({ saveState: 'saving' });
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      const out = JSON.stringify(pick(useStore.getState()));
      localStorage.setItem(KEY, out);
      lastSerialized = out;
      useStore.setState({ saveState: 'saved', saveError: null });
    } catch (e) {
      useStore.setState({ saveState: 'failed', saveError: (e as Error).message });
    }
  }, 400);
});

/** Hook: the active event (or null). */
export const useActiveEvent = () => useStore((s) => s.events.find((e) => e.id === s.activeEventId) ?? null);

export function newEventFromTemplate(template: string, title: string, date: string, tz?: string, currency?: string): ShowEvent {
  const s = useStore.getState();
  return createEvent(template, title, s.org.id, s.user.name, date, tz, currency);
}
