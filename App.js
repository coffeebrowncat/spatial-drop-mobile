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
  Stop
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
import { hashToUnit, toneIndexForDevice, radiusForDevice } from './utils/hash';
import { scatterPositionFor, branchPathFor, DUST_STARS, SHARD_ANGLES } from './utils/geometry';
import { generateId } from './utils/id';
import { resolveIp } from './utils/network';
import { AnimatedCircle, AnimatedPath } from './components/AnimatedPrimitives';
import { MatrixBackground } from './components/MatrixBackground';
import { styles } from './styles/appStyles';

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

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); // massive physical thud
    setGhostDropMsg(null); // clear old error text
    setStatus('dropping...');

    boomAnim.setValue(0); // reset the sonic boom to radius 0
    Animated.timing(boomAnim, {
      toValue: 1,
      duration: 500, // half a second to travel up the screen
      useNativeDriver: false // must be false for svg sizing
    }).start();

    const formData = new FormData(); // standard web payload container
    selectedFiles.forEach((f) => {
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

    setSelectedFiles([]); // clear memory
    setTargetId(null); // un-target the orb
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

        {/* --- stage 4: the radar constellation --- */}
        {stage === 'radar' && (
          <GestureDetector gesture={swipeGesture}> {/* outer wrapper, listens for the swipe */}
            <View style={styles.radarContainer}> {/* master container, fills the screen */}
              <GestureDetector gesture={tapGesture}> {/* inner wrapper, listens for the tap */}
                <Svg
                  width={windowWidth} // exactly as wide as the phone
                  height={windowHeight} // exactly as tall as the phone
                  style={StyleSheet.absoluteFill} // pinned to the corners
                >
                  <Defs>
                    <RadialGradient id="youGrad" cx="50%" cy="50%" r="50%"> {/* soft glowing light effect */}
                      <Stop offset="0%" stopColor={COLORS.amber} stopOpacity="0.4" /> {/* center core */}
                      <Stop offset="100%" stopColor={COLORS.amber} stopOpacity="0" /> {/* outer edge, fades out */}
                    </RadialGradient>

                    {/* two dispersal-bloom gradients: warm amber for a successful drop, */}
                    {/* grey for a failed one, replaces the old hard ring */}
                    <RadialGradient id="boomGradAmber" cx="50%" cy="50%" r="50%">
                      <Stop offset="0%" stopColor={COLORS.amber} stopOpacity="0.55" />
                      <Stop offset="55%" stopColor={COLORS.amber} stopOpacity="0.2" />
                      <Stop offset="100%" stopColor={COLORS.amber} stopOpacity="0" />
                    </RadialGradient>
                    <RadialGradient id="boomGradGrey" cx="50%" cy="50%" r="50%">
                      <Stop offset="0%" stopColor={COLORS.mutedText} stopOpacity="0.5" />
                      <Stop offset="55%" stopColor={COLORS.mutedText} stopOpacity="0.18" />
                      <Stop offset="100%" stopColor={COLORS.mutedText} stopOpacity="0" />
                    </RadialGradient>

                    {/* one soft glow gradient per node tone, so each peer's orb */}
                    {/* sits inside its own halo instead of a flat filled dot */}
                    {NODE_TONES.map((tone, i) => (
                      <RadialGradient key={`glow-${i}`} id={`nodeGlow${i}`} cx="50%" cy="50%" r="50%">
                        <Stop offset="0%" stopColor={tone} stopOpacity="0.55" />
                        <Stop offset="100%" stopColor={tone} stopOpacity="0" />
                      </RadialGradient>
                    ))}
                  </Defs>

                  {/* 0. background dust — faint fixed stars, sitting behind everything else */}
                  {DUST_STARS.map((star, i) => (
                    <Circle key={`dust-${i}`} cx={star.x} cy={star.y} r={star.r} fill={COLORS.text} opacity={star.o} />
                  ))}

                  {/* 1. constellation branches — curved, bowed connections instead of dead-straight */}
                  {/* spokes, so the whole graph reads as an organic constellation */}
                  {peers.map((peer, i) => {
                    const pos = scatterPositionFor(peer.deviceId, i); // this peer's coordinate
                    const isTargeted = targetId === peer.deviceId; // is this line selected
                    const branch = branchPathFor(ANCHOR_X, ANCHOR_Y, pos.x, pos.y, peer.deviceId); // curved path + bowed midpoint
                    const toneIdx = toneIndexForDevice(peer.deviceId); // which warm tone this junction star uses
                    return (
                      <React.Fragment key={`branch-${peer.deviceId}`}>
                        <AnimatedPath // the curved branch
                          d={branch.d} // bowed quadratic-bezier path
                          stroke={isTargeted ? COLORS.amber : COLORS.branch} // amber if active, dusty rose if idle
                          strokeWidth={isTargeted ? 1.5 : 0.75} // thick if active, thin if idle
                          fill="none"
                          opacity={ // complex heartbeat check
                            isTargeted
                              ? pulseAnim.interpolate({ // tied to the breathing engine
                                inputRange: [0, 1],
                                outputRange: [0.3, 0.85]
                              })
                              : 0.22 // idle, static — visible enough to read as a graph
                          }
                        />
                        <Circle // tiny junction star where the branch bows
                          cx={branch.midX}
                          cy={branch.midY}
                          r={isTargeted ? 2.5 : 1.6} // slightly bigger if active
                          fill={NODE_TONES[toneIdx]} // matches the peer's own warm tone
                          opacity={isTargeted ? 0.9 : 0.4}
                        />
                      </React.Fragment>
                    );
                  })}

                  {/* 2. the dispersal — a soft bloom of light that expands and dissolves in place, */}
                  {/* like a hue spreading outward, instead of a hard ring launching offscreen */}
                  <AnimatedCircle // wide, soft outer bloom
                    cx={ANCHOR_X} // centered horizontally
                    cy={ // drifts gently upward as it disperses, doesn't fly off-screen
                      boomAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [ANCHOR_Y - 30, ANCHOR_Y - 170] // near the anchor -> drifts up and dissolves
                      })
                    }
                    r={ // grows into a broad, soft glow rather than a screen-filling ring
                      boomAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [24, 240]
                      })
                    }
                    fill={shattered ? 'url(#boomGradGrey)' : 'url(#boomGradAmber)'} // grey if the drop failed
                    opacity={
                      boomAnim.interpolate({
                        inputRange: [0, 0.5, 1], // start -> halfway -> finished
                        outputRange: [0.9, 0.6, 0] // solid -> dimming -> invisible
                      })
                    }
                  />
                  <AnimatedCircle // tighter, brighter core so it still reads as "a spark just left"
                    cx={ANCHOR_X}
                    cy={ // same drift as the outer bloom
                      boomAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [ANCHOR_Y - 30, ANCHOR_Y - 170]
                      })
                    }
                    r={ // shrinks to nothing as the bloom takes over
                      boomAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [10, 0] // bright pinpoint -> dissolves away
                      })
                    }
                    fill={shattered ? COLORS.mutedText : COLORS.amber} // solid core, grey if failed
                    opacity={
                      boomAnim.interpolate({
                        inputRange: [0, 0.6, 1],
                        outputRange: [1, 0.4, 0] // solid -> dimming -> gone
                      })
                    }
                  />

                  {/* 2b. the shatter: grey particles bursting outward, only exists briefly */}
                  {/* right after a failed throw */}
                  {shattered && SHARD_ANGLES.map((angle, i) => (
                    <AnimatedCircle // one grey shard
                      key={`shard-${i}`}
                      cx={shatterAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [ANCHOR_X, ANCHOR_X + Math.cos(angle) * 90] // anchor -> fly outward at this angle
                      })}
                      cy={shatterAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [ANCHOR_Y - 60, ANCHOR_Y - 60 + Math.sin(angle) * 90]
                      })}
                      r={shatterAnim.interpolate({ // shrinks as it flies, like debris burning out
                        inputRange: [0, 1],
                        outputRange: [5, 0]
                      })}
                      fill={COLORS.mutedText} // dull grey, matches the retinted boom
                      opacity={shatterAnim.interpolate({ // fades out as it travels
                        inputRange: [0, 0.6, 1],
                        outputRange: [0.9, 0.6, 0]
                      })}
                    />
                  ))}

                  {/* 3. peer orbs — each one its own glowing, breathing constellation star */}
                  {peers.map((peer, i) => {
                    const pos = scatterPositionFor(peer.deviceId, i); // this peer's coordinate
                    const scale = getPeerScale(peer.deviceId); // join-bounce spring animation
                    const breathe = getPeerBreathe(peer.deviceId); // idle breathing animation
                    const isTargeted = targetId === peer.deviceId;
                    const toneIdx = toneIndexForDevice(peer.deviceId); // which warm tone family this orb belongs to
                    const baseRadius = radiusForDevice(peer.deviceId); // this orb's own base size
                    const breatheOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }); // slow living pulse

                    return (
                      <React.Fragment key={peer.deviceId}>
                        {/* soft halo behind the core */}
                        <AnimatedCircle
                          cx={pos.x}
                          cy={pos.y}
                          r={scale.interpolate({ inputRange: [0, 1], outputRange: [0, baseRadius * 2.6] })}
                          fill={`url(#nodeGlow${toneIdx})`}
                          opacity={breatheOpacity}
                        />
                        {isTargeted && ( // currently tapped
                          <AnimatedCircle
                            cx={pos.x}
                            cy={pos.y}
                            r={baseRadius + 12}
                            fill="none"
                            stroke={COLORS.amber}
                            strokeWidth={1}
                            opacity={0.8}
                          />
                        )}
                        <AnimatedCircle // the core orb
                          cx={pos.x}
                          cy={pos.y}
                          r={scale.interpolate({ inputRange: [0, 1], outputRange: [0, baseRadius] })}
                          fill={isTargeted ? COLORS.amber : NODE_TONES[toneIdx]}
                          opacity={0.95}
                        />
                      </React.Fragment>
                    );
                  })}

                  {/* 4. "you" bottom anchor */}
                  <Circle // massive glowing aura
                    cx={ANCHOR_X}
                    cy={ANCHOR_Y + 120} // pushed far down off the screen
                    r={180}
                    fill="url(#youGrad)"
                  />
                  <Circle // physical hard line
                    cx={ANCHOR_X}
                    cy={ANCHOR_Y + 160} // pushed further down
                    r={180}
                    fill={COLORS.bg} // black core
                    stroke={COLORS.amber} // amber ring
                    strokeWidth={1} // razor thin
                    opacity={0.3} // very dim
                  />
                </Svg>
              </GestureDetector>

              {/* the "flick to transmit" cue at the top, breathing with the same */}
              {/* heartbeat engine as everything else so it never feels static */}
              <Animated.Text
                style={[
                  styles.topLabel, // positioned in the reserved top safe zone
                  { opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] }) } // slow breathing fade
                ]}
              >
                flick a file.
              </Animated.Text>

              {/* 5. text labels (floating above the svg) */}
              {peers.map((peer, i) => {
                const pos = scatterPositionFor(peer.deviceId, i); // this peer's coordinate
                const isTargeted = targetId === peer.deviceId;
                return (
                  <Text
                    key={`label-${peer.deviceId}`}
                    style={[
                      styles.peerLabel,
                      {
                        left: pos.x - 40, // centers the 80px text box on the x coord
                        top: pos.y + 15, // 15px below the orb
                        color: isTargeted ? COLORS.amber : COLORS.mutedText
                      }
                    ]}
                  >
                    {peer.label}
                  </Text>
                );
              })}

              {/* 6. bottom hud */}
              <View style={styles.hud}>
                {ghostDropMsg ? ( // we have a red error message
                  <Text
                    style={[
                      styles.caption,
                      { color: COLORS.error }
                    ]}
                  >
                    {ghostDropMsg}
                  </Text>
                ) : ( // no error
                  <Text style={styles.caption}>
                    {status || (selectedFiles.length > 0 ? 'payload armed. flick to send.' : 'tap the core to load.')}
                    {targetId ? ` → ${peers.find((p) => p.deviceId === targetId)?.label}` : ''}
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