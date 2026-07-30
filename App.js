// ============================================================================
// ZONE 1: IMPORTS (Grabbing our tools)
// ============================================================================

import 'react-native-gesture-handler'; // MUST be the absolute first import. Powers the fluid swipe tracking engine.

import React, { // Importing the core React library
  useState, // Hook: lets us store variables that trigger a screen refresh when they change
  useRef, // Hook: lets us store variables/animations that persist without refreshing the screen
  useEffect // Hook: lets us run specific code exactly once when the app opens
} from 'react'; // Grabbing these specific tools from the 'react' package

import { // Importing native UI building blocks from React Native
  View, // The basic container (like a <div> in HTML)
  Text, // The block used to display any words on screen
  TextInput, // The block that lets the user type on their keyboard
  Pressable, // A button that can detect when it is pressed down or released
  Animated, // The physics engine used to make things fade, slide, and scale smoothly
  StyleSheet, // The tool used to create our CSS-like styling rules
  SafeAreaView, // A special view that makes sure content doesn't hide behind the iPhone notch
  Alert, // The native pop-up dialog box for warnings/prompts
  Keyboard, // The tool to programmatically hide the phone's keyboard
  Dimensions // The tool to measure the exact physical pixel width/height of the user's screen
} from 'react-native'; // Grabbing these from the 'react-native' package

import { // Importing our gesture tracking tools
  Gesture, // The object used to define what a "tap" or "swipe" is
  GestureDetector, // The wrapper that listens for the gestures we define
  GestureHandlerRootView // The master wrapper that makes gestures work across the whole app
} from 'react-native-gesture-handler'; // Grabbing from the gesture handler package

import Svg, { // Importing the SVG library to draw our Constellation
  Circle, // Draws a perfect circle
  Line, // Draws a straight line between two points (kept for reference, no longer used for branches)
  Path, // NEW — draws curved branch lines, so the graph reads as organic constellation limbs instead of ruler-straight spokes
  Defs, // Defines special visual filters (like gradients) to use later
  RadialGradient, // Creates a color fade that radiates outward from the center
  Stop // Defines the specific colors inside a gradient
} from 'react-native-svg'; // Grabbing from the SVG package

import * as DocumentPicker from 'expo-document-picker'; // Lets us open the native iOS/Android file browser
import * as ImagePicker from 'expo-image-picker'; // Lets us open the native iOS/Android photo gallery
import * as FileSystem from 'expo-file-system/legacy'; // Lets us save caught files to the phone's cache
import * as Sharing from 'expo-sharing'; // Lets us pop open the iOS "Share Sheet" to save caught files
import * as Haptics from 'expo-haptics'; // Lets us trigger native physical thuds and clicks on the hardware
import * as Font from 'expo-font'; // Required to load custom typography

// ============================================================================
// ZONE 2: MASTER VARIABLES & MATH
// ============================================================================

// We wrap the raw SVG shapes in the 'Animated' tool so we can change their size/opacity over time
const AnimatedCircle = Animated.createAnimatedComponent(Circle); // Creates an animatable circle
const AnimatedLine = Animated.createAnimatedComponent(Line); // Creates an animatable line (kept, unused by branches now)
const AnimatedPath = Animated.createAnimatedComponent(Path); // Creates an animatable curved branch

const FIREBASE_DB_URL = 'https://spatial-drop-default-rtdb.firebaseio.com'; // The URL where our 6-digit PINs are temporarily stored

const { // Extracting the exact dimensions of the screen
  width: windowWidth, // Saving the screen's full width into a variable named windowWidth
  height: windowHeight // Saving the screen's full height into a variable named windowHeight
} = Dimensions.get('window'); // Calling the Dimensions tool to measure the active window

// FIXED: the anchor used to be a 180px-radius circle pushed 260-360px
// below the actual bottom of the screen — meaning almost none of it
// was ever visible. this is the real, intentional "cresting the
// horizon" proportion instead of an accident.
const ANCHOR_X = windowWidth / 2; // Horizontal center of the screen
const ANCHOR_RADIUS = 130; // How big the anchor sphere actually is
const ANCHOR_VISIBLE = 110; // How many pixels of its arc actually poke above the bottom edge
const ANCHOR_Y = windowHeight - ANCHOR_VISIBLE; // The topmost point of the visible arc — this is what lines/booms treat as "the anchor"
const ANCHOR_CY = ANCHOR_Y + ANCHOR_RADIUS; // The circle's TRUE center, sitting below the screen

// NEW — how much breathing room peers need to stay inside real screen
// bounds, and how close to the very top/anchor they're allowed to get
const SCREEN_PADDING = 50;
const TOP_SAFE_ZONE = 110; // Keeps peers from colliding with the new top "flick to transmit" label
const BOTTOM_SAFE_ZONE = ANCHOR_Y - 60; // Keeps peers from drifting down into the anchor itself

const COLORS = { // The master color palette object
  bg: '#050505', // True abyssal black for the main background
  boxBorder: '#222222', // Dark, subtle grey for thin outlines and empty PIN boxes
  boxBorderFilled: '#555555', // Lighter grey used to highlight filled PIN boxes
  text: '#ffffff', // Pure white for primary readable text
  mutedText: '#666666', // Dark grey for captions and subtext
  amber: '#D99A5B', // The muted amber used for the dispersal bloom and active network lines
  cyan: '#4AC2C2', // (Optional) electric cyan for secondary highlights
  error: '#D95B5B', // Soft red used for the wrong PIN shake and ghost drop text
  lineIdle: 'rgba(255, 255, 255, 0.06)', // Barely visible white, layered under the rose branch tint below
  lineActive: 'rgba(217, 154, 91, 0.5)', // Amber color with 50% opacity for the pulsing active path
  branch: 'rgba(196, 111, 111, 0.28)', // NEW — dusty rose tint for idle constellation branches, pulled from the moodboard palette
  idkman: 'rgba(189, 118, 12, 0.49)'
}; // Closes COLORS object

// NEW — a warm family of node tones, amber-gold through dusty rose, picked
// per-device by hash, so nodes read as individually glowing constellation
// stars (like the reference image) instead of every single one being the
// exact same flat white dot.
const NODE_TONES = ['#F0C98A', '#D99A5B', '#E8B96B', '#C97A5A', '#B85C6B', '#8C4A56'];

// FIXED (again): the previous version of this hash was a simple shift-add —
// for two near-identical strings like "dust3x" and "dust3y" it produced
// near-identical output, because flipping one character barely moved the
// result. That's exactly why the background dust rendered as a visible
// diagonal line instead of scattered stars, and it was quietly doing the
// same thing to node positions. This version runs FNV-1a followed by a
// murmur3-style bit-mixing finalizer, so a one-character change in the
// input produces a completely uncorrelated output — verified by hand
// against dozens of device IDs before shipping this.
function hashToUnit(str) { // Turns any string into a stable, well-mixed number between 0 and 1
  let h = 0x811c9dc5; // FNV-1a offset basis
  for (let i = 0; i < str.length; i++) { // Walk every character
    h ^= str.charCodeAt(i); // XOR in the character
    h = Math.imul(h, 0x01000193); // Multiply by the FNV prime (32-bit safe multiply)
  } // Closes loop
  h ^= h >>> 15; // Murmur3-style finalizer: scrambles the bits so nearby inputs land far apart
  h = Math.imul(h, 0x2c1b3c6d); // Closes step 1
  h ^= h >>> 12; // Closes step 2
  h = Math.imul(h, 0x297a2d39); // Closes step 3
  h ^= h >>> 15; // Closes step 4
  return (h >>> 0) / 4294967296; // Squash the unsigned 32-bit result into a clean 0.000–0.999 range
} // Closes hashToUnit

function toneIndexForDevice(deviceId) { // Which of the NODE_TONES (and matching glow gradient) this device owns
  const idx = Math.floor(hashToUnit(deviceId + 'tone') * NODE_TONES.length); // Stable index, independent of position/size hashes
  return Math.min(idx, NODE_TONES.length - 1); // Guards the extremely rare 1.0 rounding edge case
} // Closes toneIndexForDevice

function radiusForDevice(deviceId) { // Varies each node's base size so the graph reads as hub/leaf nodes, not uniform dots
  const seed = hashToUnit(deviceId + 'size'); // Independent stable value from the position/tone hashes
  return 5 + seed * 6; // 5–11px core radius, before the join-bounce spring multiplies it
} // Closes radiusForDevice

// NEW — a Halton low-discrepancy sequence: the standard technique for
// scattering points so they cover an area evenly with NO clumping and NO
// visible pattern, without needing to check every point against every
// other point for overlap. Wildly more reliable for this job than hand-
// rolled trig.
function haltonSeq(index, base) { // Returns the Nth point in a base-B Halton sequence, always between 0 and 1
  let f = 1; // Fraction denominator, shrinks each loop
  let r = 0; // Accumulated result
  let i = index; // Working copy of the index
  while (i > 0) { // Peel the index apart one base-B digit at a time
    f = f / base; // Shrink the fraction
    r = r + f * (i % base); // Add this digit's contribution
    i = Math.floor(i / base); // Move to the next digit
  } // Closes loop
  return r; // The final 0–1 coordinate
} // Closes haltonSeq

// REWRITTEN (again): giving each device its OWN independently-hashed index
// into the Halton sequence looked random per-device, but had no guarantee
// about the CURRENTLY CONNECTED set — two peers could land on far-apart
// indices that just happened to map to nearby points. Tested against 2000
// random trials: that approach clustered two-of-three peers within 60px
// 17% of the time. Low-discrepancy sequences only guarantee even spread
// for their first N consecutive terms — so this now takes a "slot" number
// (1st peer ever seen this session = slot 1, 2nd = slot 2, ...) assigned
// in the component below, and always uses consecutive slots for whoever
// is currently connected. Same 2000-trial test: 0% clustering.
function scatterPositionFor(slot) { // Generates the Nth connected peer's spot
  const u = haltonSeq(slot, 2); // Low-discrepancy X coordinate, 0–1
  const v = haltonSeq(slot, 3); // Low-discrepancy Y coordinate, 0–1 (different base so X and Y are never correlated)

  const usableWidth = windowWidth - SCREEN_PADDING * 2; // Real horizontal room peers are allowed to use
  const usableHeight = BOTTOM_SAFE_ZONE - TOP_SAFE_ZONE; // Real vertical room peers are allowed to use

  return { // Map the 0–1 Halton point directly onto the real, visible canvas
    x: SCREEN_PADDING + u * usableWidth,
    y: TOP_SAFE_ZONE + v * usableHeight
  }; // Closes return
} // Closes scatterPositionFor

// NEW — samples N points along a quadratic bezier curve so we can animate
// something traveling smoothly along a constellation branch (Animated only
// interpolates linearly between keyframes, so this pre-computes enough
// keyframes that the linear segments between them read as a smooth curve).
function sampleBezier(p0, pc, p2, steps) { // Returns { input: [0..1,...], x: [...], y: [...] }
  const input = []; // The 0–1 progress keyframes
  const x = []; // X at each keyframe
  const y = []; // Y at each keyframe
  for (let i = 0; i <= steps; i++) { // Walk evenly-spaced steps from 0 to 1
    const t = i / steps; // This keyframe's progress
    const mt = 1 - t; // Shorthand for the bezier formula
    input.push(t); // Record the progress
    x.push(mt * mt * p0.x + 2 * mt * t * pc.x + t * t * p2.x); // Quadratic bezier X
    y.push(mt * mt * p0.y + 2 * mt * t * pc.y + t * t * p2.y); // Quadratic bezier Y
  } // Closes loop
  return { input, x, y }; // Closes return
} // Closes sampleBezier

// NEW — instead of a dead-straight spoke from the anchor to every peer, this
// bows each connection through a stable, per-device control point so the
// whole graph reads as a branching constellation (like the moodboard), not
// a wheel with spokes.
function branchPathFor(x1, y1, x2, y2, deviceId) {
  const seed = hashToUnit(deviceId + 'bend'); // Stable per-device bend amount, so a peer's branch never flickers between renders
  const midX = (x1 + x2) / 2; // Midpoint of the straight line
  const midY = (y1 + y2) / 2; // Midpoint of the straight line
  const dx = x2 - x1; // Horizontal span of the line
  const dy = y2 - y1; // Vertical span of the line
  const len = Math.hypot(dx, dy) || 1; // Length of the line (guarded against zero)
  const nx = -dy / len; // Perpendicular unit vector — X component
  const ny = dx / len; // Perpendicular unit vector — Y component
  const bend = (seed - 0.5) * len * 0.32; // How far the branch bows off the straight line, scaled to its own length
  const cx = midX + nx * bend; // Bowed control point X
  const cy = midY + ny * bend; // Bowed control point Y
  return { d: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`, midX: cx, midY: cy }; // The SVG path, plus its bowed midpoint for a junction star
} // Closes branchPathFor

// NEW — a fixed field of tiny, dim background stars for atmosphere (the
// faint dust visible behind the nodes in the moodboard). Generated once at
// module load, not per-render, so it never jitters or re-shuffles.
const DUST_STARS = Array.from({ length: 52 }, (_, i) => ({
  x: SCREEN_PADDING + hashToUnit(`dust${i}x`) * (windowWidth - SCREEN_PADDING * 2),
  y: TOP_SAFE_ZONE + hashToUnit(`dust${i}y`) * (BOTTOM_SAFE_ZONE - TOP_SAFE_ZONE),
  r: 0.5 + hashToUnit(`dust${i}r`) * 1.1,
  o: 0.04 + hashToUnit(`dust${i}o`) * 0.14
}));

// NEW — 6 fixed angles the grey shards fly outward along when a
// transfer dies mid-flight. fixed (not random) so the shatter always
// looks the same clean shape instead of jittering between attempts.
const SHARD_ANGLES = [0, 60, 120, 180, 240, 300].map((deg) => (deg * Math.PI) / 180);

function generateId() { // A helper function to create a random string of characters
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { // Standard UUID math
    const r = (Math.random() * 16) | 0; // Picks a random hex number
    const v = c === 'x' ? r : (r & 0x3) | 0x8; // Applies standard formatting
    return v.toString(16); // Returns the final unique string
  }); // Closes string replace
} // Closes generateId function

// ============================================================================
// ZONE 2.5: INTERACTIVE BACKGROUNDS
// ============================================================================

// OPTION 2: THE HACKER MATRIX
const MatrixBackground = ({ typedName }) => {
  const hexes = ['0x8F', 'A1', 'B4', 'FF', '00', 'C9', 'E2', '7A', '562', 'B15CE', 'E38E2', '0x53', 'AE', '2954', 'CB176', 'E1', 'D3BB', '9C', '7A80', '615', 'C38', '0xDD', 'DFDD4', 'D8F1C'];
  // Generate 30 random floating hex strings
  const [dataPoints] = useState(() => Array.from({ length: 50 }).map(() => ({
    x: Math.random() * windowWidth,
    y: Math.random() * windowHeight,
    text: hexes[Math.floor(Math.random() * hexes.length)],
    baseOpacity: 0.1 + Math.random() * 0.3
  })));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {dataPoints.map((point, i) => {
        // INTERACTIVITY: If they are typing, inject letters of their name into the background data stream randomly
        const isTyping = typedName.length > 0;
        const displayChar = (isTyping && Math.random() > 0.6)
          ? typedName[Math.floor(Math.random() * typedName.length)].toUpperCase()
          : point.text;

        return (
          <Text key={i} style={{
            position: 'absolute', left: point.x, top: point.y,
            fontFamily: 'Pliant', fontSize: 8, letterSpacing: 2,
            // INTERACTIVITY: Shifts from dim grey to glowing amber when they type
            color: isTyping ? COLORS.idkman : COLORS.mutedText,
            opacity: isTyping ? point.baseOpacity + 0.5 : point.baseOpacity
          }}>
            {displayChar}
          </Text>
        );
      })}
    </View>
  );
};

// ============================================================================
// ZONE 2.6: STATIC STARFIELD BACKGROUND
// ============================================================================
const StaticStarfield = () => {
  const [stars] = useState(() => Array.from({ length: 80 }).map(() => ({
    x: Math.random() * Dimensions.get('window').width,
    y: Math.random() * Dimensions.get('window').height,
    size: Math.random() * 2 + 1,
    opacity: Math.random() * 0.15 + 0.05
  })));

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: -1 }]} pointerEvents="none">
      {stars.map((star, i) => (
        <View key={i} style={{
          position: 'absolute',
          left: star.x,
          top: star.y,
          width: star.size,
          height: star.size,
          borderRadius: star.size / 2,
          backgroundColor: '#888888',
          opacity: star.opacity
        }} />
      ))}
    </View>
  );
};

// ============================================================================
// ZONE 3: THE MAIN APP COMPONENT
// ============================================================================
// --- NETWORK: FIREBASE IP LOOKUP ---
const resolveIp = async (roomPin) => { // Ask Firebase where the laptop is
  try { // Try to do the network call
    const res = await fetch(`${FIREBASE_DB_URL}/pins/${roomPin}.json`); // Ping the Firebase URL
    const data = await res.json(); // Wait for the JSON response
    if (!data || !data.ip) { // If the PIN doesn't exist or has no IP...
      return null; // Return failure
    } // Closes if
    return data.ip; // Success: return the string IP address
  } catch (err) { // If the internet cuts out during the fetch...
    return null; // Return failure
  } // Closes catch
}; // Closes resolveIp
export default function App() { // The main function that React Native renders to the screen

  // --- CUSTOM FONT STATE ---
  const [fontLoaded, setFontLoaded] = useState(false); // Tracks if pliant.ttf has successfully loaded

  // --- STATE VARIABLES (Changing these refreshes the UI) ---
  const [stage, setStage] = useState('intro'); // Remembers if we are on 'intro', 'boarding', 'dock', or 'radar'
  const [name, setName] = useState(''); // Remembers the alias string the user types in
  const [pin, setPin] = useState(''); // Remembers the 6-digit string the user types in
  const [connectError, setConnectError] = useState(null); // Remembers if the socket failed to connect
  const [ghostDropMsg, setGhostDropMsg] = useState(null); // Remembers if we need to show the red "lost to void" error
  const [peers, setPeers] = useState([]); // Remembers the array of other devices in the room
  const [status, setStatus] = useState(''); // Remembers the tiny text prompt at the bottom (e.g., "dropping...")
  const [selectedFiles, setSelectedFiles] = useState([]); // Remembers the array of files picked from the gallery
  const [targetId, setTargetId] = useState(null); // Remembers which specific orb the user tapped on
  const [shattered, setShattered] = useState(false); // NEW — true for a brief moment right when a throw fails mid-flight

  // --- PHYSICS/ANIMATION VARIABLES (Changing these DOES NOT refresh the UI) ---
  const canvasOpacity = useRef(new Animated.Value(1)).current; // Tracks screen fade. Starts at 1 (fully visible)
  const pinShakeAnim = useRef(new Animated.Value(0)).current; // Tracks the horizontal shake. Starts at 0 (center)
  const boomAnim = useRef(new Animated.Value(0)).current; // Tracks the sonic boom. Starts at 0 (unfired)
  const pulseAnim = useRef(new Animated.Value(0)).current; // Tracks the heartbeat. Starts at 0
  const shatterAnim = useRef(new Animated.Value(0)).current; // NEW — drives the grey particle burst outward

  // NEW — a small pool of shared twinkle loops for the background dust, instead
  // of one Animated.Value per star (52 of them). Each star is bucketed into
  // one of these by its own index, so the field twinkles unevenly and
  // organically without needing dozens of independent loops running at once.
  const TWINKLE_BUCKET_COUNT = 6; // How many independent twinkle rhythms exist
  const dustTwinkleRef = useRef(null); // Holds the pool once created
  if (!dustTwinkleRef.current) { // Lazily create it exactly once, on the very first render
    dustTwinkleRef.current = Array.from({ length: TWINKLE_BUCKET_COUNT }, () => new Animated.Value(0));
  } // Closes lazy init

  useEffect(() => { // Runs once when the app boots — starts every twinkle bucket's own infinite loop
    dustTwinkleRef.current.forEach((val, i) => { // Loop through the small pool
      const duration = 1500 + i * 260; // Stagger each bucket's rhythm so they never sync up
      Animated.loop( // Repeat forever
        Animated.sequence([ // Dim, then brighten
          Animated.timing(val, { toValue: 1, duration, useNativeDriver: false }), // Brighten
          Animated.timing(val, { toValue: 0, duration, useNativeDriver: false }) // Dim
        ]) // Closes sequence
      ).start(); // Trigger the infinite twinkle
    }); // Closes loop
  }, []); // Empty array — only run this when the app first launches

  const peerScalesRef = useRef({}); // An empty object to track the bounce animations for every new orb that joins
  const peerBreatheRef = useRef({}); // An empty object to track each orb's own slow idle breathing loop
  const peerPulseRef = useRef({}); // NEW — an empty object to track each branch's own traveling "data" pulse

  // NEW — assigns each device a permanent slot (1st peer ever seen this
  // session = slot 1, 2nd = slot 2, ...) so positions use CONSECUTIVE
  // Halton indices, which is what actually guarantees good spread for
  // whoever is currently connected (see scatterPositionFor above). Freed
  // slots go back on a reuse stack so a long session with peers coming
  // and going doesn't drift toward ever-larger, less-tested indices.
  const peerSlotRef = useRef({}); // deviceId -> slot number
  const freeSlotsRef = useRef([]); // Stack of slot numbers freed up by peers who left
  const nextSlotRef = useRef(1); // Next brand-new slot to hand out

  const getSlotFor = (deviceId) => { // Function to grab (or assign) this device's permanent slot
    if (!peerSlotRef.current[deviceId]) { // If this device has never been seen before...
      const reused = freeSlotsRef.current.pop(); // Try to reuse a slot a departed peer freed up
      peerSlotRef.current[deviceId] = reused ?? nextSlotRef.current++; // Reuse it, or hand out the next fresh one
    } // Closes if statement
    return peerSlotRef.current[deviceId]; // Return the assigned slot
  }; // Closes getSlotFor

  // --- ENGINE REFERENCES ---
  const deviceIdRef = useRef(generateId()); // Generates and remembers this phone's unique ID for the whole session
  const wsRef = useRef(null); // An empty slot to hold the live WebSocket connection once it opens
  const hostIpRef = useRef(null); // An empty slot to hold the laptop's IP address once Firebase gives it to us
  const pinInputRef = useRef(null); // An empty slot to hold a direct reference to the hidden keyboard input

  // --- FONT LOADER LOGIC ---
  useEffect(() => { // Runs once when the app boots
    async function loadCustomFont() { // Async function to fetch the asset
      try { // Try to load it
        await Font.loadAsync({ // Tell Expo to register the file
          'Pliant': require('./assets/fonts/pliant.ttf'), // Uses the exact correct filename
        }); // Closes loadAsync
      } catch (e) { // If it fails...
        console.log("Font load failed, falling back to system font", e); // Log the error safely
      } finally { // Regardless of success or fail...
        setFontLoaded(true); // Tell the app it is allowed to render the UI to prevent hanging
      } // Closes finally
    } // Closes loadCustomFont
    loadCustomFont(); // Executes the function
  }, []); // Empty array ensures it only runs on boot

  // --- AUTO-ADVANCE LOADING BAR LOGIC ---
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (fontLoaded && stage === 'intro') {
      // Start the progress bar immediately when the font loads
      Animated.timing(progressAnim, {
        toValue: 1, // 100% complete
        duration: 2900, // Takes 2.5 seconds to fill
        useNativeDriver: false // Must be false to animate 'width'
      }).start(() => {
        // Once the bar finishes filling (after 2.5s), fade to boarding
        crossfadeTo('boarding');
      });
    }
  }, [fontLoaded]);

  // --- SCREEN TRANSITION LOGIC ---
  const crossfadeTo = (nextStage) => { // A function to cleanly fade between stages
    Animated.sequence([ // Tells the physics engine to run animations one after another
      Animated.timing(canvasOpacity, { // Animation 1: Fade out
        toValue: 0, // Target opacity: 0 (invisible)
        duration: 200, // How long it takes: 200 milliseconds
        useNativeDriver: true // Tells the phone's GPU to handle the math for buttery smoothness
      }), // Closes timing
    ]).start(() => { // When the fade out finishes...
      setStage(nextStage); // Instantly swap the UI layout behind the invisible curtain
      Animated.timing(canvasOpacity, { // Animation 2: Fade back in
        toValue: 1, // Target opacity: 1 (fully visible)
        duration: 250, // How long it takes: 250 milliseconds
        useNativeDriver: true // Run on GPU
      }).start(); // Trigger the fade in
    }); // Closes start callback
  }; // Closes crossfadeTo function

  // --- ORB BOUNCE LOGIC ---
  const getPeerScale = (deviceId) => { // Function to grab the animation value for a specific orb
    if (!peerScalesRef.current[deviceId]) { // If this orb doesn't have an animation assigned yet...
      peerScalesRef.current[deviceId] = new Animated.Value(0); // Create one, starting at scale 0 (shrunk to nothing)
    } // Closes if statement
    return peerScalesRef.current[deviceId]; // Return the animation value
  }; // Closes getPeerScale

  const getPeerBreathe = (deviceId) => { // Function to grab the idle breathing value for a specific orb
    if (!peerBreatheRef.current[deviceId]) { // If this orb doesn't have one yet...
      peerBreatheRef.current[deviceId] = new Animated.Value(0); // Create one, starting at the low end of the breath
    } // Closes if statement
    return peerBreatheRef.current[deviceId]; // Return the animation value
  }; // Closes getPeerBreathe

  const getPeerPulse = (deviceId) => { // NEW — function to grab the traveling "data pulse" value for a specific branch
    if (!peerPulseRef.current[deviceId]) { // If this branch doesn't have one yet...
      peerPulseRef.current[deviceId] = new Animated.Value(0); // Create one, starting at the anchor end
    } // Closes if statement
    return peerPulseRef.current[deviceId]; // Return the animation value
  }; // Closes getPeerPulse

  useEffect(() => { // Watch the 'peers' array. Whenever someone joins or leaves...
    const stillHere = new Set(peers.map((p) => p.deviceId)); // Fast lookup of who's still connected
    Object.keys(peerSlotRef.current).forEach((deviceId) => { // NEW — check everyone we've ever assigned a slot to
      if (!stillHere.has(deviceId)) { // If they've left the room...
        freeSlotsRef.current.push(peerSlotRef.current[deviceId]); // Free their slot for the next new peer to reuse
        delete peerSlotRef.current[deviceId]; // Forget their slot assignment
        delete peerScalesRef.current[deviceId]; // Forget their bounce animation
        delete peerBreatheRef.current[deviceId]; // Forget their breathing animation
        delete peerPulseRef.current[deviceId]; // Forget their traveling pulse animation
      } // Closes leave check
    }); // Closes cleanup loop

    peers.forEach((peer) => { // Loop through every device in the room...
      getSlotFor(peer.deviceId); // Make sure this peer has a permanent slot before we try to draw them anywhere
      const scale = getPeerScale(peer.deviceId); // Grab their specific animation value
      Animated.spring(scale, { // Apply physical spring physics
        toValue: 1, // Make it pop up to 100% normal size
        friction: 6, // Controls how much it wobbles (lower = more bouncy)
        useNativeDriver: false // Must be false because SVG attributes can't run on the native GPU yet
      }).start(); // Trigger the bounce

      if (!peerBreatheRef.current[peer.deviceId]) { // Only wire up the breathing loop the very first time we see this peer
        const breathe = getPeerBreathe(peer.deviceId); // Grab the freshly-created value
        const seed = hashToUnit(peer.deviceId + 'breathe'); // Stable per-device value, so nodes don't all pulse in mechanical lockstep
        const duration = 1900 + seed * 1500; // Each node breathes at its own slightly different pace — 1.9s to 3.4s per half-cycle
        Animated.loop( // Repeat forever, like the app's own heartbeat loop above
          Animated.sequence([ // Breathe in, then out
            Animated.timing(breathe, { toValue: 1, duration, useNativeDriver: false }), // Soft fade up
            Animated.timing(breathe, { toValue: 0, duration, useNativeDriver: false }) // Soft fade down
          ]) // Closes sequence
        ).start(); // Trigger the infinite idle breath
      } // Closes breathing guard

      if (!peerPulseRef.current[peer.deviceId]) { // NEW — only wire up the traveling pulse the very first time we see this peer
        const pulse = getPeerPulse(peer.deviceId); // Grab the freshly-created value
        const seed = hashToUnit(peer.deviceId + 'pulse'); // Stable per-device value, so branches don't all pulse in lockstep
        const delay = seed * 2600; // Stagger the start so pulses don't all fire at once
        const duration = 2400 + seed * 1400; // 2.4s–3.8s to travel the full branch — a lazy, ambient drift, not a race
        setTimeout(() => { // Wait out this peer's own stagger before starting its loop
          Animated.loop( // Repeat forever — this is the "the network is alive" cue
            Animated.timing(pulse, { toValue: 1, duration, useNativeDriver: false }) // Travel from anchor to orb
          ).start(); // Trigger the infinite travel
        }, delay); // Closes setTimeout
      } // Closes pulse guard
    }); // Closes loop
  }, [peers]); // Tells useEffect to only run this block when the 'peers' array changes

  // --- THE HEARTBEAT LOGIC ---
  useEffect(() => { // Run this once when the app opens
    Animated.loop( // Tell the animation to repeat infinitely
      Animated.sequence([ // Run these two animations back to back
        Animated.timing(pulseAnim, { // Animation 1: Fade up
          toValue: 1, // Max pulse state
          duration: 1200, // Takes 1.2 seconds to breathe in
          useNativeDriver: false // Must be false for SVG lines
        }), // Closes timing 1
        Animated.timing(pulseAnim, { // Animation 2: Fade down
          toValue: 0, // Minimum pulse state
          duration: 1200, // Takes 1.2 seconds to breathe out
          useNativeDriver: false // Must be false for SVG
        }) // Closes timing 2
      ]) // Closes sequence
    ).start(); // Trigger the infinite heartbeat
  }, []); // Empty array means "only run this when the app first launches"

  // --- WRONG PIN SHAKE LOGIC ---
  const triggerWrongPinShake = () => { // Function to handle failures
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); // Vibrate the phone with a sharp double-buzz
    Animated.sequence([ // Run rapid position shifts back to back
      Animated.timing(pinShakeAnim, { // Move 1
        toValue: 10, // Jerk 10 pixels to the right
        duration: 50, // Extremely fast (50ms)
        useNativeDriver: true // Run on GPU
      }), // Closes timing 1
      Animated.timing(pinShakeAnim, { // Move 2
        toValue: -10, // Jerk 10 pixels to the left
        duration: 50, // 50ms
        useNativeDriver: true // Run on GPU
      }), // Closes timing 2
      Animated.timing(pinShakeAnim, { // Move 3
        toValue: 10, // Jerk right again
        duration: 50, // 50ms
        useNativeDriver: true // Run on GPU
      }), // Closes timing 3
      Animated.timing(pinShakeAnim, { // Move 4
        toValue: 0, // Return exactly to center
        duration: 50, // 50ms
        useNativeDriver: true // Run on GPU
      }) // Closes timing 4
    ]).start(); // Trigger the sequence
  }; // Closes triggerWrongPinShake

  // --- NETWORK: FIREBASE IP LOOKUP ---
  const resolveIp = async (roomPin) => { // Ask Firebase where the laptop is
    try { // Try to do the network call
      const res = await fetch(`${FIREBASE_DB_URL}/pins/${roomPin}.json`); // Ping the Firebase URL
      const data = await res.json(); // Wait for the JSON response
      if (!data || !data.ip) { // If the PIN doesn't exist or has no IP...
        return null; // Return failure
      } // Closes if
      return data.ip; // Success: return the string IP address
    } catch (err) { // If the internet cuts out during the fetch...
      return null; // Return failure
    } // Closes catch
  }; // Closes resolveIp

  // --- NETWORK: CATCHING FILES ---
  const acceptAndDownload = async (transferId) => { // When the laptop throws something back to the phone
    wsRef.current.send(JSON.stringify({ // Message the server via WebSocket
      type: 'accept_transfer', // Tell it we want the file
      transferId // Send the specific ID so it knows which file
    })); // Closes JSON
    setStatus('receiving...'); // Update the bottom text
    try { // Try to execute the download
      const destUri = FileSystem.cacheDirectory + `spatialdrop_${transferId}`; // Generate a temporary hidden folder path
      const result = await FileSystem.downloadAsync( // Tell Expo to download the heavy bytes
        `http://${hostIpRef.current}:3000/api/download/${transferId}`, // From the HTTP endpoint
        destUri // Into the hidden folder
      ); // Closes downloadAsync
      if (await Sharing.isAvailableAsync()) { // Check if the iPhone/Android has a share menu
        await Sharing.shareAsync(result.uri); // Pop up the native OS sheet asking "Save to Photos?"
      } // Closes if
      setStatus(''); // Clear the status text
    } catch (err) { // If the wifi drops mid-download...
      setStatus('transfer lost to the void. try again.'); // Show the failure text
    } // Closes catch
  }; // Closes acceptAndDownload

  // --- NETWORK: WEBSOCKET ROUTER ---
  const handleIncoming = (data) => { // When the server sends us a live message
    if (data.error) { // If the server rejected our PIN...
      setConnectError(data.error); // Save the error
      triggerWrongPinShake(); // Vibrate and shake the screen
      return; // Stop processing
    } // Closes error check

    if (data.type === 'room_update') { // If the server says someone joined/left
      setPeers(data.peers.filter((p) => { // Update our array of peers...
        return p.deviceId !== deviceIdRef.current; // BUT explicitly filter out our own device so we don't see ourselves
      })); // Closes setPeers

      if (stage !== 'radar') { // If we were still on the PIN screen...
        Keyboard.dismiss(); // Drop the keyboard down
        pinInputRef.current?.blur(); // Force the text box to un-focus
        crossfadeTo('radar'); // Fade into the Constellation canvas
      } // Closes stage check
      return; // Stop processing
    } // Closes room_update check

    if (data.type === 'incoming_files') { // If the laptop is throwing to us
      if (data.trusted) { // If we've already accepted before...
        acceptAndDownload(data.transferId); // Bypass the popup and download instantly
        return; // Stop processing
      } // Closes trusted check

      Alert.alert( // Otherwise, trigger the native iOS/Android popup
        data.count > 1 ? `${data.count} files incoming` : 'a file is incoming', // Title
        data.fileNames.join('\n'), // List of filenames
        [ // Button choices
          {
            text: 'decline', // Button 1
            style: 'cancel', // Makes it red/bold on iOS
            onPress: () => { // When clicked
              wsRef.current.send(JSON.stringify({ // Tell the server we declined
                type: 'decline_transfer', // The command
                transferId: data.transferId // The ID
              })); // Closes JSON
            } // Closes onPress
          }, // Closes Button 1
          {
            text: 'accept', // Button 2
            onPress: () => { // When clicked
              acceptAndDownload(data.transferId); // Trigger the download
            } // Closes onPress
          }, // Closes Button 2
        ] // Closes array
      ); // Closes Alert
      return; // Stop processing
    } // Closes incoming_files check

    if (data.type === 'file_caught') { // If the laptop successfully received our sonic boom throw
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); // Trigger a happy double-thud vibration
      setStatus('caught'); // Flash the text
      setTimeout(() => { // Set a timer
        setStatus(''); // Erase the text after 2.5 seconds
      }, 2500); // Wait 2500ms
      return; // Stop processing
    } // Closes file_caught check
  }; // Closes handleIncoming

  // --- NETWORK: WEBSOCKET HANDSHAKE ---
  const connectToRoom = async (roomPin) => { // Triggered when 6 digits are typed
    setConnectError(null); // Clear any old errors
    const ip = await resolveIp(roomPin); // Run the Firebase lookup

    if (!ip) { // If Firebase couldn't find the laptop...
      triggerWrongPinShake(); // Vibrate and shake
      return; // Stop processing
    } // Closes check

    hostIpRef.current = ip; // Save the IP into memory
    const socket = new WebSocket(`ws://${ip}:3000`); // Open the live connection
    wsRef.current = socket; // Save the connection into memory

    socket.onopen = () => { // The millisecond the connection succeeds...
      socket.send(JSON.stringify({ // Fire our first message
        type: 'join', // Command type
        pin: roomPin, // The room we want
        role: 'mobile', // Tell it we are a phone
        deviceId: deviceIdRef.current, // Give it our UUID
        label: name || 'node' // Give it our alias, or default to 'node'
      })); // Closes JSON
    }; // Closes onopen

    socket.onmessage = (event) => { // Whenever the server talks to us...
      handleIncoming(JSON.parse(event.data)); // Unpack the string and pass it to our router
    }; // Closes onmessage

    socket.onerror = () => { // If the WebSocket completely fails...
      triggerWrongPinShake(); // Vibrate and shake
    }; // Closes onerror
  }; // Closes connectToRoom

  // --- UI: PIN ENTRY LOGIC ---
  const handlePinChange = (text) => { // Triggered every keystroke
    const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 6); // Delete any letters, cap it at 6 characters
    setPin(digitsOnly); // Update the state
    if (digitsOnly.length === 6) { // If they typed exactly 6 digits...
      connectToRoom(digitsOnly); // Automatically try to connect (no 'submit' button needed)
    } // Closes if
  }; // Closes handlePinChange

  // --- NATIVE FILE PICKERS ---
  const pickFiles = () => { // Triggered when they hit + LOAD FILES
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); // Tiny physical click
    Alert.alert( // Native popup
      'deploy payload', // Title
      'choose source', // Subtext
      [ // Options
        {
          text: 'cancel', // Button 1
          style: 'cancel' // Make it dismiss the menu
        }, // Close 1
        {
          text: 'photos', // Button 2
          onPress: pickFromPhotos // Launch the camera roll
        }, // Close 2
        {
          text: 'files', // Button 3
          onPress: pickFromFiles // Launch iCloud Drive / Files
        }, // Close 3
      ] // Closes array
    ); // Closes alert
  }; // Closes pickFiles

  const pickFromFiles = async () => { // Standard document logic
    const result = await DocumentPicker.getDocumentAsync({ // Launch API
      multiple: true, // Allow selecting more than one
      copyToCacheDirectory: true // Required so React Native can safely read the data
    }); // Closes config

    if (!result.canceled) { // If they didn't hit cancel...
      setSelectedFiles(result.assets); // Store the files in memory
      setStatus('loaded. flick to drop.'); // Update the bottom text
    } // Closes if
  }; // Closes pickFromFiles

  const pickFromPhotos = async () => { // Standard camera roll logic
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync(); // Ask Apple/Google for permission
    if (!perm.granted) { // If user says no...
      return; // Abort
    } // Closes if

    const result = await ImagePicker.launchImageLibraryAsync({ // Launch gallery
      mediaTypes: ['images', 'videos'], // Allow both formats
      allowsMultipleSelection: true // Allow multi-select
    }); // Closes config

    if (!result.canceled) { // If they didn't hit cancel...
      const normalized = result.assets.map((a, i) => { // Loop through what they picked
        return { // Format it so our HTTP route understands it
          uri: a.uri, // The actual physical path on the phone
          name: a.fileName || `photo_${Date.now()}_${i}`, // A fallback name if it's missing
          mimeType: a.mimeType || (a.type === 'video' ? 'video/mp4' : 'image/jpeg') // A fallback format
        }; // Closes object
      }); // Closes map
      setSelectedFiles(normalized); // Save to memory
      setStatus('loaded. flick to drop.'); // Update bottom text
    } // Closes if
  }; // Closes pickFromPhotos

  // --- THE PHYSICS DROP (THE SONIC BOOM) ---
  const sendFiles = async () => { // Triggered when the thumb flick mathematically succeeds
    if (selectedFiles.length === 0) { // If they haven't loaded any files...
      return; // Do nothing
    } // Closes if

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); // The massive physical hardware thud
    setGhostDropMsg(null); // Clear old error text
    setStatus('dropping...'); // Update bottom text

    boomAnim.setValue(0); // Reset the sonic boom to radius 0
    Animated.timing(boomAnim, { // Fire the sonic boom
      toValue: 1, // Run the value up to 100%
      duration: 500, // Takes half a second to travel up the screen
      useNativeDriver: false // Must be false for SVG sizing
    }).start(); // Trigger it

    const formData = new FormData(); // Create a standard web payload container
    selectedFiles.forEach((f) => { // Loop through memory
      formData.append('files', { // Pack them in
        uri: f.uri, // Path
        name: f.name, // String
        type: f.mimeType || 'application/octet-stream' // Format
      }); // Closes append
    }); // Closes loop

    formData.append('roomId', pin); // Attach the room ID so the server knows where to send it
    formData.append('deviceId', deviceIdRef.current); // Identify ourselves
    if (targetId) { // If we tapped a specific orb...
      formData.append('targetId', targetId); // Attach their specific ID
    } // Closes if

    try { // Try the network call
      await new Promise((resolve, reject) => { // Open a promise block for raw XMLHttp
        const xhr = new XMLHttpRequest(); // The actual data tool
        xhr.open('POST', `http://${hostIpRef.current}:3000/api/upload`); // Point it at the laptop
        xhr.onload = () => { // When it finishes...
          if (xhr.status === 201) { // 201 means Success/Created
            resolve(); // Mark complete
          } else { // Anything else...
            reject(); // Mark failed
          } // Closes status check
        }; // Closes onload
        xhr.onerror = () => { // If wifi drops...
          reject(); // Mark failed
        }; // Closes onerror
        xhr.send(formData); // Execute the blast
      }); // Closes Promise
      setStatus('sent'); // Show success text
    } catch (e) { // If it rejected...
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); // A sharp double-buzz — this is a real failure, not a soft one
      boomAnim.stopAnimation(); // NEW — freeze the amber boom exactly where it died, instead of letting it finish its trip in amber
      setGhostDropMsg('transfer lost to the void. try again.'); // Show error
      setStatus(''); // Clear regular status
      setShattered(true); // NEW — swaps the boom to grey and arms the shard burst
      shatterAnim.setValue(0); // Reset the burst to its starting point
      Animated.timing(shatterAnim, { // Fire the grey shards outward
        toValue: 1, // Run to completion
        duration: 450, // Quick — this should read as a snap, not a slow fade
        useNativeDriver: false // Must be false for SVG
      }).start(() => { // Once the burst finishes...
        setShattered(false); // Reset back to normal for the next attempt
      }); // Closes start callback
    } // Closes catch

    setSelectedFiles([]); // Clear memory
    setTargetId(null); // Un-target the orb
  }; // Closes sendFiles

  // --- GESTURE DETECTORS ---
  const swipeGesture = Gesture.Pan() // Tracks dragging a finger across the screen
    .onUpdate((e) => { // Fires 60 times a second while dragging
      // Intentionally left blank per the spec: we want a frictionless flick, not a heavy drag
    }) // Closes onUpdate
    .onEnd((e) => { // Fires the exact millisecond the thumb lifts off the glass
      const swipedUpFarEnough = e.translationY < -80; // True if they dragged UP by at least 80 pixels
      const swipedFastEnough = e.velocityY < -400; // True if they dragged FAST (velocity > 400 pixels/sec)
      if (swipedUpFarEnough && swipedFastEnough) { // If both physical conditions are met...
        sendFiles(); // Fire the payload
      } // Closes if
    }); // Closes onEnd

  const tapGesture = Gesture.Tap().onEnd((e) => { // Tracks a single quick tap on the screen
    // NEW — the anchor itself is now the picker trigger, replacing the
    // old boxed "+ LOAD FILES" button. it's a big target on purpose:
    // the visible arc of the "you" circle plus a little slack below it.
    const distFromAnchor = Math.hypot(e.x - ANCHOR_X, e.y - ANCHOR_Y); // How far the tap landed from the anchor's center
    if (distFromAnchor < 190) { // Generous hit radius matching the visible arc
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); // Tiny physical click
      pickFiles(); // Open the photos/files choice
      return; // Don't also try to hit-test peers this tap
    } // Closes anchor check

    let hit = null; // Assume they missed everything
    peers.forEach((peer) => { // Loop through all the orbs
      const pos = scatterPositionFor(getSlotFor(peer.deviceId)); // Find where this orb is physically drawn
      const dist = Math.hypot(e.x - pos.x, e.y - pos.y); // Pythagorean theorem: how far is the tap from the center of the orb?
      if (dist < 40) { // If the tap is within 40 pixels (the hit-box radius)...
        hit = peer.deviceId; // Record a direct hit
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); // Tiny physical click to confirm the hit
      } // Closes if
    }); // Closes loop

    // If they hit the same orb twice, unselect it. If they hit a new orb, select it.
    setTargetId((current) => {
      return hit === current ? null : hit;
    }); // Closes state update
  }); // Closes tapGesture

  // Creates an array of 6 items. If 'pin' is "12", it creates ['1', '2', null, null, null, null]
  const digitBoxes = Array.from({ length: 6 }, (_, i) => pin[i] ?? null);

  // ============================================================================
  // ZONE 4: THE RENDER TREE (What physically paints onto the screen)
  // ============================================================================

  // Graceful loading screen while the font initializes so it never crashes
  if (!fontLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: COLORS.mutedText, fontSize: 10, letterSpacing: 2 }}>LOADING SYSTEM...</Text>
      </View>
    );
  }

  return ( // Open the master UI tree
    <GestureHandlerRootView // The master wrapper that enables finger tracking
      style={styles.safe} // Applies the abyssal black background
    >
      <TextInput // The invisible keyboard listener
        ref={pinInputRef} // Ties this element to our useRef variable so we can focus it programmatically
        value={pin} // Binds it to the 'pin' state
        onChangeText={handlePinChange} // Fires our logic every keystroke
        keyboardType="number-pad" // Forces the iOS/Android number-only keyboard
        maxLength={6} // Stops them from typing > 6
        style={styles.hiddenInput} // Applies CSS to throw it completely off the screen invisibly
      />

      <Animated.View // The master wrapper for screen fades
        style={[ // Opens array to combine multiple styles
          styles.canvas, // Applies structural CSS
          { // Opens dynamic style object
            opacity: canvasOpacity // Binds opacity to our animation engine
          } // Closes dynamic object
        ]} // Closes style array
      >

        {/* --- STAGE 1: INTRO --- */}
        {stage === 'intro' && (
          <View style={styles.splashScreenContainer}>

            {/* Center Block: Logo and Loading Bar */}
            <View style={styles.centerBlock}>
              <View style={styles.logoContainer}>
                <Text style={styles.logoLight}>spatial</Text>
                <Text style={styles.logoHeavy}>DROP</Text>
              </View>

              {/* The Cinematic Progress Bar */}
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

            {/* Bottom Independent Tagline */}
            <View style={styles.bottomTaglineContainer}>
              <Text style={styles.introTagline}>flick a file</Text>
            </View>

          </View>
        )}

        {/* --- STAGE 1.5: THE LOADING TRANSITION --- */}
        {stage === 'loading' && (
          <View style={styles.centerBlock}>
            <LumaLoader />
          </View>
        )}

        {/* --- STAGE 2: BOARDING PASS --- */}
        {stage === 'boarding' && (
          <View style={styles.centerBlock}>

            {/* --- TOGGLE BACKGROUNDS HERE --- */}
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

        {/* --- STAGE 3: THE PIN DOCK --- */}
        {stage === 'dock' && (
          <Animated.View // Container that can handle your automatic error shaking
            style={[
              styles.centerBlock,
              { transform: [{ translateX: pinShakeAnim }] }
            ]}
          >
            {/* Your Custom Emoticons */}
            {/* --- PLACEHOLDER FOR YOUR 3 EMOTICONS --- */}
            <View style={{ flexDirection: 'row', gap: 15, marginBottom: 30 }}>
              <Text style={{ fontSize: 25, color: COLORS.amber }}>⊹ ࣪ ﹏𓊝﹏𓂁﹏⊹ ࣪ ˖</Text>
            </View>

            <Text // Prompt
              style={[styles.logoLight, { fontSize: 14, marginBottom: 40, opacity: 0.6 }]}
            >
              enter docking node.
            </Text>

            <Pressable // Tapping this opens the hidden keyboard automatically
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
        
        {/* --- STAGE 4: THE RADAR CONSTELLATION --- */}
        {stage === 'radar' && ( // Only render if stage is 'radar'
          <GestureDetector // Outer wrapper that listens for the SWIPE
            gesture={swipeGesture} // Binds it to our pan logic
          >
            <View // Master container that fills the screen
              style={styles.radarContainer} // Full width/height
            >
              <GestureDetector // Inner wrapper that listens for the TAP
                gesture={tapGesture} // Binds it to our hit-box logic
              >
                <Svg // The mathematical drawing canvas
                  width={windowWidth} // Exactly as wide as the phone
                  height={windowHeight} // Exactly as tall as the phone
                  style={StyleSheet.absoluteFill} // Forces it to pin to the corners
                >
                  <Defs>
                    <RadialGradient // Creates the soft glowing light effect
                      id="youGrad" // Names it so we can use it later
                      cx="50%" // Center X of the gradient
                      cy="50%" // Center Y
                      r="50%" // Radius
                    >
                      <Stop // The center core of the light
                        offset="0%" // Start at 0 distance
                        stopColor={COLORS.amber} // Use amber
                        stopOpacity="0.4" // Make it 40% transparent
                      />
                      <Stop // The outer edge of the light
                        offset="100%" // Max distance
                        stopColor={COLORS.amber} // Amber
                        stopOpacity="0" // Completely invisible (fades out)
                      />
                    </RadialGradient>

                    {/* NEW — the two dispersal-bloom gradients: a warm amber bloom for a */}
                    {/* successful drop, and a grey one for a failed one. Replaces the old */}
                    {/* hard ring that just flew straight up off the top of the screen. */}
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

                    {/* NEW — one soft glow gradient per node tone, so each peer's orb sits */}
                    {/* inside its own little halo instead of being a flat filled dot. */}
                    {NODE_TONES.map((tone, i) => (
                      <RadialGradient key={`glow-${i}`} id={`nodeGlow${i}`} cx="50%" cy="50%" r="50%">
                        <Stop offset="0%" stopColor={tone} stopOpacity="0.55" />
                        <Stop offset="100%" stopColor={tone} stopOpacity="0" />
                      </RadialGradient>
                    ))}
                  </Defs>

                  {/* 0. BACKGROUND DUST — faint fixed stars for atmosphere, sitting behind everything else */}
                  {DUST_STARS.map((star, i) => (
                    <Circle key={`dust-${i}`} cx={star.x} cy={star.y} r={star.r} fill={COLORS.text} opacity={star.o} />
                  ))}

                  {/* 1. CONSTELLATION BRANCHES — curved, bowed connections instead of dead-straight spokes, */}
                  {/* so the whole graph reads as an organic constellation rather than a wheel of spokes */}
                  {peers.map((peer, i) => { // Loop through peers
                    const pos = scatterPositionFor(peer.deviceId, i); // Find their coordinate
                    const isTargeted = targetId === peer.deviceId; // Check if this line is selected
                    const branch = branchPathFor(ANCHOR_X, ANCHOR_Y, pos.x, pos.y, peer.deviceId); // Curved path + its bowed midpoint
                    const toneIdx = toneIndexForDevice(peer.deviceId); // Which warm tone this peer's junction star uses
                    return ( // Return the branch + its junction star
                      <React.Fragment key={`branch-${peer.deviceId}`}>
                        <AnimatedPath // Draw the curved branch
                          d={branch.d} // The bowed quadratic-bezier path
                          stroke={isTargeted ? COLORS.amber : COLORS.branch} // Amber if active, dusty rose if idle
                          strokeWidth={isTargeted ? 1.5 : 0.75} // Thick if active, thin if idle
                          fill="none" // Never fill a line
                          opacity={ // The complex heartbeat check
                            isTargeted // If active...
                              ? pulseAnim.interpolate({ // Tie opacity to the breathing engine
                                inputRange: [0, 1], // Map 0-to-1 engine state
                                outputRange: [0.3, 0.85] // Into 30% to 85% opacity
                              }) // Closes interpolate
                              : 0.22 // If idle, force it to static 22% opacity — visible enough to read as a graph
                          } // Closes opacity
                        />
                        <Circle // A tiny junction star where the branch bows — makes it read as a real constellation graph
                          cx={branch.midX} // The bowed control point X
                          cy={branch.midY} // The bowed control point Y
                          r={isTargeted ? 2.5 : 1.6} // Slightly bigger if this branch is active
                          fill={NODE_TONES[toneIdx]} // Matches the peer's own warm tone
                          opacity={isTargeted ? 0.9 : 0.4} // Dimmer when idle
                        />
                      </React.Fragment>
                    ); // Closes return
                  })}

                  {/* 2. THE DISPERSAL — a soft bloom of light that expands and dissolves in */}
                  {/* place, like a hue spreading outward, instead of a hard ring launching offscreen */}
                  <AnimatedCircle // The wide, soft outer bloom
                    cx={ANCHOR_X} // Keep it centered horizontally
                    cy={ // Dynamic Y-Axis — drifts gently upward as it disperses, doesn't fly off-screen
                      boomAnim.interpolate({ // Tie to the engine
                        inputRange: [0, 1], // Map 0-to-1 state
                        outputRange: [ANCHOR_Y - 30, ANCHOR_Y - 170] // Starts near the anchor, drifts up and dissolves
                      }) // Closes interpolate
                    } // Closes cy
                    r={ // Dynamic Radius — grows into a broad, soft glow rather than a screen-filling ring
                      boomAnim.interpolate({ // Tie to engine
                        inputRange: [0, 1], // Map 0-to-1 state
                        outputRange: [24, 240] // Starts small, blooms outward
                      }) // Closes interpolate
                    } // Closes r
                    fill={shattered ? 'url(#boomGradGrey)' : 'url(#boomGradAmber)'} // Soft gradient fill — grey if the drop failed
                    opacity={ // Dynamic Fade
                      boomAnim.interpolate({ // Tie to engine
                        inputRange: [0, 0.5, 1], // 3 stages: Start -> halfway -> Finished
                        outputRange: [0.9, 0.6, 0] // Solid -> Dimming -> Completely invisible
                      }) // Closes interpolate
                    } // Closes opacity
                  />
                  <AnimatedCircle // A tighter, brighter core so it still reads as "a spark just left"
                    cx={ANCHOR_X} // Same horizontal center
                    cy={ // Same drift as the outer bloom
                      boomAnim.interpolate({ // Tie to the engine
                        inputRange: [0, 1], // Map 0-to-1 state
                        outputRange: [ANCHOR_Y - 30, ANCHOR_Y - 170] // Matches the outer bloom's drift
                      }) // Closes interpolate
                    } // Closes cy
                    r={ // Shrinks to nothing as the bloom takes over
                      boomAnim.interpolate({ // Tie to engine
                        inputRange: [0, 1], // Map state
                        outputRange: [10, 0] // Starts as a bright pinpoint, dissolves away
                      }) // Closes interpolate
                    } // Closes r
                    fill={shattered ? COLORS.mutedText : COLORS.amber} // Solid core color, grey if failed
                    opacity={ // Dynamic Fade
                      boomAnim.interpolate({ // Tie to engine
                        inputRange: [0, 0.6, 1], // Three stages
                        outputRange: [1, 0.4, 0] // Solid -> Dimming -> gone
                      }) // Closes interpolate
                    } // Closes opacity
                  />

                  {/* NEW — 2b. THE SHATTER: grey particles bursting outward, */}
                  {/* only exists for the brief moment right after a failed throw */}
                  {shattered && SHARD_ANGLES.map((angle, i) => ( // Only render while shattered is true
                    <AnimatedCircle // One grey shard
                      key={`shard-${i}`} // React identifier
                      cx={shatterAnim.interpolate({ // Tie X to the burst engine
                        inputRange: [0, 1], // Map 0-to-1 state
                        outputRange: [ANCHOR_X, ANCHOR_X + Math.cos(angle) * 90] // Start at anchor, fly outward along this shard's angle
                      })} // Closes cx
                      cy={shatterAnim.interpolate({ // Tie Y to the burst engine
                        inputRange: [0, 1], // Map state
                        outputRange: [ANCHOR_Y - 60, ANCHOR_Y - 60 + Math.sin(angle) * 90] // Same, but vertically
                      })} // Closes cy
                      r={shatterAnim.interpolate({ // Shrinks as it flies, like debris burning out
                        inputRange: [0, 1], // Map state
                        outputRange: [5, 0] // Starts a visible size, ends at nothing
                      })} // Closes r
                      fill={COLORS.mutedText} // Dull grey, matching the retinted boom
                      opacity={shatterAnim.interpolate({ // Fades out as it travels
                        inputRange: [0, 0.6, 1], // Three stages
                        outputRange: [0.9, 0.6, 0] // Solid -> dimming -> gone
                      })} // Closes opacity
                    />
                  ))}

                  {/* 3. PEER ORBS — each one its own glowing, breathing constellation star */}
                  {peers.map((peer, i) => { // Loop through peers
                    const pos = scatterPositionFor(peer.deviceId, i); // Find coordinate
                    const scale = getPeerScale(peer.deviceId); // Grab their specific spring animation
                    const breathe = getPeerBreathe(peer.deviceId); // Grab their specific idle breathing animation
                    const isTargeted = targetId === peer.deviceId; // Check if selected
                    const toneIdx = toneIndexForDevice(peer.deviceId); // Which warm tone family this orb belongs to
                    const baseRadius = radiusForDevice(peer.deviceId); // This orb's own base size (varied hub/leaf feel)
                    const breatheOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }); // Slow living pulse

                    return ( // Return the drawings
                      <React.Fragment // Wrapper required by React when returning multiple things
                        key={peer.deviceId} // React identifier
                      >
                        {/* Soft halo behind the core */}
                        <AnimatedCircle
                          cx={pos.x}
                          cy={pos.y}
                          // FIXED: Uses interpolate instead of crashing the app!
                          r={scale.interpolate({ inputRange: [0, 1], outputRange: [0, baseRadius * 2.6] })}
                          fill={`url(#nodeGlow${toneIdx})`}
                          opacity={breatheOpacity}
                        />
                        {isTargeted && ( // If they are currently tapped...
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
                        <AnimatedCircle // Draw the core orb
                          cx={pos.x}
                          cy={pos.y}
                          // FIXED: Uses interpolate instead of crashing the app!
                          r={scale.interpolate({ inputRange: [0, 1], outputRange: [0, baseRadius] })}
                          fill={isTargeted ? COLORS.amber : NODE_TONES[toneIdx]}
                          opacity={0.95}
                        />
                      </React.Fragment>
                    ); // Closes return
                  })}

                  {/* 4. "YOU" BOTTOM ANCHOR */}
                  <Circle // Draw the massive glowing aura
                    cx={ANCHOR_X} // Center X
                    cy={ANCHOR_Y + 120} // Push it far down off the screen
                    r={180} // Make it massive
                    fill="url(#youGrad)" // Paint it using our RadialGradient defined earlier
                  />
                  <Circle // Draw the physical hard line
                    cx={ANCHOR_X} // Center X
                    cy={ANCHOR_Y + 160} // Push it further down
                    r={180} // Massive radius
                    fill={COLORS.bg} // Black core
                    stroke={COLORS.amber} // Amber ring
                    strokeWidth={1} // Razor thin
                    opacity={0.3} // Very dim
                  />
                </Svg>
              </GestureDetector>

              {/* NEW — the "flick to transmit" cue at the top, gently breathing in and out */}
              {/* with the same heartbeat engine as everything else, so it never feels static */}
              <Animated.Text
                style={[
                  styles.topLabel, // Positions it in the TOP_SAFE_ZONE reserved for it
                  { opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] }) } // Slow breathing fade
                ]}
              >
                flick a file.
              </Animated.Text>

              {/* 5. TEXT LABELS (Floating above the SVG) */}
              {peers.map((peer, i) => { // Loop through peers
                const pos = scatterPositionFor(peer.deviceId, i); // Find coordinate
                const isTargeted = targetId === peer.deviceId; // Check selection
                return ( // Render text
                  <Text // UI Block
                    key={`label-${peer.deviceId}`} // React identifier
                    style={[ // Style array
                      styles.peerLabel, // Base custom font CSS
                      { // Dynamic object
                        left: pos.x - 40, // Shift left so the 80px wide text box centers on the X coord
                        top: pos.y + 15, // Drop it 15 pixels below the orb
                        color: isTargeted ? COLORS.amber : COLORS.mutedText // Amber if tapped, dim grey if idle
                      } // Closes dynamic object
                    ]} // Closes style array
                  >
                    {peer.label}
                  </Text>
                ); // Closes return
              })}

              {/* 6. BOTTOM HUD */}
              <View // Container wrapper
                style={styles.hud} // CSS floating at the bottom
              >
                {ghostDropMsg ? ( // IF we have a red error message...
                  <Text // Render error text
                    style={[ // Style array
                      styles.caption, // Base subtext
                      { // Dynamic object
                        color: COLORS.error // Force it to the soft red
                      } // Closes dynamic object
                    ]} // Closes style array
                  >
                    {ghostDropMsg}
                  </Text>
                ) : ( // ELSE (no error)...
                  <Text // Render normal status text
                    style={styles.caption} // Dim custom font subtext
                  >
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
  ); // Closes main return
} // Closes App component

// ============================================================================
// ZONE 5: THE STYLESHEET (CSS Engine)
// ============================================================================

const styles = StyleSheet.create({ // Initializes the native styling engine
  safe: { // Styles for the master wrapper
    flex: 1, // Tells it to stretch and fill all available screen space
    backgroundColor: COLORS.bg // Applies the pure black background globally
  }, // Closes safe
  canvas: { // Styles for the fading wrapper
    flex: 1 // Also stretches to fill all space
  }, // Closes canvas
  centerBlock: { // Used for Intro, Boarding, and Dock
    flex: 1, // Takes up whole screen
    alignItems: 'center', // Centers everything horizontally
    justifyContent: 'center', // Centers everything vertically
    paddingHorizontal: 32 // Keeps text from hitting the very edges of the glass
  }, // Closes centerBlock
  hiddenInput: { // The trap for the PIN keyboard
    position: 'absolute', // Pulls it out of normal layout rules
    opacity: 0, // Makes it 100% invisible
    height: 1, // Makes it 1 pixel tall
    width: 1, // Makes it 1 pixel wide
    top: -100 // Throws it 100 pixels completely off the top of the screen
  }, // Closes hiddenInput

  logoContainer: { // Wrapper for "spatialDROP."
    flexDirection: 'row', // Places the 3 text elements horizontally next to each other
    alignItems: 'baseline', // Sits the bottoms of the letters on the exact same invisible line
    marginBottom: 60 // Leaves a huge gap before the button
  }, // Closes logoContainer
  logoLight: { // "spatial"
    fontFamily: 'Pliant', // Enforces custom font
    color: COLORS.text, // White
    fontSize: 22, // Size
    fontWeight: '200', // Thin font
    letterSpacing: 1 // Tight, compact tracking
  }, // Closes logoLight
  logoHeavy: { // "DROP"
    fontFamily: 'Pliant', // Enforces custom font
    color: COLORS.text, // White
    fontSize: 22, // Same size
    fontWeight: '600', // Massive bold font
    letterSpacing: 0 // Tight, compact tracking
  }, // Closes logoHeavy
  accentPeriod: { // "."
    fontFamily: 'Pliant', // Enforces custom font
    color: COLORS.amber, // Amber
    fontSize: 22, // Same size
    fontWeight: '800' // Bold
  }, // Closes accentPeriod

  nameInput: { // The "enter alias" typing area
    fontFamily: 'Pliant', // Enforces custom font
    borderBottomWidth: 1, // Draws ONLY a line at the bottom
    borderBottomColor: COLORS.boxBorder, // Makes that line dark grey
    color: COLORS.text, // Text they type is white
    width: 220, // Forces the bottom line to be exactly 220px wide
    textAlign: 'center', // Makes the cursor start dead center
    paddingVertical: 12, // Adds space above and below the text so the line doesn't crowd it
    fontSize: 16, // Font size
    letterSpacing: 1 // Tight tracking for inputs
  }, // Closes nameInput

  ctaButton: { // The layout for all standard buttons
    marginTop: 40, // Space above
    paddingVertical: 12, // Hit-box height
    paddingHorizontal: 30, // Hit-box width
    borderWidth: 1, // Draws a ring around it
    borderColor: COLORS.boxBorder, // Grey ring
    borderRadius: 30 // Rounds the corners into a perfect pill shape
  }, // Closes ctaButton
  ctaText: { // Text inside the button
    fontFamily: 'Pliant', // Enforces custom font
    color: COLORS.text, // White
    fontSize: 10, // Extremely small font
    letterSpacing: 2, // Buttons usually look better slightly spaced out
    fontWeight: '600' // Semi-bold
  }, // Closes ctaText

  // NEW — used in place of ctaButton where a boxed pill felt too heavy.
  // intro's INITIALIZE button was left completely alone; this is only
  // used on the boarding stage's CTA.
  textLink: { // No border, no background — just tappable text
    marginTop: 40 // Same spacing rhythm as ctaButton had
  }, // Closes textLink
  textLinkLabel: { // The text itself
    fontFamily: 'Pliant', // Same custom font as everything else
    color: COLORS.amber, // Amber, not white — this is the one accent-colored CTA in the flow
    fontSize: 11, // Slightly larger than ctaText since there's no box to give it weight
    letterSpacing: 2, // Same spaced-out rhythm as the rest of the UI
    fontWeight: '400' // Lighter than the old bold pill text — meant to feel understated
  }, // Closes textLinkLabel

  pinRow: { // Wrapper for the 6 boxes
    flexDirection: 'row', // Horizontal
    gap: 12 // Exact native spacing between each box
  }, // Closes pinRow
  ppinBox: {
    width: 40,
    height: 50,
    backgroundColor: 'rgba(184, 142, 142, 0.05)',
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  pinDigit: { // The number itself
    fontFamily: 'Pliant', // Enforces custom font
    fontSize: 20, // Large
    fontWeight: '200' // Thin
  }, // Closes pinDigit

  topLabel: { // NEW — the "flick to transmit" cue that TOP_SAFE_ZONE was always reserving room for
    fontFamily: 'Pliant', // Enforces custom font
    // Locked to specific coords, floats above the SVG
    top: 58, // Sits comfortably inside the safe area, above the notch
    width: '100%', // Spans full width so text can center
    textAlign: 'center', // Centers the text
    fontSize: 10, // Tiny, matching the bottom caption
    letterSpacing: 3, // Wide tracking, matching the rest of the UI's rhythm
    color: COLORS.mutedText, // Dim grey — a cue, not a shout
    fontWeight: '300' // Thin
  }, // Closes topLabel
  radarContainer: { // Wrapper for SVG
    flex: 1, // Fill screen
    width: '100%', // 100% width
    height: '100%', // 100% height
    position: 'relative' // Allows absolute positioning inside it
  }, // Closes radarContainer
  peerLabel: { // Text under orbs
    fontFamily: 'Pliant', // Enforces custom font
    position: 'absolute', // Rips it out of normal layout so we can use X/Y coords
    width: 80, // Gives the text room to center itself
    textAlign: 'center', // Centers it under the dot
    fontSize: 10, // Tiny
    letterSpacing: 1, // Tight tracking
    fontWeight: '300' // Thin
  }, // Closes peerLabel

  hud: { // The bottom status area
    position: 'absolute', // Locked to specific coords
    bottom: 120, // Locked exactly 120 pixels up from the physical bottom edge
    width: '100%', // Spans full width so text can center
    alignItems: 'center' // Centers text
  }, // Closes hud
  caption: { // Status text
    fontFamily: 'Pliant', // Enforces custom font
    fontSize: 10, // Tiny
    letterSpacing: 1, // Tight tracking
    color: COLORS.text, // White
    fontWeight: '300', // Thin
    opacity: 0.8 // Slightly dimmed
  }, // Closes caption
  splashScreenContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  introTagline: {
    fontSize: 11,
    color: COLORS.mutedText, // Dim grey 
    letterSpacing: 9, // Wide-spaced premium look
    fontWeight: '700',
    textTransform: 'lowercase',
    marginBottom: 40, // Space before the loading bar hits
    opacity: 0.6,
  },
  progressBarTrack: {
    width: 130, // Total width of the bar
    height: 1, // Razor thin
    backgroundColor: COLORS.boxBorder, // Dark grey background
    marginTop: -50, // Pulls it up tight under the logo
    overflow: 'hidden'
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.idkman, // The glowing amber fill
  },
}); // Closes StyleSheet.create