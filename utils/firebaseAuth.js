// ============================================================
// FILE: utils/firebaseAuth.js
// Spatial Drop — sign-in, in one file.
//
// this file is where sign-in actually happens. two ways in: a real
// email/password account, or a one-tap "continue as guest" using
// firebase's built-in anonymous auth. both hand back the same kind of
// user object at the end, so nothing else in the app has to care which
// door someone walked through.
//
// this rides on the SAME firebase project you're already using for the
// pin lookup — authentication is just a different tab in that project,
// not a whole new thing you have to set up from scratch.
// ============================================================

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  getReactNativePersistence,
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  onAuthStateChanged,
  updateProfile,
  signOut,
  linkWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

// grab these from firebase console -> project settings -> general ->
// "your apps" (same project as FIREBASE_URL in your backend .env).
// paste your real values in below, these are just placeholders for now
const firebaseConfig = {
  apiKey: 'AIzaSyBFy8C5YxtaPmWPNuZS-G4-HzWTVHLd4ug',
  authDomain: 'spatial-drop.firebaseapp.com',
  databaseURL: 'https://spatial-drop-default-rtdb.firebaseio.com',
  projectId: 'spatial-drop',
  storageBucket: 'spatial-drop.firebasestorage.app',
  appId: '1:308625658529:web:da90fc0d0f1228cf8396e0'
};

// this check stops a "firebase app already initialized" crash from
// happening every time metro hot-reloads this file while you're testing
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// FIXED — this used to be a plain getAuth(app), which on React Native
// defaults to IN-MEMORY-ONLY persistence (there's no browser
// localStorage for it to fall back on like on web) — meaning every
// single person got logged straight back out the moment they closed and
// reopened the app. that directly contradicts watchAuthState's whole
// documented point below ("so someone who already signed in before
// doesn't get thrown back to a login screen every single time"). wiring
// AsyncStorage in as the persistence layer is what actually makes that
// true.
//
// initializeAuth can only be called ONCE per app instance — calling it a
// second time throws, which is exactly what happens every time Metro
// hot-reloads this file during dev. same fallback pattern as the
// getApps() check above, just for auth instead of the app itself.
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage)
  });
} catch (e) {
  auth = getAuth(app); // already initialized (hot reload) — just grab the existing instance
}
export { auth };

// makes a real account with an email + password, and sets the display
// name in the same step so you don't need a second call right after
export async function signUp(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  return cred.user;
}

// logs into an account that already exists
export async function logIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

// NEW — upgrades an already-signed-in guest into a real account IN PLACE
// (same uid before and after), instead of creating a brand new, separate
// account like signUp() does. this matters: if a guest hits signUp()
// directly, they get a fresh account with a fresh uid, and whatever was
// already tied to their guest session (avatar choice, anything synced to
// the backend under their guest uid) is just orphaned — silently lost.
// linkWithCredential attaches the email/password login method to the
// EXISTING anonymous user instead, so nothing has to be re-picked or
// re-synced. this is what the in-settings "sign up" flow should call,
// not signUp().
export async function linkGuestAccount(email, password, displayName) {
  if (!auth.currentUser) throw new Error('no active guest session to upgrade');
  const credential = EmailAuthProvider.credential(email, password);
  const result = await linkWithCredential(auth.currentUser, credential);
  if (displayName) {
    await updateProfile(result.user, { displayName });
  }
  return result.user;
}

// "continue as guest" — no email, no password, nothing to type. just
// hands back a real, working firebase user, except isAnonymous is true
// on it. this alone satisfies the "sign up or continue as guest" app
// store requirement in one function call
export async function continueAsGuest() {
  const cred = await signInAnonymously(auth);
  return cred.user;
}

// signs whoever's currently logged in back out
export async function logOut() {
  await signOut(auth);
}

// call this once, up near the top of App.js, so someone who already
// signed in before doesn't get thrown back to a login screen every
// single time they reopen the app
export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}