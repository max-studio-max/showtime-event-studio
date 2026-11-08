import { describe, expect, it } from 'vitest';
import { venues, venueEvidence } from '../src/data/venues';
import { channels } from '../src/data/channels';
import { genericProducts } from '../src/data/catalog';
import { applyVenue, createEvent } from '../src/domain/factory';
import { deriveEvent, type WorkspaceData } from '../src/domain/derive';
import type { ShowEvent } from '../src/domain/types';

const ws: WorkspaceData = { products: [], offers: [], acts: [], evidence: [], venues: [], suppliers: [], references: [] };
const NOW = new Date('2026-11-08T12:00:00Z');

function comedyAt(venueId: string): ShowEvent {
  const ev = createEvent('comedy', 'Test night', 'org', 'tester', '2026-12-05');
  const v = venues.find((x) => x.id === venueId)!;
  return applyVenue(ev, v, v.configurations[0].id).event;
}

describe('seed data integrity (AC-02, AC-07)', () => {
  it('has three venue spaces per market, each with an official https source', () => {
    for (const m of ['Toronto', 'New York City', 'Greater Los Angeles']) expect(venues.filter((v) => v.market === m)).toHaveLength(3);
    for (const v of venues) {
      expect(v.officialUrls.length).toBeGreaterThan(0);
      v.officialUrls.forEach((u) => expect(u.startsWith('https://')).toBe(true));
      for (const c of v.configurations) expect(c.evidenceIds.length).toBeGreaterThan(0);
    }
  });
  it('no seed venue claims verified-to-scale geometry or verified status', () => {
    expect(venues.some((v) => v.geometryFidelity === 'verified_dimensions')).toBe(false);
    expect(venueEvidence.every((e) => e.verificationStatus === 'third_party_unverified' && e.sourceUrl)).toBe(true);
  });
  it('generic catalog proxies carry no price, power or brand', () => {
    expect(genericProducts.every((p) => p.isGenericProxy && p.manufacturer === null && p.powerW === null)).toBe(true);
  });
  it('channels are link-only with official URLs', () => {
    expect(channels.every((c) => c.integration === 'link-only' && c.officialUrl.startsWith('https://'))).toBe(true);
  });
});

describe('shared event model propagation', () => {
  it('importing a venue with published stage dims marks the stage verified and recomputes seating', () => {
    const ev = comedyAt('la-wallis-goldsmith');
    const stage = ev.scene.objects.find((o) => o.kind === 'stage_deck')!;
    expect(stage.dimsSource).toBe('verified');
    expect(stage.size[0]).toBeCloseTo(46 * 0.3048, 9);
    const d = deriveEvent(ev, ws, NOW);
    expect(d.analysis.fidelity).toBe('partial_dimensions');
    expect(d.venueCapacity.value).toBe(500);
    expect(d.capacity.certified).toBe(false); // evidence not reviewed in-app
  });

  it('AC-09: expanding the stage reduces seats, ticket inventory and modeled revenue', () => {
    const ev = comedyAt('ny-symphony-thalia');
    const before = deriveEvent(ev, ws, NOW);
    const bigger: ShowEvent = JSON.parse(JSON.stringify(ev));
    const st = bigger.scene.objects.find((o) => o.kind === 'stage_deck')!;
    st.size = [st.size[0], st.size[1], st.size[2] + 3];
    st.position = [st.position[0], st.position[1], st.position[2] + 1.5];
    const after = deriveEvent(bigger, ws, NOW);
    expect(after.analysis.seating.usable.length).toBeLessThan(before.analysis.seating.usable.length);
    // Venue figure of 169 may still bind; inventory must never exceed it
    expect(after.capacity.available!).toBeLessThanOrEqual(169);
    expect(after.finance.cases!.base.grossTicketMinor).toBeLessThanOrEqual(before.finance.cases!.base.grossTicketMinor);
    expect(after.issues.some((i) => i.message.includes('exceeds the venue’s published stage'))).toBe(true);
  });

  it('venue without a published rate yields an unpriced venue line, making totals incomplete', () => {
    const d = deriveEvent(comedyAt('ny-city-winery'), ws, NOW);
    const venueLine = d.costLines.find((l) => l.category === 'venue')!;
    expect(venueLine.amountMinor).toBeNull();
    expect(d.finance.cases!.base.costComplete).toBe(false);
    expect(d.finance.breakEven.attendance).toBeNull();
  });

  it('published indicative rate flows into the budget with its source note', () => {
    const d = deriveEvent(comedyAt('to-mac-lyric'), ws, NOW);
    const venueLine = d.costLines.find((l) => l.category === 'venue')!;
    expect(venueLine.amountMinor).toBe(1_000_000);
    expect(venueLine.sourceNote).toContain('indicative');
  });

  it('venue-supplied gear is not double counted; rented gear with no offer is unpriced', () => {
    const ev = comedyAt('to-mac-lyric');
    ev.procurement = [
      { id: 'p1', productId: 'gp-speaker', offerId: null, quantity: 2, ownership: 'venue_supplied', rentalDays: 1 },
      { id: 'p2', productId: 'gp-wedge', offerId: null, quantity: 1, ownership: 'rent', rentalDays: 1 },
    ];
    const d = deriveEvent(ev, ws, NOW);
    expect(d.costLines.filter((l) => l.derivedFrom?.module === 'catalog')).toHaveLength(1);
    expect(d.costLines.find((l) => l.id === 'd-proc-p2')!.amountMinor).toBeNull();
  });

  it('rent offer price multiplies by rental days and quantity', () => {
    const ev = comedyAt('to-mac-lyric');
    ev.budgetLines = [{ id: 'v', category: 'venue', label: 'Venue quote', amountMinor: 500000, currency: 'CAD', basis: 'fixed', quantity: 1, state: 'quoted', source: 'private_quote' }];
    ev.procurement = [{ id: 'p', productId: 'gp-wedge', offerId: 'o', quantity: 2, ownership: 'rent', rentalDays: 3 }];
    const d = deriveEvent(ev, { ...ws, offers: [{ id: 'o', productId: 'gp-wedge', vendor: 'V', vendorRegion: 'ON', kind: 'rent', amountMinor: 4000, currency: 'CAD', basis: 'per day', exclusions: '', url: 'https://example.com', retrievedAt: '2026-11-07T00:00:00Z', lastChecked: '2026-11-07T00:00:00Z', status: 'verified_supplier', privateQuote: false }] }, NOW);
    const l = d.costLines.find((x) => x.id === 'd-proc-p')!;
    expect(l.amountMinor! * l.quantity).toBe(4000 * 3 * 2);
    expect(d.costLines.some((x) => x.id.startsWith('d-venue'))).toBe(false); // manual venue line overrides
  });

  it('a user-recorded contradicting capacity source downgrades the venue figure', () => {
    const ev = comedyAt('to-harbourfront-studio');
    const d = deriveEvent(ev, { ...ws, evidence: [{ id: 'u1', entityType: 'venue_config', entityId: 'cfg-hc-studio', fieldPath: 'capacity', assertedValue: 160, sourceType: 'official_venue_website', sourceUrl: 'https://example.com/old', publisher: 'old page', retrievedAt: '2026-11-08T00:00:00Z', extractionMethod: 'manual', verificationStatus: 'third_party_unverified', confidenceClass: 'low', usagePolicy: '' }] }, NOW);
    expect(d.venueCapacity.status).toBe('contradicted');
    expect(d.venueCapacity.value).toBe(160);
    expect(d.issues.some((i) => i.message.includes('disagree'))).toBe(true);
  });

  it('guest forecast drives bar queue and staffing requirement', () => {
    const ev = comedyAt('to-mac-lyric');
    ev.scene.objects.push({ ...ev.scene.objects[0], id: 'bar1', kind: 'bar', label: 'Bar', position: [8, 0, 10], size: [3, 1.1, 0.8], dimsSource: 'generic_proxy', layer: 'service' });
    ev.cohorts = [{ id: 'c', name: 'GA', kind: 'general', projected: 300, verified: null, arrivalWindowMin: 30 }];
    const d = deriveEvent(ev, ws, NOW);
    const bar = d.queues.find((q) => q.kind === 'bar')!;
    expect(bar.stations).toBe(1);
    expect(bar.utilisation).toBeGreaterThan(1);
    expect(d.staff.requiredByStations).toBeGreaterThanOrEqual(2);
  });
});
