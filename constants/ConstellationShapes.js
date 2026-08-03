// named constellation shapes peers can be arranged into once enough of them
// are connected. purely cosmetic — scatterPositionFor() in utils/geometry.js
// falls back to the plain halton scatter when there's no room pin yet (or no
// peers), so nothing breaks before a session actually exists.
//
// each shape is a fixed list of normalized (0-1) points — stylized asterisms,
// not astronomically accurate ones. listed smallest to largest: a session
// only ever picks a shape with at least as many points as there are
// connected peers, so nobody gets crammed onto a shape too small to hold them.

export const CASSIOPEIA = {
  name: 'Cassiopeia',
  nodes: [
    { x: 0.1, y: 0.62 },
    { x: 0.32, y: 0.22 },
    { x: 0.52, y: 0.58 },
    { x: 0.72, y: 0.16 },
    { x: 0.92, y: 0.52 }
  ]
};

export const LEO = {
  name: 'Leo',
  nodes: [
    { x: 0.14, y: 0.36 }, // Regulus
    { x: 0.24, y: 0.15 },
    { x: 0.36, y: 0.09 },
    { x: 0.56, y: 0.2 },
    { x: 0.78, y: 0.36 }, // Denebola
    { x: 0.5, y: 0.56 }
  ]
};

export const URSA_MINOR = {
  name: 'Ursa Minor',
  nodes: [
    { x: 0.82, y: 0.08 }, // Polaris
    { x: 0.66, y: 0.2 },
    { x: 0.55, y: 0.32 },
    { x: 0.44, y: 0.46 },
    { x: 0.28, y: 0.4 },
    { x: 0.18, y: 0.56 },
    { x: 0.34, y: 0.62 }
  ]
};

export const ORION = {
  name: 'Orion',
  nodes: [
    { x: 0.25, y: 0.14 }, // Betelgeuse
    { x: 0.76, y: 0.11 }, // Bellatrix
    { x: 0.4, y: 0.44 },  // belt L
    { x: 0.5, y: 0.49 },  // belt mid
    { x: 0.6, y: 0.54 },  // belt R
    { x: 0.3, y: 0.85 },  // Saiph
    { x: 0.7, y: 0.88 }   // Rigel
  ]
};

// smallest to largest, so constellationShapeFor() in geometry.js can filter
// down to "shapes with enough points" and randomly pick among what's left
export const CONSTELLATION_SHAPES = [CASSIOPEIA, LEO, URSA_MINOR, ORION];