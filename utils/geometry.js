import { hashToUnit } from './hash';
import {
  windowWidth,
  SCREEN_PADDING,
  TOP_SAFE_ZONE,
  BOTTOM_SAFE_ZONE
} from '../constants/layout';

// returns the nth point in a base-b halton low-discrepancy sequence (0–1).
// used instead of hand-rolled trig/random so scattered points cover an
// area evenly with no clumping and no visible pattern.
export function haltonSeq(index, base) {
  let f = 1; // fraction denominator, shrinks each loop
  let r = 0; // accumulated result
  let i = index;
  while (i > 0) {
    f = f / base;
    r = r + f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

// generates the nth connected peer's screen position. peers are assigned a
// permanent "slot" (1st ever seen this session = 1, 2nd = 2, ...) so the
// halton sequence's even-spread guarantee actually applies to whoever is
// currently connected, instead of scattering by device-id hash alone.
export function scatterPositionFor(slot) {
  const u = haltonSeq(slot, 2); // low-discrepancy x, 0–1
  const v = haltonSeq(slot, 3); // low-discrepancy y, 0–1 (different base so x/y never correlate)

  const usableWidth = windowWidth - SCREEN_PADDING * 2;
  const usableHeight = BOTTOM_SAFE_ZONE - TOP_SAFE_ZONE;

  return {
    x: SCREEN_PADDING + u * usableWidth,
    y: TOP_SAFE_ZONE + v * usableHeight
  };
}

// samples n points along a quadratic bezier curve so something can be
// animated smoothly along a branch (Animated only interpolates linearly
// between keyframes, so this precomputes enough of them to read as curved).
export function sampleBezier(p0, pc, p2, steps) {
  const input = []; // 0–1 progress keyframes
  const x = [];
  const y = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    input.push(t);
    x.push(mt * mt * p0.x + 2 * mt * t * pc.x + t * t * p2.x); // quadratic bezier x
    y.push(mt * mt * p0.y + 2 * mt * t * pc.y + t * t * p2.y); // quadratic bezier y
  }
  return { input, x, y };
}

// bows a connection from the anchor to a peer through a stable, per-device
// control point, so the graph reads as branching constellation limbs
// instead of dead-straight spokes on a wheel.
export function branchPathFor(x1, y1, x2, y2, deviceId) {
  const seed = hashToUnit(deviceId + 'bend'); // stable bend amount, never flickers between renders
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1; // guard against zero length
  const nx = -dy / len; // perpendicular unit vector, x
  const ny = dx / len; // perpendicular unit vector, y
  const bend = (seed - 0.5) * len * 0.32; // how far the branch bows, scaled to its own length
  const cx = midX + nx * bend;
  const cy = midY + ny * bend;
  return { d: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`, midX: cx, midY: cy }; // path + bowed midpoint for a junction star
}

// fixed field of tiny, dim background stars for atmosphere. generated once
// at module load (not per-render) so it never jitters or re-shuffles.
export const DUST_STARS = Array.from({ length: 52 }, (_, i) => ({
  x: SCREEN_PADDING + hashToUnit(`dust${i}x`) * (windowWidth - SCREEN_PADDING * 2),
  y: TOP_SAFE_ZONE + hashToUnit(`dust${i}y`) * (BOTTOM_SAFE_ZONE - TOP_SAFE_ZONE),
  r: 0.5 + hashToUnit(`dust${i}r`) * 1.1,
  o: 0.04 + hashToUnit(`dust${i}o`) * 0.14
}));

// 6 fixed angles the grey shards fly outward along on a failed transfer.
// fixed, not random, so the shatter always looks the same clean shape.
export const SHARD_ANGLES = [0, 60, 120, 180, 240, 300].map((deg) => (deg * Math.PI) / 180);