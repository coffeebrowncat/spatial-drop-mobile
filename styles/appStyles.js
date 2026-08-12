import { StyleSheet } from 'react-native';
import { COLORS } from '../constants/colors';

export const styles = StyleSheet.create({
  safe: { // master wrapper
    flex: 1, // stretch to fill all available screen space
    backgroundColor: COLORS.bg // pure black background, globally
  },
  canvas: { // fading wrapper
    flex: 1
  },
  centerBlock: { // used for intro, boarding, and dock
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32 // keeps text off the very edges of the glass
  },
  hiddenInput: { // trap for the pin keyboard
    position: 'absolute', // pulled out of normal layout
    opacity: 0, // fully invisible
    height: 1,
    width: 1,
    top: -100 // thrown off the top of the screen
  },

  logoContainer: { // wrapper for "spatialDROP."
    flexDirection: 'row', // 3 text elements side by side
    alignItems: 'baseline', // bottoms of the letters sit on the same line
    marginBottom: 60 // gap before the button
  },
  logoLight: { // "spatial"
    fontFamily: 'Pliant', // custom font
    color: COLORS.text, // white
    fontSize: 22,
    fontWeight: '200', // thin
    letterSpacing: 1 // tight, compact tracking
  },
  logoHeavy: { // "DROP"
    fontFamily: 'Pliant',
    color: COLORS.text,
    fontSize: 22, // same size
    fontWeight: '600', // heavy/bold
    letterSpacing: 0
  },
  accentPeriod: { // "."
    fontFamily: 'Pliant',
    color: COLORS.amber,
    fontSize: 22,
    fontWeight: '800'
  },

  nameInput: { // the "enter alias" typing area
    fontFamily: 'Pliant',
    borderBottomWidth: 1, // line only at the bottom
    borderBottomColor: COLORS.boxBorder, // dark grey line
    color: COLORS.text, // white typed text
    width: 220, // fixed bottom-line width
    textAlign: 'center', // cursor starts dead center
    paddingVertical: 12, // space above/below so the line doesn't crowd the text
    fontSize: 16,
    letterSpacing: 1 // tight tracking for inputs
  },

  ctaButton: { // layout for standard buttons
    marginTop: 40,
    paddingVertical: 12, // hit-box height
    paddingHorizontal: 30, // hit-box width
    borderWidth: 1, // ring around it
    borderColor: COLORS.boxBorder,
    borderRadius: 30 // pill shape
  },
  ctaText: { // text inside the button
    fontFamily: 'Pliant',
    color: COLORS.text,
    fontSize: 10, // tiny
    letterSpacing: 2,
    fontWeight: '600'
  },

  // used in place of ctaButton where a boxed pill felt too heavy —
  // only used on the boarding stage's cta, intro's INITIALIZE is untouched
  textLink: { // no border, no background — just tappable text
    marginTop: 40 // same spacing rhythm as ctaButton
  },
  textLinkLabel: { // the text itself
    fontFamily: 'Pliant',
    color: COLORS.amber, // the one accent-colored cta in the flow
    fontSize: 11, // slightly larger, no box to give it weight
    letterSpacing: 2,
    fontWeight: '400' // understated, lighter than the old bold pill text
  },

  pinRow: { // wrapper for the 6 digit slots
    flexDirection: 'row',
    gap: 20 // wider than the old boxed layout — these read as separate marks, not a joined pill row
  },
  // CHANGED — replaces the old bordered-pill pinBox. no box/background at
  // all now, just a column: the digit itself, then a short underline.
  pinDigitWrap: {
    width: 22,
    alignItems: 'center',
  },
  pinDigit: { // the number itself
    fontFamily: 'Pliant',
    fontSize: 30, // bumped up — carries the "filled" weight on its own now that there's no box around it
    height: 36, // fixed so an empty slot (no digit) doesn't collapse the row height
  },
  pinUnderline: { // the short mark under each digit — crimson once filled, dim grey while empty
    width: 24,
    height: 3,
    borderRadius: 2,
    marginTop: 6,
  },
  // NEW — the actual "room full"/wrong-pin error message. color gets
  // overridden inline with theme.error at the call site (App.js), same
  // pattern the rest of this file mostly ignores — this file hardcodes
  // COLORS directly rather than being theme-aware, which is the real
  // reason light mode never fully applied (separate task, not fixed here).
  pinErrorText: {
    fontFamily: 'Pliant',
    fontSize: 11,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 24,
    maxWidth: 260,
  },

  topLabel: { // the "flick to transmit" cue reserved by TOP_SAFE_ZONE
    fontFamily: 'Pliant',
    // locked to specific coords, floats above the svg
    top: 58, // inside the safe area, above the notch
    width: '100%', // spans full width so text can center
    textAlign: 'center',
    fontSize: 10, // tiny, matches the bottom caption
    letterSpacing: 3, // wide tracking, matches the rest of the ui
    color: COLORS.mutedText, // dim — a cue, not a shout
    fontWeight: '300'
  },
  radarContainer: { // wrapper for the svg
    flex: 1, // fill screen
    width: '100%',
    height: '100%',
    position: 'relative' // allows absolute positioning inside it
  },
  peerLabel: { // text under orbs
    fontFamily: 'Pliant',
    position: 'absolute', // out of normal layout so we can use x/y coords
    width: 80, // room for the text to center itself
    textAlign: 'center',
    fontSize: 10, // tiny
    letterSpacing: 1,
    fontWeight: '300'
  },

  hud: { // bottom status area
    position: 'absolute', // locked to specific coords
    bottom: 100, // fixed distance from the physical bottom edge
    width: '100%', // spans full width so text can center
    alignItems: 'center'
  },
  // NEW — replaces the old hud pill (blur box + border) with plain
  // floating text, same spot, no box around it at all. deliberately
  // minimal — this only ever appears for a real error or transient
  // status, not continuously.
  hudText: {
    position: 'absolute',
    bottom: 100,
    width: '100%',
    textAlign: 'center',
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: '300'
  },
  // NEW — this was referenced in App.js (styles.hudPill on the BlurView
  // wrapping the status text) but never actually defined anywhere in this
  // file, meaning that pill has been rendering completely unstyled this
  // whole time — no padding, no rounded corners, nothing. found while
  // wiring up the Android blur fallback below, fixed here since it's the
  // same spot.
  hudPill: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    overflow: 'hidden', // required for the blur (or its Android fallback fill) to respect the rounded corners
    borderWidth: 1,
    borderColor: COLORS.boxBorder,
  },
  // NEW — Android-only, layered on top of hudPill above. expo-blur's real
  // blur is meaningfully more expensive on Android than iOS, and this pill
  // can sit on screen continuously during a transfer, right alongside the
  // radar screen's several other looping animations. a flat tinted fill
  // reads close enough at a glance and costs basically nothing to render.
  hudPillAndroidFallback: {
    backgroundColor: 'rgba(18, 17, 16, 0.85)', // approximates COLORS.bg at high opacity, same visual weight as the dark blur tint
  },
  caption: { // status text
    fontFamily: 'Pliant',
    fontSize: 10, // tiny
    letterSpacing: 1,
    color: COLORS.text,
    fontWeight: '300',
    opacity: 0.8 // slightly dimmed
  },
  splashScreenContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  introTagline: {
    fontSize: 11,
    color: COLORS.mutedText, // dim grey
    letterSpacing: 9, // wide-spaced premium look
    fontWeight: '700',
    textTransform: 'lowercase',
    marginBottom: 40, // space before the loading bar hits
    opacity: 0.6,
  },
  progressBarTrack: {
    width: 130, // total width of the bar
    height: 1, // razor thin
    backgroundColor: COLORS.boxBorder, // dark grey background
    marginTop: -50, // pulled up tight under the logo
    overflow: 'hidden'
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.idkman, // the glowing amber fill
  },
});