import { hashToUnit } from './hash';
import {
  windowWidth,
  windowHeight,
  SCREEN_PADDING,
  TOP_SAFE_ZONE,
  BOTTOM_SAFE_ZONE
} from '../constants/layout';
import { CONSTELLATION_SHAPES } from '../constants/ConstellationShapes'; // NOTE: matches your actual filename (capital C). if you ever rename that file to lowercase, update this import to match — case mismatches here work fine on Windows/Mac but will 404 on Android/Linux builds

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
// picks a constellation shape for the current peer count, seeded off the
// room pin so everyone in the same session lands on the same shape.
export function constellationShapeFor(peerCount, seed) {
  const bigEnough = CONSTELLATION_SHAPES.filter((s) => s.nodes.length >= peerCount);
  const pool = bigEnough.length > 0 ? bigEnough : CONSTELLATION_SHAPES;
  const pick = Math.floor(hashToUnit(seed + 'constellationPick') * pool.length);
  return pool[Math.min(pick, pool.length - 1)];
}

// generates the nth connected peer's screen position. once there's a room
// pin and at least one peer, positions come from a named constellation
// shape instead of the raw halton scatter. falls back to halton if called
// without a seed (shouldn't happen in practice).
export function scatterPositionFor(slot, peerCount = 0, seed = '') {
  const usableWidth = windowWidth - SCREEN_PADDING * 2;
  const usableHeight = BOTTOM_SAFE_ZONE - TOP_SAFE_ZONE;

  if (peerCount > 0 && seed) {
    const shape = constellationShapeFor(peerCount, seed);
    const node = shape.nodes[(slot - 1) % shape.nodes.length];
    return {
      x: SCREEN_PADDING + node.x * usableWidth,
      y: TOP_SAFE_ZONE + node.y * usableHeight
    };
  }

  const u = haltonSeq(slot, 2);
  const v = haltonSeq(slot, 3);
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
// kept around for anyone still importing it, but App.js now renders
// GRID_DOTS instead — see the comment below for why.
export const DUST_STARS = Array.from({ length: 52 }, (_, i) => ({
  x: SCREEN_PADDING + hashToUnit(`dust${i}x`) * (windowWidth - SCREEN_PADDING * 2),
  y: TOP_SAFE_ZONE + hashToUnit(`dust${i}y`) * (BOTTOM_SAFE_ZONE - TOP_SAFE_ZONE),
  r: 0.5 + hashToUnit(`dust${i}r`) * 1.1,
  o: 0.04 + hashToUnit(`dust${i}o`) * 0.14
}));

// structured background texture — a faint, evenly-spaced dot grid instead
// of 52 random dust specks. the old random scatter left huge dead patches
// of pure black between dots, which is a big part of why the screen read
// as unfinished. a uniform grid — even a very faint one — reads as
// "sensor field" instead of "empty void," and because it's a grid (not
// random placement) it stays quiet and non-distracting no matter how much
// of the screen it covers. runs the full height so it fills the space
// behind the anchor too, not just the peer zone.
const GRID_SPACING = 46; // px between dots, both axes
export const GRID_DOTS = (() => {
  const dots = [];
  const usableWidth = windowWidth - SCREEN_PADDING * 2;
  const usableHeight = windowHeight - TOP_SAFE_ZONE - 40;
  const cols = Math.floor(usableWidth / GRID_SPACING);
  const rows = Math.floor(usableHeight / GRID_SPACING);
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      const jitterX = (hashToUnit(`grid${row}_${col}x`) - 0.5) * 4; // tiny per-dot jitter so it doesn't read as a spreadsheet
      const jitterY = (hashToUnit(`grid${row}_${col}y`) - 0.5) * 4;
      const seed = hashToUnit(`grid${row}_${col}o`);
      dots.push({
        x: SCREEN_PADDING + col * GRID_SPACING + jitterX,
        y: TOP_SAFE_ZONE + row * GRID_SPACING + jitterY,
        r: 0.7,
        o: 0.045 + seed * 0.05 // low, near-uniform opacity — bumped up slightly from the first pass, which was so faint it barely registered
      });
    }
  }
  return dots;
})();

// 6 fixed angles the grey shards fly outward along on a failed transfer.
// fixed, not random, so the shatter always looks the same clean shape.
export const SHARD_ANGLES = [0, 60, 120, 180, 240, 300].map((deg) => (deg * Math.PI) / 180);

// export the function so it can be pulled into app.js
export function generateLightningPath(x1, y1, x2, y2, deviceId) {
  // how many jagged "breaks" the lightning has (increase for more zig-zags)
  const segments = 5;
  // calculate the total horizontal distance between phone and laptop
  const dx = x2 - x1;
  // calculate the total vertical distance between phone and laptop
  const dy = y2 - y1;
  // find the direct straight-line length (fallback to 1 to avoid dividing by zero)
  const len = Math.hypot(dx, dy) || 1;
  // calculate the perpendicular x vector for the jagged offset
  const nx = -dy / len;
  // calculate the perpendicular y vector for the jagged offset
  const ny = dx / len;

  // collect every joint (including start/end) so we can both build the path
  // string AND measure its real jagged length, not just the straight-line one —
  // needed so an animated "draw-on" strike can be timed to its actual length
  const points = [{ x: x1, y: y1 }];
  // set a default midpoint x just in case
  let midX = (x1 + x2) / 2;
  // set a default midpoint y just in case
  let midY = (y1 + y2) / 2;

  // loop through each segment to draw the jagged breaks
  for (let i = 1; i < segments; i++) {
    // calculate how far along the straight line we are (0.0 to 1.0)
    const t = i / segments;
    // find the exact base x coordinate on the straight line for this segment
    const baseX = x1 + dx * t;
    // find the exact base y coordinate on the straight line for this segment
    const baseY = y1 + dy * t;

    // create a unique string based on the laptop's id and the segment number
    const seedStr = deviceId + 'zap' + i;
    // use your stable hash to generate a permanent offset (change 90 to make it wider/crazier)
    const offset = (hashToUnit(seedStr) - 0.5) * 90;

    // apply the perpendicular x offset to the straight line point
    const px = baseX + nx * offset;
    // apply the perpendicular y offset to the straight line point
    const py = baseY + ny * offset;

    points.push({ x: px, y: py });

    // if we are on the second segment break...
    if (i === 2) {
      // save this specific x coordinate to draw a spark here later
      midX = px;
      // save this specific y coordinate to draw a spark here later
      midY = py;
    }
  }
  // finally, connect the last jagged point directly to the laptop node
  points.push({ x: x2, y: y2 });

  // build the svg path string and measure the jagged length in the same pass
  let d = `M ${points[0].x} ${points[0].y}`;
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }

  // return the completed path string, spark coordinates, and its real length
  return { d, midX, midY, length };
}