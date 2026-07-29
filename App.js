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
  Line, // Draws a straight line between two points
  Defs, // Defines special visual filters (like gradients) to use later
  RadialGradient, // Creates a color fade that radiates outward from the center
  Stop // Defines the specific colors inside a gradient
} from 'react-native-svg'; // Grabbing from the SVG package

import * as DocumentPicker from 'expo-document-picker'; // Lets us open the native iOS/Android file browser
import * as ImagePicker from 'expo-image-picker'; // Lets us open the native iOS/Android photo gallery
import * as FileSystem from 'expo-file-system/legacy'; // Lets us save caught files to the phone's cache
import * as Sharing from 'expo-sharing'; // Lets us pop open the iOS "Share Sheet" to save caught files
import * as Haptics from 'expo-haptics'; // Lets us trigger native physical thuds and clicks on the hardware

// ============================================================================
// ZONE 2: MASTER VARIABLES & MATH
// ============================================================================

// We wrap the raw SVG shapes in the 'Animated' tool so we can change their size/opacity over time
const AnimatedCircle = Animated.createAnimatedComponent(Circle); // Creates an animatable circle
const AnimatedLine = Animated.createAnimatedComponent(Line); // Creates an animatable line

const FIREBASE_DB_URL = 'https://spatial-drop-default-rtdb.firebaseio.com'; // The URL where our 6-digit PINs are temporarily stored

const { // Extracting the exact dimensions of the screen
  width: windowWidth, // Saving the screen's full width into a variable named windowWidth
  height: windowHeight // Saving the screen's full height into a variable named windowHeight
} = Dimensions.get('window'); // Calling the Dimensions tool to measure the active window

const ANCHOR_X = windowWidth / 2; // Calculates the exact horizontal center of the screen
const ANCHOR_Y = windowHeight - 100; // Calculates a point exactly 100 pixels up from the absolute bottom

const COLORS = { // The master color palette object
  bg: '#050505', // True abyssal black for the main background
  boxBorder: '#222222', // Dark, subtle grey for thin outlines and empty PIN boxes
  boxBorderFilled: '#555555', // Lighter grey used to highlight filled PIN boxes
  text: '#ffffff', // Pure white for primary readable text
  mutedText: '#666666', // Dark grey for captions and subtext
  amber: '#D99A5B', // The muted amber used for the sonic boom and active network lines
  cyan: '#4AC2C2', // (Optional) electric cyan for secondary highlights
  error: '#D95B5B', // Soft red used for the wrong PIN shake and ghost drop text
  lineIdle: 'rgba(255, 255, 255, 0.08)', // Barely visible white for idle constellation connections
  lineActive: 'rgba(217, 154, 91, 0.4)' // Amber color with 40% opacity for pulsing data paths
}; // Closes COLORS object

const SCATTER_POSITIONS = [ // An array mapping out where each peer orb will float on screen
  { // Orb 1 position
    x: ANCHOR_X - 100, // 100 pixels to the left of center
    y: ANCHOR_Y - 250 // 250 pixels up from the bottom anchor
  }, // Closes Orb 1
  { // Orb 2 position
    x: ANCHOR_X + 90, // 90 pixels right of center
    y: ANCHOR_Y - 320 // 320 pixels up
  }, // Closes Orb 2
  { // Orb 3 position
    x: ANCHOR_X - 40, // 40 pixels left of center
    y: ANCHOR_Y - 450 // 450 pixels up (highest orb)
  }, // Closes Orb 3
  { // Orb 4 position
    x: ANCHOR_X + 110, // 110 pixels right
    y: ANCHOR_Y - 180 // 180 pixels up (lowest orb)
  }, // Closes Orb 4
  { // Orb 5 position
    x: ANCHOR_X, // Dead center horizontally
    y: ANCHOR_Y - 380 // 380 pixels up
  } // Closes Orb 5
]; // Closes SCATTER_POSITIONS array

function generateId() { // A helper function to create a random string of characters
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { // Standard UUID math
    const r = (Math.random() * 16) | 0; // Picks a random hex number
    const v = c === 'x' ? r : (r & 0x3) | 0x8; // Applies standard formatting
    return v.toString(16); // Returns the final unique string
  }); // Closes string replace
} // Closes generateId function

// ============================================================================
// ZONE 3: THE MAIN APP COMPONENT
// ============================================================================

export default function App() { // The main function that React Native renders to the screen

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

  // --- PHYSICS/ANIMATION VARIABLES (Changing these DOES NOT refresh the UI) ---
  const canvasOpacity = useRef(new Animated.Value(1)).current; // Tracks screen fade. Starts at 1 (fully visible)
  const pinShakeAnim = useRef(new Animated.Value(0)).current; // Tracks the horizontal shake. Starts at 0 (center)
  const boomAnim = useRef(new Animated.Value(0)).current; // Tracks the sonic boom. Starts at 0 (unfired)
  const pulseAnim = useRef(new Animated.Value(0)).current; // Tracks the heartbeat. Starts at 0
  const peerScalesRef = useRef({}); // An empty object to track the bounce animations for every new orb that joins

  // --- ENGINE REFERENCES ---
  const deviceIdRef = useRef(generateId()); // Generates and remembers this phone's unique ID for the whole session
  const wsRef = useRef(null); // An empty slot to hold the live WebSocket connection once it opens
  const hostIpRef = useRef(null); // An empty slot to hold the laptop's IP address once Firebase gives it to us
  const pinInputRef = useRef(null); // An empty slot to hold a direct reference to the hidden keyboard input

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

  useEffect(() => { // Watch the 'peers' array. Whenever someone joins or leaves...
    peers.forEach((peer) => { // Loop through every device in the room...
      const scale = getPeerScale(peer.deviceId); // Grab their specific animation value
      Animated.spring(scale, { // Apply physical spring physics
        toValue: 1, // Make it pop up to 100% normal size
        friction: 6, // Controls how much it wobbles (lower = more bouncy)
        useNativeDriver: false // Must be false because SVG attributes can't run on the native GPU yet
      }).start(); // Trigger the bounce
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
        label: name || 'phone' // Give it our alias, or default to 'phone'
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
    } catch(e) { // If it rejected...
      setGhostDropMsg('transfer lost to the void. try again.'); // Show error
      setStatus(''); // Clear regular status
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
    let hit = null; // Assume they missed everything
    peers.forEach((peer, i) => { // Loop through all the orbs
      const pos = SCATTER_POSITIONS[i % SCATTER_POSITIONS.length]; // Find where this orb is physically drawn
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
        
        {/* --- STAGE: INTRO --- */}
        {stage === 'intro' && ( // Only render this block if stage is 'intro'
          <View // Container
            style={styles.centerBlock} // Centers everything
          > 
            <View // The wrapper for our split-font logo
              style={styles.logoContainer} // Keeps letters on the baseline
            > 
              <Text // The first half
                style={styles.logoLight} // Applies the ultra-thin, wide-spaced font
              > 
                spatial
              </Text> 
              <Text // The second half
                style={styles.logoHeavy} // Applies the ultra-thick, wide-spaced font
              > 
                DROP
              </Text> 
              <Text // The accent
                style={styles.accentPeriod} // Applies the bold amber color
              > 
                .
              </Text> 
            </View> 
            <Pressable // The interactable button
              style={({pressed}) => [ // Dynamic array that listens for the finger
                styles.ctaButton, // Base CSS
                { // Dynamic object
                  opacity: pressed ? 0.5 : 1 // Dims the button 50% while the finger is holding it down
                } // Closes dynamic object
              ]} // Closes style array
              onPress={() => { // When the finger lifts off...
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); // Native physical click
                crossfadeTo('boarding'); // Trigger the fade to the next screen
              }} // Closes onPress
            > 
              <Text // Button text
                style={styles.ctaText} // Applies tiny, wide-spaced CSS
              > 
                INITIALIZE
              </Text> 
            </Pressable> 
          </View> 
        )} 

        {/* --- STAGE: BOARDING PASS --- */}
        {stage === 'boarding' && ( // Only render if stage is 'boarding'
          <View // Container
            style={styles.centerBlock} // Centers
          > 
             <Text // Prompt
              style={[ // Style array
                styles.logoLight, // Thin font
                { // Dynamic object
                  fontSize: 14, // Shrinks it
                  marginBottom: 40, // Space below
                  opacity: 0.6 // Dims it
                } // Closes dynamic object
              ]} // Closes style array
             > 
                identify your node.
             </Text> 
            <TextInput // Visible input field
              placeholder="enter alias..." // Ghost text
              placeholderTextColor={COLORS.mutedText} // Color of the ghost text
              value={name} // Binds to our state
              onChangeText={setName} // Updates state on type
              style={styles.nameInput} // Bottom-border-only CSS
              keyboardAppearance="dark" // Forces Apple's dark-mode keyboard UI
              autoCapitalize="none" // Turns off auto-caps for the terminal vibe
              autoCorrect={false} // Stops the red squiggly spellcheck lines
            /> 
            <Pressable // Button
              style={({pressed}) => [ // Style array
                styles.ctaButton, // Base CSS
                { // Dynamic object
                  opacity: pressed ? 0.5 : 1 // Dim on press
                } // Closes dynamic object
              ]} // Closes style array
              onPress={() => { // On click
                if(name.trim().length > 0) { // If they actually typed something...
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); // Slightly heavier physical click
                  crossfadeTo('dock'); // Fade to PIN screen
                } // Closes if
              }} // Closes onPress
            > 
              <Text // Button text
                style={styles.ctaText} // Small wide font
              > 
                ENTER DOCK
              </Text> 
            </Pressable> 
          </View> 
        )} 

        {/* --- STAGE: PIN DOCK --- */}
        {stage === 'dock' && ( // Only render if stage is 'dock'
          <Animated.View // Container that can handle physical shaking
            style={[ // Style array
              styles.centerBlock, // Centers
              { // Dynamic object
                transform: [{ // Opens transform array
                  translateX: pinShakeAnim // Binds horizontal sliding directly to the error animation
                }] // Closes transform array
              } // Closes dynamic object
            ]} // Closes style array
          > 
            <Text // Prompt
              style={[ // Style array
                styles.logoLight, // Thin font
                { // Dynamic object
                  fontSize: 14, // Shrink
                  marginBottom: 40, // Space below
                  opacity: 0.6 // Dim
                } // Closes dynamic object
              ]} // Closes style array
            > 
                enter dock pin.
             </Text> 
            <Pressable // A giant wrapper so tapping anywhere near the boxes opens the keyboard
              style={styles.pinRow} // Flex-row to put boxes side by side
              onPress={() => { // On click
                pinInputRef.current?.focus(); // Programmatically forces the hidden TextInput to pop open the keyboard
              }} // Closes onPress
            > 
              {digitBoxes.map((d, i) => ( // Loop through our 6-item array
                <View // Draw a square for each item
                  key={i} // Required by React for mapping
                  style={[ // Style array
                    styles.pinBox, // Base square CSS
                    { // Dynamic object
                      borderColor: d ? COLORS.boxBorderFilled : COLORS.boxBorder // If it has a digit, light up the border
                    } // Closes dynamic object
                  ]} // Closes style array
                > 
                  <Text // The actual number inside the square
                    style={[ // Style array
                      styles.pinDigit, // Base big font
                      { // Dynamic object
                        color: d ? COLORS.text : COLORS.mutedText // If it's a real number make it white, if it's the '_' placeholder make it grey
                      } // Closes dynamic object
                    ]} // Closes style array
                  > 
                    {d ?? '_'} 
                  </Text> 
                </View> 
              ))} 
            </Pressable> 
          </Animated.View> 
        )} 

        {/* --- STAGE: RADAR CONSTELLATION --- */}
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
                  </Defs> 

                  {/* 1. CONNECTION LINES */}
                  {peers.map((peer, i) => { // Loop through peers
                    const pos = SCATTER_POSITIONS[i % SCATTER_POSITIONS.length]; // Find their coordinate
                    const isTargeted = targetId === peer.deviceId; // Check if this line is selected
                    return ( // Return the line
                      <AnimatedLine // Draw a line
                        key={`line-${peer.deviceId}`} // React identifier
                        x1={ANCHOR_X} // Start X at bottom center
                        y1={ANCHOR_Y} // Start Y at bottom
                        x2={pos.x} // End X at the peer's orb
                        y2={pos.y} // End Y at the peer's orb
                        stroke={isTargeted ? COLORS.amber : COLORS.text} // Amber if active, white if idle
                        strokeWidth={isTargeted ? 1.5 : 0.5} // Thick if active, razor thin if idle
                        opacity={ // The complex heartbeat check
                          isTargeted // If active...
                            ? pulseAnim.interpolate({ // Tie opacity to the breathing engine
                                inputRange: [0, 1], // Map 0-to-1 engine state
                                outputRange: [0.2, 0.8] // Into 20% to 80% opacity
                              }) // Closes interpolate
                            : 0.1 // If idle, force it to static 10% opacity
                        } // Closes opacity
                      /> 
                    ); // Closes return
                  })} 

                  {/* 2. THE SONIC BOOM WAVE */}
                  <AnimatedCircle // Draw the energy ring
                    cx={ANCHOR_X} // Keep it centered horizontally
                    cy={ // Dynamic Y-Axis
                      boomAnim.interpolate({ // Tie to the engine
                        inputRange: [0, 1], // Map 0-to-1 state
                        outputRange: [ANCHOR_Y, -200] // Start at bottom, fly UP past the top notch
                      }) // Closes interpolate
                    } // Closes cy
                    r={ // Dynamic Radius
                      boomAnim.interpolate({ // Tie to engine
                        inputRange: [0, 1], // Map 0-to-1 state
                        outputRange: [40, windowWidth * 1.5] // Start thumb-sized, grow massively
                      }) // Closes interpolate
                    } // Closes r
                    fill="none" // Hollow core
                    stroke={COLORS.amber} // Amber ring
                    strokeWidth={ // Dynamic Thickness
                      boomAnim.interpolate({ // Tie to engine
                        inputRange: [0, 1], // Map state
                        outputRange: [4, 0] // Start thick, thin out to zero as it travels
                      }) // Closes interpolate
                    } // Closes strokeWidth
                    opacity={ // Dynamic Fade
                      boomAnim.interpolate({ // Tie to engine
                        inputRange: [0, 0.7, 1], // 3 stages: Start -> 70% up -> Finished
                        outputRange: [1, 0.5, 0] // Solid -> Dimming -> Completely invisible
                      }) // Closes interpolate
                    } // Closes opacity
                  /> 

                  {/* 3. PEER ORBS */}
                  {peers.map((peer, i) => { // Loop through peers
                    const pos = SCATTER_POSITIONS[i % SCATTER_POSITIONS.length]; // Find coordinate
                    const scale = getPeerScale(peer.deviceId); // Grab their specific spring animation
                    const isTargeted = targetId === peer.deviceId; // Check if selected
                    
                    return ( // Return the drawings
                      <React.Fragment // Wrapper required by React when returning multiple things
                        key={peer.deviceId} // React identifier
                      > 
                        {isTargeted && ( // If they are currently tapped...
                          <AnimatedCircle // Draw the target reticle
                            cx={pos.x} // Center X
                            cy={pos.y} // Center Y
                            r={20} // Radius slightly larger than the core orb
                            fill="none" // Hollow
                            stroke={COLORS.amber} // Amber ring
                            strokeWidth={1} // Thin line
                            opacity={0.8} // Mostly visible
                          /> 
                        )} 
                        <AnimatedCircle // Draw the core orb
                          cx={pos.x} // Center X
                          cy={pos.y} // Center Y
                          r={ // Dynamic Radius
                            Animated.multiply(scale, 8) // Multiply their 0-to-1 spring state by 8 pixels so they bounce up
                          } // Closes r
                          fill={isTargeted ? COLORS.amber : COLORS.text} // Turn amber if tapped, white if idle
                          opacity={0.9} // 90% solid
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

              {/* 5. TEXT LABELS (Floating above the SVG) */}
              {peers.map((peer, i) => { // Loop through peers
                const pos = SCATTER_POSITIONS[i % SCATTER_POSITIONS.length]; // Find coordinate
                const isTargeted = targetId === peer.deviceId; // Check selection
                return ( // Render text
                  <Text // UI Block
                    key={`label-${peer.deviceId}`} // React identifier
                    style={[ // Style array
                      styles.peerLabel, // Base tiny CSS
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
                    style={styles.caption} // Dim subtext
                  > 
                    {status || (selectedFiles.length > 0 ? 'payload armed. flick to send.' : 'docked.')} 
                    {targetId ? ` → ${peers.find((p) => p.deviceId === targetId)?.label}` : ''} 
                  </Text> 
                )} 
                <Pressable // Button wrapper
                  onPress={pickFiles} // Triggers the gallery popup
                  style={{ // Inline object
                    marginTop: 20, // Space above
                    padding: 10 // Invisible hit-box space around text
                  }} // Closes inline object
                > 
                  <Text // The actual words
                    style={[ // Style array
                      styles.ctaText, // Button font
                      { // Dynamic object
                        opacity: 0.6 // Dim it to blend into dark mode
                      } // Closes dynamic object
                    ]} // Closes style array
                  > 
                    + LOAD FILES 
                  </Text> 
                </Pressable> 
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
    color: COLORS.text, // White
    fontSize: 22, // Size
    fontWeight: '300', // Thin font
    letterSpacing: 4 // Pushes characters wide apart
  }, // Closes logoLight
  logoHeavy: { // "DROP"
    color: COLORS.text, // White
    fontSize: 22, // Same size
    fontWeight: '800', // Massive bold font
    letterSpacing: 4 // Same wide tracking
  }, // Closes logoHeavy
  accentPeriod: { // "."
    color: COLORS.amber, // Amber
    fontSize: 22, // Same size
    fontWeight: '800' // Bold
  }, // Closes accentPeriod

  nameInput: { // The "enter alias" typing area
    borderBottomWidth: 1, // Draws ONLY a line at the bottom
    borderBottomColor: COLORS.boxBorder, // Makes that line dark grey
    color: COLORS.text, // Text they type is white
    width: 220, // Forces the bottom line to be exactly 220px wide
    textAlign: 'center', // Makes the cursor start dead center
    paddingVertical: 12, // Adds space above and below the text so the line doesn't crowd it
    fontSize: 16, // Font size
    letterSpacing: 2 // Pushes their typed letters apart slightly
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
    color: COLORS.text, // White
    fontSize: 10, // Extremely small font
    letterSpacing: 2, // Wide spacing
    fontWeight: '600' // Semi-bold
  }, // Closes ctaText

  pinRow: { // Wrapper for the 6 boxes
    flexDirection: 'row', // Horizontal
    gap: 12 // Exact native spacing between each box
  }, // Closes pinRow
  pinBox: { // The individual PIN squares
    width: 40, // Square width
    height: 50, // Slightly taller than square
    borderBottomWidth: 1, // Draws only a bottom underline
    alignItems: 'center', // Centers the number horizontally
    justifyContent: 'center' // Centers the number vertically
  }, // Closes pinBox
  pinDigit: { // The number itself
    fontSize: 20, // Large
    fontWeight: '300' // Thin
  }, // Closes pinDigit
  
  radarContainer: { // Wrapper for SVG
    flex: 1, // Fill screen
    width: '100%', // 100% width
    height: '100%', // 100% height
    position: 'relative' // Allows absolute positioning inside it
  }, // Closes radarContainer
  peerLabel: { // Text under orbs
    position: 'absolute', // Rips it out of normal layout so we can use X/Y coords
    width: 80, // Gives the text room to center itself
    textAlign: 'center', // Centers it under the dot
    fontSize: 10, // Tiny
    letterSpacing: 1, // Spaced
    fontWeight: '300' // Thin
  }, // Closes peerLabel
  
  hud: { // The bottom status area
    position: 'absolute', // Locked to specific coords
    bottom: 120, // Locked exactly 120 pixels up from the physical bottom edge
    width: '100%', // Spans full width so text can center
    alignItems: 'center' // Centers text
  }, // Closes hud
  caption: { // Status text
    fontSize: 10, // Tiny
    letterSpacing: 1.5, // Spaced
    color: COLORS.text, // White
    fontWeight: '300', // Thin
    opacity: 0.8 // Slightly dimmed
  } // Closes caption
}); // Closes StyleSheet.create