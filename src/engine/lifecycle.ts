import type { AuditEvent, EventStatus } from '../domain/types';

export const STATUS_ORDER: EventStatus[] = ['draft', 'researching', 'planning', 'pending_external_confirmation', 'approved', 'in_production', 'live', 'completed', 'archived'];

const CANCELLABLE: EventStatus[] = ['draft', 'researching', 'planning', 'pending_external_confirmation', 'approved', 'in_production'];

export function allowedTransitions(from: EventStatus): EventStatus[] {
  if (from === 'cancelled') return ['archived'];
  if (from === 'archived') return [];
  const i = STATUS_ORDER.indexOf(from);
  const next: EventStatus[] = [];
  if (i >= 0 && i < STATUS_ORDER.length - 1) next.push(STATUS_ORDER[i + 1]);
  // Step back one stage (e.g. approval revoked after an edit) except from live/completed.
  if (i > 0 && !['live', 'completed'].includes(from)) next.push(STATUS_ORDER[i - 1]);
  if (CANCELLABLE.includes(from)) next.push('cancelled');
  return next;
}

export function transition(from: EventStatus, to: EventStatus, actor: string, reason: string, now: string, id: string): AuditEvent {
  if (!allowedTransitions(from).includes(to)) throw new Error(`Transition ${from} → ${to} is not allowed`);
  if (!reason.trim()) throw new Error('A reason is required for every status change');
  return { id, at: now, actor, action: 'status_change', detail: `${from} → ${to}`, reason };
}

export const STATUS_LABEL: Record<EventStatus, string> = {
  draft: 'Draft',
  researching: 'Researching',
  planning: 'Planning',
  pending_external_confirmation: 'Pending external confirmation',
  approved: 'Approved',
  in_production: 'In production',
  live: 'Live',
  completed: 'Completed',
  archived: 'Archived',
  cancelled: 'Cancelled',
};
