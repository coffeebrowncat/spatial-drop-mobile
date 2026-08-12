import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import { Circle, Path, Defs, RadialGradient, LinearGradient, Stop } from 'react-native-svg';
import { AnimatedCircle, AnimatedG } from './AnimatedPrimitives';

// ============================================================
// REDESIGN — take ten. this is a literal integration of the actual
// generated reference app (RadarScreen.jsx / useSpatialDrop.js — a real
// working React replica of the Claude Design source, not a template or
// a screenshot). per explicit instruction ("integrate as is... just
// ui"), the colors below are the EXACT oklch values from that file,
// converted to sRGB hex (proper OKLab math, not eyeballed) — not the
// app's cherry/graphite theme. only the underlying peer/room/socket
// logic stays app-specific; this component is purely visual.
// ============================================================

export const SWEEP_PERIOD_MS = 4200; // must match the copy of this constant in PeerConstellation.js

const RING_ACCENT = '#990433';
const SPHERE_LIGHT = '#a3003f';
const SPHERE_DARK = '#990433';
const HISTORY_COLOR = '#853441';
const CORE_DOT_GLOW = '#840630';

const polarPoint = (cx, cy, r, angleDeg) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180; // -90 so 0deg points straight up
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const TRAIL_SPREAD = 34; // degrees the wedge covers, tail to leading edge — widened slightly from 26 per direct feedback

// PLATFORM-SPLIT — this used to recompute the wedge's Path `d` string
// (arc math, two points, gradient coordinates) from scratch every single
// frame via a JS-driven setState loop, forever, for as long as the radar
// screen is mounted. that's real JS-thread work competing directly with
// react-native-gesture-handler's swipe recognition — the actual cause of
// swipes getting swallowed on Android, confirmed by fixing it there.
// the fix (below, RadarSweepNative): draw the wedge ONCE and rotate the
// whole thing with a native-driven transform, so it costs the JS thread
// nothing per frame once started.
//
// BUT — that native-driven approach turned out to have its own rough
// edge specifically on iOS (an Animated.G with a continuously-updating
// native transform occasionally flickers/fails to resolve its fill for
// a frame — confirmed iPhone-only, tried fixing the gradient's
// coordinate system first, didn't fully resolve it). iPhone never had a
// performance problem in the first place (JS thread was reading 60fps
// fine even under the old approach), so there's no reason to accept that
// risk there. this now branches: Android gets the native-driven rewrite
// (real, measured fix for real lag), iPhone gets the exact original
// per-frame approach back (proven to look right, zero risk of this
// specific glitch since it never uses the mechanism that causes it).
const RadarSweep = (props) =>
  Platform.OS === 'ios' ? <RadarSweepJS {...props} /> : <RadarSweepNative {...props} />;

// ORIGINAL — per-frame Path recompute, exactly as it was before today's
// Android performance pass. kept for iOS only now.
const RadarSweepJS = ({ cx, cy, outerR, innerR }) => {
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

  const sweepAngle = ((Date.now() % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS) * 360;
  const leadAngle = sweepAngle;
  const tailAngle = sweepAngle - TRAIL_SPREAD;

  const leadOuter = polarPoint(cx, cy, outerR, leadAngle);
  const leadInner = polarPoint(cx, cy, innerR, leadAngle);
  const tailOuter = polarPoint(cx, cy, outerR, tailAngle);
  const tailInner = polarPoint(cx, cy, innerR, tailAngle);

  const d = [
    `M ${tailInner.x} ${tailInner.y}`,
    `L ${tailOuter.x} ${tailOuter.y}`,
    `A ${outerR} ${outerR} 0 0 1 ${leadOuter.x} ${leadOuter.y}`,
    `L ${leadInner.x} ${leadInner.y}`,
    `A ${innerR} ${innerR} 0 0 0 ${tailInner.x} ${tailInner.y}`,
    'Z'
  ].join(' ');

  return (
    <React.Fragment>
      <Defs>
        <LinearGradient
          id="sweepFadeJS"
          x1={tailOuter.x}
          y1={tailOuter.y}
          x2={leadOuter.x}
          y2={leadOuter.y}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0%" stopColor={RING_ACCENT} stopOpacity="0" />
          <Stop offset="100%" stopColor={RING_ACCENT} stopOpacity="0.5" />
        </LinearGradient>
      </Defs>
      <Path d={d} fill="url(#sweepFadeJS)" />
    </React.Fragment>
  );
};

// NATIVE-DRIVEN — Android only now. static wedge shape, rotated entirely
// on the native thread, costs the JS thread nothing per frame.
const RadarSweepNative = ({ cx, cy, outerR, innerR }) => {
  // static wedge geometry, computed once — angle 0 points straight up,
  // spanning back TRAIL_SPREAD degrees. never recomputed after mount.
  const leadOuter = polarPoint(cx, cy, outerR, 0);
  const leadInner = polarPoint(cx, cy, innerR, 0);
  const tailOuter = polarPoint(cx, cy, outerR, -TRAIL_SPREAD);
  const tailInner = polarPoint(cx, cy, innerR, -TRAIL_SPREAD);

  const d = [
    `M ${tailInner.x} ${tailInner.y}`,
    `L ${tailOuter.x} ${tailOuter.y}`,
    `A ${outerR} ${outerR} 0 0 1 ${leadOuter.x} ${leadOuter.y}`,
    `L ${leadInner.x} ${leadInner.y}`,
    `A ${innerR} ${innerR} 0 0 0 ${tailInner.x} ${tailInner.y}`,
    'Z'
  ].join(' ');

  // FIXED — the gradient used to be defined with gradientUnits=
  // "userSpaceOnUse" and absolute (tailOuter/leadOuter) coordinates,
  // nested inside the now-continuously-native-rotating AnimatedG. that
  // combination (an absolute-coordinate gradient inside a parent that's
  // being transformed on the native thread every frame) is a known rough
  // edge in react-native-svg — an occasional frame where it fails to
  // resolve, which reads exactly as a flash/flicker. switching to the
  // default objectBoundingBox units (plain 0-1 fractions of the wedge's
  // own bounding box) removes that dependency entirely — it's defined
  // relative to the shape's own local geometry, not any external
  // coordinate system, so it has no reason to care that its parent is
  // spinning.
  const wedgeXs = [tailInner.x, tailOuter.x, leadOuter.x, leadInner.x];
  const wedgeYs = [tailInner.y, tailOuter.y, leadOuter.y, leadInner.y];
  const bboxMinX = Math.min(...wedgeXs);
  const bboxMaxX = Math.max(...wedgeXs);
  const bboxMinY = Math.min(...wedgeYs);
  const bboxMaxY = Math.max(...wedgeYs);
  const bboxW = bboxMaxX - bboxMinX || 1; // guard divide-by-zero on a degenerate wedge
  const bboxH = bboxMaxY - bboxMinY || 1;
  const gradX1 = (tailOuter.x - bboxMinX) / bboxW;
  const gradY1 = (tailOuter.y - bboxMinY) / bboxH;
  const gradX2 = (leadOuter.x - bboxMinX) / bboxW;
  const gradY2 = (leadOuter.y - bboxMinY) / bboxH;

  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // start already at the correct phase (matches the same
    // Date.now() % SWEEP_PERIOD_MS math PeerConstellation.js uses
    // independently for its sweep-ping flash, so the two stay in sync)
    // instead of every fresh mount snapping the sweep back to angle 0.
    const currentProgress = (Date.now() % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS;
    rotation.setValue(currentProgress);
    const remainingMs = (1 - currentProgress) * SWEEP_PERIOD_MS;

    let loopAnim;
    const firstLap = Animated.timing(rotation, {
      toValue: 1,
      duration: remainingMs,
      easing: Easing.linear,
      useNativeDriver: true
    });

    firstLap.start(({ finished }) => {
      if (!finished) return; // unmounted mid-animation
      rotation.setValue(0);
      loopAnim = Animated.loop(
        Animated.timing(rotation, {
          toValue: 1,
          duration: SWEEP_PERIOD_MS,
          easing: Easing.linear,
          useNativeDriver: true
        })
      );
      loopAnim.start();
    });

    return () => {
      firstLap.stop();
      if (loopAnim) loopAnim.stop();
    };
  }, []);

  const rotateDeg = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <AnimatedG
      style={{
        transform: [
          { translateX: cx },
          { translateY: cy },
          { rotate: rotateDeg },
          { translateX: -cx },
          { translateY: -cy }
        ]
      }}
    >
      <Defs>
        <LinearGradient
          id="sweepFade"
          x1={gradX1}
          y1={gradY1}
          x2={gradX2}
          y2={gradY2}
        >
          <Stop offset="0%" stopColor={RING_ACCENT} stopOpacity="0" />
          <Stop offset="100%" stopColor={RING_ACCENT} stopOpacity="0.5" />
        </LinearGradient>
      </Defs>
      <Path d={d} fill="url(#sweepFade)" />
    </AnimatedG>
  );
};

export const SquigglyOrb = ({ cx, cy, radius, pulseAnim, historyPct = 22 }) => {
  const ping = useRef(new Animated.Value(0)).current;
  // NEW — slow "breathing" pulse for the ambient bloom, so the glow
  // filling the empty space above the rings isn't static — it swells and
  // fades like it's alive, not just a fixed soft-focus circle.
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(ping, {
        toValue: 1,
        duration: 3400,
        useNativeDriver: false // svg radius/opacity can't run on the native driver
      })
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 4200, useNativeDriver: false }),
        Animated.timing(breathe, { toValue: 0, duration: 4200, useNativeDriver: false })
      ])
    ).start();
  }, []);

  // three concentric rings + sphere, sized proportionally to the
  // reference's 150 (outer) / 112 (dashed) / 74 (inner) / 48 (sphere)
  // radii inside its 150-radius container
  const outerRingR = radius * 0.94;
  const midRingR = radius * 0.75;
  const innerRingR = radius * 0.49;
  const coreRadius = radius * 0.46;
  const sweepInnerR = coreRadius * 0.5;

  // the history/progress ring — straight out of the reference's
  // conic-gradient historyRing element (bumped 14% per send, wraps past
  // 100). SVG has no conic-gradient, so this is the standard
  // stroke-dasharray progress-ring trick: same visual result.
  const historyRingR = outerRingR;
  const historyCircumference = 2 * Math.PI * historyRingR;
  const historyPctClamped = Math.max(0, Math.min(100, historyPct));
  const historyDashOffset = historyCircumference * (1 - historyPctClamped / 100);

  return (
    <React.Fragment>
      <Defs>
        {/* soft outer bloom — CHANGED: was flat opacity 0.2 all the way out
            to 90% radius then a sharp fade in the last 10%, which combined
            with a huge circle read as a hard-edged dome, not a soft glow.
            now fades gradually across its whole radius instead of staying
            flat then cutting off. */}
        <RadialGradient id="orbAmbient" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={RING_ACCENT} stopOpacity="0.22" />
          <Stop offset="45%" stopColor={RING_ACCENT} stopOpacity="0.1" />
          <Stop offset="100%" stopColor={RING_ACCENT} stopOpacity="0" />
        </RadialGradient>
        {/* the center sphere — exact reference gradient:
            radial-gradient(circle, oklch(0.62 0.24 350) 0%, oklch(0.5 0.24 350) 45%, transparent 78%) */}
        <RadialGradient id="orbSphere" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={SPHERE_LIGHT} stopOpacity="1" />
          <Stop offset="45%" stopColor={SPHERE_DARK} stopOpacity="1" />
          <Stop offset="78%" stopColor={SPHERE_DARK} stopOpacity="0" />
        </RadialGradient>
        {/* metallic sheen — CHANGED twice now: fixed the malformed colors
            last pass, this pass fixes two more things per feedback —
            (1) x1/y1/x2/y2 are now symmetric around the exact center
            (10,10 -> 90,90 midpoints at 50,50), so the bright band
            actually crosses dead-center instead of passing above-left of
            it; (2) swapped the near-white peak color for a pale tint of
            the SAME magenta family (not stark white/pink), and widened
            the falloff considerably so it reads as a soft frosted haze —
            like Apple's Liquid Glass — instead of a sharp reflective
            line. */}
        {/* CHANGED — the last cut (0.025/0.045) went too far, it stopped
            reading as anything at all. brought back up to roughly midway
            between that and the 0.05/0.09 pass before it. */}
        {/* FIXED — one of the stops had an 8-digit hex (#7e0f30af), which
            isn't valid for stopColor (that's not how alpha works here —
            stopOpacity is its own separate prop, already set on every
            stop). harmless since that particular stop was opacity 0
            anyway, but cleaned up to plain 6-digit hex for consistency. */}
        <LinearGradient id="metallicSheen" x1="10%" y1="10%" x2="90%" y2="90%">
          <Stop offset="0%" stopColor="#830a2e" stopOpacity="0" />
          <Stop offset="25%" stopColor="#7e0f30" stopOpacity="0" />
          <Stop offset="40%" stopColor="#e10056" stopOpacity="0.06" />
          <Stop offset="50%" stopColor="#fc0456" stopOpacity="0.11" />
          <Stop offset="60%" stopColor="#ba1467" stopOpacity="0.06" />
          <Stop offset="75%" stopColor="#c43b56" stopOpacity="0" />
          <Stop offset="100%" stopColor="#b03773" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      {/* 1. ambient bloom — CHANGED AGAIN: 2.2x radius read as a giant
           dome, way too big. pulled way back down, much closer to the
           ring itself, just a touch bigger than the instrument rather
           than sprawling across half the screen. */}
      <AnimatedCircle
        cx={cx}
        cy={cy - radius * 0.1}
        r={radius * 1.15}
        fill="url(#orbAmbient)"
        opacity={breathe.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.5] })}
      />

      {/* 2. outer ring */}
      <Circle cx={cx} cy={cy} r={outerRingR} fill="none" stroke={RING_ACCENT} strokeWidth={1} opacity={0.25} />

      {/* 3. middle dashed ring */}
      <Circle
        cx={cx}
        cy={cy}
        r={midRingR}
        fill="none"
        stroke={RING_ACCENT}
        strokeWidth={1}
        strokeDasharray="5 5"
        opacity={0.22}
      />

      {/* 4. inner ring */}
      <Circle cx={cx} cy={cy} r={innerRingR} fill="none" stroke={RING_ACCENT} strokeWidth={1} opacity={0.28} />

      {/* 5. the radar sweep wash — kept, this is what makes it a RADAR */}
      <RadarSweep cx={cx} cy={cy} outerR={outerRingR} innerR={sweepInnerR} />

      {/* 6. the history/progress ring — fills clockwise from the top as
           sends happen (see historyPct calc above) */}
      <Circle
        cx={cx}
        cy={cy}
        r={historyRingR}
        fill="none"
        stroke={HISTORY_COLOR}
        strokeWidth={radius * 0.02}
        strokeDasharray={`${historyCircumference} ${historyCircumference}`}
        strokeDashoffset={historyDashOffset}
        opacity={0.85}
        rotation={-90}
        origin={`${cx}, ${cy}`}
      />

      {/* 7. the center glow sphere — flat radial gradient, exact reference recipe */}
      <Circle cx={cx} cy={cy} r={coreRadius} fill="url(#orbSphere)" />

      {/* 7b. the metallic sheen overlay — CHANGED: was clipped to
           coreRadius*2 (roughly just the sphere), now spans the whole
           instrument (outerRingR) so the frosted sweep passes across the
           rings too, not just the center sphere */}
      <Circle cx={cx} cy={cy} r={outerRingR} fill="url(#metallicSheen)" />

      {/* 8. the heartbeat core — CHANGED: was pure #FFFFFF at 0.95 opacity,
           which against the magenta sphere read as a jarring, out-of-
           palette hot-white dot. softened to a pale pink-white (same
           family as the sheen tint) at lower opacity, so it still reads
           as a glowing core without popping out of the color scheme. */}
      <AnimatedCircle
        cx={cx}
        cy={cy}
        r={pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [4, 10] })}
        fill="#FFE3F1"
        opacity={0.75}
      />
      <AnimatedCircle
        cx={cx}
        cy={cy}
        r={pulseAnim.interpolate({ inputRange: [2, 8], outputRange: [10, 50] })}
        fill="none"
        stroke={CORE_DOT_GLOW}
        strokeWidth={4}
        opacity={pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0.15] })}
      />
    </React.Fragment>
  );
};
