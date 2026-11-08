/**
 * Decimal-safe money. Amounts are integer minor units (cents) and never
 * floats; percentages are basis points (1% = 100 bps). Rounding of fractional
 * results is banker's rounding (half-to-even) and happens in exactly one place.
 */
export type CurrencyCode = string; // ISO 4217, e.g. 'CAD', 'USD'

export interface Money {
  minor: number; // integer minor units
  currency: CurrencyCode;
}

export interface FxRate {
  from: CurrencyCode;
  to: CurrencyCode;
  /** Rate expressed as a decimal string to avoid float drift in storage, e.g. "0.7312". */
  rate: string;
  source: string;
  asOf: string; // ISO timestamp
}

const MINOR_DIGITS: Record<string, number> = { JPY: 0, KRW: 0 };
export const minorDigits = (c: CurrencyCode) => MINOR_DIGITS[c] ?? 2;

export function assertInt(n: number, what = 'amount'): void {
  if (!Number.isSafeInteger(n)) throw new Error(`${what} must be a safe integer in minor units, got ${n}`);
}

/** Round half-to-even a rational p/q (q > 0) to an integer. */
export function roundHalfEvenDiv(p: number, q: number): number {
  if (q <= 0) throw new Error('divisor must be positive');
  const neg = p < 0;
  const a = Math.abs(p);
  const whole = Math.floor(a / q);
  const rem = a - whole * q;
  let r = whole;
  if (rem * 2 > q) r = whole + 1;
  else if (rem * 2 === q) r = whole % 2 === 0 ? whole : whole + 1;
  return neg ? -r : r;
}

export function applyBps(minor: number, bps: number): number {
  assertInt(minor);
  // bps may carry up to 2 decimals (e.g. 2.5% = 250 bps; 2.95% = 295 bps).
  const scaled = Math.round(bps * 100);
  return roundHalfEvenDiv(minor * scaled, 1_000_000);
}

/** Parse a user decimal string ("12.50", "1,234.5") to minor units, or null when blank/invalid. */
export function parseMoney(input: string, currency: CurrencyCode): number | null {
  const s = input.replace(/[,\s]/g, '').replace(/^[$€£]/, '');
  if (s === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const digits = minorDigits(currency);
  const [intPart, frac = ''] = s.replace('-', '').split('.');
  if (frac.length > digits) return null; // refuse silent truncation
  const minor = Number(intPart) * 10 ** digits + Number((frac + '0'.repeat(digits)).slice(0, digits) || '0');
  return s.startsWith('-') ? -minor : minor;
}

export function formatMoney(minor: number | null, currency: CurrencyCode, locale = 'en-CA'): string {
  if (minor === null) return '—';
  const digits = minorDigits(currency);
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: digits }).format(
    minor / 10 ** digits,
  );
}

/** Decimal-string rate × minor amount, exact to the rounding step. */
export function convert(minor: number, rate: FxRate): number {
  assertInt(minor);
  const [i, f = ''] = rate.rate.split('.');
  const scale = 10 ** f.length;
  const rateInt = Number(i) * scale + Number(f || '0');
  return roundHalfEvenDiv(minor * rateInt, scale);
}

export function findRate(rates: FxRate[], from: CurrencyCode, to: CurrencyCode): FxRate | null {
  if (from === to) return { from, to, rate: '1', source: 'identity', asOf: '1970-01-01T00:00:00Z' };
  return rates.find((r) => r.from === from && r.to === to) ?? null;
}
