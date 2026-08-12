// ============================================================
// FILE: components/CornerFrame.js
// Spatial Drop — the hairline instrument-panel corners from the radar
// screen, factored out into its own component.
//
// WHY THIS EXISTS — radar was the only screen that read as a "contained
// instrument display" (see App.js's old inline corner-brackets block).
// every other screen (auth, boarding, dock, settings) just faded to
// black at the edges, which is a big part of why they felt like a
// different app bolted onto the radar screen instead of more rooms in
// the same one. dropping this same frame onto those screens is the
// cheapest, highest-leverage fix for that — same device, everywhere.
//
// purely decorative, absolutely positioned, pointerEvents="none" — drop
// it in as a sibling anywhere in a full-bleed screen and it costs
// nothing.
// ============================================================

import React from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const { width: windowWidth, height: windowHeight } = Dimensions.get('window');

export const CornerFrame = ({
  color,
  top = 54,      // distance from the top edge — nudge down on screens with a status-bar-adjacent label
  bottom = 36,    // distance from the bottom edge
  inset = 20,     // distance from the left/right edges
  size = 22,      // length of each bracket arm
  opacity = 0.6,
}) => {
  const corners = [
    { x: inset, y: top, dx: 1, dy: 1 },                                  // top-left
    { x: windowWidth - inset, y: top, dx: -1, dy: 1 },                   // top-right
    { x: inset, y: windowHeight - bottom, dx: 1, dy: -1 },               // bottom-left
    { x: windowWidth - inset, y: windowHeight - bottom, dx: -1, dy: -1 }, // bottom-right
  ];

  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      {corners.map((c, i) => (
        <Path
          key={`corner-${i}`}
          d={`M ${c.x} ${c.y + size * c.dy} L ${c.x} ${c.y} L ${c.x + size * c.dx} ${c.y}`}
          stroke={color}
          strokeWidth={1}
          fill="none"
          opacity={opacity}
        />
      ))}
    </Svg>
  );
};
