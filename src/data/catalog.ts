/**
 * Built-in catalog entries are GENERIC PROXIES: unbranded, dimensioned
 * placeholders for laying out a scene. Their sizes are typical working
 * dimensions chosen by SHOWTIME (dimsSource `generic_proxy`), not a
 * manufacturer's spec, and they carry no price and no power rating.
 * Real products and supplier offers are added by users with source links.
 */
import type { Product, SceneLayer, SceneObjectKind, Vec3 } from '../domain/types';

const g = (id: string, name: string, category: SceneObjectKind, sizeM: Vec3, extra: Partial<Product> = {}): Product => ({
  id,
  name,
  manufacturer: null,
  model: null,
  category,
  isGenericProxy: true,
  specUrl: null,
  sizeM,
  dimsSource: 'generic_proxy',
  weightKg: null,
  powerW: null,
  peakPowerW: null,
  createdBy: 'seed',
  ...extra,
});

export const genericProducts: Product[] = [
  g('gp-deck-8x4', 'Stage deck module 8′×4′ (generic)', 'stage_deck', [2.4384, 0.6096, 1.2192], { notes: 'Height adjustable in inspector' }),
  g('gp-riser', 'Drum/choir riser (generic)', 'riser', [2.4384, 0.4064, 1.8288]),
  g('gp-mic', 'Mic on round-base stand (generic)', 'mic_stand', [0.3, 1.6, 0.3], { connector: 'XLR' }),
  g('gp-di', 'DI box (generic)', 'di_box', [0.12, 0.06, 0.1], { connector: 'XLR' }),
  g('gp-speaker', 'Point-source loudspeaker on stand (generic)', 'speaker', [0.45, 1.9, 0.4]),
  g('gp-sub', 'Subwoofer (generic)', 'sub', [0.6, 0.65, 0.7]),
  g('gp-wedge', 'Floor monitor wedge (generic)', 'wedge', [0.55, 0.35, 0.45]),
  g('gp-mixer', 'Digital console, 16 inputs (generic)', 'mixer', [0.8, 0.25, 0.6], { inputs: 16 }),
  g('gp-par', 'LED par fixture (generic)', 'light_fixture', [0.3, 0.3, 0.25]),
  g('gp-truss', 'Box truss segment 3 m (generic)', 'truss', [3, 0.3, 0.3]),
  g('gp-screen', 'Projection screen 16:9, 3 m (generic)', 'screen', [3.1, 2.3, 0.15]),
  g('gp-projector', 'Projector (generic)', 'projector', [0.5, 0.2, 0.45]),
  g('gp-podium', 'Lectern / podium (generic)', 'podium', [0.6, 1.15, 0.5]),
  g('gp-bar', 'Bar station 3 m (generic)', 'bar', [3, 1.1, 0.8]),
  g('gp-merch', 'Merch table 6′ (generic)', 'merch', [1.83, 0.76, 0.76]),
  g('gp-checkin', 'Check-in desk 6′ (generic)', 'checkin', [1.83, 0.76, 0.76]),
  g('gp-round', 'Round table 60″ (generic)', 'table_round', [1.524, 0.76, 1.524]),
  g('gp-barrier', 'Crowd barrier 2 m (generic)', 'barrier', [2, 1.1, 0.6]),
  g('gp-door', 'Door / exit 1.8 m (marker)', 'door', [1.8, 2.1, 0.1]),
  g('gp-column', 'Column 0.5 m (marker)', 'column', [0.5, 4, 0.5]),
  g('gp-zone', 'Named zone (no physical extent)', 'zone', [4, 0.02, 4]),
];

export const LAYER_OF: Record<SceneObjectKind, SceneLayer> = {
  stage_deck: 'stage',
  riser: 'stage',
  seat_block: 'seating',
  table_round: 'seating',
  mic_stand: 'audio',
  di_box: 'audio',
  speaker: 'audio',
  sub: 'audio',
  wedge: 'audio',
  mixer: 'audio',
  light_fixture: 'lighting',
  truss: 'lighting',
  screen: 'video',
  projector: 'video',
  podium: 'stage',
  bar: 'service',
  merch: 'service',
  checkin: 'service',
  door: 'structure',
  column: 'structure',
  barrier: 'service',
  zone: 'zone',
  generic: 'decor',
};

export const STAGECRAFT_KINDS: SceneObjectKind[] = ['stage_deck', 'riser', 'mic_stand', 'di_box', 'speaker', 'sub', 'wedge', 'mixer', 'light_fixture', 'truss', 'screen', 'projector', 'podium'];
export const FIT_KINDS: SceneObjectKind[] = ['seat_block', 'table_round', 'bar', 'merch', 'checkin', 'barrier', 'door', 'column', 'zone', 'stage_deck', 'podium'];
