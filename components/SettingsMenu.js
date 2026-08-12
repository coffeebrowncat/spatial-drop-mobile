// ============================================================
// FILE: components/SettingsMenu.js
// Spatial Drop — the "menu" screen.
//
// the "menu" screen — ties the rest of this batch together in one
// place. shows whoever's signed in (or just "guest"), lets them flip
// their avatar, and either log out (real accounts) or upgrade to a real
// account right here (guests).
//
// REMOVED — the dark mode toggle. app is dark-only now, on purpose. the
// theme system underneath still exists (ThemeProvider still wraps
// everything, `theme` still comes from useTheme()), it's just permanently
// pinned to darkTheme with no UI path to flip it, so this can come back
// with one row if you ever want it — but not before styles/appStyles.js
// also gets its hardcoded backgrounds moved onto theme, since that file is
// what was still painting some screens solid dark regardless of the toggle.
//
// NEW — guests no longer see a "log out" button at all. logging out only
// makes sense once there's actually an account to log out OF — a guest
// never logged in anywhere, so that button was just confusing (and was
// flagged as exactly that: why does a "log out" button show up for someone
// signed in as guest). guests now get an inline sign up / log in card
// instead, right here on this screen, instead of having to back out to a
// separate auth screen. sign up specifically UPGRADES the existing guest
// session in place (see linkGuestAccount in utils/firebaseAuth.js) so
// nothing about their session — avatar choice included — gets lost.
// ============================================================

import React, { useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, TextInput, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
// NEW — real blur is meaningfully more expensive on Android than iOS. this
// card is static (not mid-animation, unlike DispatchManifest's tags), so
// it's lower priority than that fix, but still free to swap for
// consistency: a flat tinted View on Android, real blur kept on iOS.
const Backing = Platform.OS === 'android' ? View : BlurView;
import { AvatarPicker, getAvatarImage } from './AvatarPicker';
import { StaticStarfield } from './StaticStarfield';
import { useTheme } from '../contexts/ThemeContext';
import { logOut, linkGuestAccount, logIn } from '../utils/firebaseAuth';

export function SettingsMenu({ user, avatarId, onAvatarChange, onLoggedOut, onUserUpdated, onBack }) {
  const { theme, isDark } = useTheme(); // toggleTheme no longer used here — the dark mode switch was removed, see the groupedCard comment below

  // null | 'signup' | 'login' — which inline auth card (if any) is open
  const [authMode, setAuthMode] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState(null);
  const [busy, setBusy] = useState(false);

  const isGuest = !!user?.isAnonymous;

  const handleLogOut = async () => {
    await logOut();
    onLoggedOut();
  };

  const resetAuthCard = () => {
    setAuthMode(null);
    setEmail('');
    setPassword('');
    setDisplayName('');
    setAuthError(null);
  };

  const handleAuthSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setAuthError('email and password are both required.');
      return;
    }
    setBusy(true);
    setAuthError(null);
    try {
      const upgradedUser = authMode === 'signup'
        ? await linkGuestAccount(email.trim(), password, displayName.trim())
        : await logIn(email.trim(), password);
      onUserUpdated?.(upgradedUser);
      resetAuthCard();
    } catch (err) {
      const reason = (err.code || err.message || 'unknown error').replace('auth/', '').replace(/-/g, ' ');
      setAuthError(reason);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* FIXED FOR REAL THIS TIME — the actual bug: KeyboardAvoidingView
          itself had backgroundColor set directly on it, and a DIRECT child
          with negative zIndex (the gradient) sitting under a parent that
          has its own backgroundColor is a known RN/iOS quirk — that child
          renders behind the parent's own paint layer and just disappears,
          it doesn't merely reorder. that's why the last fix hid BOTH the
          gradient and the stars instead of stacking them correctly.
          backgroundColor moved off the parent and onto its own plain sibling
          View below (bgFill) — now nothing with a negative zIndex is a
          direct child of anything that paints its own background, so
          normal stacking rules apply: bgFill (-3) behind gradient (-2)
          behind StaticStarfield's own built-in -1 behind everything else. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, zIndex: -3 }]} />
      <LinearGradient
        colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)', 'rgba(200, 18, 63, 0.22)']}
        locations={[0, 0.65, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { zIndex: -2 }]}
        pointerEvents="none"
      />
      <StaticStarfield />

      {/* only shows up if the screen that opened this actually gave us a
          way back — keeps this component usable standalone too. kept
          outside the ScrollView so it stays pinned while everything
          below scrolls. */}
      {onBack && (
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={[styles.backText, { color: theme.mutedText }]}>‹ back</Text>
        </Pressable>
      )}

      {/* FIXED — none of this was ever scrollable. once the sign up/log in
          card pushed the page taller than the screen, there was no way to
          reach the fields or the submit button below the fold — the whole
          thing was just stuck. wrapping in a real ScrollView fixes that.
          keyboardShouldPersistTaps="handled" so tapping "create account"
          while the keyboard's still up actually registers instead of just
          dismissing the keyboard on the first tap. */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* REMOVED — the shadow bloom behind the ring (shadowColor/
            shadowOpacity/shadowRadius/elevation, all still in the
            avatarRing style below but no longer applied here). border
            only now — with the background gradient behind the whole
            screen too, the ring's own glow on top of that was doubling up
            and reading as too much. */}
        <View style={[styles.avatarRing, { borderColor: '#5A544C' }]}>
          <Image source={getAvatarImage(avatarId)} style={styles.bigAvatarImage} resizeMode="cover" />
          {/* NEW — the art itself is white-background line art, which reads
              as a bright headlight sitting in the middle of an otherwise
              dark screen. dark scrim on top, not a new asset — dims the
              white without touching the actual PNGs. */}
          <View style={styles.avatarDimOverlay} pointerEvents="none" />
        </View>

        <Text style={[styles.name, { color: theme.text }]}>
          {isGuest ? 'guest' : (user?.displayName || user?.email || 'node')}
        </Text>
        {isGuest && (
          <Text style={[styles.guestNote, { color: theme.mutedText }]}>
            signed in as guest — sign up to keep your avatar
          </Text>
        )}

        <Text style={[styles.sectionLabel, { color: theme.mutedText }]}>avatar</Text>
        {/* REDONE — the frosted-blur Backing here was reading as a lighter
            floating panel sitting on top of the page instead of part of
            it, since BlurView brightens whatever's behind it (including
            AmbientGlow's warmth). the actual target look is closer to
            flush-with-the-page: near-black, almost invisible except for a
            thin cherry hairline border, so the card reads as a cutout in
            the background rather than a card floating above it. plain
            View with a near-opaque dark fill instead of blur — no
            Backing/BlurView needed here at all. */}
        <View
          style={[
            styles.groupedCard,
            { borderColor: 'rgba(90, 84, 76, 0.6)', backgroundColor: 'rgba(8, 6, 6, 0.55)' },
          ]}
        >
          <AvatarPicker selectedId={avatarId} onSelect={onAvatarChange} />
        </View>

      {/* real account — same log out button as before, unchanged */}
      {!isGuest && (
        <Pressable style={[styles.logoutButton, { borderColor: theme.danger }]} onPress={handleLogOut}>
          <Text style={[styles.logoutText, { color: theme.danger }]}>log out</Text>
        </Pressable>
      )}

      {/* guest, no card open yet — two pill buttons instead of one lonely
          "log out" that never made sense here in the first place */}
      {isGuest && authMode === null && (
        <View style={styles.guestButtonRow}>
          {/* CHANGED — was an outline-only pill (cherry border, cherry
              text, transparent middle) — the flattest, least "designed"
              element on the whole screen next to a solid frosted card and
              a glowing ring. solid cherry gradient fill + a real drop
              shadow gives it actual weight, same idea as a physical button
              catching light rather than a sticker outline. */}
          <Pressable onPress={() => setAuthMode('signup')} style={styles.primaryPillShadow}>
            <LinearGradient
              colors={['#7A1B32', '#4A0F1E']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.primaryPill}
            >
              <Text style={styles.primaryPillText}>sign up</Text>
            </LinearGradient>
          </Pressable>
          <Pressable
            style={[styles.secondaryPill, { borderColor: 'rgba(255, 255, 255, 0.12)', backgroundColor: 'rgba(255, 255, 255, 0.03)' }]}
            onPress={() => setAuthMode('login')}
          >
            <Text style={[styles.secondaryPillText, { color: theme.text }]}>log in</Text>
          </Pressable>
        </View>
      )}

      {/* guest, card open — inline sign up / log in, no leaving this screen.
          BlurView gives it a frosted-glass card feel instead of a flat box,
          matching the same "premium" language as the rest of the app. */}
      {isGuest && authMode !== null && (
        <Backing
          {...(Platform.OS === 'android' ? {} : { intensity: 40, tint: isDark ? 'dark' : 'light' })}
          style={[
            styles.authCard,
            { borderColor: theme.boxBorder },
            Platform.OS === 'android' && { backgroundColor: isDark ? 'rgba(18, 17, 16, 0.92)' : 'rgba(245, 242, 239, 0.94)' },
          ]}
        >
          <Text style={[styles.authCardTitle, { color: theme.text }]}>
            {authMode === 'signup' ? 'create your account' : 'log into an existing account'}
          </Text>

          {authMode === 'signup' && (
            <TextInput
              placeholder="display name"
              placeholderTextColor={theme.mutedText}
              value={displayName}
              onChangeText={setDisplayName}
              style={[styles.input, { borderColor: theme.boxBorder, color: theme.text }]}
              autoCapitalize="words"
            />
          )}
          <TextInput
            placeholder="email"
            placeholderTextColor={theme.mutedText}
            value={email}
            onChangeText={setEmail}
            style={[styles.input, { borderColor: theme.boxBorder, color: theme.text }]}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            placeholder="password"
            placeholderTextColor={theme.mutedText}
            value={password}
            onChangeText={setPassword}
            style={[styles.input, { borderColor: theme.boxBorder, color: theme.text }]}
            secureTextEntry
          />

          {authError && (
            <Text style={[styles.authError, { color: theme.error }]}>{authError}</Text>
          )}

          <Pressable
            style={[styles.primaryPillShadow, { opacity: busy ? 0.6 : 1 }]}
            onPress={handleAuthSubmit}
            disabled={busy}
          >
            <LinearGradient
              colors={['#7A1B32', '#4A0F1E']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.primaryPill}
            >
              {busy
                ? <ActivityIndicator color="#F5EDF0" />
                : <Text style={styles.primaryPillText}>{authMode === 'signup' ? 'create account' : 'log in'}</Text>}
            </LinearGradient>
          </Pressable>

          <Pressable onPress={resetAuthCard} disabled={busy}>
            <Text style={[styles.cancelText, { color: theme.mutedText }]}>cancel</Text>
          </Pressable>
        </Backing>
      )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 30,
    paddingTop: 10, // back button (sibling, above this) already provides the top-of-screen spacing now
    paddingBottom: 60, // breathing room at the bottom now that this actually scrolls
    alignItems: 'center',
  },
  backButton: {
    // CHANGED — used to sit inside the same padded container as
    // everything else; now a sibling of the ScrollView, so it needs its
    // own top/side spacing to land in the same spot as before.
    // FIXED — this had a negative marginBottom to cancel out
    // scrollContent's paddingTop, which pulled the ScrollView up on top
    // of it and physically ate its touch area — that's why the button
    // looked fine but did nothing when tapped. positive spacing here,
    // paired with scrollContent's paddingTop being reduced instead
    // (below), so there's no overlap.
    alignSelf: 'flex-start',
    marginTop: 60,
    marginLeft: 30,
    marginBottom: 20,
  },
  backText: {
    fontFamily: 'Pliant',
    fontSize: 15,
  },
  avatarRing: {
    // REMOVED — the shadow bloom (shadowOpacity/shadowRadius/shadowOffset/
    // elevation) that used to live here. border-only ring now, no glow.
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  bigAvatarImage: {
    // FIXED (earlier pass) — this never had any circular treatment at all
    // before (no borderRadius anywhere), so it rendered as a flat square
    // no matter what image was inside it. borderRadius directly on the
    // Image (half of width/height) is what actually clips it to a circle.
    width: 118,
    height: 118,
    borderRadius: 59,
  },
  avatarDimOverlay: {
    position: 'absolute',
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
  },
  name: {
    fontFamily: 'Pliant',
    fontSize: 19,
    fontWeight: '600',
  },
  guestNote: {
    fontFamily: 'Pliant',
    fontSize: 12.5,
    marginTop: 6,
    textAlign: 'center',
  },
  sectionLabel: {
    fontFamily: 'Pliant',
    fontSize: 11, // down from 12 — matches ctaText's scale for section-style labels elsewhere
    letterSpacing: 2, // was 1 — the rest of the app's all-caps labels (ctaText, introTagline) all use wide tracking, this was the odd one out
    marginTop: 40,
    marginBottom: 16,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  // REDONE — no longer rendered through Backing/BlurView at the call
  // site (see the comment there) — this is a flat near-black card with a
  // thin cherry hairline border now, not a frosted panel. more internal
  // padding too, so the avatar grid isn't cramped against the border.
  groupedCard: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 22,
    overflow: 'hidden',
  },
  row: {
    // CHANGED — this used to be a standalone element with its own
    // top+bottom border and its own top margin. now nested inside
    // groupedCard, it only needs a divider ABOVE it (separating it from
    // the avatar grid) — the card itself already provides the outer
    // edge, so a second full border here would double up.
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    borderTopWidth: 1,
    paddingTop: 16,
    marginTop: 18,
  },
  rowLabel: {
    fontFamily: 'Pliant',
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
    fontFamily: 'Pliant',
    fontWeight: '600',
  },
  guestButtonRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 44,
    width: '100%',
  },
  // CHANGED — was an outline pill (border + transparent middle). now a
  // two-layer thing: this outer wrapper carries flex sizing + the drop
  // shadow (shadows don't clip cleanly on the same element that also
  // clips its own gradient corners), and primaryPill below is the actual
  // gradient-filled pill nested inside it.
  primaryPillShadow: {
    flex: 1,
    borderRadius: 24,
    shadowColor: '#4A0F1E',
    // CHANGED — was opacity 0.4 / radius 10, reading as a bright neon
    // bloom around the button rather than a normal drop shadow. dialed
    // both down — still has weight/lift, just not glowing.
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  primaryPill: {
    borderRadius: 26,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryPillText: {
    fontFamily: 'Pliant',
    // FIXED — this was hardcoded near-black (#050505), which is low
    // contrast sitting on the cherry/wine fill: that background is deep
    // and saturated in BOTH themes (dark mode's #8C1A3F and light mode's
    // #A31E47 are close in actual brightness, just different hues), so
    // dark text on it reads poorly regardless of which theme you're in.
    // fixed off-white instead of a theme-swapped color on purpose — the
    // pill itself doesn't get meaningfully brighter in light mode, so the
    // text on it shouldn't get meaningfully darker either.
    color: '#F5EDF0',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryPill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 26,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryPillText: {
    fontFamily: 'Pliant',
    fontWeight: '600',
    fontSize: 14,
  },
  authCard: {
    width: '100%',
    marginTop: 40,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    overflow: 'hidden', // required for BlurView to respect the rounded corners
  },
  authCardTitle: {
    fontFamily: 'Pliant',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    fontFamily: 'Pliant',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 12,
    fontSize: 14,
  },
  authError: {
    fontFamily: 'Pliant',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
  },
  cancelText: {
    fontFamily: 'Pliant',
    textAlign: 'center',
    marginTop: 14,
    fontSize: 13,
  },
});
