/** Source freshness, badges and conflict detection. */
import type { PriceOffer, SourceEvidence, VerificationStatus } from '../domain/types';

export type Badge = 'Verified' | 'Published/dated' | 'Source available' | 'Provider-reported' | 'Assumption' | 'Estimated' | 'Missing' | 'Stale' | 'Conflicted' | 'User-entered quote';

/** Review cadence per data category, in days. */
export const FRESHNESS_DAYS = { price: 30, venue: 180, talent: 90, channel: 90 } as const;

const DAY = 86_400_000;

export function isStale(lastChecked: string, category: keyof typeof FRESHNESS_DAYS, now: Date, validUntil?: string): boolean {
  if (validUntil && new Date(validUntil).getTime() < now.getTime()) return true;
  return now.getTime() - new Date(lastChecked).getTime() > FRESHNESS_DAYS[category] * DAY;
}

/** Effective status after applying time — stored status is never mutated by reading. */
export function effectiveStatus(status: VerificationStatus, lastChecked: string, category: keyof typeof FRESHNESS_DAYS, now: Date, validUntil?: string): VerificationStatus {
  if (status === 'contradicted' || status === 'unavailable' || status === 'modeled' || status === 'illustrative') return status;
  return isStale(lastChecked, category, now, validUntil) ? 'stale' : status;
}

export function badgeFor(status: VerificationStatus): Badge {
  switch (status) {
    case 'verified_authoritative':
    case 'verified_supplier':
      return 'Verified';
    case 'user_confirmed_private':
      return 'User-entered quote';
    case 'third_party_unverified':
      return 'Source available';
    case 'stale':
      return 'Stale';
    case 'contradicted':
      return 'Conflicted';
    case 'unavailable':
      return 'Missing';
    case 'modeled':
      return 'Estimated';
    case 'illustrative':
      return 'Assumption';
    case 'provider_reported':
      return 'Provider-reported';
  }
}

export interface OfferView {
  displayable: boolean; // may be shown as a *current* offer
  label: string;
  status: VerificationStatus;
}

/** A stale, expired or priceless offer is never presented as a current price. */
export function offerView(o: PriceOffer, now: Date): OfferView {
  const status = o.privateQuote ? 'user_confirmed_private' : effectiveStatus(o.status, o.lastChecked, 'price', now, o.validUntil);
  if (o.amountMinor == null) return { displayable: false, label: o.priceUnavailableReason ? `Request quote — ${o.priceUnavailableReason}` : 'Request quote', status: o.status === 'unavailable' ? 'unavailable' : status };
  if (status === 'stale') return { displayable: false, label: 'Price stale — not current', status };
  return { displayable: true, label: o.privateQuote ? 'Private quote' : 'Published offer', status };
}

export interface Conflict {
  fieldPath: string;
  entityId: string;
  values: { value: SourceEvidence['assertedValue']; evidenceId: string; retrievedAt: string }[];
}

/** Two live evidence records asserting different values for one field = a conflict. Values are never averaged. */
export function findConflicts(evidence: SourceEvidence[]): Conflict[] {
  const groups = new Map<string, SourceEvidence[]>();
  for (const e of evidence) {
    if (e.supersededBy) continue;
    const k = `${e.entityId}::${e.fieldPath}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const out: Conflict[] = [];
  for (const list of groups.values()) {
    const distinct = new Set(list.map((e) => String(e.assertedValue)));
    if (distinct.size > 1) {
      out.push({ fieldPath: list[0].fieldPath, entityId: list[0].entityId, values: list.map((e) => ({ value: e.assertedValue, evidenceId: e.id, retrievedAt: e.retrievedAt })) });
    }
  }
  return out;
}

export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}
