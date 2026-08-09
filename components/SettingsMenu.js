// ============================================================
// FILE: components/SettingsMenu.js
// Spatial Drop — the "menu" screen.
//
// the "menu" screen — ties the rest of this batch together in one
// place. shows whoever's signed in (or just "guest"), lets them flip
// their avatar, and log out. kept generic on purpose for now — easy to
// bolt more rows onto later once you actually know what else belongs here.
//
// REMOVED — the dark mode toggle. app is dark-only now, on purpose. the
// theme system underneath still exists (ThemeProvider still wraps
// everything, `theme` still comes from useTheme()), it's just permanently
// pinned to darkTheme with no UI path to flip it, so this can come back
// with one row if you ever want it — but not before styles/appStyles.js
// also gets its hardcoded backgrounds moved onto theme, since that file is
// what was still painting some screens solid dark regardless of the toggle.
// ============================================================

import React from 'react';
import { View, Text, Image, Pressable, StyleSheet, Switch } from 'react-native';
import { AvatarPicker, getAvatarImage } from './AvatarPicker';
import { useTheme } from '../contexts/ThemeContext';
import { logOut } from '../utils/firebaseAuth';

export function SettingsMenu({ user, avatarId, onAvatarChange, onLoggedOut, onBack }) {
  const { theme, isDark, toggleTheme } = useTheme();

  const handleLogOut = async () => {
    await logOut();
    onLoggedOut();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* only shows up if the screen that opened this actually gave us a
          way back — keeps this component usable standalone too */}
      {onBack && (
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={[styles.backText, { color: theme.mutedText }]}>‹ back</Text>
        </Pressable>
      )}

      <Image source={getAvatarImage(avatarId)} style={styles.bigAvatarImage} resizeMode="cover" />

      <Text style={[styles.name, { color: theme.text }]}>
        {user?.isAnonymous ? 'guest' : (user?.displayName || user?.email || 'node')}
      </Text>
      {user?.isAnonymous && (
        <Text style={[styles.guestNote, { color: theme.mutedText }]}>
          signed in as guest — sign up any time to keep your name and avatar
        </Text>
      )}

      <Text style={[styles.sectionLabel, { color: theme.mutedText }]}>avatar</Text>
      <AvatarPicker selectedId={avatarId} onSelect={onAvatarChange} />

      <View style={[styles.row, { borderColor: theme.boxBorder }]}>
        <Text style={[styles.rowLabel, { color: theme.text }]}>dark mode</Text>
        <Switch
          value={isDark}
          onValueChange={toggleTheme}
          trackColor={{ false: theme.boxBorder, true: theme.amber }}
        />
      </View>

      <Pressable style={[styles.logoutButton, { borderColor: theme.error }]} onPress={handleLogOut}>
        <Text style={[styles.logoutText, { color: theme.error }]}>log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 30,
    paddingTop: 60,
    alignItems: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  backText: {
    fontSize: 15,
  },
  bigAvatarImage: {
    // FIXED — this never had any circular treatment at all before (no
    // borderRadius anywhere), so it rendered as a flat square no matter
    // what image was inside it — nothing to do with which PNG was
    // passed in. borderRadius directly on the Image (half of width/
    // height) is what actually clips it to a circle, same technique as
    // AvatarPicker.js's avatarImage. also bumped from 72x72 since it was
    // hard to make out at that size.
    width: 110,
    height: 110,
    borderRadius: 55,
    marginBottom: 10,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
  },
  guestNote: {
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 1,
    marginTop: 34,
    marginBottom: 14,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 16,
    marginTop: 30,
  },
  rowLabel: {
    fontSize: 15,
  },
  logoutButton: {
    marginTop: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 30,
  },
  logoutText: {
    fontWeight: '600',
  },
});