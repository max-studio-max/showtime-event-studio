/** Internal base unit is the metre. Conversions are display-only and never written back. */
export const M_PER_FT = 0.3048;

export type UnitSystem = 'metric' | 'imperial';

export const ftToM = (ft: number) => ft * M_PER_FT;
export const mToFt = (m: number) => m / M_PER_FT;

export function formatLength(m: number, system: UnitSystem, precision = 2): string {
  if (system === 'metric') return `${m.toFixed(precision)} m`;
  const totalIn = m / 0.0254;
  const ft = Math.floor(totalIn / 12);
  const inch = totalIn - ft * 12;
  const inchR = Math.round(inch * 4) / 4; // quarter inch display
  if (inchR >= 12) return `${ft + 1}′ 0″`;
  return `${ft}′ ${inchR}″`;
}

export function formatArea(m2: number, system: UnitSystem): string {
  return system === 'metric' ? `${m2.toFixed(1)} m²` : `${(m2 / (M_PER_FT * M_PER_FT)).toFixed(0)} ft²`;
}

/** Parse a length typed in the current display system back to metres. */
export function parseLength(input: string, system: UnitSystem): number | null {
  const n = Number(input.trim());
  if (!Number.isFinite(n)) return null;
  return system === 'metric' ? n : ftToM(n);
}

export const lengthInDisplay = (m: number, system: UnitSystem) => (system === 'metric' ? m : mToFt(m));
