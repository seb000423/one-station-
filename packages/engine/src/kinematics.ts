/**
 * Kinematics layer helpers (R1 §8.5): trapezoidal velocity profiles from vmax / amax, PTP synchronisation
 * to the slowest joint, ON/OFF actuators as stroke / speed + cushion time.
 */
export interface Profile { T: number; ta: number; tc: number; vpeak: number; d: number }

/** Time-optimal trapezoid (or triangle) for a move of |d| with vmax, amax, starting and ending at rest. */
export function trapezoid(d: number, vmax: number, amax: number): Profile {
  const D = Math.abs(d);
  if (D === 0) return { T: 0, ta: 0, tc: 0, vpeak: 0, d };
  const da = (vmax * vmax) / amax; // distance to accelerate to vmax and brake again
  if (D <= da) { const ta = Math.sqrt(D / amax); return { T: 2 * ta, ta, tc: 0, vpeak: amax * ta, d }; }
  const ta = vmax / amax, tc = (D - da) / vmax;
  return { T: 2 * ta + tc, ta, tc, vpeak: vmax, d };
}
/** Same profile stretched to last exactly T (used to synchronise slower joints in a PTP move). */
export function stretched(d: number, T: number, amax: number): Profile {
  const D = Math.abs(d);
  if (D === 0 || T <= 0) return { T: Math.max(0, T), ta: 0, tc: 0, vpeak: 0, d };
  // v·(T − v/a) = D  →  v = (aT − √(a²T² − 4aD)) / 2
  const disc = amax * amax * T * T - 4 * amax * D;
  const v = disc >= 0 ? (amax * T - Math.sqrt(disc)) / 2 : D / (T / 2);
  const ta = v / amax;
  return { T, ta, tc: Math.max(0, T - 2 * ta), vpeak: v, d };
}
/** Position (0 … d) after time t on a profile. */
export function positionAt(p: Profile, t: number): number {
  const s = Math.sign(p.d), a = p.ta > 0 ? p.vpeak / p.ta : 0;
  if (t <= 0) return 0;
  if (t >= p.T) return p.d;
  let x: number;
  if (t < p.ta) x = 0.5 * a * t * t;
  else if (t < p.ta + p.tc) x = 0.5 * a * p.ta * p.ta + p.vpeak * (t - p.ta);
  else { const r = p.T - t; x = Math.abs(p.d) - 0.5 * a * r * r; }
  return s * x;
}
export interface JointLimit { vmax: number; amax: number }
/** PTP: every joint moves from a to b and arrives together; T = slowest joint's time (R1 §8.5 rule 1). */
export function ptp(from: number[], to: number[], limits: JointLimit[]): { T: number; profiles: Profile[] } {
  const own = from.map((a, i) => trapezoid(to[i]! - a, limits[i]!.vmax, limits[i]!.amax));
  const T = Math.max(0, ...own.map(p => p.T));
  return { T, profiles: own.map((p, i) => stretched(p.d, T, limits[i]!.amax)) };
}
/** ON/OFF (pneumatic) axis: stroke / speed + cushion (R1 §8.5 rule 4). */
export const onoffTime = (stroke: number, speed: number, cushion = 0): number => Math.abs(stroke) / speed + cushion;
