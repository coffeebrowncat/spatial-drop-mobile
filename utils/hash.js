import { NODE_TONES } from '../constants/colors';

// turns any string into a stable, well-mixed number between 0 and 1.
// runs fnv-1a followed by a murmur3-style finalizer so a one-character
// change in the input produces a completely uncorrelated output — this
// matters because a weaker hash makes near-identical ids (or dust-star
// keys like "dust3x"/"dust3y") land in near-identical spots.
export function hashToUnit(str) {
  let h = 0x811c9dc5; // fnv-1a offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i); // xor in the character
    h = Math.imul(h, 0x01000193); // multiply by the fnv prime (32-bit safe)
  }
  h ^= h >>> 15; // murmur3-style finalizer: scrambles bits, spreads nearby inputs apart
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296; // squash unsigned 32-bit result into 0.000–0.999
}

// which of the NODE_TONES (and matching glow gradient) a device owns
export function toneIndexForDevice(deviceId) {
  const idx = Math.floor(hashToUnit(deviceId + 'tone') * NODE_TONES.length); // stable, independent of position/size hashes
  return Math.min(idx, NODE_TONES.length - 1); // guard the rare 1.0 rounding edge case
}

// CHANGED AGAIN — this used to vary 15-21px per device on purpose ("hub/
// leaf nodes, not uniform dots"), but with the new monoline ring+circle
// mark that per-device variance just read as "one peer randomly bigger
// than the others" (direct feedback, size it down and make it the same
// as the rest). every peer is the same size now — no more seed lookup.
export function radiusForDevice(deviceId) {
  return 16; // fixed core radius for every peer, before the join-bounce spring multiplies it
}