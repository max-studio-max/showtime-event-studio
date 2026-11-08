import { describe, expect, it } from 'vitest';
import { applyBps, convert, parseMoney, roundHalfEvenDiv } from '../src/engine/money';
import { formatLength, ftToM, mToFt, parseLength } from '../src/engine/units';
import { computeSeating, footprintDistance, footprintOf, footprintsOverlap, screenSightlines, segmentHitsBox } from '../src/engine/geometry';
import { analyzeScene, inputList, patchIssues } from '../src/engine/sceneAnalysis';
import { allocateTiers, availableTickets, computeFinance, type FinanceInputs } from '../src/engine/finance';
import { effectiveStatus, findConflicts, offerView } from '../src/engine/provenance';
import { allowedTransitions, transition } from '../src/engine/lifecycle';
import { canonicalJson, compareScenarios, hashInputs, reproduce, snapshotScenario } from '../src/engine/scenario';
import { buildUtmUrl, channelMetrics, estimateQueue, fromMin, lineupOverlaps, modeledTickets, parseCsv, scheduleConflicts, spanMin, staffCost, toCsv } from '../src/engine/operations';
import { baseScene, makeObject, mainStage, seatBlock } from '../src/domain/factory';
import type { BudgetLine, PriceOffer, Scene, SourceEvidence } from '../src/domain/types';

describe('money', () => {
  it('rounds half to even', () => {
    expect(roundHalfEvenDiv(5, 2)).toBe(2);
    expect(roundHalfEvenDiv(7, 2)).toBe(4);
    expect(roundHalfEvenDiv(-5, 2)).toBe(-2);
  });
  it('applies basis points exactly', () => {
    expect(applyBps(10000, 295)).toBe(295);
    expect(applyBps(3333, 1000)).toBe(333);
    expect(applyBps(1, 5000)).toBe(0); // 0.5 → even 0
  });
  it('parses money without float drift and refuses extra precision', () => {
    expect(parseMoney('0.10', 'USD')).toBe(10);
    expect(parseMoney('1,234.56', 'CAD')).toBe(123456);
    expect(parseMoney('12', 'JPY')).toBe(12);
    expect(parseMoney('1.005', 'USD')).toBeNull();
    expect(parseMoney('', 'USD')).toBeNull();
    expect(parseMoney('abc', 'USD')).toBeNull();
  });
  it('converts with a decimal-string rate', () => {
    expect(convert(10000, { from: 'CAD', to: 'USD', rate: '0.7312', source: 't', asOf: 'x' })).toBe(7312);
  });
});

describe('units', () => {
  it('round-trips feet and metres without altering base values', () => {
    expect(ftToM(40)).toBeCloseTo(12.192, 9);
    expect(mToFt(ftToM(38))).toBeCloseTo(38, 12);
    expect(parseLength('10', 'imperial')).toBeCloseTo(3.048, 9);
    expect(formatLength(ftToM(19), 'imperial')).toBe('19′ 0″');
  });
});

const box = (id: string, x: number, z: number, w: number, d: number, rot = 0) => ({ id, position: [x, 0, z] as [number, number, number], rotationY: rot, size: [w, 1, d] as [number, number, number] });

describe('geometry', () => {
  it('detects overlap and separation, including rotated boxes', () => {
    expect(footprintsOverlap(footprintOf(box('a', 0, 0, 2, 2)).corners, footprintOf(box('b', 1.5, 0, 2, 2)).corners)).toBe(true);
    expect(footprintsOverlap(footprintOf(box('a', 0, 0, 2, 2)).corners, footprintOf(box('b', 2, 0, 2, 2)).corners)).toBe(false); // touching
    // A 45° rotated square reaches √2 from centre
    expect(footprintsOverlap(footprintOf(box('a', 0, 0, 2, 2, Math.PI / 4)).corners, footprintOf(box('b', 1.6, 0, 0.5, 0.5)).corners)).toBe(true);
    expect(footprintsOverlap(footprintOf(box('a', 0, 0, 2, 2)).corners, footprintOf(box('b', 1.6, 0, 0.5, 0.5)).corners)).toBe(false);
    expect(footprintDistance(footprintOf(box('a', 0, 0, 2, 2)).corners, footprintOf(box('b', 5, 0, 2, 2)).corners)).toBeCloseTo(3, 9);
  });
  it('segment-box intersection', () => {
    const o = { position: [0, 0, 0] as [number, number, number], rotationY: 0, size: [1, 2, 1] as [number, number, number] };
    expect(segmentHitsBox([-5, 1, 0], [5, 1, 0], o)).toBe(true);
    expect(segmentHitsBox([-5, 3, 0], [5, 3, 0], o)).toBe(false);
  });
});

function testScene(stageDepth = 4): Scene {
  const s = baseScene();
  s.room = { widthM: 12, depthM: 20, heightM: 6, source: 'user_proposed', note: '' };
  s.objects = [mainStage(s.room, 6, stageDepth, 0.6), seatBlock('Block', 10, 10, [0, 0, 2])];
  return s;
}

describe('seating and capacity (AC-09)', () => {
  it('counts nominal seats and drops none when clear', () => {
    const r = computeSeating(testScene(4));
    expect(r.nominal).toBe(100);
    expect(r.usable.length).toBe(100);
  });
  it('expanding the stage removes seats within the front clearance', () => {
    const before = computeSeating(testScene(4)).usable.length;
    const after = computeSeating(testScene(9)).usable.length;
    expect(after).toBeLessThan(before);
    const capBefore = availableTickets({ venueCapacity: 500, venueCapacityStatus: 'verified_authoritative', layoutSellable: before, holds: 4 });
    const capAfter = availableTickets({ venueCapacity: 500, venueCapacityStatus: 'verified_authoritative', layoutSellable: after, holds: 4 });
    expect(capAfter.available).toBe(after - 4);
    expect(capBefore.available! - capAfter.available!).toBe(before - after);
    expect(capAfter.binding).toBe('layout');
  });
  it('venue capacity caps a larger layout and reports it', () => {
    const c = availableTickets({ venueCapacity: 80, venueCapacityStatus: 'verified_authoritative', layoutSellable: 100, holds: 0 });
    expect(c.available).toBe(80);
    expect(c.exceedsVenue).toBe(true);
    expect(c.certified).toBe(true);
  });
  it('unknown venue capacity is never certified', () => {
    const c = availableTickets({ venueCapacity: null, venueCapacityStatus: 'unavailable', layoutSellable: 100, holds: 0 });
    expect(c.available).toBe(100);
    expect(c.certified).toBe(false);
    expect(availableTickets({ venueCapacity: null, venueCapacityStatus: 'unavailable', layoutSellable: null, holds: 0 }).available).toBeNull();
  });
  it('flags a column blocking a sightline', () => {
    const s = testScene(4);
    s.objects.push(makeObject('column', 'Column', [0.5, 4, 0.5], [0, 0, -2.5]));
    const seats = computeSeating(s).usable;
    const r = screenSightlines(s, seats);
    expect(r.blocked.length).toBeGreaterThan(0);
    expect(r.blocked.every((b) => b.by === 'Column')).toBe(true);
  });
});

describe('scene analysis', () => {
  it('reports collisions but not objects resting on a deck', () => {
    const s = testScene(4);
    const stage = s.objects[0];
    s.objects.push(makeObject('mic_stand', 'Mic', [0.3, 1.6, 0.3], [0, stage.size[1], stage.position[2]], { channel: 1 }));
    s.objects.push(makeObject('bar', 'Bar', [3, 1.1, 0.8], [2.5, 0, stage.position[2]])); // inside the stage at floor level
    const a = analyzeScene(s);
    const collisions = a.issues.filter((i) => i.id.startsWith('col-'));
    expect(collisions.length).toBe(1);
    expect(collisions[0].message).toContain('Bar');
  });
  it('flags objects outside the room and visual-only dimensions', () => {
    const s = testScene(4);
    s.objects.push(makeObject('generic', 'Prop', [1, 1, 1], [5.9, 0, 0], { dimsSource: 'visual_only' }));
    const ids = analyzeScene(s).issues.map((i) => i.id);
    expect(ids.some((i) => i.startsWith('room-'))).toBe(true);
    expect(ids.some((i) => i.startsWith('dims-'))).toBe(true);
  });
  it('builds an input list and finds patch problems', () => {
    const objs = [
      makeObject('mic_stand', 'Vox', [0.3, 1.6, 0.3], [0, 0, 0], { channel: 2 }),
      makeObject('di_box', 'Bass', [0.1, 0.1, 0.1], [0, 0, 0], { channel: 2 }),
      makeObject('mic_stand', 'Spare', [0.3, 1.6, 0.3], [0, 0, 0]),
    ];
    expect(inputList(objs).map((r) => r.source)).toEqual(['Bass', 'Vox', 'Spare']);
    const issues = patchIssues(objs);
    expect(issues.some((i) => i.includes('Channel 2'))).toBe(true);
    expect(issues.some((i) => i.includes('no mixing console'))).toBe(true);
  });
  it('power totals are incomplete when ratings are unknown', () => {
    const s = testScene(4);
    s.objects.push(makeObject('speaker', 'PA', [0.4, 1.9, 0.4], [-5, 0, -6], { powerW: 500, peakPowerW: 1200 }));
    s.objects.push(makeObject('speaker', 'PA2', [0.4, 1.9, 0.4], [5, 0, -6], { powerW: null }));
    const a = analyzeScene(s);
    expect(a.power).toEqual({ nominalW: 500, peakW: 1200, unknownCount: 1 });
  });
});

const line = (p: Partial<BudgetLine>): BudgetLine => ({ id: Math.random().toString(), category: 'other', label: 'x', amountMinor: 0, currency: 'CAD', basis: 'fixed', quantity: 1, state: 'estimated', source: 'assumption', ...p });

function fin(over: Partial<FinanceInputs> = {}): FinanceInputs {
  return {
    currency: 'CAD',
    capacity: availableTickets({ venueCapacity: 200, venueCapacityStatus: 'verified_authoritative', layoutSellable: 250, holds: 0 }),
    tiers: [{ id: 't1', name: 'GA', priceMinor: 3000, quantity: null }],
    assumptions: { sellThrough: { low: 0.5, base: 0.75, high: 1 }, ticketFeeBps: 1000, ticketFeeFixedMinor: 0, refundBps: 0, taxIncludedBps: 0, contingencyBps: 0, feeSourceNote: '' },
    costs: [line({ label: 'Venue', amountMinor: 200000 }), line({ label: 'Drink tokens', amountMinor: 200, basis: 'per_attendee' })],
    revenue: [],
    fxRates: [],
    ...over,
  };
}

describe('finance (AC-10, AC-11)', () => {
  it('computes gross, fees, net and contribution', () => {
    const r = computeFinance(fin());
    const b = r.cases!.base;
    expect(b.attendance).toBe(150);
    expect(b.grossTicketMinor).toBe(450000);
    expect(b.feesMinor).toBe(45000);
    expect(b.netTicketMinor).toBe(405000);
    expect(b.totalCostMinor).toBe(200000 + 150 * 200);
    expect(b.contributionMinor).toBe(405000 - 230000);
  });
  it('computes break-even only when everything is priced', () => {
    const r = computeFinance(fin());
    // net per ticket 2700, variable 200 → 200000 / 2500 = 80
    expect(r.breakEven.attendance).toBe(80);
    const r2 = computeFinance(fin({ costs: [line({ label: 'Venue', amountMinor: null })] }));
    expect(r2.breakEven.attendance).toBeNull();
    expect(r2.cases!.base.costComplete).toBe(false);
    expect(r2.cases!.base.contributionMinor).toBeNull();
    expect(r2.warnings.join(' ')).toContain('incomplete');
  });
  it('a missing price is never zero', () => {
    const r = computeFinance(fin({ costs: [line({ amountMinor: 1000 }), line({ label: 'Speakers', amountMinor: null })] }));
    expect(r.cases!.base.missingCostLines).toEqual(['Speakers (no price)']);
    expect(r.cases!.base.costKnownMinor).toBe(1000);
  });
  it('foreign-currency costs need a rate', () => {
    const usd = line({ label: 'US act', amountMinor: 10000, currency: 'USD' });
    expect(computeFinance(fin({ costs: [usd] })).cases!.base.costComplete).toBe(false);
    const r = computeFinance(fin({ costs: [usd], fxRates: [{ from: 'USD', to: 'CAD', rate: '1.3700', source: 'test', asOf: '2026-11-08' }] }));
    expect(r.cases!.base.costKnownMinor).toBe(13700);
  });
  it('included tax is backed out of gross', () => {
    const r = computeFinance(fin({ assumptions: { ...fin().assumptions, ticketFeeBps: 0, taxIncludedBps: 1300 } }));
    expect(r.cases!.base.taxMinor).toBe(450000 - Math.round(450000 / 1.13));
  });
  it('allocates fixed tiers before the open tier', () => {
    const a = allocateTiers([{ id: 'a', name: 'VIP', priceMinor: 1, quantity: 30 }, { id: 'b', name: 'GA', priceMinor: 1, quantity: null }], 100);
    expect(a.map((x) => x.qty)).toEqual([30, 70]);
  });
  it('a saved scenario reproduces after a price changes', () => {
    const inputs = fin();
    const snap = snapshotScenario('Base', inputs, 's1', '2026-11-08T00:00:00Z');
    inputs.costs[0].amountMinor = 999999; // live price refresh after the snapshot
    const rep = reproduce(snap);
    expect(rep.matches).toBe(true);
    expect(rep.hashMatches).toBe(true);
    const diff = compareScenarios(snap.result as never, computeFinance(inputs));
    expect(diff.find((d) => d.metric === 'Total cost (known)')!.delta).toBe(999999 - 200000);
  });
  it('hash is key-order independent', () => {
    expect(canonicalJson({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe('{"a":[1,{"c":3,"d":2}],"b":1}');
    expect(hashInputs({ a: 1, b: 2 })).toBe(hashInputs({ b: 2, a: 1 }));
    expect(hashInputs({ a: 1 })).not.toBe(hashInputs({ a: 2 }));
  });
});

describe('provenance (AC-12)', () => {
  const now = new Date('2026-11-08T00:00:00Z');
  const offer: PriceOffer = { id: 'o', productId: 'p', vendor: 'V', vendorRegion: 'ON', kind: 'rent', amountMinor: 5000, currency: 'CAD', basis: 'per day', exclusions: '', url: 'https://example.com', retrievedAt: '2026-11-01T00:00:00Z', lastChecked: '2026-11-01T00:00:00Z', status: 'verified_supplier', privateQuote: false };
  it('fresh offers display, stale/expired/priceless do not', () => {
    expect(offerView(offer, now).displayable).toBe(true);
    expect(offerView({ ...offer, lastChecked: '2026-08-01T00:00:00Z' }, now).displayable).toBe(false);
    expect(offerView({ ...offer, validUntil: '2026-11-07T00:00:00Z' }, now).label).toContain('stale');
    expect(offerView({ ...offer, amountMinor: null }, now).label).toContain('Request quote');
  });
  it('effective status ages without mutating', () => {
    expect(effectiveStatus('verified_authoritative', '2026-01-01T00:00:00Z', 'venue', now)).toBe('stale');
    expect(effectiveStatus('contradicted', '2026-11-01T00:00:00Z', 'venue', now)).toBe('contradicted');
  });
  it('detects conflicting assertions and does not average', () => {
    const e = (id: string, v: number): SourceEvidence => ({ id, entityType: 'venue', entityId: 'v', fieldPath: 'capacity', assertedValue: v, sourceType: 'official_venue_website', sourceUrl: null, publisher: 'x', retrievedAt: '2026-01-01', extractionMethod: 'm', verificationStatus: 'third_party_unverified', confidenceClass: 'low', usagePolicy: '' });
    const c = findConflicts([e('a', 181), e('b', 200)]);
    expect(c.length).toBe(1);
    expect(c[0].values.map((v) => v.value)).toEqual([181, 200]);
    expect(findConflicts([e('a', 181), { ...e('b', 200), supersededBy: 'a' }])).toEqual([]);
  });
});

describe('lifecycle', () => {
  it('enforces transitions and requires a reason', () => {
    expect(allowedTransitions('draft')).toEqual(['researching', 'cancelled']);
    expect(allowedTransitions('live')).toEqual(['completed']);
    expect(() => transition('draft', 'approved', 'me', 'x', 'now', 'id')).toThrow();
    expect(() => transition('draft', 'researching', 'me', ' ', 'now', 'id')).toThrow();
    expect(transition('draft', 'researching', 'me', 'start', 'now', 'id').detail).toBe('draft → researching');
  });
});

describe('operations', () => {
  it('time helpers handle midnight', () => {
    expect(spanMin('22:00', '01:30')).toBe(210);
    expect(fromMin(-30)).toBe('23:30');
    expect(fromMin(1500)).toBe('01:00');
  });
  it('fluid queue model', () => {
    const q = estimateQueue({ kind: 'bar', servedPerHourPerStation: 60, usageShare: 0.5, staffPerStation: 2 }, 1, 200, 30);
    // 100 users over 0.5 h = 200/h vs 60/h; backlog 100 − 30 = 70 → 70 min
    expect(q.utilisation).toBeCloseTo(200 / 60, 9);
    expect(q.maxWaitMin).toBeCloseTo(70, 9);
    expect(q.staffNeeded).toBe(2);
    expect(estimateQueue({ kind: 'bar', servedPerHourPerStation: 60, usageShare: 0.5, staffPerStation: 2 }, 0, 200, 30).maxWaitMin).toBeNull();
  });
  it('staff cost tracks unknown rates', () => {
    expect(staffCost([{ id: '1', role: 'Bar', person: '', start: '18:00', end: '23:30', rateMinorPerHour: 2000 }, { id: '2', role: 'Sec', person: '', start: '18:00', end: '22:00', rateMinorPerHour: null }])).toEqual({ knownMinor: 11000, missing: 1, hours: 9.5 });
  });
  it('lineup overlap and schedule dependency conflicts', () => {
    const slot = (id: string, start: string, d: number) => ({ id, actId: id, sessionId: 's', startLocal: start, durationMin: d, role: 'feature' as const, inquiry: { state: 'not_contacted' as const }, feeMinor: null, riderReceived: false });
    expect(lineupOverlaps([slot('a', '20:00', 30), slot('b', '20:20', 30), slot('c', '20:50', 10)])).toEqual([{ a: 'a', b: 'b' }]);
    expect(scheduleConflicts([{ id: '1', sessionId: 's', kind: 'setup', label: 'Setup', start: '10:00', end: '12:00' }, { id: '2', sessionId: 's', kind: 'soundcheck', label: 'Check', start: '11:00', end: '12:30', dependsOn: ['1'] }])).toHaveLength(1);
  });
  it('campaign metrics come only from observed data; forecasts need an explicit model', () => {
    const m = channelMetrics({ impressions: 10000, clicks: 200, conversions: 10, spendMinor: 20000, revenueMinor: 50000, importedAt: '', source: '' });
    expect(m.cpm).toBe(2000);
    expect(m.cpc).toBe(100);
    expect(m.ctr).toBe(0.02);
    expect(m.cpa).toBe(2000);
    expect(m.roas).toBe(2.5);
    const l = { id: 'l', channelId: 'c', plannedMinor: 50000, committedMinor: null, invoicedMinor: null, observed: null, utm: { source: 's', medium: 'm', campaign: 'c' }, model: null };
    expect(modeledTickets(l)).toBeNull();
    expect(modeledTickets({ ...l, model: { cpcMinor: 125, clickToTicketPct: 2 } })).toBe(8);
  });
  it('utm builder and csv round-trip', () => {
    expect(buildUtmUrl('https://tix.example/e?id=1', { source: 'meta', medium: 'paid_social', campaign: 'launch' })).toBe('https://tix.example/e?id=1&utm_source=meta&utm_medium=paid_social&utm_campaign=launch');
    expect(buildUtmUrl('not a url', { source: 'a', medium: 'b', campaign: 'c' })).toBeNull();
    const csv = toCsv([['a', 'b,c', 'say "hi"'], [1, null, 2]]);
    expect(parseCsv(csv)).toEqual([['a', 'b,c', 'say "hi"'], ['1', '', '2']]);
  });
});
