/**
 * Capacity → ticket inventory → revenue/cost model. Pure and deterministic:
 * the same inputs always produce the same result, and every figure carries a
 * trace of the equation and inputs that produced it. Missing prices make
 * totals *incomplete* — they are never treated as zero.
 */
import type { BudgetLine, FinanceAssumptions, RevenueLine, TicketTier } from '../domain/types';
import { applyBps, convert, findRate, type CurrencyCode, type FxRate } from './money';

export const CALC_VERSION = 'finance@1.0.0';

export interface CapacityInputs {
  venueCapacity: number | null;
  venueCapacityStatus: string; // provenance status of the venue figure
  layoutSellable: number | null; // seats/standing places in the planned scene
  holds: number;
}

export interface CapacityResult {
  available: number | null;
  certified: boolean;
  binding: 'venue' | 'layout' | 'none';
  explanation: string;
  exceedsVenue: boolean;
}

export function availableTickets(i: CapacityInputs): CapacityResult {
  const known = [i.venueCapacity, i.layoutSellable].filter((v): v is number => v != null);
  if (!known.length) {
    return { available: null, certified: false, binding: 'none', exceedsVenue: false, explanation: 'Neither a venue capacity nor a planned layout exists — ticket inventory cannot be computed.' };
  }
  const exceedsVenue = i.venueCapacity != null && i.layoutSellable != null && i.layoutSellable > i.venueCapacity;
  let base: number;
  let binding: CapacityResult['binding'];
  if (i.venueCapacity != null && (i.layoutSellable == null || i.venueCapacity <= i.layoutSellable)) {
    base = i.venueCapacity;
    binding = 'venue';
  } else {
    base = i.layoutSellable!;
    binding = 'layout';
  }
  const available = Math.max(0, base - i.holds);
  const certified = i.venueCapacity != null && i.venueCapacityStatus === 'verified_authoritative';
  const parts = [
    `min(venue ${i.venueCapacity ?? 'unknown'}, layout ${i.layoutSellable ?? 'none'}) − holds ${i.holds} = ${available}`,
    binding === 'venue' ? 'Venue published capacity is binding.' : 'Planned layout is binding.',
  ];
  if (i.venueCapacity == null) parts.push('Venue capacity unknown: inventory is not certified.');
  else if (!certified) parts.push(`Venue figure status is "${i.venueCapacityStatus}" — confirm with the venue before selling.`);
  if (exceedsVenue) parts.push('Layout exceeds the venue figure; venue maximum caps sales.');
  return { available, certified, binding, explanation: parts.join(' '), exceedsVenue };
}

export interface TraceStep {
  label: string;
  formula: string;
  value: string;
}

export interface CaseResult {
  attendance: number;
  ticketsByTier: { tierId: string; name: string; qty: number; grossMinor: number }[];
  grossTicketMinor: number;
  feesMinor: number;
  refundsMinor: number;
  taxMinor: number;
  netTicketMinor: number;
  otherRevenueMinor: number;
  otherRevenueMissing: number;
  costKnownMinor: number;
  contingencyMinor: number;
  totalCostMinor: number;
  costComplete: boolean;
  missingCostLines: string[];
  contributionMinor: number | null;
}

export interface FinanceInputs {
  currency: CurrencyCode;
  capacity: CapacityResult;
  tiers: TicketTier[];
  assumptions: FinanceAssumptions;
  costs: BudgetLine[];
  revenue: RevenueLine[];
  fxRates: FxRate[];
}

export interface FinanceResult {
  calcVersion: string;
  cases: { low: CaseResult; base: CaseResult; high: CaseResult } | null;
  breakEven: { attendance: number | null; explanation: string };
  trace: TraceStep[];
  warnings: string[];
}

/** Allocate sellable inventory to tiers: fixed quantities first, remainder to the first open tier. */
export function allocateTiers(tiers: TicketTier[], sellable: number): { tier: TicketTier; qty: number }[] {
  let left = sellable;
  const out = tiers.map((t) => {
    const q = t.quantity == null ? 0 : Math.min(t.quantity, left);
    left -= q;
    return { tier: t, qty: q };
  });
  const open = out.find((x) => x.tier.quantity == null);
  if (open) open.qty += left;
  return out;
}

function toEventCurrency(minor: number, from: CurrencyCode, to: CurrencyCode, rates: FxRate[]): number | null {
  const r = findRate(rates, from, to);
  return r ? convert(minor, r) : null;
}

function runCase(inp: FinanceInputs, sellThrough: number, available: number): CaseResult {
  const a = inp.assumptions;
  // Tier allocation is on sellable inventory; the case's sell-through scales each tier.
  const alloc = allocateTiers(inp.tiers, available);
  const ticketsByTier = alloc.map(({ tier, qty }) => {
    const sold = Math.floor(qty * sellThrough);
    return { tierId: tier.id, name: tier.name, qty: sold, grossMinor: sold * tier.priceMinor };
  });
  const attendance = ticketsByTier.reduce((s, t) => s + t.qty, 0);
  const grossTicketMinor = ticketsByTier.reduce((s, t) => s + t.grossMinor, 0);
  // Tax included in face price: tax = gross − gross / (1 + r)
  const taxMinor = a.taxIncludedBps ? grossTicketMinor - Math.round((grossTicketMinor * 10000) / (10000 + a.taxIncludedBps)) : 0;
  const feesMinor = applyBps(grossTicketMinor, a.ticketFeeBps) + attendance * a.ticketFeeFixedMinor;
  const refundsMinor = applyBps(grossTicketMinor, a.refundBps);
  const netTicketMinor = grossTicketMinor - feesMinor - refundsMinor - taxMinor;

  let otherRevenueMinor = 0;
  let otherRevenueMissing = 0;
  for (const r of inp.revenue) {
    if (r.amountMinor == null) {
      otherRevenueMissing++;
      continue;
    }
    const v = toEventCurrency(r.amountMinor, r.currency, inp.currency, inp.fxRates);
    if (v == null) otherRevenueMissing++;
    else otherRevenueMinor += v;
  }

  let costKnownMinor = 0;
  const missingCostLines: string[] = [];
  for (const c of inp.costs) {
    if (c.amountMinor == null) {
      missingCostLines.push(`${c.label} (no price)`);
      continue;
    }
    const unit = toEventCurrency(c.amountMinor, c.currency, inp.currency, inp.fxRates);
    if (unit == null) {
      missingCostLines.push(`${c.label} (no ${c.currency}→${inp.currency} rate)`);
      continue;
    }
    const mult = c.basis === 'fixed' ? c.quantity : attendance * c.quantity;
    costKnownMinor += unit * mult;
  }
  const contingencyMinor = applyBps(costKnownMinor, a.contingencyBps);
  const totalCostMinor = costKnownMinor + contingencyMinor;
  const costComplete = missingCostLines.length === 0;
  const contributionMinor = costComplete && otherRevenueMissing === 0 ? netTicketMinor + otherRevenueMinor - totalCostMinor : null;
  return { attendance, ticketsByTier, grossTicketMinor, feesMinor, refundsMinor, taxMinor, netTicketMinor, otherRevenueMinor, otherRevenueMissing, costKnownMinor, contingencyMinor, totalCostMinor, costComplete, missingCostLines, contributionMinor };
}

export function computeFinance(inp: FinanceInputs): FinanceResult {
  const trace: TraceStep[] = [];
  const warnings: string[] = [];
  const cap = inp.capacity;
  trace.push({ label: 'Available tickets', formula: 'min(verified venue capacity, planned sellable) − approved holds', value: cap.available == null ? 'not computable' : String(cap.available) });
  if (!cap.certified) warnings.push('Ticket inventory is not certified against a verified venue capacity.');
  if (cap.available == null) {
    return { calcVersion: CALC_VERSION, cases: null, breakEven: { attendance: null, explanation: cap.explanation }, trace, warnings: [...warnings, cap.explanation] };
  }
  if (!inp.tiers.length) warnings.push('No ticket tiers defined — ticket revenue is zero.');
  if (inp.tiers.length && !inp.tiers.some((t) => t.quantity == null)) {
    const fixed = inp.tiers.reduce((s, t) => s + (t.quantity ?? 0), 0);
    if (fixed < cap.available) warnings.push(`Tiers allocate ${fixed} of ${cap.available} available tickets; the rest are unallocated.`);
  }
  const st = inp.assumptions.sellThrough;
  const cases = {
    low: runCase(inp, st.low, cap.available),
    base: runCase(inp, st.base, cap.available),
    high: runCase(inp, st.high, cap.available),
  };
  const b = cases.base;
  trace.push(
    { label: 'Gross ticket revenue (base)', formula: 'Σ(floor(tier qty × sell-through) × face price)', value: String(b.grossTicketMinor) },
    { label: 'Ticketing fees (base)', formula: `gross × ${inp.assumptions.ticketFeeBps / 100}% + tickets × fixed fee`, value: String(b.feesMinor) },
    { label: 'Included tax (base)', formula: `gross − gross / (1 + ${inp.assumptions.taxIncludedBps / 100}%)`, value: String(b.taxMinor) },
    { label: 'Refund allowance (base)', formula: `gross × ${inp.assumptions.refundBps / 100}%`, value: String(b.refundsMinor) },
    { label: 'Net ticket revenue (base)', formula: 'gross − fees − refunds − included tax', value: String(b.netTicketMinor) },
    { label: 'Total cost (base)', formula: `Σ fixed + Σ(per-attendee × attendance) + contingency ${inp.assumptions.contingencyBps / 100}%`, value: b.costComplete ? String(b.totalCostMinor) : `incomplete (≥ ${b.totalCostMinor})` },
    { label: 'Contribution (base)', formula: 'net ticket + other revenue − total cost', value: b.contributionMinor == null ? 'not computable' : String(b.contributionMinor) },
  );
  if (!b.costComplete) warnings.push(`Exact total is incomplete: ${b.missingCostLines.length} cost line(s) lack a price — ${b.missingCostLines.join('; ')}.`);
  if (b.otherRevenueMissing) warnings.push(`${b.otherRevenueMissing} other revenue line(s) have no amount.`);
  return { calcVersion: CALC_VERSION, cases, breakEven: breakEven(inp, cap.available), trace, warnings };
}

/**
 * Break-even attendance from the weighted-average net per ticket and
 * fixed/variable costs. Only computed when every price is known and the
 * per-attendee contribution is positive.
 */
export function breakEven(inp: FinanceInputs, available: number): { attendance: number | null; explanation: string } {
  const full = runCase(inp, 1, available);
  if (full.attendance === 0) return { attendance: null, explanation: 'No sellable tickets — break-even is not computable.' };
  if (!full.costComplete) return { attendance: null, explanation: 'Not computable: some cost lines have no price.' };
  if (full.otherRevenueMissing) return { attendance: null, explanation: 'Not computable: some revenue lines have no amount.' };
  const netPerTicket = full.netTicketMinor / full.attendance;
  let fixed = 0;
  let variablePerAttendee = 0;
  for (const c of inp.costs) {
    const unit = toEventCurrency(c.amountMinor!, c.currency, inp.currency, inp.fxRates)!;
    if (c.basis === 'fixed') fixed += unit * c.quantity;
    else variablePerAttendee += unit * c.quantity;
  }
  const k = 1 + inp.assumptions.contingencyBps / 10000;
  fixed *= k;
  variablePerAttendee *= k;
  fixed -= full.otherRevenueMinor;
  const denom = netPerTicket - variablePerAttendee;
  if (denom <= 0) return { attendance: null, explanation: 'Not computable: each attendee costs at least as much as their net ticket revenue.' };
  const att = Math.max(0, Math.ceil(fixed / denom));
  const expl = `ceil((fixed ${Math.round(fixed)} − other revenue) / (avg net ${netPerTicket.toFixed(0)} − variable ${variablePerAttendee.toFixed(0)})) = ${att}`;
  if (att > available) return { attendance: att, explanation: `${expl} — exceeds available inventory of ${available}; the event cannot break even at current prices.` };
  return { attendance: att, explanation: expl };
}
