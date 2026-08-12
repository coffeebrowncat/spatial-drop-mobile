// master color palette
// FIXED — amber/idkman/lineActive/branch had all drifted off their own
// comments (amber was actually purple #8d177d, idkman was teal, lineActive
// and branch were cyan/green despite their names). that drift is the real
// reason things looked "half pink half amber half blue" — this pass fixes
// the drift AND moves the whole thing onto the graphite + cherry palette.
export const COLORS = {
  // MATCHED — was '#121110', now the exact literal '#000000' the radar
  // screen has always used, so every screen sits on the same black
  // instead of two near-identical-but-not-quite darks.
  bg: '#000000',
  card: '#1C1A18', // slightly-lifted surface, for boxed/card elements
  boxBorder: '#2A2724', // thin outlines / empty pin boxes
  boxBorderFilled: '#5A544C', // highlights filled pin boxes
  text: '#F2EDE6', // warm off-white, primary readable text
  mutedText: '#8A8580', // warm grey, captions and subtext
  // MATCHED — was '#8C1A3F'. every screen outside the radar had its own
  // slightly-different "cherry" accent; this is now the literal color the
  // idle peer markers render on the radar screen itself (PeerConstellation.js
  // lineColorFor now reads THIS value instead of its own hardcoded
  // '#c8123f' duplicate, so the two can never drift apart again).
  amber: '#C8123F', // NOTE: key kept as "amber" on purpose so every existing
  // COLORS.amber reference in App.js keeps working — the VALUE is now the
  // deep cherry/burgundy accent, not amber. treat this key as "accent."
  cyan: '#4AC2C2', // now actually referenced — see error below
  error: '#4AC2C2', // CHANGED — was a soft red, then an ice-blue; now matches
  // COLORS.cyan exactly (same value on purpose, so there's one real cyan in
  // the palette instead of two near-identical blues). used for: wrong pin
  // shake, ghost drop text, pin error text, settings logout button
  lineIdle: 'rgba(255, 255, 255, 0.06)', // barely visible white, unchanged
  lineActive: 'rgba(200, 18, 63, 0.5)', // cherry at 50% opacity, pulsing active path — matches the new amber value above
  branch: 'rgba(184, 92, 107, 0.28)', // dusty rose tint for idle constellation branches (was green, now actually matches its own name)
  idkman: '#C8123F', // matches accent, same pattern as before
  incomingGlow: '#D9708F', // brightened rose — needs to read distinctly from the now-dark accent when a peer is sending you files
  starGold: '#D9A05B', // secondary accent, background sensor-field dots only — a little warmth behind the cherry so the radar screen doesn't read as one flat hue
};

// rose-cherry family of node tones (was amber-gold), picked per-device
// by hash so each node reads as its own glowing constellation star
export const NODE_TONES = ['#E8A0B0', '#D9708F', '#C94A6E', '#B8214F', '#9E1A45', '#8C1A3F'];