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

  pinRow: { // wrapper for the 6 boxes
    flexDirection: 'row',
    gap: 12 // exact native spacing between each box
  },
  pinBox: {
    width: 40,
    height: 50,
    backgroundColor: 'rgba(184, 142, 142, 0.05)',
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  pinDigit: { // the number itself
    fontFamily: 'Pliant',
    fontSize: 20, // large
    fontWeight: '200' // thin
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
    bottom: 120, // fixed distance from the physical bottom edge
    width: '100%', // spans full width so text can center
    alignItems: 'center'
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