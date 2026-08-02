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
  Keyboard
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

import { COLORS, NODE_TONES } from './constants/colors';
import {
  windowWidth,
  windowHeight,
  ANCHOR_X,
  ANCHOR_Y
} from './constants/layout';
import { hashToUnit } from './utils/hash';
import { scatterPositionFor, branchPathFor, DUST_STARS, SHARD_ANGLES } from './utils/geometry';
import { generateId } from './utils/id';
import { resolveIp } from './utils/network';
import { AnimatedCircle, AnimatedPath, AnimatedLine } from './components/AnimatedPrimitives';
import { MatrixBackground } from './components/MatrixBackground';
import { styles } from './styles/appStyles';
import { SquigglyOrb } from './components/SquigglyOrb';
import { DispatchManifest } from './components/DispatchManifest';
import { PeerConstellation } from './components/PeerConstellation';

export default function App() { // main function react native renders to the screen

  // --- custom font state ---
  const [fontLoaded, setFontLoaded] = useState(false); // tracks if pliant.ttf has loaded

  // --- state variables (changing these refreshes the ui) ---
  const [stage, setStage] = useState('intro'); // 'intro', 'boarding', 'dock', or 'radar'
  const [name, setName] = useState(''); // alias string the user types in
  const [pin, setPin] = useState(''); // 6-digit string the user types in
  const [connectError, setConnectError] = useState(null); // true if the socket failed to connect
  const [ghostDropMsg, setGhostDropMsg] = useState(null); // red "lost to void" error text
  const [peers, setPeers] = useState([]); // other devices in the room
  const [status, setStatus] = useState(''); // tiny text prompt at the bottom
  const [selectedFiles, setSelectedFiles] = useState([]); // files picked from the gallery
  const [targetId, setTargetId] = useState(null); // which specific orb the user tapped on
  const [shattered, setShattered] = useState(false); // true briefly when a throw fails mid-flight
  const [dispatchSnapshot, setDispatchSnapshot] = useState([]); // files frozen at swipe-time, purely for the vanish animation
  const [strikeTargets, setStrikeTargets] = useState([]); // deviceIds the lightning strike is currently animating toward

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
        // once the bar finishes filling, fade to boarding
        crossfadeTo('boarding');
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
      Animated.timing(canvasOpacity, { // fade back in
        toValue: 1,
        duration: 250,
        useNativeDriver: true
      }).start();
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
  const acceptAndDownload = async (transferId) => { // when the laptop throws something back to the phone
    wsRef.current.send(JSON.stringify({
      type: 'accept_transfer',
      transferId
    }));
    setStatus('receiving...');
    try {
      const destUri = FileSystem.cacheDirectory + `spatialdrop_${transferId}`; // temporary hidden folder path
      const result = await FileSystem.downloadAsync( // download the heavy bytes
        `http://${hostIpRef.current}:3000/api/download/${transferId}`,
        destUri
      );
      if (await Sharing.isAvailableAsync()) { // if the phone has a share menu
        await Sharing.shareAsync(result.uri); // native "save to photos?" sheet
      }
      setStatus('');
    } catch (err) { // wifi dropped mid-download
      setStatus('transfer lost to the void. try again.');
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

      if (stage !== 'radar') { // still on the pin screen
        Keyboard.dismiss();
        pinInputRef.current?.blur();
        crossfadeTo('radar'); // fade into the constellation canvas
      }
      return;
    }

    if (data.type === 'incoming_files') { // the laptop is throwing to us
      if (data.trusted) { // already accepted before
        acceptAndDownload(data.transferId); // bypass the popup, download instantly
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
            }
          },
          {
            text: 'accept',
            onPress: () => {
              acceptAndDownload(data.transferId);
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
  };

  // --- network: websocket handshake ---
  const connectToRoom = async (roomPin) => { // triggered when 6 digits are typed
    setConnectError(null);
    const ip = await resolveIp(roomPin); // firebase lookup

    if (!ip) { // firebase couldn't find the laptop
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
        label: name || 'node' // default alias
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

    if (!result.canceled) {
      setSelectedFiles(result.assets);
      setStatus('loaded. flick to drop.');
    }
  };

  const pickFromPhotos = async () => { // standard camera roll logic
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync(); // ask for permission
    if (!perm.granted) {
      return; // user said no
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true
    });

    if (!result.canceled) {
      const normalized = result.assets.map((a, i) => { // format for our http route
        return {
          uri: a.uri, // physical path on the phone
          name: a.fileName || `photo_${Date.now()}_${i}`, // fallback name if missing
          mimeType: a.mimeType || (a.type === 'video' ? 'video/mp4' : 'image/jpeg') // fallback format
        };
      });
      setSelectedFiles(normalized);
      setStatus('loaded. flick to drop.');
    }
  };

  // --- the physics drop (the sonic boom) ---
  const sendFiles = async () => { // triggered when the thumb flick mathematically succeeds
    if (selectedFiles.length === 0) {
      return; // nothing loaded
    }

    const dispatched = selectedFiles; // freeze what's being sent before the tray empties
    setDispatchSnapshot(dispatched); // hands these off to the vanish animation
    setStrikeTargets(targetId ? [targetId] : peers.map((p) => p.deviceId)); // one bolt if targeted, one to everyone if broadcasting
    setSelectedFiles([]); // empty the tray the instant the flick registers, not after upload finishes
    setTargetId(null); // un-target the orb

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); // massive physical thud
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
    if (targetId) { // tapped a specific orb
      formData.append('targetId', targetId);
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
      const swipedUpFarEnough = e.translationY < -80; // dragged up at least 80 pixels
      const swipedFastEnough = e.velocityY < -400; // dragged fast enough
      if (swipedUpFarEnough && swipedFastEnough) { // both conditions met
        sendFiles();
      }
    });

  const tapGesture = Gesture.Tap().onEnd((e) => { // tracks a single quick tap
    // the anchor itself is the picker trigger, a big target on purpose:
    // the visible arc of the "you" circle plus a little slack below it
    const distFromAnchor = Math.hypot(e.x - ANCHOR_X, e.y - ANCHOR_Y);
    if (distFromAnchor < 190) { // generous hit radius matching the visible arc
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); // tiny physical click
      pickFiles(); // open the photos/files choice
      return; // don't also hit-test peers this tap
    }

    let hit = null; // assume they missed everything
    peers.forEach((peer) => { // loop through all the orbs
      const pos = scatterPositionFor(getSlotFor(peer.deviceId)); // where this orb is physically drawn
      const dist = Math.hypot(e.x - pos.x, e.y - pos.y); // how far the tap landed from the orb's center
      if (dist < 40) { // within the hit-box radius
        hit = peer.deviceId; // record a direct hit
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); // tiny click to confirm
      }
    });

    // hit the same orb twice -> unselect it. hit a new orb -> select it.
    setTargetId((current) => {
      return hit === current ? null : hit;
    });
  });

  // array of 6 items. if 'pin' is "12", creates ['1', '2', null, null, null, null]
  const digitBoxes = Array.from({ length: 6 }, (_, i) => pin[i] ?? null);

  // ============================================================================
  // the render tree
  // ============================================================================

  // graceful loading screen while the font initializes so it never crashes
  if (!fontLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: COLORS.mutedText, fontSize: 10, letterSpacing: 2 }}>LOADING SYSTEM...</Text>
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
          { opacity: canvasOpacity } // bound to the fade engine
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
              placeholderTextColor={COLORS.mutedText}
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
            {/* --- placeholder for the 3 emoticons --- */}
            <View style={{ flexDirection: 'row', gap: 15, marginBottom: 30 }}>
              <Text style={{ fontSize: 25, color: COLORS.amber }}>⊹ ࣪ ﹏𓊝﹏𓂁﹏⊹ ࣪ ˖</Text>
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
                <View
                  key={i}
                  style={[styles.pinBox, { borderColor: d ? COLORS.boxBorderFilled : COLORS.boxBorder }]}
                >
                  <Text style={[styles.pinDigit, { color: d ? COLORS.text : COLORS.mutedText }]}>
                    {d ?? '_'}
                  </Text>
                </View>
              ))}
            </Pressable>
          </Animated.View>
        )}

        {/* --- STAGE 4: THE PLASMA FIELD (LIGHTNING) --- */}
        {stage === 'radar' && (
          <GestureDetector gesture={swipeGesture}>
            <View style={styles.radarContainer}>
              <GestureDetector gesture={tapGesture}>
                <Svg width={windowWidth} height={windowHeight} style={StyleSheet.absoluteFill}>
                  <Defs>
                    {NODE_TONES.map((tone, i) => (
                      <RadialGradient key={`glow-${i}`} id={`nodeGlow${i}`} cx="50%" cy="50%" r="50%">
                        <Stop offset="0%" stopColor={tone} stopOpacity="0.6" /> 
                        <Stop offset="100%" stopColor={tone} stopOpacity="0" />
                      </RadialGradient>
                    ))}
                    <RadialGradient id="youGrad" cx="50%" cy="50%" r="50%">
                      <Stop offset="0%" stopColor={COLORS.amber} stopOpacity="0.3" /> 
                      <Stop offset="100%" stopColor={COLORS.amber} stopOpacity="0" /> 
                    </RadialGradient>
                  </Defs>

                  {/* 1. FAINT BACKGROUND DUST */}
                  {DUST_STARS.map((star, i) => (
                    <Circle 
                      key={`dust-${i}`} 
                      cx={star.x} // horizontal hash placement
                      cy={star.y} // vertical hash placement
                      r={star.r} // base size of the dust
                      fill={COLORS.text} // pure white
                      opacity={star.o} // dim hashed opacity
                    />
                  ))}

                  {/* 2 & 3. PEER CONSTELLATION — orbiting nodes, ambient bolts, and the swipe-triggered strike */}
                  <PeerConstellation
                    peers={peers}
                    getSlotFor={getSlotFor}
                    getPeerScale={getPeerScale}
                    getPeerBreathe={getPeerBreathe}
                    targetId={targetId}
                    pulseAnim={pulseAnim}
                    boomAnim={boomAnim}
                    strikeTargets={strikeTargets}
                  />

                  {/* 4. THE 3D SQUIGGLY ORB (Anchor) */}
                  <SquigglyOrb 
                    cx={ANCHOR_X} 
                    cy={ANCHOR_Y + 120} 
                    radius={180} 
                    color={COLORS.idkman} 
                    pulseAnim={pulseAnim} 
                  />

                  {/* 5. THE DISPATCH BLOOM — soft light lifting off the anchor as files launch */}
                  {(dispatchSnapshot.length > 0 || shattered) && (
                    <AnimatedCircle
                      cx={ANCHOR_X}
                      cy={ANCHOR_Y}
                      r={boomAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 220] })}
                      fill={shattered ? COLORS.mutedText : COLORS.amber}
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
                        fill={COLORS.mutedText}
                        opacity={shatterAnim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.8, 0.5, 0] })}
                      />
                    );
                  })}
                </Svg>
              </GestureDetector>

              {/* 5. FLOATING UI LABELS */}
              <Animated.Text style={[styles.topLabel, { opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }) }]}>
                {selectedFiles.length > 0 ? 'launch code.' : 'flick a file.'}
              </Animated.Text>

              {peers.map((peer) => {
                const pos = scatterPositionFor(getSlotFor(peer.deviceId));
                const isTargeted = targetId === peer.deviceId;
                
                return (
                  <Text 
                    key={`label-${peer.deviceId}`} 
                    style={[
                      styles.peerLabel, 
                      { 
                        left: pos.x - 40, // centers the 80px wide text box
                        top: pos.y + 15, // drops text below the orb
                        color: isTargeted ? COLORS.amber : COLORS.mutedText // highlights if targeted
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

              {/* 6. BOTTOM HUD / ERRORS */}
              <View style={styles.hud}>
                {ghostDropMsg ? (
                  <Text style={[styles.caption, { color: COLORS.error }]}>{ghostDropMsg}</Text>
                ) : (
                  <Text style={styles.caption}>
                    {status || (selectedFiles.length > 0 ? `[ ${selectedFiles.length} FILE(S) ARMED ]` : '')}
                  </Text>
                )}
              </View>

            </View>
          </GestureDetector>
        )}
      </Animated.View>
    </GestureHandlerRootView>
  );
}