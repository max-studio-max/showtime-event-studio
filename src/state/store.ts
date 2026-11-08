/**
 * Workspace state. Local-first: persisted to localStorage with an explicit
 * save status. Every event mutation goes through `updateEvent`, which keeps
 * an undo/redo history, bumps `updatedAt`, writes an audit row, and — when
 * the workspace rule is on — withdraws approval after an edit.
 */
import { create } from 'zustand';
import { createEvent, nowIso, uid } from '../domain/factory';
import type { WorkspaceData } from '../domain/derive';
import type { PriceOffer, Product, ShowEvent, SourceEvidence, TalentAct } from '../domain/types';
import type { UnitSystem } from '../engine/units';

export type Route = 'home' | 'events' | 'venues' | 'studio' | 'spotlight' | 'catalog' | 'campaign' | 'service' | 'finance' | 'production' | 'settings';

export interface Settings {
  units: UnitSystem;
  hour24: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
  requireReapproval: boolean;
  locale: string;
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
  importWorkspace: (json: string) => string | null;
  exportWorkspace: () => string;
  resetWorkspace: () => void;
}

const KEY = 'showtime.workspace.v1';
const SCHEMA = 1;

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
    settings: { units: 'metric', hour24: false, highContrast: false, reducedMotion: false, requireReapproval: true, locale: 'en-CA' },
  };
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initial();
    const p = JSON.parse(raw) as Persisted;
    if (p.schema !== SCHEMA) return initial();
    return { ...initial(), ...p, settings: { ...initial().settings, ...p.settings } };
  } catch {
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
  exportWorkspace: () => JSON.stringify(pick(get()), null, 2),
  importWorkspace: (json) => {
    try {
      const p = JSON.parse(json) as Persisted;
      if (p.schema !== SCHEMA || !Array.isArray(p.events)) return 'Not a SHOWTIME workspace export (schema mismatch)';
      set({ ...initial(), ...p, past: {}, future: {} });
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
