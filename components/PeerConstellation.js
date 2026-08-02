import React, { useState, useEffect } from 'react';
import { Circle } from 'react-native-svg';
import { AnimatedCircle, AnimatedPath } from './AnimatedPrimitives';
import { COLORS, NODE_TONES } from '../constants/colors';
import { ANCHOR_X, ANCHOR_Y } from '../constants/layout';
import { hashToUnit, toneIndexForDevice, radiusForDevice } from '../utils/hash';
import { scatterPositionFor, generateLightningPath } from '../utils/geometry';

// owns its own animation clock (same rAF-loop technique as SquigglyOrb) so
// the whole field can drift continuously without re-rendering the rest of
// the app every frame. everything peer-related lives in here — the ambient
// bolts, the nodes, AND the swipe-triggered strike — because the strike has
// to point at wherever a node's orbit currently has it, not its resting spot.
export const PeerConstellation = ({
  peers,
  getSlotFor,
  getPeerScale,
  getPeerBreathe,
  targetId,
  pulseAnim,
  boomAnim,
  strikeTargets // deviceIds currently being struck by an outgoing send
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

  // each node keeps its halton-assigned resting spot, but slowly circles it —
  // radius/speed/phase are all stable per device, so nobody's orbit ever resets
  // or looks the same as its neighbor's
  const orbitPositionFor = (deviceId) => {
    const base = scatterPositionFor(getSlotFor(deviceId));
    const radiusSeed = hashToUnit(deviceId + 'orbitR');
    const speedSeed = hashToUnit(deviceId + 'orbitSpeed');
    const phaseSeed = hashToUnit(deviceId + 'orbitPhase');

    const orbitRadius = 10 + radiusSeed * 12; // 10–22px — a wobble, not a wander
    const period = 7 + speedSeed * 9; // 7–16s per lap, unhurried
    const angle = (time / period) * Math.PI * 2 + phaseSeed * Math.PI * 2;

    return {
      x: base.x + Math.cos(angle) * orbitRadius,
      y: base.y + Math.sin(angle) * orbitRadius * 0.7 // slight ellipse reads more natural than a perfect circle
    };
  };

  return (
    <>
      {/* AMBIENT BOLTS — the resting constellation, recomputed each frame so they stay glued to the orbiting nodes */}
      {peers.map((peer) => {
        const pos = orbitPositionFor(peer.deviceId);
        const isTargeted = targetId === peer.deviceId;
        const toneIdx = toneIndexForDevice(peer.deviceId);
        const bolt = generateLightningPath(ANCHOR_X, ANCHOR_Y, pos.x, pos.y, peer.deviceId);

        return (
          <React.Fragment key={`bolt-${peer.deviceId}`}>
            <AnimatedPath
              d={bolt.d}
              stroke={isTargeted ? COLORS.amber : COLORS.text}
              strokeWidth={isTargeted ? 2 : 1}
              strokeLinejoin="miter"
              fill="none"
              opacity={isTargeted ? pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) : 0.15}
            />
            <Circle
              cx={bolt.midX}
              cy={bolt.midY}
              r={isTargeted ? 3 : 1.5}
              fill={isTargeted ? COLORS.amber : NODE_TONES[toneIdx]}
              opacity={isTargeted ? 1 : 0.4}
            />
          </React.Fragment>
        );
      })}

      {/* THE PEER NODES — orbiting halo + core, same visual language as before */}
      {peers.map((peer) => {
        const pos = orbitPositionFor(peer.deviceId);
        const scale = getPeerScale(peer.deviceId);
        const breathe = getPeerBreathe(peer.deviceId);
        const isTargeted = targetId === peer.deviceId;
        const toneIdx = toneIndexForDevice(peer.deviceId);
        const baseRadius = radiusForDevice(peer.deviceId);

        return (
          <React.Fragment key={peer.deviceId}>
            <AnimatedCircle
              cx={pos.x}
              cy={pos.y}
              r={scale.interpolate({ inputRange: [0, 1], outputRange: [0, baseRadius * 3] })}
              fill={`url(#nodeGlow${toneIdx})`}
              opacity={breathe.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] })}
            />
            {isTargeted && (
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
            <AnimatedCircle
              cx={pos.x}
              cy={pos.y}
              r={scale.interpolate({ inputRange: [0, 1], outputRange: [0, baseRadius] })}
              fill={isTargeted ? COLORS.amber : NODE_TONES[toneIdx]}
            />
          </React.Fragment>
        );
      })}

      {/* THE STRIKE — fires on send, draws itself from the anchor to each struck node,
          and ends exactly as it arrives (both driven by the same boomAnim, 0 to 1) */}
      {peers.map((peer) => {
        if (!strikeTargets || !strikeTargets.includes(peer.deviceId)) {
          return null;
        }
        const pos = orbitPositionFor(peer.deviceId);
        const bolt = generateLightningPath(ANCHOR_X, ANCHOR_Y, pos.x, pos.y, peer.deviceId + 'strike');
        const dashLength = Math.max(bolt.length, 1);

        return (
          <React.Fragment key={`strike-${peer.deviceId}`}>
            <AnimatedPath
              d={bolt.d}
              stroke={COLORS.amber}
              strokeWidth={2.5}
              strokeLinejoin="miter"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={[dashLength, dashLength]}
              strokeDashoffset={boomAnim.interpolate({ inputRange: [0, 1], outputRange: [dashLength, 0] })}
              opacity={boomAnim.interpolate({ inputRange: [0, 0.05, 0.9, 1], outputRange: [0, 1, 1, 0] })}
            />
            {/* impact flash — blooms right as the strike lands on the node */}
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