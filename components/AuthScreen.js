// ============================================================
// FILE: components/AuthScreen.js
// Spatial Drop — sign up / log in / continue as guest, one screen.
//
// this is the actual screen — sign up, log in, or skip it entirely and
// go in as a guest. drop it in before your 'boarding' stage (or
// wherever makes sense in your flow) and it just calls straight into
// utils/firebaseAuth.js, no extra wiring needed.
//
// onAuthed(user) fires the second someone's actually signed in, no
// matter which of the three buttons got them there — use that to
// advance whatever stage comes next.
//
// RESKINNED — this used to be a totally generic RN form (system font,
// solid filled button, boxed 8px-radius inputs, native Alert.alert
// popups) sitting between the splash screen and boarding/dock, which
// both already speak the app's actual visual language (Pliant font,
// thin outline pills, lowercase tiny-tracked labels, hairline corner
// frame, atmosphere behind the content). this screen was the single
// biggest disconnect in the flow — first thing after the splash, and it
// looked like a different app. now it borrows the same instrument-panel
// vocabulary: AmbientGlow behind it, Pliant everywhere, outline pills
// instead of a filled one, and inline errors instead of a native OS
// dialog breaking the fiction. NOTE — the corner-bracket frame was tried
// here too and then pulled back out on purpose: that's staying a radar-
// only signature, not a repeated motif.
// ============================================================

import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { signUp, logIn, continueAsGuest } from '../utils/firebaseAuth';
import { useTheme } from '../contexts/ThemeContext';
import { AmbientGlow } from './AmbientGlow';

export function AuthScreen({ onAuthed }) {
  const { theme } = useTheme();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  // NEW — replaces Alert.alert. the rest of the app never breaks out to a
  // native popup (the pin screen's wrong-code error is just inline text
  // that shakes the boxes), so this shouldn't either.
  const [formError, setFormError] = useState(null);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setFormError('email and password are both required.');
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const user = mode === 'signup'
        ? await signUp(email.trim(), password, displayName.trim())
        : await logIn(email.trim(), password);
      onAuthed(user);
    } catch (err) {
      // firebase's own error codes are already pretty readable on their
      // own (like "auth/wrong-password"), this just strips the "auth/"
      // prefix and swaps the dashes for spaces so it reads like an
      // actual sentence instead of an error code
      const reason = (err.code || err.message || 'unknown error').replace('auth/', '').replace(/-/g, ' ');
      setFormError(reason);
    } finally {
      setBusy(false);
    }
  };

  const handleGuest = async () => {
    setBusy(true);
    setFormError(null);
    try {
      const user = await continueAsGuest();
      onAuthed(user);
    } catch (err) {
      setFormError(err.message || 'guest sign-in failed — try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <AmbientGlow />

      <Text style={[styles.title, { color: theme.text }]}>
        {mode === 'signup' ? 'create account' : 'welcome back'}
      </Text>

      {mode === 'signup' && (
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

      {formError && (
        <Text style={[styles.errorText, { color: theme.error }]}>{formError}</Text>
      )}

      <Pressable
        style={({ pressed }) => [
          styles.primaryButton,
          { borderColor: theme.amber, opacity: pressed || busy ? 0.5 : 1 },
        ]}
        onPress={handleSubmit}
        disabled={busy}
      >
        <Text style={[styles.primaryButtonText, { color: theme.amber }]}>
          {busy ? 'working...' : mode === 'signup' ? 'sign up' : 'log in'}
        </Text>
      </Pressable>

      <Pressable onPress={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
        <Text style={[styles.switchModeText, { color: theme.mutedText }]}>
          {mode === 'signup' ? 'already have an account? log in' : "don't have an account? sign up"}
        </Text>
      </Pressable>

      <View style={[styles.divider, { backgroundColor: theme.boxBorder }]} />

      <Pressable
        style={({ pressed }) => [
          styles.guestButton,
          { borderColor: theme.boxBorder, opacity: pressed || busy ? 0.5 : 1 },
        ]}
        onPress={handleGuest}
        disabled={busy}
      >
        <Text style={[styles.guestButtonText, { color: theme.mutedText }]}>continue as guest</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  title: {
    fontFamily: 'Pliant',
    fontSize: 15,
    fontWeight: '300',
    letterSpacing: 3,
    textTransform: 'lowercase',
    marginBottom: 34,
    textAlign: 'center',
  },
  input: {
    fontFamily: 'Pliant',
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 13,
    fontSize: 13,
    letterSpacing: 1,
    marginBottom: 14,
  },
  errorText: {
    fontFamily: 'Pliant',
    fontSize: 11,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 14,
  },
  primaryButton: {
    borderWidth: 1,
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    fontFamily: 'Pliant',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
  },
  switchModeText: {
    fontFamily: 'Pliant',
    textAlign: 'center',
    marginTop: 18,
    fontSize: 11,
    letterSpacing: 1,
  },
  divider: {
    height: 1,
    marginVertical: 26,
  },
  guestButton: {
    borderWidth: 1,
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: 'center',
  },
  guestButtonText: {
    fontFamily: 'Pliant',
    fontSize: 11,
    letterSpacing: 2,
  },
});
