import { Dimensions } from 'react-native';

// exact screen size, measured once at load
const { width: windowWidth, height: windowHeight } = Dimensions.get('window');
export { windowWidth, windowHeight };

// anchor is the "you" instrument core. it used to be a big sphere mostly
// pushed below the screen with only a thin arc cresting the bottom edge —
// intentional at the time, but it meant almost none of the layered
// rings/gauge detail was ever actually visible, which is exactly why it
// read as "just a blob" with dead space above it. now it's a fully
// on-screen circle, sized to leave real breathing room on every side.
export const ANCHOR_X = windowWidth / 2; // horizontal center of the screen
export const ANCHOR_RADIUS = 130; // bumped up from 112 to match the reference's instrument size (the rings were noticeably smaller relative to the screen than the reference)
export const ANCHOR_VISIBLE = ANCHOR_RADIUS; // kept for compatibility — the core is fully visible now, nothing is cropped
// CHANGED AGAIN — 210 overcorrected (confirmed on-device, "a little too
// up now"). pulled back partway between the original 90 and the 210 that
// went too far.
export const ANCHOR_Y = windowHeight - ANCHOR_RADIUS - 130; // true center, comfortably clear of the bottom edge
export const ANCHOR_CY = ANCHOR_Y; // kept for compatibility — no longer a separate off-screen center

// breathing room peers need to stay inside real screen bounds
export const SCREEN_PADDING = 30;
export const TOP_SAFE_ZONE = 110; // keeps peers clear of the "flick to transmit" label
export const BOTTOM_SAFE_ZONE = ANCHOR_Y - ANCHOR_RADIUS - 80; // keeps peers clear of the now fully-visible core