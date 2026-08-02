import React from 'react';
import { Animated, Text } from 'react-native';
import { COLORS } from '../constants/colors';
import { ANCHOR_X, ANCHOR_Y } from '../constants/layout';
import { hashToUnit } from '../utils/hash';

// small ghost tags representing the currently loaded files, stacked loosely
// above the anchor. idle: sits still so you can see what's armed. dispatching:
// each tag lifts, wobbles, and fades out on its own stagger — driven entirely
// off the shared boomAnim value so no extra Animated.Value per file is needed.
export const DispatchManifest = ({ files, boomAnim, dispatching }) => {
  return (
    <>
      {files.map((file, i) => {
        const label = file.name || 'file';
        const seed = hashToUnit(label + i); // stable per-tag jitter, never re-rolls on render
        const xOffset = (seed - 0.5) * 56; // tight horizontal fan — a cluster, not a scatter
        const baseTop = ANCHOR_Y - 150 - i * 26; // loose vertical stack, most recent on top

        // stagger this tag's exit within the shared 0–1 boom window,
        // so tags leave one at a time instead of all at once
        const start = Math.min(i * 0.12, 0.6);
        const end = Math.min(start + 0.4, 1);

        const opacity = dispatching
          ? boomAnim.interpolate({
              inputRange: [0, start, end, 1],
              outputRange: [1, 1, 0, 0]
            })
          : 1;

        const translateY = dispatching
          ? boomAnim.interpolate({
              inputRange: [0, start, end, 1],
              outputRange: [0, 0, -74, -74]
            })
          : 0;

        const rotate = dispatching
          ? boomAnim.interpolate({
              inputRange: [0, start, end, 1],
              outputRange: ['0deg', '0deg', `${(seed - 0.5) * 16}deg`, `${(seed - 0.5) * 16}deg`]
            })
          : '0deg';

        return (
          <Animated.View
            key={`tag-${label}-${i}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: ANCHOR_X + xOffset - 60,
              top: baseTop,
              width: 120,
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: COLORS.idkman,
              backgroundColor: 'rgba(217, 154, 91, 0.06)',
              alignItems: 'center',
              opacity,
              transform: [{ translateY }, { rotate }]
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontFamily: 'Pliant',
                fontSize: 9,
                letterSpacing: 0.5,
                color: COLORS.text,
                opacity: 0.85
              }}
            >
              {label.length > 14 ? `${label.slice(0, 12)}…` : label}
            </Text>
          </Animated.View>
        );
      })}
    </>
  );
};