/**
 * Scene validation and technical derivations (warnings, power, input list,
 * fidelity). Results are advisory screening — never code/safety certification.
 */
import type { GeometryFidelity, Scene, SceneObject } from '../domain/types';
import { computeSeating, footprintOf, footprintsOverlap, insideRoom, polygonArea, screenSightlines, verticalOverlap, type SeatingResult, type SightlineResult } from './geometry';

export type IssueLevel = 'potential_conflict' | 'needs_review' | 'info';

export interface SceneIssue {
  id: string;
  level: IssueLevel;
  objectIds: string[];
  message: string;
}

const SOFT_KINDS = new Set(['zone', 'seat_block']);

export interface SceneAnalysis {
  seating: SeatingResult;
  sightlines: SightlineResult;
  issues: SceneIssue[];
  floorAreaM2: number;
  occupiedAreaM2: number;
  freeAreaM2: number;
  standingCapacityModel: number;
  power: { nominalW: number; peakW: number; unknownCount: number };
  fidelity: GeometryFidelity;
}

export function sceneFidelity(scene: Scene): GeometryFidelity {
  const roomVerified = scene.room.source === 'verified' || scene.room.source === 'user_measured';
  const physical = scene.objects.filter((o) => !SOFT_KINDS.has(o.kind));
  const allDimsTrusted = physical.every((o) => o.dimsSource !== 'visual_only');
  if (roomVerified && allDimsTrusted && scene.room.source === 'verified') return 'verified_dimensions';
  if (scene.objects.some((o) => o.dimsSource === 'verified') || roomVerified) return 'partial_dimensions';
  return 'illustrative';
}

export function analyzeScene(scene: Scene): SceneAnalysis {
  const issues: SceneIssue[] = [];
  const visible = scene.objects.filter((o) => !o.hidden);
  const physical = visible.filter((o) => !SOFT_KINDS.has(o.kind));
  const fps = new Map(visible.map((o) => [o.id, footprintOf(o)]));

  for (const o of visible) {
    if (!insideRoom(fps.get(o.id)!, scene.room)) {
      issues.push({ id: `room-${o.id}`, level: 'potential_conflict', objectIds: [o.id], message: `${o.label} extends outside the room shell` });
    }
    if (o.dimsSource === 'visual_only') {
      issues.push({ id: `dims-${o.id}`, level: 'needs_review', objectIds: [o.id], message: `${o.label} has no trustworthy dimensions — it cannot satisfy clearance tests until measured` });
    }
  }

  for (let i = 0; i < physical.length; i++) {
    for (let j = i + 1; j < physical.length; j++) {
      const a = physical[i];
      const b = physical[j];
      const fa = fps.get(a.id)!;
      const fb = fps.get(b.id)!;
      // An object resting on a deck sits on top of it; that is not a collision.
      if (!verticalOverlap(fa, fb)) continue;
      if (footprintsOverlap(fa.corners, fb.corners)) {
        issues.push({ id: `col-${a.id}-${b.id}`, level: 'potential_conflict', objectIds: [a.id, b.id], message: `${a.label} overlaps ${b.label}` });
      }
    }
  }

  // Door clearance: nothing physical may sit in the swing/egress zone in front of a door.
  for (const d of visible.filter((o) => o.kind === 'door')) {
    const zone = footprintOf(d, scene.assumptions.doorClearanceM);
    for (const o of visible) {
      // Seats inside the zone are dropped by the seating solver instead.
      if (o.id === d.id || o.kind === 'zone' || o.kind === 'door' || o.kind === 'seat_block') continue;
      if (footprintsOverlap(zone.corners, fps.get(o.id)!.corners)) {
        issues.push({ id: `door-${d.id}-${o.id}`, level: 'potential_conflict', objectIds: [d.id, o.id], message: `${o.label} is inside the ${scene.assumptions.doorClearanceM} m clearance of ${d.label}` });
      }
    }
  }

  const seating = computeSeating(scene);
  const sightlines = screenSightlines(scene, seating.usable);
  if (sightlines.blocked.length) {
    issues.push({
      id: 'sightlines',
      level: 'needs_review',
      objectIds: [...new Set(sightlines.blocked.map((b) => b.by))].map((label) => visible.find((o) => o.label === label)?.id ?? ''),
      message: `${sightlines.blocked.length} seat(s) have a screened sightline obstruction (geometric screening only)`,
    });
  }
  if (!visible.some((o) => o.kind === 'stage_deck')) {
    issues.push({ id: 'no-stage', level: 'info', objectIds: [], message: 'No stage deck placed — sightline screening is unavailable' });
  }

  const floorAreaM2 = scene.room.widthM * scene.room.depthM;
  const occupiedAreaM2 = physical.reduce((a, o) => a + polygonArea(fps.get(o.id)!.corners), 0);
  const freeAreaM2 = Math.max(0, floorAreaM2 - occupiedAreaM2);
  const standingCapacityModel = Math.floor(freeAreaM2 / scene.assumptions.standingM2PerPerson);

  let nominalW = 0;
  let peakW = 0;
  let unknownCount = 0;
  for (const o of physical) {
    const needsPower = ['speaker', 'sub', 'wedge', 'mixer', 'light_fixture', 'projector', 'screen'].includes(o.kind);
    if (!needsPower) continue;
    if (o.powerW == null) unknownCount++;
    else {
      nominalW += o.powerW;
      peakW += o.peakPowerW ?? o.powerW;
    }
  }
  if (unknownCount) {
    issues.push({ id: 'power-unknown', level: 'needs_review', objectIds: [], message: `${unknownCount} powered item(s) have no published power rating — power totals are incomplete` });
  }

  return { seating, sightlines, issues, floorAreaM2, occupiedAreaM2, freeAreaM2, standingCapacityModel, power: { nominalW, peakW, unknownCount }, fidelity: sceneFidelity(scene) };
}

export interface InputListRow {
  channel: number | null;
  source: string;
  kind: string;
  connector: string;
  objectId: string;
}

/** Input list straight from the live scene, ordered by assigned channel then label. */
export function inputList(objects: SceneObject[]): InputListRow[] {
  return objects
    .filter((o) => o.kind === 'mic_stand' || o.kind === 'di_box')
    .map((o) => ({ channel: o.channel ?? null, source: o.label, kind: o.kind === 'mic_stand' ? 'Microphone' : 'DI', connector: o.connector ?? 'XLR', objectId: o.id }))
    .sort((a, b) => (a.channel ?? 999) - (b.channel ?? 999) || a.source.localeCompare(b.source));
}

/** Channel conflicts and console capacity check. */
export function patchIssues(objects: SceneObject[]): string[] {
  const rows = inputList(objects);
  const out: string[] = [];
  const seen = new Map<number, string>();
  for (const r of rows) {
    if (r.channel == null) out.push(`${r.source} has no console channel assigned`);
    else if (seen.has(r.channel)) out.push(`Channel ${r.channel} assigned to both ${seen.get(r.channel)} and ${r.source}`);
    else seen.set(r.channel, r.source);
  }
  const mixers = objects.filter((o) => o.kind === 'mixer');
  const capacity = mixers.reduce((a, m) => a + (m.inputs ?? 0), 0);
  if (rows.length && !mixers.length) out.push('Inputs exist but no mixing console is placed');
  else if (mixers.length && mixers.some((m) => m.inputs == null)) out.push('Console input count unknown — capacity cannot be checked');
  else if (rows.length > capacity) out.push(`${rows.length} inputs exceed console capacity of ${capacity}`);
  const maxCh = Math.max(0, ...rows.map((r) => r.channel ?? 0));
  if (mixers.length && capacity && maxCh > capacity) out.push(`Channel ${maxCh} is beyond the console's ${capacity} inputs`);
  return out;
}
