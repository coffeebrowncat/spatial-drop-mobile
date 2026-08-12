import 'react-native-gesture-handler'; // must be the absolute first import, powers swipe tracking

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Animated,
  StyleSheet,
  Alert,
  Keyboard,
  Platform
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView
} from 'react-native-gesture-handler';
import Svg, {
  Circle,
  Defs,
  RadialGradient,
  Stop,
  Path,
  Line,
  Ellipse
} from 'react-native-svg';

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import * as Font from 'expo-font';
import { BlurView } from 'expo-blur';


// NOTE: COLORS import removed — App.js now reads everything through
// theme (see useTheme() below) so the light/dark toggle actually reaches
// every screen, not just Settings. constants/colors.js still exists and
// still works for any file that imports it directly (server-side stuff,
// desktop.html, superhub.html, etc. aren't part of this context).
import {
  windowWidth,
  windowHeight,
  ANCHOR_X,
  ANCHOR_Y,
  ANCHOR_RADIUS
} from './constants/layout';
import { hashToUnit } from './utils/hash';
import { scatterPositionFor, branchPathFor, GLOW_STARS, SHARD_ANGLES } from './utils/geometry';
import { generateId } from './utils/id';
import { resolveIp } from './utils/network';
import { AnimatedCircle, AnimatedPath, AnimatedLine } from './components/AnimatedPrimitives';
import { MatrixBackground } from './components/MatrixBackground';
import { StaticStarfield } from './components/StaticStarfield';
import { styles } from './styles/appStyles';
import { SquigglyOrb } from './components/SquigglyOrb';
import { DispatchManifest } from './components/DispatchManifest';
import { PeerConstellation } from './components/PeerConstellation';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AuthScreen } from './components/AuthScreen';
import { SettingsMenu } from './components/SettingsMenu';
import { AmbientGlow } from './components/AmbientGlow';
import { CornerFrame } from './components/CornerFrame';

// the RENDER-hosted backend, not the local laptop one — account/profile
// stuff needs to work no matter what wifi network the phone is on, so
// this talks to the always-on deployed server, completely separate from
// hostIpRef (which is only ever used for the local file-transfer calls)
const RENDER_API_URL = 'https://spatial-drop.onrender.com';

// fire-and-forget save of the signed-in user's profile to mongo. called
// right after sign-in succeeds, and again any time the avatar changes.
// wrapped in its own try/catch so a flaky connection here can never
// block someone from actually using the app
async function syncUserToBackend({ firebaseUid, email, displayName, isGuest, avatarId, theme }) {
  try {
    await fetch(`${RENDER_API_URL}/api/user/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firebaseUid, email, displayName, isGuest, avatarId, theme }),
    });
  } catch (err) {
    console.log('user sync failed, not fatal:', err.message);
  }
}

// this used to BE the default export, with <ThemeProvider> wrapped around
// its own returned JSX. that's actually why light mode only ever affected
// SettingsMenu — a component can't read a context it's the one rendering,
// so useTheme() called in here would've just gotten the default value
// forever, no matter what the toggle in Settings did. now this is a real
// child of ThemeProvider (see the actual default export at the bottom),
// so `theme` below is live and actually responds to the toggle.
function AppInner() { // main function react native renders to the screen

  const { theme } = useTheme(); // now genuinely reactive — see comment above

  // --- custom font state ---
  const [fontLoaded, setFontLoaded] = useState(false); // tracks if pliant.ttf has loaded

  // --- state variables (changing these refreshes the ui) ---
  const [stage, setStage] = useState('intro'); // 'intro', 'auth', 'boarding', 'dock', 'radar', or 'settings'
  const [currentUser, setCurrentUser] = useState(null); // the firebase user object, once signed in
  const [avatarId, setAvatarId] = useState('comet'); // matches AVATAR_PRESETS in AvatarPicker.js
  const [name, setName] = useState(''); // alias string the user types in
  const [pin, setPin] = useState(''); // 6-digit string the user types in
  const [connectError, setConnectError] = useState(null); // true if the socket failed to connect
  const [ghostDropMsg, setGhostDropMsg] = useState(null); // red "lost to void" error text
  const [peers, setPeers] = useState([]); // other devices in the room
  const [status, setStatus] = useState(''); // tiny text prompt at the bottom
  const [selectedFiles, setSelectedFiles] = useState([]); // files picked from the gallery
  // CHANGED — was a single targetId (or null for "everyone"). generalized
  // to an array so tapping multiple orbs sends to that whole subset in one
  // go, instead of only ever being able to pick exactly one peer or
  // broadcast to the entire room. empty array still means "everyone" —
  // same default behavior as before, just no longer capped at one.
  const [targetIds, setTargetIds] = useState([]); // deviceIds of the orbs the user has tapped on
  const [shattered, setShattered] = useState(false); // true briefly when a throw fails mid-flight
  const [dispatchSnapshot, setDispatchSnapshot] = useState([]); // files frozen at swipe-time, purely for the vanish animation
  const [strikeTargets, setStrikeTargets] = useState([]); // deviceIds the lightning strike is currently animating toward
  const [incomingFromId, setIncomingFromId] = useState(null); // deviceId currently sending files to us, or null
  // NEW — the anchor's "history ring", straight out of the reference
  // design (Spatial Drop.dc.html: this.state.history / bumpHistory()).
  // a thin progress ring around the anchor that fills up 14% per send,
  // wrapping back to a small sliver once it passes 100 — a visible sense
  // of "this thing has been used" rather than a static instrument.
  const [sentHistoryPct, setSentHistoryPct] = useState(22); // same starting value as the reference

  // --- physics/animation variables (changing these does not refresh the ui) ---
  const canvasOpacity = useRef(new Animated.Value(1)).current; // screen fade, starts fully visible
  const pinShakeAnim = useRef(new Animated.Value(0)).current; // horizontal shake, starts centered
  const boomAnim = useRef(new Animated.Value(0)).current; // sonic boom, starts unfired
  const pulseAnim = useRef(new Animated.Value(0)).current; // heartbeat
  const shatterAnim = useRef(new Animated.Value(0)).current; // grey particle burst

  // small pool of shared twinkle loops for the background dust, instead of
  // one Animated.Value per star. each star is bucketed into one of these by
  // its own index, so the field twinkles unevenly without dozens of loops.
  const TWINKLE_BUCKET_COUNT = 6; // how many independent twinkle rhythms exist
  const dustTwinkleRef = useRef(null); // holds the pool once created
  if (!dustTwinkleRef.current) { // lazily create it exactly once, on first render
    dustTwinkleRef.current = Array.from({ length: TWINKLE_BUCKET_COUNT }, () => new Animated.Value(0));
  }

  useEffect(() => { // starts every twinkle bucket's own infinite loop
    dustTwinkleRef.current.forEach((val, i) => {
      const duration = 1500 + i * 260; // stagger each bucket's rhythm
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration, useNativeDriver: false }), // brighten
          Animated.timing(val, { toValue: 0, duration, useNativeDriver: false }) // dim
        ])
      ).start();
    });
  }, []); // only run once, on boot

  const peerScalesRef = useRef({}); // tracks the join-bounce animation for every orb
  const peerBreatheRef = useRef({}); // tracks each orb's own slow idle breathing loop
  const peerPulseRef = useRef({}); // tracks each branch's own traveling "data" pulse

  // assigns each device a permanent slot (1st peer ever seen this session =
  // slot 1, 2nd = slot 2, ...) so positions use consecutive halton indices,
  // which is what guarantees good spread for whoever is currently connected.
  // freed slots go back on a reuse stack so a long session doesn't drift
  // toward ever-larger indices.
  const peerSlotRef = useRef({}); // deviceId -> slot number
  const freeSlotsRef = useRef([]); // stack of slot numbers freed by peers who left
  const nextSlotRef = useRef(1); // next brand-new slot to hand out

  const getSlotFor = (deviceId) => { // grabs (or assigns) this device's permanent slot
    if (!peerSlotRef.current[deviceId]) { // never seen before
      const reused = freeSlotsRef.current.pop(); // try to reuse a departed peer's slot
      peerSlotRef.current[deviceId] = reused ?? nextSlotRef.current++; // reuse, or hand out the next fresh one
    }
    return peerSlotRef.current[deviceId];
  };

  // --- engine references ---
  const deviceIdRef = useRef(generateId()); // this phone's unique id for the whole session
  const wsRef = useRef(null); // holds the live websocket connection once it opens
  const hostIpRef = useRef(null); // holds the laptop's ip once firebase gives it to us
  const pinInputRef = useRef(null); // direct reference to the hidden keyboard input

  // NEW — this is the REAL fix for "changing my avatar kicks me back to the
  // radar screen." socket.onmessage (set up once, inside connectToRoom, the
  // moment you first connect) captures whatever `handleIncoming` closure
  // existed AT THAT MOMENT — which means it also freezes whatever `stage`
  // was AT THAT MOMENT, forever, for the rest of that connection. since you
  // always connect while stage is 'dock', that closure's `stage` reads as
  // 'dock' PERMANENTLY, no matter what screen you actually navigate to
  // afterward. so the room_update guard below was never really checking
  // your current screen — it was checking a snapshot from the instant you
  // typed your pin, which is always true. deviceIdRef above already solves
  // this exact problem for deviceId; stageRef does the same thing for
  // stage — a ref stays live across stale closures, state does not.
  const stageRef = useRef(stage);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  // --- font loader logic ---
  useEffect(() => { // runs once when the app boots
    async function loadCustomFont() {
      try {
        await Font.loadAsync({
          'Pliant': require('./assets/fonts/pliant.ttf'),
        });
      } catch (e) {
        console.log("Font load failed, falling back to system font", e);
      } finally {
        setFontLoaded(true); // allow the app to render, so it never hangs
      }
    }
    loadCustomFont();
  }, []);

  // --- auto-advance loading bar logic ---
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (fontLoaded && stage === 'intro') {
      // start the progress bar immediately once the font loads
      Animated.timing(progressAnim, {
        toValue: 1, // 100% complete
        duration: 2900,
        useNativeDriver: false // must be false to animate 'width'
      }).start(() => {
        // once the bar finishes filling, fade to the sign-in screen —
        // used to go straight to 'boarding', now 'auth' sits in front of
        // it so nobody gets into the app without signing in or at least
        // going through as a guest
        crossfadeTo('auth');
      });
    }
  }, [fontLoaded]);

  // --- screen transition logic ---
  const crossfadeTo = (nextStage) => { // cleanly fades between stages
    Animated.sequence([
      Animated.timing(canvasOpacity, { // fade out
        toValue: 0,
        duration: 200,
        useNativeDriver: true // gpu-driven for smoothness
      }),
    ]).start(() => { // once faded out...
      setStage(nextStage); // swap the ui layout behind the invisible curtain
      // FIXED — the fade-back-in used to start on this exact same tick as
      // setStage above. setState is async, so this kicked off a NATIVE-
      // driven opacity animation immediately, while React was still in
      // the middle of actually unmounting the old screen and mounting the
      // new one underneath it — heaviest on the radar screen specifically
      // (lots of animated SVG/gesture-handler nodes to tear down) swapping
      // to settings (ScrollView, images, KeyboardAvoidingView to lay out).
      // opacity was rising back to 1 before the new screen had actually
      // finished being built, so you'd catch it still settling into place
      // — that's the flash. requestAnimationFrame here gives React one
      // frame to finish that commit before anything starts becoming
      // visible again.
      requestAnimationFrame(() => {
        Animated.timing(canvasOpacity, { // fade back in
          toValue: 1,
          duration: 250,
          useNativeDriver: true
        }).start();
      });
    });
  };

  // --- orb bounce logic ---
  const getPeerScale = (deviceId) => { // animation value for a specific orb
    if (!peerScalesRef.current[deviceId]) {
      peerScalesRef.current[deviceId] = new Animated.Value(0); // starts shrunk to nothing
    }
    return peerScalesRef.current[deviceId];
  };

  const getPeerBreathe = (deviceId) => { // idle breathing value for a specific orb
    if (!peerBreatheRef.current[deviceId]) {
      peerBreatheRef.current[deviceId] = new Animated.Value(0); // starts at the low end of the breath
    }
    return peerBreatheRef.current[deviceId];
  };

  const getPeerPulse = (deviceId) => { // traveling "data pulse" value for a specific branch
    if (!peerPulseRef.current[deviceId]) {
      peerPulseRef.current[deviceId] = new Animated.Value(0); // starts at the anchor end
    }
    return peerPulseRef.current[deviceId];
  };

  useEffect(() => { // watches 'peers'. whenever someone joins or leaves...
    const stillHere = new Set(peers.map((p) => p.deviceId)); // fast lookup of who's still connected
    Object.keys(peerSlotRef.current).forEach((deviceId) => { // check everyone we've ever assigned a slot to
      if (!stillHere.has(deviceId)) { // they've left the room
        freeSlotsRef.current.push(peerSlotRef.current[deviceId]); // free their slot for reuse
        delete peerSlotRef.current[deviceId];
        delete peerScalesRef.current[deviceId]; // forget their bounce animation
        delete peerBreatheRef.current[deviceId]; // forget their breathing animation
        delete peerPulseRef.current[deviceId]; // forget their traveling pulse animation
      }
    });

    peers.forEach((peer) => { // loop through every device in the room
      getSlotFor(peer.deviceId); // make sure this peer has a permanent slot before drawing
      const scale = getPeerScale(peer.deviceId);
      Animated.spring(scale, { // physical spring physics
        toValue: 1, // pop up to 100% normal size
        friction: 6, // lower = more bouncy
        useNativeDriver: false // svg attributes can't run on the native gpu yet
      }).start();

      if (!peerBreatheRef.current[peer.deviceId]) { // only wire the breathing loop the first time we see this peer
        const breathe = getPeerBreathe(peer.deviceId);
        const seed = hashToUnit(peer.deviceId + 'breathe'); // stable per-device value, no mechanical lockstep
        const duration = 1900 + seed * 1500; // 1.9s to 3.4s per half-cycle
        Animated.loop(
          Animated.sequence([
            Animated.timing(breathe, { toValue: 1, duration, useNativeDriver: false }), // fade up
            Animated.timing(breathe, { toValue: 0, duration, useNativeDriver: false }) // fade down
          ])
        ).start();
      }

      if (!peerPulseRef.current[peer.deviceId]) { // only wire the traveling pulse the first time we see this peer
        const pulse = getPeerPulse(peer.deviceId);
        const seed = hashToUnit(peer.deviceId + 'pulse'); // stable per-device value, no lockstep
        const delay = seed * 2600; // stagger the start
        const duration = 2400 + seed * 1400; // 2.4s–3.8s to travel the full branch
        setTimeout(() => { // wait out this peer's own stagger
          Animated.loop(
            Animated.timing(pulse, { toValue: 1, duration, useNativeDriver: false }) // travel from anchor to orb
          ).start();
        }, delay);
      }
    });
  }, [peers]); // only run when the 'peers' array changes

  // --- the heartbeat logic ---
  useEffect(() => { // runs once when the app opens
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { // fade up
          toValue: 1,
          duration: 1200,
          useNativeDriver: false // must be false for svg lines
        }),
        Animated.timing(pulseAnim, { // fade down
          toValue: 0,
          duration: 1200,
          useNativeDriver: false
        })
      ])
    ).start();
  }, []); // only run on first launch

  // --- wrong pin shake logic ---
  const triggerWrongPinShake = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); // sharp double-buzz
    Animated.sequence([ // rapid position shifts back to back
      Animated.timing(pinShakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }), // jerk right
      Animated.timing(pinShakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }), // jerk left
      Animated.timing(pinShakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }), // jerk right again
      Animated.timing(pinShakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }) // return to center
    ]).start();
  };

  // --- network: catching files ---
  const acceptAndDownload = async (transferId, fileName) => { // when the laptop throws something back to the phone
    wsRef.current.send(JSON.stringify({
      type: 'accept_transfer',
      transferId
    }));
    setStatus('receiving...');
    try {
      const ext = fileName && fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '';
      const destUri = FileSystem.cacheDirectory + `spatialdrop_${transferId}${ext}`; // ext goes HERE
      const result = await FileSystem.downloadAsync(
        `http://${hostIpRef.current}:3000/api/download/${transferId}`, // NOT here — plain UUID only
        destUri
      );
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri);
      }
      setStatus('');
    } catch (err) {
      setStatus('transfer lost to the void. try again.');
    } finally {
      setIncomingFromId(null);
    }
  };

  // --- network: websocket router ---
  const handleIncoming = (data) => { // when the server sends us a live message
    if (data.error) { // server rejected our pin
      setConnectError(data.error);
      triggerWrongPinShake();
      return;
    }

    if (data.type === 'room_update') { // someone joined/left
      setPeers(data.peers.filter((p) => {
        return p.deviceId !== deviceIdRef.current; // filter out our own device
      }));

      // FIXED — this used to check `stage` directly, which is permanently
      // stale here (see stageRef's comment above — this is the actual bug,
      // not just the 'radar'-vs-'dock' condition itself). now reads
      // stageRef.current, which is kept live via the useEffect above, so
      // this genuinely reflects whatever screen you're on right now instead
      // of whatever screen you were on the moment you first connected.
      if (stageRef.current === 'dock') { // still on the pin screen, this IS the "you just connected" moment
        Keyboard.dismiss();
        pinInputRef.current?.blur();
        crossfadeTo('radar'); // fade into the constellation canvas
      }
      return;
    }

    if (data.type === 'incoming_files') { // the laptop is throwing to us
      // NOTE: assumes the payload has a `fromDeviceId` field identifying the
      // sender. check your backend's incoming_files message — if it uses a
      // different key (senderId, deviceId, etc.), swap it in right here.
      setIncomingFromId(data.fromDeviceId ?? null);

      if (data.trusted) { // already accepted before
        acceptAndDownload(data.transferId, data.fileNames?.[0]); // bypass the popup, download instantly
        return;
      }

      Alert.alert( // native accept/decline popup
        data.count > 1 ? `${data.count} files incoming` : 'a file is incoming',
        data.fileNames.join('\n'),
        [
          {
            text: 'decline',
            style: 'cancel', // red/bold on ios
            onPress: () => {
              wsRef.current.send(JSON.stringify({
                type: 'decline_transfer',
                transferId: data.transferId
              }));
              setIncomingFromId(null);
            }
          },
          {
            text: 'accept',
            onPress: () => {
              acceptAndDownload(data.transferId, data.fileNames?.[0]);
            }
          },
        ]
      );
      return;
    }

    if (data.type === 'file_caught') { // laptop successfully received our throw
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); // happy double-thud
      setStatus('caught');
      setTimeout(() => {
        setStatus(''); // erase after 2.5 seconds
      }, 2500);
      return;
    }

    // NEW — the server already broadcasts this the instant the other side
    // hits decline (see socket.js's decline_transfer handler), but nothing
    // on the phone was ever listening for it. the drop flow sets
    // status('sent') the moment the upload POST finishes, which only means
    // "the file left my phone," not "the other person actually took it" —
    // so a decline was silently swallowed and the phone just kept showing
    // "sent" forever, looking like it succeeded when it didn't.
    if (data.type === 'transfer_declined') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); // distinct from the success thud above
      setStatus('declined');
      setTimeout(() => {
        setStatus(''); // erase after 2.5 seconds, same rhythm as 'caught'
      }, 2500);
      return;
    }
  };

  // --- network: websocket handshake ---
  const connectToRoom = async (roomPin) => { // triggered when 6 digits are typed
    setConnectError(null);
    const ip = await resolveIp(roomPin); // firebase lookup

    if (!ip) { // firebase couldn't find the laptop
      // NEW — this is a DIFFERENT failure than the server-side room-full
      // rejection (handleIncoming's data.error branch). that one happens
      // AFTER connecting, once the server actually looks at your pin. this
      // one happens BEFORE any connection even starts — firebase just has
      // no laptop registered under this pin at all (typo, laptop's off,
      // pin expired). was only shaking with zero explanation before.
      setConnectError("can't find that room — check the pin and try again");
      triggerWrongPinShake();
      return;
    }

    hostIpRef.current = ip;
    const socket = new WebSocket(`ws://${ip}:3000`); // open the live connection
    wsRef.current = socket;

    socket.onopen = () => { // the millisecond the connection succeeds
      socket.send(JSON.stringify({
        type: 'join',
        pin: roomPin,
        role: 'mobile',
        deviceId: deviceIdRef.current,
        label: name || 'node', // default alias
        avatarId // NEW — lets superhub.html (and eventually other peers) render your actual chosen avatar instead of a generic grey orb. server.js's room_update just needs to pass this field through on the peer object, same as it already does for label/deviceId — that's the one backend change this needs.
      }));
    };

    socket.onmessage = (event) => { // whenever the server talks to us
      handleIncoming(JSON.parse(event.data));
    };

    socket.onerror = () => { // websocket completely failed
      triggerWrongPinShake();
    };
  };

  // --- ui: pin entry logic ---
  const handlePinChange = (text) => { // triggered every keystroke
    const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 6); // strip letters, cap at 6 characters
    setPin(digitsOnly);
    setConnectError(null); // NEW — clear any stale "room full"/error text the moment they start retyping
    if (digitsOnly.length === 6) { // auto-connect, no submit button needed
      connectToRoom(digitsOnly);
    }
  };

  // --- native file pickers ---
  const pickFiles = () => { // triggered when they hit "+ load files"
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); // tiny physical click
    Alert.alert(
      'deploy payload',
      'choose source',
      [
        { text: 'cancel', style: 'cancel' },
        { text: 'photos', onPress: pickFromPhotos }, // launch the camera roll
        { text: 'files', onPress: pickFromFiles }, // launch icloud drive / files
      ]
    );
  };

  const pickFromFiles = async () => { // standard document picker logic
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      copyToCacheDirectory: true // required so react native can safely read the data
    });

    // FIXED — this used to stop right here. the picker would open, you'd
    // pick something, and then... nothing. the result was never read, so
    // "files" was a dead end next to "photos" in the deploy-payload
    // dialog. same merge logic as pickFromPhotos below (append + dedupe
    // by uri + cap at 10), for consistency.
    if (!result.canceled) {
      const normalized = result.assets.map((a) => ({
        uri: a.uri,
        name: a.name || 'file',
        mimeType: a.mimeType || 'application/octet-stream'
      }));
      setSelectedFiles((prev) => {
        const existingUris = new Set(prev.map((f) => f.uri));
        const merged = prev.concat(normalized.filter((f) => !existingUris.has(f.uri)));
        return merged.slice(0, 10);
      });
    }
  };

  // NEW — Android-specific fix. expo-image-picker's `fileName` field on
  // Android sometimes comes back as the media provider's own internal
  // UUID (seen: cloud-backed Google Photos images) instead of the actual
  // original filename — iOS's Photos framework doesn't have this
  // problem, it reliably hands back real names like "IMG_1234.HEIC".
  // no real person names a photo a bare hex UUID, so treat that shape as
  // unreliable and synthesize a clean name instead of showing raw
  // garbage in the file tray.
  const looksLikeJunkName = (name) => {
    if (!name) return true;
    const withoutExt = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(withoutExt);
  };

  const extensionForMime = (mimeType) => {
    const knownExtensions = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif',
      'image/gif': 'gif', 'image/webp': 'webp',
      'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/3gpp': '3gp'
    };
    return knownExtensions[mimeType] || (mimeType?.startsWith('video/') ? 'mp4' : 'jpg');
  };

  const pickFromPhotos = async () => { // standard camera roll logic
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync(); // ask for permission
    if (!perm.granted) {
      return; // user said no
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: 10 // explicit — was relying on the platform default (0/unlimited), made it match "up to 10" on purpose
    });

    if (!result.canceled) {
      const normalized = result.assets.map((a, i) => { // format for our http route
        const mimeType = a.mimeType || (a.type === 'video' ? 'video/mp4' : 'image/jpeg'); // fallback format
        // CHANGED — was `a.fileName || fallback`, which only caught a
        // MISSING name. a present-but-junk UUID name (see above) sailed
        // straight through. now anything that looks like junk also gets
        // the synthesized name — and that fallback now carries a real
        // extension (derived from mimeType) instead of no extension at
        // all, so a saved file still opens correctly on the other end.
        const name = looksLikeJunkName(a.fileName)
          ? `photo_${Date.now()}_${i}.${extensionForMime(mimeType)}`
          : a.fileName;
        return {
          uri: a.uri, // physical path on the phone
          name,
          mimeType
        };
      });
      // CHANGED — same fix as pickFromFiles: append + dedupe + cap at 10,
      // instead of wholesale replacing the tray on every pick.
      setSelectedFiles((prev) => {
        const existingUris = new Set(prev.map((f) => f.uri));
        const merged = prev.concat(normalized.filter((f) => !existingUris.has(f.uri)));
        return merged.slice(0, 10);
      });
    }
  };

  // --- the physics drop (the sonic boom) ---
  const sendFiles = async () => { // triggered when the thumb flick mathematically succeeds
    if (selectedFiles.length === 0) {
      return; // nothing loaded
    }

    const dispatched = selectedFiles; // freeze what's being sent before the tray empties
    setDispatchSnapshot(dispatched); // hands these off to the vanish animation
    setStrikeTargets(targetIds.length > 0 ? targetIds : peers.map((p) => p.deviceId)); // one bolt per targeted orb, or one to everyone if broadcasting
    setSelectedFiles([]); // empty the tray the instant the flick registers, not after upload finishes
    setTargetIds([]); // un-target every orb

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); // massive physical thud
    setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); // second beat, timed to the strike's impact flash
    }, 440);
    setGhostDropMsg(null); // clear old error text
    setStatus('dropping...');

    boomAnim.setValue(0); // reset the sonic boom to radius 0
    Animated.timing(boomAnim, {
      toValue: 1,
      duration: 500, // half a second to travel up the screen
      useNativeDriver: false // must be false for svg sizing
    }).start(() => {
      setDispatchSnapshot([]); // tags have fully dissolved, stop rendering them
      setStrikeTargets([]); // strike has landed, stop rendering it
    });

    // bump the history ring the moment the strike fires — matches the
    // reference's bumpHistory() call timing (right alongside the send)
    setSentHistoryPct((v) => {
      const next = v + 14;
      return next > 100 ? 16 : next;
    });

    const formData = new FormData(); // standard web payload container
    dispatched.forEach((f) => {
      formData.append('files', {
        uri: f.uri,
        name: f.name,
        type: f.mimeType || 'application/octet-stream'
      });
    });

    formData.append('roomId', pin); // where the server should send it
    formData.append('deviceId', deviceIdRef.current); // who we are
    if (targetIds.length > 0) { // tapped one or more specific orbs
      // CHANGED — was a single 'targetId' field. multipart form fields
      // don't reliably collapse repeated same-name entries into an array
      // across every parser, so this sends one JSON-encoded field instead
      // of gambling on that — see transferController.js for the other
      // half of this (JSON.parse + an .includes() check instead of ===).
      formData.append('targetIds', JSON.stringify(targetIds));
    }

    try {
      await new Promise((resolve, reject) => { // raw xmlhttp for upload progress control
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `http://${hostIpRef.current}:3000/api/upload`);
        xhr.onload = () => {
          if (xhr.status === 201) { // 201 = created/success
            resolve();
          } else {
            reject();
          }
        };
        xhr.onerror = () => { // wifi dropped
          reject();
        };
        xhr.send(formData);
      });
      setStatus('sent');
    } catch (e) { // upload rejected
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); // sharp double-buzz, a real failure
      boomAnim.stopAnimation(); // freeze the amber boom exactly where it died
      setGhostDropMsg('transfer lost to the void. try again.');
      setStatus('');
      setShattered(true); // swap the boom to grey, arm the shard burst
      shatterAnim.setValue(0); // reset the burst to its starting point
      Animated.timing(shatterAnim, { // fire the grey shards outward
        toValue: 1,
        duration: 450, // should read as a snap, not a slow fade
        useNativeDriver: false // must be false for svg
      }).start(() => { // once the burst finishes
        setShattered(false); // reset for the next attempt
      });
    }
  };

  // --- gesture detectors ---
  const swipeGesture = Gesture.Pan() // tracks dragging a finger across the screen
    .onUpdate((e) => {
      // intentionally left blank: we want a frictionless flick, not a heavy drag
    })
    .onEnd((e) => { // fires the exact millisecond the thumb lifts off the glass
      const distance = -e.translationY; // positive when swiped up
      const speed = -e.velocityY; // positive when swiped up
      // old logic required BOTH >80px of travel AND >400 velocity — but a
      // real quick flick covers very little distance precisely because
      // it's fast, so genuine flicks were failing the distance check
      // before ever getting evaluated on speed. now: a real fast flick
      // (high speed) registers even with barely any travel, OR a slower
      // more deliberate drag still works as long as it covers real
      // distance with at least some speed behind it
      const registersAsSwipe = (distance > 40 && speed > 250) || speed > 700;
      if (registersAsSwipe) {
        sendFiles();
      }
    });

  const tapGesture = Gesture.Tap().onEnd((e) => { // tracks a single quick tap
    // the anchor itself is the picker trigger, a big target on purpose:
    // the visible arc of the "you" circle plus a little slack below it
    const distFromAnchor = Math.hypot(e.x - ANCHOR_X, e.y - ANCHOR_Y);
    if (distFromAnchor < ANCHOR_RADIUS + 90) { // generous hit radius matching the now fully-visible core
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); // tiny physical click
      pickFiles(); // open the photos/files choice
      return; // don't also hit-test peers this tap
    }

    let hit = null; // assume they missed everything
    peers.forEach((peer) => { // loop through all the orbs
      const pos = scatterPositionFor(getSlotFor(peer.deviceId), peers.length, pin); // where this orb is physically drawn
      const dist = Math.hypot(e.x - pos.x, e.y - pos.y); // how far the tap landed from the orb's center
      if (dist < 40) { // within the hit-box radius
        hit = peer.deviceId; // record a direct hit
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); // tiny click to confirm
      }
    });

    if (!hit) {
      setTargetIds([]); // tapped empty space — same "cancel" behavior as before, now clearing the whole selection instead of just one id
      return;
    }

    // CHANGED — this used to just overwrite the single targetId, so
    // tapping a second orb silently dropped the first one. now each tap
    // toggles that ONE orb in/out of the selection, leaving everyone
    // else's state untouched: tap 3 different orbs and all 3 stay
    // selected, tap one of them again and only that one drops out.
    setTargetIds((current) =>
      current.includes(hit) ? current.filter((id) => id !== hit) : [...current, hit]
    );
  });

  // array of 6 items. if 'pin' is "12", creates ['1', '2', null, null, null, null]
  const digitBoxes = Array.from({ length: 6 }, (_, i) => pin[i] ?? null);

  // ============================================================================
  // the render tree
  // ============================================================================

  // graceful loading screen while the font initializes so it never crashes
  if (!fontLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: theme.mutedText, fontSize: 10, letterSpacing: 2 }}>LOADING SYSTEM...</Text>
      </View>
    );
  }

  return (
      <GestureHandlerRootView style={styles.safe}> {/* master wrapper, enables finger tracking */}
        <TextInput // invisible keyboard listener
          ref={pinInputRef} // lets us focus it programmatically
          value={pin}
          onChangeText={handlePinChange}
          keyboardType="number-pad" // number-only keyboard
          maxLength={6}
          style={styles.hiddenInput} // throws it completely off screen, invisibly
        />

        <Animated.View // master wrapper for screen fades
          style={[
            styles.canvas,
            { opacity: canvasOpacity, backgroundColor: theme.bg } // bound to the fade engine, and now actually swaps with the toggle instead of staying stuck on whatever styles.canvas hardcodes
          ]}
        >

          {/* --- stage 1: intro --- */}
          {stage === 'intro' && (
            <View style={styles.splashScreenContainer}>

              {/* center block: logo and loading bar */}
              <View style={styles.centerBlock}>
                <View style={styles.logoContainer}>
                  <Text style={styles.logoLight}>spatial</Text>
                  <Text style={styles.logoHeavy}>DROP</Text>
                </View>

                {/* the cinematic progress bar */}
                <View style={styles.progressBarTrack}>
                  <Animated.View
                    style={[
                      styles.progressBarFill,
                      {
                        width: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%']
                        })
                      }
                    ]}
                  />
                  <AmbientGlow />
                </View>
              </View>

              {/* bottom independent tagline */}
              <View style={styles.bottomTaglineContainer}>
                <Text style={styles.introTagline}>flick a file</Text>
              </View>

            </View>
          )}

          {/* --- stage 1.5: the loading transition --- */}
          {stage === 'loading' && (
            <View style={styles.centerBlock}>
              <LumaLoader />
            </View>
          )}

          {/* --- stage 1.75: sign in --- */}
          {/* sits between the intro splash and 'boarding' now — nobody gets
              further into the app without either a real account or
              tapping "continue as guest." onAuthed just advances the
              stage exactly like the old progress-bar callback used to */}
          {stage === 'auth' && (
            <AuthScreen
              onAuthed={(user) => {
                setCurrentUser(user); // remember who's signed in for the rest of the session
                syncUserToBackend({
                  firebaseUid: user.uid,
                  email: user.email,
                  displayName: user.displayName,
                  isGuest: user.isAnonymous,
                  avatarId,
                });
                crossfadeTo('boarding');
              }}
            />
          )}

          {/* --- stage 2: boarding pass --- */}
          {stage === 'boarding' && (
            <View style={styles.centerBlock}>

              {/* --- toggle backgrounds here --- */}
              {/* <ConstellationBackground /> */}
              <MatrixBackground typedName={name} />

              <Text style={[styles.logoLight, { fontSize: 14, marginBottom: 40, opacity: 0.6 }]}>
                welcome aboard.
              </Text>
              <TextInput
                placeholder="identification:"
                placeholderTextColor={theme.mutedText}
                value={name}
                onChangeText={setName}
                style={styles.nameInput}
                keyboardAppearance="dark"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                style={({ pressed }) => [styles.ctaButton, { opacity: pressed ? 0.5 : 1 }]}
                onPress={() => {
                  if (name.trim().length > 0) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    crossfadeTo('dock');
                  }
                }}
              >
                <Text style={styles.ctaText}>continue</Text>
              </Pressable>
            </View>
          )}

          {/* --- stage 3: the pin dock --- */}
          {stage === 'dock' && (
            <Animated.View // container that handles the automatic error shaking
              style={[
                styles.centerBlock,
                { transform: [{ translateX: pinShakeAnim }] }
              ]}
            >
              {/* NEW — this screen used to be totally flat black, no
                  atmosphere at all, unlike boarding (hex rain) and radar
                  (scattered stars). StaticStarfield already existed,
                  built and ready, just never actually mounted anywhere
                  in the app until now. */}
              <StaticStarfield />
              {/* --- placeholder for the 3 emoticons --- */}
              <View style={{ flexDirection: 'row', gap: 15, marginBottom: 30 }}>
                <Text style={{ fontSize: 25, color: theme.amber }}>⊹ ࣪ ﹏𓊝﹏𓂁﹏⊹ ࣪ ˖</Text>
              </View>

              <Text style={[styles.logoLight, { fontSize: 14, marginBottom: 40, opacity: 0.6 }]}>
                enter docking node.
              </Text>

              <Pressable // tapping this opens the hidden keyboard automatically
                style={styles.pinRow}
                onPress={() => {
                  pinInputRef.current?.focus();
                }}
              >
                {digitBoxes.map((d, i) => (
                  // CHANGED — was a bordered pill (box + outline) around each
                  // digit. swapped for the plain "digit + underline" style:
                  // no box at all, just a big number with a short line under
                  // it that lights up crimson once that slot is filled.
                  <View key={i} style={styles.pinDigitWrap}>
                    <Text style={[styles.pinDigit, { color: d ? theme.text : theme.mutedText, fontWeight: '300' }]}>
                      {d ?? ''}
                    </Text>
                    <View style={[styles.pinUnderline, { backgroundColor: d ? theme.amber : theme.boxBorderFilled }]} />
                  </View>
                ))}
              </Pressable>
              {/* NEW — connectError was already being SET (see handleIncoming
                  above, data.error branch) but never actually rendered
                  anywhere, so a room-full rejection just silently shook the
                  pin boxes with no explanation. this is the missing piece. */}
              {/* !!() — same defensive fix as ghostDropMsg/status below.
                  connectError gets set from data.error off the socket; if
                  the server ever sent an empty string there instead of
                  null, `'' && (...)` would render the bare string '' and
                  trip the same "Text strings must be rendered within a
                  <Text> component" error. */}
              {!!connectError && (
                <Text style={[styles.pinErrorText, { color: theme.error }]}>
                  {connectError}
                </Text>
              )}
            </Animated.View>
          )}

          {/* --- STAGE 4: THE PLASMA FIELD (LIGHTNING) --- */}
          {stage === 'radar' && (
            <GestureDetector gesture={swipeGesture}>
              <View style={styles.radarContainer}>
                {/* NEW — trying the radar screen against pitch black
                    specifically (not the theme's #121110), scoped to just
                    this screen — other stages still use theme.bg */}
                <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000' }]} />
                <CornerFrame color={theme.boxBorder} />
                <GestureDetector gesture={tapGesture}>
                  <Svg width={windowWidth} height={windowHeight} style={StyleSheet.absoluteFill}>
                    <Defs>
                      {/* CHANGED BACK — was the reference's literal magenta
                          (#E9389F), now matches SquigglyOrb's cherry
                          RING_ACCENT (#990433) instead */}
                      <RadialGradient id="nodeGlowIdle" cx="50%" cy="50%" r="50%">
                        <Stop offset="0%" stopColor="#990433" stopOpacity="0.5" />
                        <Stop offset="100%" stopColor="#990433" stopOpacity="0" />
                      </RadialGradient>
                      <RadialGradient id="nodeGlowOutgoing" cx="50%" cy="50%" r="50%">
                        <Stop offset="0%" stopColor={theme.amber} stopOpacity="0.6" />
                        <Stop offset="100%" stopColor={theme.amber} stopOpacity="0" />
                      </RadialGradient>
                      <RadialGradient id="nodeGlowIncoming" cx="50%" cy="50%" r="50%">
                        <Stop offset="0%" stopColor={theme.incomingGlow} stopOpacity="0.6" />
                        <Stop offset="100%" stopColor={theme.incomingGlow} stopOpacity="0" />
                      </RadialGradient>
                      <RadialGradient id="youGrad" cx="50%" cy="50%" r="50%">
                        <Stop offset="0%" stopColor={theme.amber} stopOpacity="0.3" />
                        <Stop offset="100%" stopColor={theme.amber} stopOpacity="0" />
                      </RadialGradient>
                      {/* CHANGED — first version of this halo (0.9 opacity at
                          center, 4x the core radius) is what made the stars
                          read as solid gold blobs instead of a soft glow.
                          pulled the peak opacity way down and tightened the
                          falloff so it's a faint haze around a tiny point,
                          not a visible disc of its own. */}
                      <RadialGradient id="starGlow" cx="50%" cy="50%" r="50%">
                        <Stop offset="0%" stopColor={theme.starGold} stopOpacity="0.45" />
                        <Stop offset="40%" stopColor={theme.starGold} stopOpacity="0.12" />
                        <Stop offset="100%" stopColor={theme.starGold} stopOpacity="0" />
                      </RadialGradient>
                    </Defs>

                    {/* 1. SCATTERED GLOWING STARS — replaces the uniform sensor-field
                        grid. back to random placement (like the very first pass),
                        but each star is now a real two-layer glow (soft halo +
                        bright core, both theme.starGold) instead of a single flat
                        dot, and actually twinkles — each star is bucketed into one
                        of the 6 shared dustTwinkleRef loops (built earlier, never
                        actually wired to anything on screen until now) so the
                        field visibly breathes instead of sitting static. */}
                    {/* CHANGED — dropped the separate halo circle per star
                        (was 2 AnimatedCircle per star, now 1). every extra
                        JS-driven animated shape is thread work competing
                        with the sweep's own per-frame path recompute —
                        this glow was marginal at this size and not worth
                        doubling the shape count for. */}
                    {GLOW_STARS.map((star, i) => {
                      const twinkle = dustTwinkleRef.current[star.bucket].interpolate({
                        inputRange: [0, 1],
                        outputRange: [star.o * 0.25, star.o]
                      });
                      return (
                        <AnimatedCircle
                          key={`star-${i}`}
                          cx={star.x}
                          cy={star.y}
                          r={star.r * 1.4}
                          fill={theme.starGold}
                          opacity={twinkle}
                        />
                      );
                    })}

                    {/* 2 & 3. PEER CONSTELLATION — orbiting nodes, and the swipe-triggered strike */}
                    <PeerConstellation
                      peers={peers}
                      getSlotFor={getSlotFor}
                      getPeerScale={getPeerScale}
                      getPeerBreathe={getPeerBreathe}
                      targetIds={targetIds}
                      incomingFromId={incomingFromId}
                      pulseAnim={pulseAnim}
                      boomAnim={boomAnim}
                      strikeTargets={strikeTargets}
                      pin={pin}
                    />

                    {/* 4. THE ANCHOR INSTRUMENT CORE — fully on-screen now (see
                        constants/layout.js), so its rings/gauge detail actually shows
                        instead of being cropped by the bottom edge */}
                    {/* NOTE — no longer takes a `color` prop: it now renders
                        the reference design's exact literal colors
                        internally (see SquigglyOrb.js), not the app theme */}
                    <SquigglyOrb
                      cx={ANCHOR_X}
                      cy={ANCHOR_Y}
                      radius={ANCHOR_RADIUS}
                      pulseAnim={pulseAnim}
                      historyPct={sentHistoryPct}
                    />

                    {/* 5. THE DISPATCH BLOOM — soft light lifting off the anchor as files launch */}
                    {(dispatchSnapshot.length > 0 || shattered) && (
                      <AnimatedCircle
                        cx={ANCHOR_X}
                        cy={ANCHOR_Y}
                        r={boomAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 220] })}
                        fill={shattered ? theme.mutedText : theme.amber}
                        opacity={boomAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.35, 0.12, 0] })}
                      />
                    )}

                    {/* 6. FAILURE SHARDS — fire outward along the 6 fixed angles from where the boom died */}
                    {shattered && SHARD_ANGLES.map((angle, i) => {
                      const dx = Math.cos(angle); // fixed per-shard direction, computed once at render
                      const dy = Math.sin(angle);
                      return (
                        <AnimatedCircle
                          key={`shard-${i}`}
                          cx={shatterAnim.interpolate({ inputRange: [0, 1], outputRange: [ANCHOR_X, ANCHOR_X + dx * 110] })}
                          cy={shatterAnim.interpolate({ inputRange: [0, 1], outputRange: [ANCHOR_Y, ANCHOR_Y + dy * 110] })}
                          r={shatterAnim.interpolate({ inputRange: [0, 1], outputRange: [4, 1] })}
                          fill={theme.mutedText}
                          opacity={shatterAnim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.8, 0.5, 0] })}
                        />
                      );
                    })}
                  </Svg>
                </GestureDetector>

                {/* 5. FLOATING UI LABELS */}
                <Animated.Text style={[styles.topLabel, { color: '#BAAAA6', opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }) }]}>
                  {selectedFiles.length > 0 ? 'launch code.' : 'flick a file.'}
                </Animated.Text>

                {peers.map((peer) => {
                  const pos = scatterPositionFor(getSlotFor(peer.deviceId), peers.length, pin);
                  const isTargeted = targetIds.includes(peer.deviceId);

                  return (
                    <Text
                      key={`label-${peer.deviceId}`}
                      style={[
                        styles.peerLabel,
                        {
                          left: pos.x - 40, // centers the 80px wide text box
                          top: pos.y + 22, // drops text below the orb — nudged down a bit more so the node itself doesn't sit on top of the label
                          color: isTargeted ? theme.amber : '#C4B3B0' // literal reference peer-label color when idle, still highlights amber when targeted
                        }
                      ]}
                    >
                      {peer.label}
                    </Text>
                  );
                })}

                {/* THE ARMED MANIFEST — files loaded and waiting, sitting still above the anchor */}
                {selectedFiles.length > 0 && (
                  <DispatchManifest files={selectedFiles} boomAnim={boomAnim} dispatching={false} />
                )}

                {/* THE DISPATCHED MANIFEST — the same tags, now lifting off and dissolving */}
                {dispatchSnapshot.length > 0 && (
                  <DispatchManifest files={dispatchSnapshot} boomAnim={boomAnim} dispatching={true} />
                )}

                {/* NEW — brought error/status feedback back, but deliberately
                    minimal this time: plain floating text, no pill/box/blur,
                    and no "[N FILE(S) ARMED]" line at all (the bottom tray
                    already shows what's loaded, so that was pure duplicate
                    clutter). only ever renders when there's an actual error
                    or a real transient event (sent/caught/declined/
                    receiving) — invisible the rest of the time, unlike the
                    old pill which sat on screen continuously whenever files
                    were armed. */}
                {/* FIXED — was `{(ghostDropMsg || status) && (...)}`. when
                    ghostDropMsg is null AND status is '' (its default/reset
                    value, i.e. most of the time), `null || ''` evaluates to
                    '' — a STRING, not false. React Native then tries to
                    render that bare empty string as a child of the
                    surrounding View instead of skipping it, which is
                    exactly the "Text strings must be rendered within a
                    <Text> component" crash. wrapping the whole condition in
                    !!(...) forces a real boolean, so the falsy case is
                    `false` (which React silently skips) instead of ''. */}
                {!!(ghostDropMsg || status) && (
                  <Text style={[styles.hudText, { color: ghostDropMsg ? theme.error : theme.mutedText }]}>
                    {ghostDropMsg || status}
                  </Text>
                )}

              </View>
            </GestureDetector>
          )}

          {/* --- settings entry point --- */}
          {/* deliberately kept OUTSIDE the swipeGesture's GestureDetector
              above — sitting inside it risked the pan gesture on the whole
              radar screen fighting with this being a simple tap. as its
              own sibling, absolutely positioned in the top-right corner,
              it never touches that gesture logic at all */}
          {stage === 'radar' && (
            <Pressable
              onPress={() => crossfadeTo('settings')}
              style={{ position: 'absolute', top: 53, right: 24, padding: 8 }} // nudged down one notch — was sitting too close to the top edge
            >
              {/* CHANGED — was a plain "⚙" gear character. matches the
                  crosshair/target icon from the redesign reference instead
                  — a thin outer ring with four short tick marks, same
                  "instrument" language as the new anchor orb's single ring
                  and the radar sweep, rather than a generic settings glyph
                  that doesn't relate to the rest of the screen at all. */}
              <Svg width={26} height={26} viewBox="0 0 26 26">
                <Circle cx={13} cy={13} r={9} stroke="#BAAAA6" strokeWidth={1.4} fill="none" opacity={0.9} />
                <Circle cx={13} cy={13} r={1.6} fill="#BAAAA6" opacity={0.9} />
                <Line x1={13} y1={0.5} x2={13} y2={4} stroke="#BAAAA6" strokeWidth={1.4} opacity={0.9} />
                <Line x1={13} y1={22} x2={13} y2={25.5} stroke="#BAAAA6" strokeWidth={1.4} opacity={0.9} />
                <Line x1={0.5} y1={13} x2={4} y2={13} stroke="#BAAAA6" strokeWidth={1.4} opacity={0.9} />
                <Line x1={22} y1={13} x2={25.5} y2={13} stroke="#BAAAA6" strokeWidth={1.4} opacity={0.9} />
              </Svg>
            </Pressable>
          )}

          {/* --- stage 5: settings / menu --- */}
          {stage === 'settings' && (
            <SettingsMenu
              user={currentUser}
              avatarId={avatarId}
              onAvatarChange={(id) => {
                setAvatarId(id);
                if (currentUser) {
                  syncUserToBackend({
                    firebaseUid: currentUser.uid,
                    email: currentUser.email,
                    displayName: currentUser.displayName,
                    isGuest: currentUser.isAnonymous,
                    avatarId: id,
                  });
                }
                // NEW — the join message only sends avatarId ONCE, at the
                // moment you first connect to a room. changing it here in
                // Settings updated your local UI and your account record,
                // but nobody currently in your room ever heard about it —
                // the peer list on their end (superhub.html's orbs, etc)
                // kept showing whatever avatar you had when you joined.
                // this pushes the change live if you're mid-session in a
                // room; socket.js has a matching 'avatar_update' handler
                // that updates the stored avatarId and re-broadcasts.
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({ type: 'avatar_update', avatarId: id }));
                }
              }}
              onLoggedOut={() => {
                setCurrentUser(null);
                crossfadeTo('auth');
              }}
              // NEW — fires when a guest upgrades to a real account (or logs
              // into an existing one) right inside Settings, without ever
              // leaving this screen. App.js is the one holding currentUser,
              // so SettingsMenu can't just update its own copy — it has to
              // hand the new user object back up here.
              onUserUpdated={(user) => {
                setCurrentUser(user);
                syncUserToBackend({
                  firebaseUid: user.uid,
                  email: user.email,
                  displayName: user.displayName,
                  isGuest: user.isAnonymous,
                  avatarId,
                });
              }}
              onBack={() => crossfadeTo('radar')}
            />
          )}
        </Animated.View>
      </GestureHandlerRootView>
  );
}

// the actual default export now — AppInner is the one doing all the work,
// this just makes sure it renders as a genuine child of ThemeProvider so
// useTheme() inside it is live instead of frozen on the default context
export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}