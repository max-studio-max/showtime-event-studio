/**
 * Floor-plane geometry: oriented footprints, overlap (SAT), clearances,
 * seat generation and sightline *screening*. All units are metres.
 * World convention: x = room width, z = room depth (+z towards the back of
 * house / audience), y = up. The room is centred on the origin.
 */
import type { Scene, SceneObject, Vec3 } from '../domain/types';

export type P2 = [number, number];

export interface Footprint {
  id: string;
  corners: P2[]; // 4 corners, counter-clockwise
  yMin: number;
  yMax: number;
}

export function footprintOf(o: Pick<SceneObject, 'id' | 'position' | 'rotationY' | 'size'>, inflate = 0): Footprint {
  const [w, h, d] = o.size;
  const hw = w / 2 + inflate;
  const hd = d / 2 + inflate;
  const c = Math.cos(o.rotationY);
  const s = Math.sin(o.rotationY);
  const local: P2[] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
  // three.js Y-rotation maps local (x,z) → (x c + z s, −x s + z c)
  const corners = local.map(([x, z]) => [o.position[0] + x * c + z * s, o.position[2] - x * s + z * c] as P2);
  return { id: o.id, corners, yMin: o.position[1], yMax: o.position[1] + h };
}

function axes(c: P2[]): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < 2; i++) {
    const a = c[i];
    const b = c[i + 1];
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const len = Math.hypot(ex, ez) || 1;
    out.push([-ez / len, ex / len]);
  }
  return out;
}

function project(c: P2[], ax: P2): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of c) {
    const v = p[0] * ax[0] + p[1] * ax[1];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

const EPS = 1e-9;

/** Separating-axis test on 2D footprints; touching edges do not count as overlap. */
export function footprintsOverlap(a: P2[], b: P2[]): boolean {
  for (const ax of [...axes(a), ...axes(b)]) {
    const [a0, a1] = project(a, ax);
    const [b0, b1] = project(b, ax);
    if (a1 <= b0 + EPS || b1 <= a0 + EPS) return false;
  }
  return true;
}

export const verticalOverlap = (a: Footprint, b: Footprint) => a.yMax > b.yMin + EPS && b.yMax > a.yMin + EPS;

function segDist(p: P2, a: P2, b: P2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz || 1;
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

/** Minimum edge-to-edge distance between footprints (0 when overlapping). */
export function footprintDistance(a: P2[], b: P2[]): number {
  if (footprintsOverlap(a, b)) return 0;
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    for (const p of b) best = Math.min(best, segDist(p, a[i], a[(i + 1) % 4]));
    for (const p of a) best = Math.min(best, segDist(p, b[i], b[(i + 1) % 4]));
  }
  return best;
}

export function insideRoom(f: Footprint, room: Scene['room']): boolean {
  const hx = room.widthM / 2 + EPS;
  const hz = room.depthM / 2 + EPS;
  return f.corners.every(([x, z]) => Math.abs(x) <= hx && Math.abs(z) <= hz) && f.yMax <= room.heightM + EPS;
}

export const polygonArea = (c: P2[]) =>
  Math.abs(c.reduce((acc, p, i) => acc + p[0] * c[(i + 1) % c.length][1] - c[(i + 1) % c.length][0] * p[1], 0)) / 2;

// ------------------------------------------------------------------ seating

export interface Seat {
  blockId: string;
  row: number;
  col: number;
  x: number;
  z: number;
  label: string;
}

const SEAT_FOOTPRINT = 0.45; // m, physical seat width/depth used for obstruction tests

/** Nominal seat positions of a seat block, ignoring obstructions. */
export function seatPositions(block: SceneObject): Seat[] {
  if (!block.seat) return [];
  const { rows, cols, seatPitchM, rowPitchM } = block.seat;
  const c = Math.cos(block.rotationY);
  const s = Math.sin(block.rotationY);
  const out: Seat[] = [];
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const lx = (k - (cols - 1) / 2) * seatPitchM;
      const lz = (r - (rows - 1) / 2) * rowPitchM;
      out.push({
        blockId: block.id,
        row: r,
        col: k,
        x: block.position[0] + lx * c + lz * s,
        z: block.position[2] - lx * s + lz * c,
        label: `${String.fromCharCode(65 + (r % 26))}${r >= 26 ? Math.floor(r / 26) : ''}${k + 1}`,
      });
    }
  }
  return out;
}

/** Physical extent of a seat block derived from its grid. */
export function seatBlockSize(p: { rows: number; cols: number; seatPitchM: number; rowPitchM: number }): Vec3 {
  return [p.cols * p.seatPitchM, 0.9, p.rows * p.rowPitchM];
}

const NON_OBSTRUCTING = new Set(['zone', 'seat_block']);

export interface SeatingResult {
  nominal: number;
  usable: Seat[];
  lost: { seat: Seat; reason: string }[];
}

/**
 * Seats survive only if they sit inside the room, clear of every physical
 * object (inflated by the aisle clearance) and clear of the stage front by
 * the configured stage clearance. Overlapping seat blocks drop the later
 * block's duplicate seats.
 */
export function computeSeating(scene: Scene): SeatingResult {
  const a = scene.assumptions;
  const blocks = scene.objects.filter((o) => o.kind === 'seat_block' && !o.hidden);
  const obstacles = scene.objects
    .filter((o) => !NON_OBSTRUCTING.has(o.kind) && !o.hidden)
    .map((o) => ({ o, f: footprintOf(o, o.kind === 'stage_deck' || o.kind === 'riser' ? a.stageFrontClearanceM : o.kind === 'door' ? a.doorClearanceM : a.aisleClearanceM) }));
  const hx = scene.room.widthM / 2;
  const hz = scene.room.depthM / 2;
  const usable: Seat[] = [];
  const lost: SeatingResult['lost'] = [];
  let nominal = 0;
  for (const b of blocks) {
    for (const seat of seatPositions(b)) {
      nominal++;
      const sf = footprintOf({ id: 's', position: [seat.x, 0, seat.z], rotationY: b.rotationY, size: [SEAT_FOOTPRINT, 0.9, SEAT_FOOTPRINT] });
      if (sf.corners.some(([x, z]) => Math.abs(x) > hx || Math.abs(z) > hz)) {
        lost.push({ seat, reason: 'outside room shell' });
        continue;
      }
      const hit = obstacles.find(({ f }) => footprintsOverlap(sf.corners, f.corners));
      if (hit) {
        lost.push({ seat, reason: `within clearance of ${hit.o.label}` });
        continue;
      }
      const dup = usable.find((u) => u.blockId !== b.id && Math.hypot(u.x - seat.x, u.z - seat.z) < SEAT_FOOTPRINT);
      if (dup) {
        lost.push({ seat, reason: 'overlaps another seat block' });
        continue;
      }
      usable.push(seat);
    }
  }
  return { nominal, usable, lost };
}

// ------------------------------------------------------------------ sightlines

/** Segment vs oriented box (slab method in box-local space). */
export function segmentHitsBox(p0: Vec3, p1: Vec3, o: Pick<SceneObject, 'position' | 'rotationY' | 'size'>): boolean {
  const c = Math.cos(-o.rotationY);
  const s = Math.sin(-o.rotationY);
  const toLocal = (p: Vec3): Vec3 => {
    const x = p[0] - o.position[0];
    const z = p[2] - o.position[2];
    return [x * c + z * s, p[1] - o.position[1], -x * s + z * c];
  };
  const a = toLocal(p0);
  const b = toLocal(p1);
  const min: Vec3 = [-o.size[0] / 2, 0, -o.size[2] / 2];
  const max: Vec3 = [o.size[0] / 2, o.size[1], o.size[2] / 2];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 3; i++) {
    const d = b[i] - a[i];
    if (Math.abs(d) < EPS) {
      if (a[i] <= min[i] || a[i] >= max[i]) return false;
    } else {
      let ta = (min[i] - a[i]) / d;
      let tb = (max[i] - a[i]) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 >= t1) return false;
    }
  }
  return t1 - t0 > EPS;
}

export interface SightlineResult {
  target: Vec3 | null;
  blocked: { seat: Seat; by: string }[];
}

/**
 * Geometric screening only: a straight ray from each seat's eye point to a
 * performer target above the front-centre of the main stage deck. Ignores
 * audience heads, rake and venue structure that is not in the scene.
 */
export function screenSightlines(scene: Scene, seats: Seat[]): SightlineResult {
  const stage = scene.objects.find((o) => o.kind === 'stage_deck' && !o.hidden);
  if (!stage) return { target: null, blocked: [] };
  const a = scene.assumptions;
  // Front edge is the +z local face (towards audience).
  const c = Math.cos(stage.rotationY);
  const s = Math.sin(stage.rotationY);
  const fz = stage.size[2] / 2 - 0.75;
  const target: Vec3 = [stage.position[0] + fz * s, stage.position[1] + stage.size[1] + a.performerTargetHeightM, stage.position[2] + fz * c];
  // Mic stands and DI boxes are modelled as bounding boxes of their bases; their real
  // obstruction is a thin pole, so they are excluded rather than over-reported.
  const blockers = scene.objects.filter(
    (o) => !o.hidden && o.id !== stage.id && !NON_OBSTRUCTING.has(o.kind) && !['door', 'mic_stand', 'di_box'].includes(o.kind),
  );
  const blocked: SightlineResult['blocked'] = [];
  for (const seat of seats) {
    const eye: Vec3 = [seat.x, a.seatedEyeHeightM, seat.z];
    const hit = blockers.find((o) => segmentHitsBox(eye, target, o));
    if (hit) blocked.push({ seat, by: hit.label });
  }
  return { target, blocked };
}

/** Elevation an object should rest at: top of the highest deck/riser under its centre, else floor. */
export function restingElevation(scene: Scene, obj: SceneObject): number {
  if (obj.kind === 'stage_deck' || obj.kind === 'riser' || obj.kind === 'truss' || obj.kind === 'light_fixture') return obj.position[1];
  let y = 0;
  for (const o of scene.objects) {
    if (o.id === obj.id || (o.kind !== 'stage_deck' && o.kind !== 'riser') || o.hidden) continue;
    const f = footprintOf(o);
    if (pointInPoly([obj.position[0], obj.position[2]], f.corners)) y = Math.max(y, f.yMax);
  }
  return y;
}

export function pointInPoly(p: P2, poly: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
