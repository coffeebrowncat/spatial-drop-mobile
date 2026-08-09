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
// ============================================================

import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { signUp, logIn, continueAsGuest } from '../utils/firebaseAuth';
import { COLORS } from '../constants/colors';

export function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('missing info', 'email and password are both required.');
      return;
    }

    setBusy(true);
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
      Alert.alert('sign-in failed', reason);
    } finally {
      setBusy(false);
    }
  };

  const handleGuest = async () => {
    setBusy(true);
    try {
      const user = await continueAsGuest();
      onAuthed(user);
    } catch (err) {
      Alert.alert('guest sign-in failed', err.message || 'try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{mode === 'signup' ? 'create account' : 'welcome back'}</Text>

      {mode === 'signup' && (
        <TextInput
          placeholder="display name"
          placeholderTextColor={COLORS.mutedText}
          value={displayName}
          onChangeText={setDisplayName}
          style={styles.input}
          autoCapitalize="words"
        />
      )}

      <TextInput
        placeholder="email"
        placeholderTextColor={COLORS.mutedText}
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        placeholder="password"
        placeholderTextColor={COLORS.mutedText}
        value={password}
        onChangeText={setPassword}
        style={styles.input}
        secureTextEntry
      />

      <Pressable
        style={({ pressed }) => [styles.primaryButton, { opacity: pressed || busy ? 0.5 : 1 }]}
        onPress={handleSubmit}
        disabled={busy}
      >
        <Text style={styles.primaryButtonText}>
          {busy ? 'working...' : mode === 'signup' ? 'sign up' : 'log in'}
        </Text>
      </Pressable>

      <Pressable onPress={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
        <Text style={styles.switchModeText}>
          {mode === 'signup' ? 'already have an account? log in' : "don't have an account? sign up"}
        </Text>
      </Pressable>

      <View style={styles.divider} />

      <Pressable
        style={({ pressed }) => [styles.guestButton, { opacity: pressed || busy ? 0.5 : 1 }]}
        onPress={handleGuest}
        disabled={busy}
      >
        <Text style={styles.guestButtonText}>continue as guest</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  title: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 30,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.boxBorder,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    marginBottom: 14,
  },
  primaryButton: {
    backgroundColor: COLORS.amber,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#050505',
    fontWeight: '700',
    fontSize: 15,
  },
  switchModeText: {
    color: COLORS.mutedText,
    textAlign: 'center',
    marginTop: 16,
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.boxBorder,
    marginVertical: 26,
  },
  guestButton: {
    borderWidth: 1,
    borderColor: COLORS.boxBorder,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  guestButtonText: {
    color: COLORS.mutedText,
    fontSize: 14,
  },
});