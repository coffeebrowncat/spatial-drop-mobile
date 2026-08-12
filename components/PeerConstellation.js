import React, { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { Circle, Ellipse } from 'react-native-svg';
import { AnimatedCircle, AnimatedPath } from './AnimatedPrimitives';
import { COLORS } from '../constants/colors';
import { ANCHOR_X, ANCHOR_Y } from '../constants/layout';
import { hashToUnit, radiusForDevice } from '../utils/hash';
import { scatterPositionFor, sampleBezier } from '../utils/geometry';
import { SWEEP_PERIOD_MS } from './SquigglyOrb'; // just the timing constant, not a render dependency — importing it (instead of hardcoding the same number twice) is what guarantees the anchor's sweep and this file's peer-ping detection can never drift out of sync

// REDESIGN, round 4 — went sphere -> ringed planet with a wide separate
// ring + filled gradient body + doodle squiggle -> a minimal monoline
// mark (ring + circle outline, both centered, plus a small accent dot)
// -> current: same two outlines, dot removed (didn't like it) and the
// idle line color deepened (was too pale). just two centered, unfilled
// outline shapes now — nothing else. underlying peer state logic
// (stateFor/gradientFor, targetId/incomingFromId, orbit motion,
// sweep-ping detection) is unchanged, as it has been through every round.
const lineColorFor = (state) => {
  if (state === 'outgoing') return COLORS.amber;
  if (state === 'incoming') return COLORS.incomingGlow;
  // CHANGED — this used to hardcode its own '#c8123f' literal here,
  // duplicating (and one step removed from) COLORS.amber. every other
  // screen's accent now matches THIS exact value on purpose (see
  // constants/colors.js), so reading COLORS.amber directly closes the
  // loop — the "source of truth" crimson is now genuinely one value,
  // not two identical-looking ones that could drift apart again later.
  return COLORS.amber;
};

// how wide (in degrees, either side) the sweep's "detection cone" is —
// a peer only pings when the sweep line is within this many degrees of
// its angle from the anchor
const PING_WINDOW_DEG = 20;

// angle (in the same "0 = up, clockwise" convention SquigglyOrb draws its
// sweep in) from the anchor to an arbitrary point
const angleFromAnchor = (x, y) => {
  const dx = x - ANCHOR_X;
  const dy = y - ANCHOR_Y;
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
};

// like your existing branchPathFor in geometry.js, but guarantees a minimum
// bow so the strike never coincidentally reads as a dead-straight line —
// some device ids just hash close to a flat bend. kept local to this file
// rather than changing branchPathFor itself, since that's shared.
const strikeBeamFor = (x1, y1, x2, y2, deviceId) => {
  const seed = hashToUnit(deviceId + 'bend');
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const rawBend = (seed - 0.5) * len * 0.32;
  const minBend = len * 0.1;
  const bend = (rawBend < 0 ? -1 : 1) * Math.max(Math.abs(rawBend), minBend);
  const cx = midX + nx * bend;
  const cy = midY + ny * bend;
  return { d: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`, controlX: cx, controlY: cy };
};

// pure, no component state — the peer's RESTING position, same for
// everyone regardless of whether they're active. used both as the
// fallback inside PeerNode (isActive === false) and directly by the
// strike-beam loop below, which always targets this static position
// (never the orbiting one — see the comment on that loop for why).
const basePosition = (deviceId, peers, pin, getSlotFor) =>
  scatterPositionFor(getSlotFor(deviceId), peers.length, pin);

// CHANGED — targetId (single id or null) -> targetIds (array). an empty
// array behaves exactly like the old null did (nobody's "outgoing" yet).
const stateFor = (deviceId, targetIds, incomingFromId) => {
  if (targetIds && targetIds.includes(deviceId)) return 'outgoing';
  if (incomingFromId === deviceId) return 'incoming';
  return 'idle';
};

const gradientFor = (state) => {
  if (state === 'outgoing') return 'url(#nodeGlowOutgoing)';
  if (state === 'incoming') return 'url(#nodeGlowIncoming)';
  return 'url(#nodeGlowIdle)';
};

// NEW — this is the actual fix for the Android FPS complaint scaling with
// room size. ALL of this used to live inline inside PeerConstellation's
// peers.map(), driven by ONE shared `time` state ticking via
// requestAnimationFrame in the PARENT component. that meant every peer,
// every single frame, forced the ENTIRE peers array to re-render and
// re-diff together as one big batch — an idle peer sitting perfectly
// still still got recomputed and re-rendered 60 times a second purely
// because the sweep-ping check needs wall-clock time for EVERYONE, and
// react had no way to know that most of a given frame's work wasn't
// actually changing anything visible. same root cause as SquigglyOrb's
// sweep trail, just worse here because the cost scales directly with how
// many people are in the room — exactly the scenario a live demo with
// several people joining at once would hit hardest.
//
// isolating each peer into its own component with its OWN local clock
// means react only ever has to re-render the ONE peer whose visuals
// actually depend on that tick, as an independent, isolated subtree —
// everyone else's fragment sits untouched until their own props (scale,
// breathe, targetId, incomingFromId) genuinely change via a real event.
const PeerNode = ({ peer, peers, getSlotFor, getPeerScale, getPeerBreathe, targetIds, incomingFromId, pin }) => {
  const [time, setTime] = useState(0);

  useEffect(() => {
    let id;
    const startTime = Date.now();
    let lastUpdate = 0;
    // THROTTLED — every peer runs its OWN copy of this loop (see the
    // comment above this component), so a room with 3-4 people was
    // forcing 3-4 full re-renders every single frame, forever, on top of
    // the radar sweep doing the same. all of that competes with
    // react-native-gesture-handler's swipe recognition on the JS thread —
    // capping actual updates to ~24fps on Android (still smooth for
    // orbiting motion and the sweep-ping flash) gives swipes real room to
    // get recognized. iOS keeps full 60fps.
    // PUSHED FURTHER — same reasoning as SquigglyOrb.js's sweep loop:
    // 42ms (~24fps) measured 14-24fps UI thread with real stutters on
    // actual low-end Android hardware, still not enough headroom for the
    // swipe gesture to get recognized reliably. ~15fps is still smooth
    // for orbit motion and the sweep-ping flash.
    const TICK_INTERVAL_MS = Platform.OS === 'android' ? 66 : 0;
    const loop = () => {
      const now = Date.now();
      if (now - lastUpdate >= TICK_INTERVAL_MS) {
        lastUpdate = now;
        setTime((now - startTime) / 1000);
      }
      id = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(id);
  }, []);

  const state = stateFor(peer.deviceId, targetIds, incomingFromId);
  const isActive = state !== 'idle';

  const pos = (() => {
    const base = basePosition(peer.deviceId, peers, pin, getSlotFor);
    if (!isActive) return base;

    const radiusSeed = hashToUnit(peer.deviceId + 'orbitR');
    const speedSeed = hashToUnit(peer.deviceId + 'orbitSpeed');
    const phaseSeed = hashToUnit(peer.deviceId + 'orbitPhase');
    const orbitRadius = 10 + radiusSeed * 12;
    const period = 7 + speedSeed * 9;
    const angle = (time / period) * Math.PI * 2 + phaseSeed * Math.PI * 2;

    return {
      x: base.x + Math.cos(angle) * orbitRadius,
      y: base.y + Math.sin(angle) * orbitRadius * 0.7
    };
  })();

  const scale = getPeerScale(peer.deviceId);
  const breathe = getPeerBreathe(peer.deviceId);
  const baseRadius = radiusForDevice(peer.deviceId);

  // THE SWEEP PING — the radar sweep drawn on the anchor (SquigglyOrb)
  // completes a lap every SWEEP_PERIOD_MS. this recomputes, purely from
  // wall-clock time, whether that sweep line is currently pointing at
  // this peer, and if so, how close to dead-center — both components
  // read Date.now() independently, so they never need to be wired
  // together to stay in sync. the payoff: peers visibly flash as the
  // sweep passes over them, like they're actually being detected in
  // real time, not just sitting there while an unrelated animation
  // spins nearby.
  const sweepAngle = ((Date.now() % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS) * 360;
  const peerAngle = angleFromAnchor(pos.x, pos.y);
  let angleDiff = Math.abs(peerAngle - sweepAngle);
  if (angleDiff > 180) angleDiff = 360 - angleDiff;
  const pingProximity =
    angleDiff < PING_WINDOW_DEG ? Math.pow(1 - angleDiff / PING_WINDOW_DEG, 2) : 0;

  return (
    <React.Fragment>
      {/* ambient glow behind the planet — same gradientFor(state) used
          before the redesign, unchanged */}
      <AnimatedCircle
        cx={pos.x}
        cy={pos.y}
        r={scale.interpolate({ inputRange: [0, 1], outputRange: [0, baseRadius * 1.7] })}
        fill={gradientFor(state)}
        opacity={
          isActive
            ? breathe.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] })
            : 0.55
        }
      />
      {pingProximity > 0 && (
        // the sweep-detection flash — bright white, briefly visible
        // only while the anchor's radar sweep is pointing at this
        // peer, radius/opacity both driven by how dead-center the
        // sweep currently is
        <Circle
          cx={pos.x}
          cy={pos.y}
          r={baseRadius + 6 + pingProximity * 18}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={1.5}
          opacity={pingProximity * 0.85}
        />
      )}

      {/* CHANGED — 1.15x/0.85x was overcorrected: barely elliptical, so it
          just read as a second circle stacked on the first ("tf is
          thos"), not a ring at all. the actual fix needed was CENTERING
          (which this already had) + making the body unfilled so the
          ring's middle stretch is visible crossing through it, not
          proportions this close to a circle. widened back out so it
          protrudes clearly left/right like the reference, while staying
          centered on the body and fully unfilled so it still reads as
          crossing in front of AND behind, all the way across. */}
      <Ellipse
        cx={pos.x}
        cy={pos.y}
        rx={baseRadius * 1.6}
        ry={baseRadius * 0.4}
        transform={`rotate(-20 ${pos.x} ${pos.y})`}
        fill="none"
        stroke={lineColorFor(state)}
        strokeWidth={1.6}
        opacity={0.95}
      />
      <Circle cx={pos.x} cy={pos.y} r={baseRadius} fill="none" stroke={lineColorFor(state)} strokeWidth={1.8} opacity={0.95} />
      {/* REMOVED — the small filled accent dot ("shine"). direct
          feedback: didn't like it. mark is now just the two outlines,
          nothing else. */}
    </React.Fragment>
  );
};

// no persistent connecting line — a targeted/incoming peer just glows, no
// line, while merely selected. a line only ever gets drawn once: the
// strike, fired the instant a send happens. important detail: sendFiles()
// clears targetIds the moment the strike starts, so the node itself snaps
// back to its still, non-orbiting resting position right away — the
// strike has to target that SAME static position (basePosition), not the
// orbiting one, or the beam ends up aiming at where the node used to be
// wobbling instead of where it actually is now.
export const PeerConstellation = ({
  peers,
  getSlotFor,
  getPeerScale,
  getPeerBreathe,
  targetIds,
  incomingFromId,
  pulseAnim,
  boomAnim,
  strikeTargets,
  pin
}) => {
  return (
    <>
      {peers.map((peer) => (
        <PeerNode
          key={peer.deviceId}
          peer={peer}
          peers={peers}
          getSlotFor={getSlotFor}
          getPeerScale={getPeerScale}
          getPeerBreathe={getPeerBreathe}
          targetIds={targetIds}
          incomingFromId={incomingFromId}
          pin={pin}
        />
      ))}

      {peers.map((peer) => {
        if (!strikeTargets || !strikeTargets.includes(peer.deviceId)) {
          return null;
        }
        const pos = basePosition(peer.deviceId, peers, pin, getSlotFor);
        const beam = strikeBeamFor(ANCHOR_X, ANCHOR_Y, pos.x, pos.y, peer.deviceId + 'strike');
        const approxLength = Math.max(Math.hypot(pos.x - ANCHOR_X, pos.y - ANCHOR_Y) * 1.1, 1);
        const bez = sampleBezier(
          { x: ANCHOR_X, y: ANCHOR_Y },
          { x: beam.controlX, y: beam.controlY },
          { x: pos.x, y: pos.y },
          24
        );

        return (
          <React.Fragment key={`strike-${peer.deviceId}`}>
            <AnimatedPath
              d={beam.d}
              stroke={COLORS.amber}
              strokeWidth={7}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={[approxLength, approxLength]}
              strokeDashoffset={boomAnim.interpolate({ inputRange: [0, 1], outputRange: [approxLength, 0] })}
              opacity={boomAnim.interpolate({ inputRange: [0, 0.05, 0.9, 1], outputRange: [0, 0.3, 0.3, 0] })}
            />
            <AnimatedPath
              d={beam.d}
              stroke={COLORS.amber}
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={[approxLength, approxLength]}
              strokeDashoffset={boomAnim.interpolate({ inputRange: [0, 1], outputRange: [approxLength, 0] })}
              opacity={boomAnim.interpolate({ inputRange: [0, 0.05, 0.9, 1], outputRange: [0, 1, 1, 0] })}
            />
            <AnimatedCircle
              cx={boomAnim.interpolate({ inputRange: bez.input, outputRange: bez.x })}
              cy={boomAnim.interpolate({ inputRange: bez.input, outputRange: bez.y })}
              r={9}
              fill={COLORS.amber}
              opacity={boomAnim.interpolate({ inputRange: [0, 0.05, 0.85, 0.95], outputRange: [0, 0.35, 0.35, 0] })}
            />
            <AnimatedCircle
              cx={boomAnim.interpolate({ inputRange: bez.input, outputRange: bez.x })}
              cy={boomAnim.interpolate({ inputRange: bez.input, outputRange: bez.y })}
              r={4}
              fill={COLORS.amber}
              opacity={boomAnim.interpolate({ inputRange: [0, 0.05, 0.85, 0.95], outputRange: [0, 1, 1, 0] })}
            />
            <AnimatedCircle
              cx={pos.x}
              cy={pos.y}
              r={boomAnim.interpolate({ inputRange: [0, 0.85, 0.94, 1], outputRange: [0, 0, 4, 26] })}
              fill={COLORS.amber}
              opacity={boomAnim.interpolate({ inputRange: [0, 0.85, 0.94, 1], outputRange: [0, 0, 0.85, 0] })}
            />
          </React.Fragment>
        );
      })}
    </>
  );
};