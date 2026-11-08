/** Immutable scenario snapshots with a canonical input hash for reproducibility. */
import type { ScenarioSnapshot } from '../domain/types';
import { CALC_VERSION, computeFinance, type FinanceInputs, type FinanceResult } from './finance';

/** JSON with sorted keys so equal inputs always serialize identically. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(',')}}`;
}

/** 64-bit FNV-1a as hex (two 32-bit lanes); identity hash, not a security primitive. */
export function hashInputs(v: unknown): string {
  const s = canonicalJson(v);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export function snapshotScenario(name: string, inputs: FinanceInputs, id: string, now: string): ScenarioSnapshot {
  const frozen = JSON.parse(JSON.stringify(inputs)) as FinanceInputs;
  return { id, name, createdAt: now, calcVersion: CALC_VERSION, inputHash: hashInputs(frozen), inputs: frozen, result: computeFinance(frozen) };
}

/** Recompute a saved scenario from its own captured inputs and confirm it reproduces. */
export function reproduce(s: ScenarioSnapshot): { result: FinanceResult; matches: boolean; hashMatches: boolean } {
  const result = computeFinance(s.inputs as FinanceInputs);
  return { result, matches: canonicalJson(result) === canonicalJson(s.result), hashMatches: hashInputs(s.inputs) === s.inputHash };
}

export interface ScenarioDiff {
  metric: string;
  left: number | null;
  right: number | null;
  delta: number | null;
}

export function compareScenarios(a: FinanceResult, b: FinanceResult): ScenarioDiff[] {
  const pick = (r: FinanceResult) => ({
    'Available tickets (base attendance)': r.cases?.base.attendance ?? null,
    'Gross ticket revenue': r.cases?.base.grossTicketMinor ?? null,
    'Net ticket revenue': r.cases?.base.netTicketMinor ?? null,
    'Total cost (known)': r.cases?.base.totalCostMinor ?? null,
    Contribution: r.cases?.base.contributionMinor ?? null,
    'Break-even attendance': r.breakEven.attendance,
  });
  const l = pick(a);
  const r = pick(b);
  return (Object.keys(l) as (keyof typeof l)[]).map((k) => ({ metric: k, left: l[k], right: r[k], delta: l[k] != null && r[k] != null ? r[k]! - l[k]! : null }));
}
