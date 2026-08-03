// master color palette
export const COLORS = {
  bg: '#050505', // true abyssal black, main background
  boxBorder: '#222222', // dark grey, thin outlines / empty pin boxes
  boxBorderFilled: '#555555', // lighter grey, highlights filled pin boxes
  text: '#ffffff', // pure white, primary readable text
  mutedText: '#666666', // dark grey, captions and subtext
  amber: '#D99A5B', // muted amber, dispersal bloom + active network lines
  cyan: '#4AC2C2', // optional electric cyan, secondary highlights
  error: '#D95B5B', // soft red, wrong pin shake + ghost drop text
  lineIdle: 'rgba(255, 255, 255, 0.06)', // barely visible white under the rose branch tint
  lineActive: 'rgba(217, 154, 91, 0.5)', // amber at 50% opacity, pulsing active path
  branch: 'rgba(196, 111, 111, 0.28)', // dusty rose tint for idle constellation branches
  idkman: 'rgba(189, 118, 12, 0.49)',
  incomingGlow: '#8C4A56', // darker wine — used when a peer is actively sending files to you
};

// warm family of node tones (amber-gold through dusty rose), picked per-device
// by hash so each node reads as its own glowing constellation star
export const NODE_TONES = ['#F0C98A', '#D99A5B', '#E8B96B', '#C97A5A', '#B85C6B', '#8C4A56'];