import React from 'react';
import { Animated, Text, View, Platform, StyleSheet, ScrollView } from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS } from '../constants/colors';
import { ANCHOR_X, ANCHOR_Y, windowWidth } from '../constants/layout';
import { hashToUnit } from '../utils/hash';

// CHANGED — was the reference's literal magenta (rgba(233,56,159,...) /
// #FFA3DB), which was never actually cherry — just the reference's own
// accent. swapped to the app's own cherry family (same RING_ACCENT/
// SPHERE_LIGHT used in SquigglyOrb.js) so the tray matches the rest of the
// redesigned radar screen instead of clashing with it.
const CHIP_ICON_BG = 'rgba(153, 4, 51, 0.25)'; // cherry RING_ACCENT (#990433) at 25%
const CHIP_ICON_TEXT = '#FF9DB4'; // light cherry tint, same family as SPHERE_LIGHT (#a3003f)
const CHIP_BG = 'rgba(28, 19, 19, 0.9)'; // oklch(0.2 0.015 25 / 0.9)
const CHIP_BORDER = 'rgba(186, 170, 166, 0.12)'; // oklch(0.75 0.02 30 / 0.12)
const CHIP_NAME_COLOR = '#EBE2E1'; // oklch(0.92 0.01 30)
const CHIP_SIZE_COLOR = 'rgba(186, 170, 166, 0.5)'; // oklch(0.75 0.02 30 / 0.5)
const GRAB_HANDLE_COLOR = 'rgba(186, 170, 166, 0.25)'; // oklch(0.75 0.02 30 / 0.25)

const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const kindForFile = (file) => {
  const name = file.name || '';
  const dot = name.lastIndexOf('.');
  if (dot > -1 && dot < name.length - 1) {
    return name.slice(dot + 1).toUpperCase().slice(0, 4);
  }
  if (file.mimeType) {
    if (file.mimeType.startsWith('image/')) return 'IMG';
    if (file.mimeType.startsWith('video/')) return 'VID';
  }
  return 'FILE';
};

// NEW — real blur riding inside an actively-transforming Animated.View
// (translateY + rotate + opacity, all firing at once during dispatch) is
// close to the worst-case combo for Android's compositor: it has to
// recompute the blur every single frame the tag is moving, on top of
// whatever the JS-driven radar animations are already costing. iOS
// handles this fine (native UIVisualEffectView, cheap to recomposite).
// swapping to a flat tinted View on Android specifically — no real blur,
// just a solid backing that reads close enough at a glance.
const Backing = Platform.OS === 'android' ? View : BlurView;
const backingProps = Platform.OS === 'android'
  ? { style: { backgroundColor: 'rgba(28, 26, 24, 0.88)' } }
  : { intensity: 40, tint: 'dark' };

// NEW — the idle ("armed, not yet sent") state now matches the reference's
// bottom sheet exactly: a rounded card anchored to the bottom of the
// screen with a grab handle and a row of file chips (icon badge + name +
// size), instead of small floating tags stacked above the anchor. this
// ONLY changes what you see before you flick — the actual send gesture,
// targeting, and dispatch animation are all unchanged (see the
// `dispatching` branch below, untouched).
const BottomTray = ({ files }) => {
  if (!files.length) return null;
  // CHANGED AGAIN — the flex:1-based row only ever worked for exactly 1
  // or 2 files (the reference's own fixed demo count). anything beyond
  // that (you can pick up to 10) would've squeezed every chip into a
  // sliver in one non-wrapping row. switched to a horizontally
  // scrollable row of naturally-sized chips instead — 1 file sizes to
  // its content, 10 files scroll, nothing gets crushed or dropped.
  return (
    <View pointerEvents="box-none" style={styles.trayWrap}>
      <View style={styles.grabHandle} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.trayRow}
      >
        {files.map((file, i) => {
          const label = file.name || 'file';
          const kind = kindForFile(file);
          const sizeLabel = formatBytes(file.size ?? file.fileSize);
          return (
            <View key={`chip-${label}-${i}`} style={styles.chip}>
              <View style={styles.chipIcon}>
                <Text style={styles.chipIconText}>{kind}</Text>
              </View>
              <View>
                <Text numberOfLines={1} style={styles.chipName}>{label}</Text>
                {sizeLabel && <Text style={styles.chipSize}>{sizeLabel}</Text>}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

// small ghost tags representing the currently loaded files, stacked loosely
// above the anchor. idle: sits still so you can see what's armed. dispatching:
// each tag lifts, wobbles, and fades out on its own stagger — driven entirely
// off the shared boomAnim value so no extra Animated.Value per file is needed.
//
// tags now sit on real frosted glass (BlurView) instead of a flat tinted
// rgba fill — the Animated.View still owns all the motion (translateY,
// rotate, opacity), the BlurView just rides along inside it as the visual
// backing, since expo-blur's BlurView isn't itself an Animated-drivable
// component.
export const DispatchManifest = ({ files, boomAnim, dispatching }) => {
  // CHANGED — idle state now renders the bottom tray card instead of the
  // floating ghost tags; the dispatching branch (the actual send
  // animation) is completely untouched below.
  if (!dispatching) {
    return <BottomTray files={files} />;
  }

  return (
    <>
      {files.map((file, i) => {
        const label = file.name || 'file';
        const seed = hashToUnit(label + i); // stable per-tag jitter, never re-rolls on render
        const xOffset = (seed - 0.5) * 56; // tight horizontal fan — a cluster, not a scatter
        const baseTop = ANCHOR_Y - 150 - i * 34; // loose vertical stack, most recent on top (34px — widened from 26 so tags don't collide mid-lift)

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
              borderRadius: 14,
              overflow: 'hidden', // required so the blur respects the rounded corners
              opacity,
              transform: [{ translateY }, { rotate }]
            }}
          >
            <Backing
              {...backingProps}
              style={[
                backingProps.style,
                {
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderWidth: 1,
                  borderColor: COLORS.idkman,
                  alignItems: 'center'
                }
              ]}
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
            </Backing>
          </Animated.View>
        );
      })}
    </>
  );
};

const styles = StyleSheet.create({
  // CHANGED — 180 was a bad guess, it landed the tray right on top of the
  // orb (confirmed on-device). the orb's bottom edge always sits a fixed
  // 90px above the screen bottom (baked into ANCHOR_Y's own formula), and
  // the hud pill sits around bottom:120-160 above that — there's a clear
  // stretch of empty space below the hud pill, all the way to the screen
  // edge. dropped down into that gap instead, close to the reference's
  // own bottom:34.
  trayWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 28,
    paddingTop: 14,
    paddingHorizontal: 30,
    paddingBottom: 19,
    width: windowWidth
  },
  grabHandle: {
    width: 30,
    height: 4,
    borderRadius: 4,
    backgroundColor: GRAB_HANDLE_COLOR,
    alignSelf: 'center',
    marginBottom: 9
  },
  // CHANGED — ScrollView's contentContainerStyle, was a plain flex row
  // for the old (max 2 files) layout
  trayRow: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 0 // so the last chip isn't flush against the scroll edge
  },
  // CHANGED — chips are naturally sized now (flex removed), min/max width
  // instead so a short filename doesn't shrink to nothing and a long one
  // doesn't run unbounded — they scroll horizontally as a set instead of
  // dividing one fixed row evenly, which is what broke past 2 files.
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 150,
    maxWidth: 240,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: CHIP_BG,
    borderWidth: 1,
    borderColor: CHIP_BORDER
  },
  chipIcon: {
    width: 30,
    height: 25,
    borderRadius: 8,
    backgroundColor: CHIP_ICON_BG,
    alignItems: 'center',
    justifyContent: 'center'
  },
  chipIconText: {
    fontSize: 9,
    color: CHIP_ICON_TEXT,
    fontWeight: '600'
  },
  chipName: {
    fontSize: 10.5,
    color: CHIP_NAME_COLOR
  },
  chipSize: {
    fontSize: 9,
    color: CHIP_SIZE_COLOR,
    marginTop: 2
  }
});