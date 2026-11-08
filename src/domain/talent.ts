/** Directory rules for acts: no booking route, no directory entry (LD-04). */
import { isHttpUrl } from '../engine/provenance';
import type { TalentAct } from './types';

export function validateAct(a: Partial<TalentAct>): string[] {
  const e: string[] = [];
  if (!a.stageName?.trim()) e.push('Stage name is required');
  if (!a.officialSiteUrl || !isHttpUrl(a.officialSiteUrl)) e.push('Official website or profile URL is required');
  if (!a.sourceUrl || !isHttpUrl(a.sourceUrl)) e.push('Source URL (where the booking route is published) is required');
  const r = a.bookingRoute;
  if (!r?.value.trim()) e.push('Booking route is required');
  else if ((r.type === 'agency_page' || r.type === 'contact_form') && !isHttpUrl(r.value)) e.push('Booking page must be a URL');
  else if (r.type === 'business_email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.value)) e.push('Business email looks invalid');
  else if (r.type === 'booking_phone' && !/^[+\d][\d\s().-]{6,}$/.test(r.value)) e.push('Phone number looks invalid');
  return e;
}
