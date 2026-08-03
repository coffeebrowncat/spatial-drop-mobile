import React, { useRef, useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { Circle, Path, Defs, RadialGradient, Stop } from 'react-native-svg';
import { AnimatedCircle } from './AnimatedPrimitives';

// SWEEP_PERIOD_MS must match the copy of this same constant in
// PeerConstellation.js — that's what lets the sweep line and the peer
// "detection ping" stay in sync without the two components needing to
// share any props or state. both just read Date.now() independently.
export const SWEEP_PERIOD_MS = 4200;

// the anchor's visual, take seven. take six's "squash the whole dial into
// an ellipse for a 3D tilt" read as fat/flattened instead of tilted — a
// uniform vertical squash with no perspective/shading depth just makes a
// wide oval, it doesn't actually sell depth on its own. reverted back to
// a true circle. the sweep stays dialed back from take five (fewer,
// thinner, dimmer trail lines) since that part landed fine.
const polarPoint = (cx, cy, r, angleDeg) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180; // -90 so 0deg points straight up
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const describeArc = (cx, cy, r, startDeg, endDeg) => {
  const start = polarPoint(cx, cy, r, endDeg);
  const end = polarPoint(cx, cy, r, startDeg);
  const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
};

const TRAIL_COUNT = 6;
const TRAIL_SPREAD = 30;

export const SquigglyOrb = ({ cx, cy, radius, color, pulseAnim }) => {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const dashRot = useRef(new Animated.Value(0)).current;
  const dashRot2 = useRef(new Animated.Value(0)).current;

  const [, forceTick] = useState(0);
  useEffect(() => {
    let id;
    const loop = () => {
      forceTick((n) => (n + 1) % 1000000);
      id = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.timing(ring1, {
        toValue: 1,
        duration: 3400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false
      })
    ).start();

    const staggerTimer = setTimeout(() => {
      Animated.loop(
        Animated.timing(ring2, {
          toValue: 1,
          duration: 3400,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false
        })
      ).start();
    }, 1700);

    Animated.loop(
      Animated.timing(dashRot, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: false
      })
    ).start();

    Animated.loop(
      Animated.timing(dashRot2, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: false
      })
    ).start();

    return () => clearTimeout(staggerTimer);
  }, []);

  const bezelRadius = radius * 0.94;
  const gaugeRadius = radius * 0.82;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const outerRingRadius = radius * 0.62;
  const outerCircumference = 2 * Math.PI * outerRingRadius;
  const innerRingRadius = radius * 0.42;
  const innerCircumference = 2 * Math.PI * innerRingRadius;
  const coreRadius = radius * 0.34;

  const sweepAngle = ((Date.now() % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS) * 360;
  const sweepInnerR = coreRadius * 0.9;

  return (
    <React.Fragment>
      <Defs>
        <RadialGradient id="orbAmbient" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <Stop offset="100%" stopColor={color} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="orbCore" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={color} stopOpacity="0.95" />
          <Stop offset="55%" stopColor={color} stopOpacity="0.5" />
          <Stop offset="100%" stopColor={color} stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* 1. ambient bloom */}
      <Circle cx={cx} cy={cy} r={radius} fill="url(#orbAmbient)" />

      {/* 2. the dark bezel housing */}
      <Circle cx={cx} cy={cy} r={bezelRadius} fill="#0A0A0A" opacity={0.78} />
      <Circle cx={cx} cy={cy} r={bezelRadius} fill="none" stroke={color} strokeWidth={1.5} opacity={0.55} />

      {/* 3. static tick-mark gauge ring */}
      <Circle
        cx={cx}
        cy={cy}
        r={gaugeRadius}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        opacity={0.4}
        strokeDasharray={[gaugeCircumference * 0.006, gaugeCircumference * 0.016]}
      />

      {/* 4. one lit accent arc */}
      <Path
        d={describeArc(cx, cy, gaugeRadius, 205, 262)}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
        opacity={0.95}
      />

      {/* 5 & 6. two independently rotating dashed rings */}
      <AnimatedCircle
        cx={cx}
        cy={cy}
        r={outerRingRadius}
        fill="none"
        stroke={color}
        strokeWidth={1}
        opacity={0.4}
        strokeDasharray={[outerCircumference * 0.03, outerCircumference * 0.05]}
        strokeDashoffset={dashRot.interpolate({ inputRange: [0, 1], outputRange: [0, -outerCircumference] })}
      />
      <AnimatedCircle
        cx={cx}
        cy={cy}
        r={innerRingRadius}
        fill="none"
        stroke={color}
        strokeWidth={1}
        opacity={0.45}
        strokeDasharray={[innerCircumference * 0.05, innerCircumference * 0.08]}
        strokeDashoffset={dashRot2.interpolate({ inputRange: [0, 1], outputRange: [0, innerCircumference] })}
      />

      {/* 7. THE RADAR SWEEP — fewer, thinner, dimmer echoes than the first pass */}
      {Array.from({ length: TRAIL_COUNT }, (_, i) => {
        const offset = (i / (TRAIL_COUNT - 1)) * TRAIL_SPREAD;
        const angle = sweepAngle - offset;
        const p = polarPoint(cx, cy, bezelRadius, angle);
        const inner = polarPoint(cx, cy, sweepInnerR, angle);
        const fade = 1 - i / (TRAIL_COUNT - 1);
        return (
          <Path
            key={`sweep-${i}`}
            d={`M ${inner.x} ${inner.y} L ${p.x} ${p.y}`}
            stroke={i === 0 ? '#F5E4C8' : color}
            strokeWidth={i === 0 ? 1.5 : 1}
            strokeLinecap="round"
            opacity={fade * fade * 0.5}
          />
        );
      })}

      {/* 8. the contained core light */}
      <Circle cx={cx} cy={cy} r={coreRadius} fill="url(#orbCore)" />

      {/* 9. two staggered sonar pings */}
      <AnimatedCircle
        cx={cx}
        cy={cy}
        r={ring1.interpolate({ inputRange: [0, 1], outputRange: [coreRadius, bezelRadius] })}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        opacity={ring1.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] })}
      />
      <AnimatedCircle
        cx={cx}
        cy={cy}
        r={ring2.interpolate({ inputRange: [0, 1], outputRange: [coreRadius, bezelRadius] })}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        opacity={ring2.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] })}
      />

      {/* 10. specular glint riding the bezel rim */}
      <Path
        d={describeArc(cx, cy, bezelRadius, -34, -4)}
        stroke="#FFFFFF"
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
        opacity={0.5}
      />

      {/* 11. the heartbeat core dot */}
      <AnimatedCircle
        cx={cx}
        cy={cy}
        r={pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [3, 9] })}
        fill={color}
        opacity={0.95}
      />
    </React.Fragment>
  );
};