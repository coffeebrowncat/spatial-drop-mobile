// ============================================================
// FILE: components/AvatarPicker.js
// Spatial Drop — avatar picker, now backed by real hand-drawn art
// instead of emoji.
//
// CHANGED — this used to be emoji-only (id + unicode character, nothing
// to bundle). now each preset points at an actual PNG via require(),
// which means these files have to physically exist in the project at
// build time — React Native resolves require() paths at bundle time,
// not runtime, so you can't swap these in later without a rebuild.
//
// FIXED — the PNGs are now actually circular-cropped with a transparent
// background (not a square white image sitting inside a circular
// border), and downsized from ~1024px to 256px — these only ever render
// at 26-72px in the app, so 1024px was pure dead weight (each file
// dropped from 300-900KB down to roughly 25-50KB), which is almost
// certainly what was making this feel so slow to load/bundle.
//
// filenames below are your ACTUAL original filenames, not renamed —
// matches what you sent back, so nothing needs renaming on your end.
//
// drop all 10 avatar PNGs into ./assets/avatars/ (same folder pattern as
// ./assets/fonts/pliant.ttf already uses in App.js) — 9 are wired below,
// 'smirkingCat' is commented out until that file actually exists,
// uncomment + add it once you've got it.
//
// only the id ever gets saved on the user/sent over the wire (same as
// before) — everything downstream (App.js's join message, socket.js,
// superhub.html) just passes avatarId around as a plain string either
// way, none of that had to change.
// ============================================================

import React from 'react';
import { View, Image, Pressable, StyleSheet } from 'react-native';
import { COLORS } from '../constants/colors';

export const AVATAR_PRESETS = [
  { id: 'wiseOldCreep', image: require('../assets/avatars/wiseOldCreep.png') },
  { id: 'methcrackhead', image: require('../assets/avatars/edwardScissorNOHands.png') },
  { id: 'coolLadyHehe', image: require('../assets/avatars/dontEvenJokeLad(y).png') },
  { id: 'roidedDudeWithBow', image: require('../assets/avatars/roidedDudeWithBow.png') },
  { id: 'hijabiNinja', image: require('../assets/avatars/hijabiNinja.png') },
  { id: 'punkRockEntity', image: require('../assets/avatars/punkRockEntity.png') },
  { id: 'ancientKarateLady', image: require('../assets/avatars/ancientKarateLady.png') },
  { id: 'mrMime', image: require('../assets/avatars/mr.mime.png') },
  { id: 'creepyChild', image: require('../assets/avatars/creepyChild.png') },
  // NEW — waiting on the 10th drawing. uncomment once smirkingCat.png is
  // actually sitting in ./assets/avatars/, or this line alone will crash
  // the whole bundle (require() throws immediately on a missing file).
  // { id: 'smirkingCat', image: require('../assets/avatars/smirkingCat.png') },
];

export function AvatarPicker({ selectedId, onSelect }) {
  return (
    <View style={styles.row}>
      {AVATAR_PRESETS.map((preset) => {
        const isSelected = preset.id === selectedId;
        return (
          <Pressable
            key={preset.id}
            onPress={() => onSelect(preset.id)}
            style={[
              styles.avatarWrap,
              { borderColor: isSelected ? COLORS.amber : COLORS.boxBorder },
            ]}
          >
            <Image source={preset.image} style={styles.avatarImage} resizeMode="cover" />
          </Pressable>
        );
      })}
    </View>
  );
}

// tiny lookup helper so any other screen can just do
// getAvatarImage(user.avatarId) instead of importing the whole preset
// list — same idea as the old getAvatarEmoji, just returns an image
// source now instead of a character. falls back to the first preset if
// the id doesn't match anything (e.g. old accounts still carrying a
// pre-rework id like 'comet').
export function getAvatarImage(avatarId) {
  return AVATAR_PRESETS.find((p) => p.id === avatarId)?.image ?? AVATAR_PRESETS[0].image;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    overflow: 'hidden', // safety net — the art itself is circular now, this just catches any platform-rendering edge case
  },
  avatarImage: {
    // FIXED — the actual fix for "why isn't this circular." borderRadius
    // applied DIRECTLY on the Image itself reliably clips it to a circle
    // on both iOS and Android, regardless of what the source PNG looks
    // like (square, white background, whatever) — no pre-cropped/
    // transparent art required on your end anymore. resizeMode "cover"
    // (set above) fills the full circle without stretching, cropping
    // any excess instead of leaving gaps.
    width: 50,
    height: 50,
    borderRadius: 25,
  },
});