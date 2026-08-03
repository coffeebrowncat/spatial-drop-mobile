import React, { useState, useEffect } from 'react';
import { Circle } from 'react-native-svg';
import { AnimatedCircle, AnimatedPath } from './AnimatedPrimitives';
import { COLORS } from '../constants/colors';
import { ANCHOR_X, ANCHOR_Y } from '../constants/layout';
import { hashToUnit, radiusForDevice } from '../utils/hash';
import { scatterPositionFor, sampleBezier } from '../utils/geometry';
import { SWEEP_PERIOD_MS } from './SquigglyOrb'; // just the timing constant, not a render dependency — importing it (instead of hardcoding the same number twice) is what guarantees the anchor's sweep and this file's peer-ping detection can never drift out of sync

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

// owns its own animation clock (same rAF-loop technique as SquigglyOrb) so
// the whole field can drift continuously without re-rendering the rest of
// the app every frame.
//
// no persistent connecting line — a targeted/incoming peer just glows, no
// line, while merely selected. a line only ever gets drawn once: the
// strike, fired the instant a send happens. important detail: sendFiles()
// clears targetId the moment the strike starts, so the node itself snaps
// back to its still, non-orbiting resting position right away — the
// strike has to target that SAME static position (positionFor(..., false)),
// not the orbiting one, or the beam ends up aiming at where the node used
// to be wobbling instead of where it actually is now.
export const PeerConstellation = ({
  peers,
  getSlotFor,
  getPeerScale,
  getPeerBreathe,
  targetId,
  incomingFromId,
  pulseAnim,
  boomAnim,
  strikeTargets,
  pin
}) => {
  const [time, setTime] = useState(0);

  useEffect(() => {
    let id;
    const startTime = Date.now();
    const loop = () => {
      setTime((Date.now() - startTime) / 1000);
      id = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(id);
  }, []);

  const positionFor = (deviceId, isActive) => {
    const base = scatterPositionFor(getSlotFor(deviceId), peers.length, pin);
    if (!isActive) return base;

    const radiusSeed = hashToUnit(deviceId + 'orbitR');
    const speedSeed = hashToUnit(deviceId + 'orbitSpeed');
    const phaseSeed = hashToUnit(deviceId + 'orbitPhase');
    const orbitRadius = 10 + radiusSeed * 12;
    const period = 7 + speedSeed * 9;
    const angle = (time / period) * Math.PI * 2 + phaseSeed * Math.PI * 2;

    return {
      x: base.x + Math.cos(angle) * orbitRadius,
      y: base.y + Math.sin(angle) * orbitRadius * 0.7
    };
  };

  const stateFor = (deviceId) => {
    if (targetId === deviceId) return 'outgoing';
    if (incomingFromId === deviceId) return 'incoming';
    return 'idle';
  };

  const colorFor = (state) => {
    if (state === 'outgoing') return COLORS.amber;
    if (state === 'incoming') return COLORS.incomingGlow;
    return COLORS.mutedText;
  };

  const gradientFor = (state) => {
    if (state === 'outgoing') return 'url(#nodeGlowOutgoing)';
    if (state === 'incoming') return 'url(#nodeGlowIncoming)';
    return 'url(#nodeGlowIdle)';
  };

  return (
    <>
      {peers.map((peer) => {
        const state = stateFor(peer.deviceId);
        const isActive = state !== 'idle';
        const pos = positionFor(peer.deviceId, isActive);
        const scale = getPeerScale(peer.deviceId);
        const breathe = getPeerBreathe(peer.deviceId);
        const color = colorFor(state);
        const baseRadius = radiusForDevice(peer.deviceId);

        // THE SWEEP PING — the radar sweep drawn on the anchor (SquigglyOrb)
        // completes a lap every SWEEP_PERIOD_MS. this recomputes, purely
        // from wall-clock time, whether that sweep line is currently
        // pointing at this peer, and if so, how close to dead-center —
        // both components read Date.now() independently, so they never
        // need to be wired together to stay in sync. the payoff: peers
        // visibly flash as the sweep passes over them, like they're
        // actually being detected in real time, not just sitting there
        // while an unrelated animation spins nearby.
        const sweepAngle = ((Date.now() % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS) * 360;
        const peerAngle = angleFromAnchor(pos.x, pos.y);
        let angleDiff = Math.abs(peerAngle - sweepAngle);
        if (angleDiff > 180) angleDiff = 360 - angleDiff;
        const pingProximity =
          angleDiff < PING_WINDOW_DEG ? Math.pow(1 - angleDiff / PING_WINDOW_DEG, 2) : 0;

        return (
          <React.Fragment key={peer.deviceId}>
            <AnimatedCircle
              cx={pos.x}
              cy={pos.y}
              r={scale.interpolate({ inputRange: [0, 1], outputRange: [0, baseRadius * 3] })}
              fill={gradientFor(state)}
              opacity={
                isActive
                  ? breathe.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] })
                  : 0.45
              }
            />
            {state === 'outgoing' && (
              <AnimatedCircle
                cx={pos.x}
                cy={pos.y}
                r={baseRadius + 14}
                fill="none"
                stroke={COLORS.amber}
                strokeWidth={1}
                opacity={0.9}
              />
            )}
            {!isActive && (
              // faint idle ring, even when a peer isn't targeted/sending —
              // ties every node to the same instrument-dial language as the
              // anchor's bezel/gauge rings, instead of idle nodes just being
              // a plain dot with nothing going on
              <AnimatedCircle
                cx={pos.x}
                cy={pos.y}
                r={baseRadius + 9}
                fill="none"
                stroke={color}
                strokeWidth={1}
                opacity={0.3}
              />
            )}
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
            <AnimatedCircle
              cx={pos.x}
              cy={pos.y}
              r={scale.interpolate({ inputRange: [0, 1], outputRange: [0, baseRadius] })}
              fill={color}
            />
          </React.Fragment>
        );
      })}

      {peers.map((peer) => {
        if (!strikeTargets || !strikeTargets.includes(peer.deviceId)) {
          return null;
        }
        const pos = positionFor(peer.deviceId, false);
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