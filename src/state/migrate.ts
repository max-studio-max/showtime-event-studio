/**
 * Idempotent workspace migrations (LD spec §11). Never drops events, records,
 * evidence, quotes or audits; adds new collections with empty defaults.
 * Unknown future schemas are refused rather than overwritten.
 */
export const SCHEMA = 2;

type Raw = Record<string, unknown> & { schema?: number; events?: unknown[] };

export type MigrationResult = { ok: true; data: Raw; from: number; changed: boolean } | { ok: false; reason: string };

export function migrateWorkspace(input: unknown): MigrationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'Not a SHOWTIME workspace' };
  const w = { ...(input as Raw) };
  const from = typeof w.schema === 'number' ? w.schema : NaN;
  if (!Number.isInteger(from) || from < 1) return { ok: false, reason: 'Workspace has no schema version' };
  if (from > SCHEMA) return { ok: false, reason: `Workspace schema ${from} is newer than this app (${SCHEMA}); update SHOWTIME instead of overwriting it` };
  if (!Array.isArray(w.events)) return { ok: false, reason: 'Workspace has no events list' };
  let v = from;
  if (v === 1) {
    // 1 → 2: live-data collections, provider toggles (all off), supplier assignments per event.
    w.venues = Array.isArray(w.venues) ? w.venues : [];
    w.suppliers = Array.isArray(w.suppliers) ? w.suppliers : [];
    w.references = Array.isArray(w.references) ? w.references : [];
    const settings = (w.settings && typeof w.settings === 'object' ? w.settings : {}) as Record<string, unknown>;
    w.settings = { ...settings, providers: { ticketmaster: false, osm_overpass: false, osm_nominatim: false, musicbrainz: false, bank_of_canada: false, ...((settings.providers as object) ?? {}) } };
    w.events = w.events.map((e) => {
      const ev = e as Record<string, unknown>;
      return { ...ev, supplierAssignments: Array.isArray(ev.supplierAssignments) ? ev.supplierAssignments : [] };
    });
    v = 2;
  }
  w.schema = v;
  return { ok: true, data: w, from, changed: from !== v };
}
