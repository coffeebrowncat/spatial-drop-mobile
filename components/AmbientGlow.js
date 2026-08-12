import React from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect, Circle } from 'react-native-svg';
import { COLORS } from '../constants/colors';

const { width, height } = Dimensions.get('window');

// NEW — intensity prop, defaults to the original subtle values so the intro
// screen (and anywhere else this is already dropped in) is untouched.
// SettingsMenu passes a stronger value — with the near-black avatar card now
// covering most of the middle of the screen, the corners are the only place
// this can actually read, so it needs more presence there than the default.
export const AmbientGlow = ({ cyanOpacity = 0.12, cherryOpacity = 0.15 }) => {
  return (
    // zIndex: -2 ensures it sits behind the Starfield, Matrix, and all UI
    <Svg style={[StyleSheet.absoluteFill, { zIndex: -2 }]} pointerEvents="none">
      <Defs>
        {/* Soft Cyan Glow - Top Left */}
        <RadialGradient id="glowCyan" cx="0%" cy="0%" r="80%">
          <Stop offset="0%" stopColor={COLORS.cyan} stopOpacity={cyanOpacity} />
          <Stop offset="100%" stopColor={COLORS.bg} stopOpacity="0" />
        </RadialGradient>

        {/* Deep Cherry Glow - Bottom Right */}
        <RadialGradient id="glowCherry" cx="100%" cy="100%" r="85%">
          <Stop offset="0%" stopColor={COLORS.amber} stopOpacity={cherryOpacity} />
          <Stop offset="100%" stopColor={COLORS.bg} stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* 1. Paint the solid graphite base */}
      <Rect x="0" y="0" width={width} height={height} fill={COLORS.bg} />

      {/* 2. Layer the glowing gradient orbs on top */}
      <Circle cx="0" cy="0" r={width} fill="url(#glowCyan)" />
      <Circle cx={width} cy={height} r={width * 1.2} fill="url(#glowCherry)" />
    </Svg>
  );
};